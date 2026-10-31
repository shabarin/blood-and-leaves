import * as THREE from '../vendor/three.module.js';
import { createHumanoid } from './humanoid.js';

/* ============================================================
   PLAYER — third person controller, injuries, prosthetics.
   ============================================================ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.velY = 0;
    this.grounded = true;
    this.yaw = 0;
    this.pitch = 0.22;
    this.camDist = 5.4;
    this.facing = 0;
    this.keys = new Set();
    this.jumpRequested = false;
    this.blocking = false;
    this.attackAnim = -1;
    this.attackCd = 0;
    this.attackHitDone = false;
    this.staminaDelay = 0;
    this.shake = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.deathCause = '';
    this.moveSpeed = 0;
    this.faction = 'neutral';
    this.name = 'Кирилл';
    this.model = null;
    this.modelRoot = null;
    this.wheelchair = null;
    this.wheelchairOn = false;

    this.baseStats = { hp: 100, maxHp: 100, maxStamina: 100 };
    this.stats = { hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, gold: 50, xp: 0, level: 1, xpNext: 100 };
    this.inj = { armL: 'ok', armR: 'ok', legL: 'ok', legR: 'ok', eyeL: 'ok', eyeR: 'ok' };
    this.bleeding = false;
    this.potions = 2;
    this.bandages = 2;
    this.gear = { weaponName: 'Ржавый меч', weaponDmg: 15, armorName: 'Кожаный доспех', armorDR: 0.05, wheelchair: false };
    this.ranged = 0;

    this.bindInput();
  }

  /* ---------------- input ---------------- */
  bindInput() {
    const canControl = () => this.game.state === 'playing' && !this.game.paused && !this.dead;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && canControl()) {
        this.jumpRequested = true;
        e.preventDefault();
      }
      if (canControl()) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.blocking = false; });

    const canvas = this.game.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!canControl() || document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.startAttack();
      if (e.button === 2) this.blocking = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.blocking = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.game.canvas) return;
      if (this.dead) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch += e.movementY * 0.0021;
      this.pitch = clamp(this.pitch, -0.32, 1.05);
    });
    canvas.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.6, 2.8, 8.5);
      e.preventDefault();
    }, { passive: false });

    // keyboard quick actions
    window.addEventListener('keydown', (e) => {
      if (!canControl()) return;
      if (e.code === 'KeyH') this.useBandage();
      if (e.code === 'Digit1') this.usePotion();
      if (e.code === 'Digit2') this.toggleWheelchair();
    });
  }

  /* ---------------- spawn / reset ---------------- */
  spawn(faction, saved = null) {
    this.faction = faction;
    this.dead = false;
    this.deathTimer = 0;
    this.attackAnim = -1;
    this.bleeding = false;
    this.inj = { armL: 'ok', armR: 'ok', legL: 'ok', legR: 'ok', eyeL: 'ok', eyeR: 'ok' };
    this.potions = 2;
    this.bandages = 2;
    this.stats = {
      hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
      gold: 50, xp: 0, level: 1, xpNext: 100,
    };
    this.gear = { weaponName: 'Ржавый меч', weaponDmg: 15, armorName: 'Кожаный доспех', armorDR: 0.05, wheelchair: false };
    this.wheelchairOn = false;
    this.yaw = 0;
    this.pitch = 0.22;

    if (faction === 'elf') {
      this.gear = { weaponName: 'Эльфийский клинок', weaponDmg: 20, armorName: 'Лёгкий доспех', armorDR: 0.06, wheelchair: false };
      this.stats.maxStamina = 120;
      this.stats.stamina = 120;
      this.potions = 3;
    } else if (faction === 'guard') {
      this.gear = { weaponName: 'Меч стражи', weaponDmg: 17, armorName: 'Стражный доспех', armorDR: 0.15, wheelchair: false };
      this.stats.maxHp = 120;
      this.stats.hp = 120;
    } else if (faction === 'villain') {
      this.gear = { weaponName: 'Тёмный топор', weaponDmg: 23, armorName: 'Шипастый доспех', armorDR: 0.1, wheelchair: false };
      this.stats.maxHp = 110;
      this.stats.hp = 110;
      this.stats.gold = 80;
    }

    const sp = this.game.world.spawnFor(faction);
    this.pos.copy(sp);
    this.pos.y = this.game.world.heightAt(sp.x, sp.z);
    this.velY = 0;
    this.grounded = true;

    this.buildModel();
    this.game.quests?.applyFactionStart(faction);
    this.game.ui?.refreshAll();
    this.game.ui?.updateEye(this.inj);

    if (saved) this.applySave(saved);
  }

  buildModel() {
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot);
      this.modelRoot = null;
    }
    const model = createHumanoid(this.faction, { isPlayer: true, role: 'warrior' });
    this.model = model;
    this.modelRoot = model.root;
    this.scene.add(this.modelRoot);
    this.modelRoot.position.copy(this.pos);

    // wheelchair visual
    const chair = new THREE.Group();
    const wheelGeo = new THREE.TorusGeometry(0.52, 0.065, 6, 16);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x3c2e1f });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x8a8f8a });
    this.chairWheels = [];
    for (const sx of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(sx * 0.58, 0.52, 0);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.y = Math.PI / 2;
      wg.add(w);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.018, 4, 16), rimMat);
      rim.rotation.y = Math.PI / 2;
      wg.add(rim);
      chair.add(wg);
      this.chairWheels.push(wg);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.6), new THREE.MeshLambertMaterial({ color: 0x6b5334 }));
    seat.position.set(0, 0.6, -0.05);
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x6b5334 }));
    back.position.set(0, 1.0, -0.32);
    chair.add(back);
    chair.visible = false;
    this.modelRoot.add(chair);
    this.wheelchair = chair;
    this.applyInjuryVisuals();
  }

  applyInjuryVisuals() {
    if (!this.model) return;
    for (const k of ['armL', 'armR', 'legL', 'legR']) this.model.setLimb(k, this.inj[k]);
    this.model.setEye('left', this.inj.eyeL);
    this.model.setEye('right', this.inj.eyeR);
    if (this.wheelchair) this.wheelchair.visible = this.wheelchairOn;
    this.game.ui?.updateEye(this.inj);
    this.game.ui?.refreshInjuries();
  }

  /* ---------------- movement ---------------- */
  get legsLost() {
    return (this.inj.legL === 'lost' ? 1 : 0) + (this.inj.legR === 'lost' ? 1 : 0);
  }

  get armsLost() {
    return (this.inj.armL === 'lost' ? 1 : 0) + (this.inj.armR === 'lost' ? 1 : 0);
  }

  get canJump() {
    return this.grounded && this.legsLost === 0 && !this.wheelchairOn && !this.blocking;
  }

  get speed() {
    let base = 5.7;
    if (this.legsLost === 1) base = 3.0;
    if (this.legsLost === 2) base = this.wheelchairOn ? 4.3 : 1.35;
    if (this.wheelchairOn) base = Math.min(base, 4.3);
    if (this.blocking) base *= 0.45;
    if (this.game.world.zoneAt(this.pos.x, this.pos.z).key === 'elf' && this.faction === 'elf') base *= 1.12;
    return base;
  }

  update(dt) {
    if (this.dead) {
      this.updateDead(dt);
      return;
    }
    const game = this.game;
    const world = game.world;

    // bleeding
    if (this.bleeding) {
      this.stats.hp -= 1.9 * dt;
      if (Math.random() < dt * 1.6) game.fx.bloodDrip(this.pos);
      if (this.stats.hp <= 0) { this.die('Вы истекли кровью. Нужно было перевязать рану.'); return; }
    } else if (this.stats.hp < this.stats.maxHp) {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 0.55 * dt);
    }

    // stamina
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!this.blocking && this.stats.stamina < this.stats.maxStamina) {
      this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + 13 * dt);
    }
    if (this.blocking) this.stats.stamina = Math.max(0, this.stats.stamina - 5 * dt);
    if (this.stats.stamina <= 0) this.blocking = false;

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // knockback/injury camera etc
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.add(forward);
    if (this.keys.has('KeyS')) move.sub(forward);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);

    const sprint = this.keys.has('ShiftLeft') && this.stats.stamina > 4 && move.lengthSq() > 0 && this.legsLost < 2 && !this.wheelchairOn;
    let speed = this.speed * (sprint ? 1.55 : 1);
    if (this.blocking) speed *= 0.9;

    if (move.lengthSq() > 0) {
      move.normalize();
      const step = speed * dt;
      this.pos.x += move.x * step;
      this.pos.z += move.z * step;
      const targetAngle = Math.atan2(move.x, move.z);
      this.facing = angleLerp(this.facing, targetAngle, Math.min(1, dt * 11));
      if (sprint) {
        this.stats.stamina -= 17 * dt;
        this.staminaDelay = 0.5;
      }
    } else if (this.attackAnim >= 0) {
      const targetAngle = Math.atan2(forward.x, forward.z);
      this.facing = angleLerp(this.facing, targetAngle, Math.min(1, dt * 14));
    }

    this.moveSpeed = move.lengthSq() > 0 ? speed : 0;

    world.resolveCollision(this.pos, 0.42);

    // jumping / gravity
    if (this.jumpRequested) {
      this.jumpRequested = false;
      if (this.canJump) {
        this.velY = 8.6;
        this.grounded = false;
        this.stats.stamina = Math.max(0, this.stats.stamina - 8);
        game.audio?.jump();
      }
    }
    this.velY -= 28 * dt;
    this.pos.y += this.velY * dt;
    const ground = world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.velY = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // attack animation
    if (this.attackAnim >= 0) {
      const prev = this.attackAnim;
      this.attackAnim += dt / 0.44;
      if (!this.attackHitDone && prev < 0.34 && this.attackAnim >= 0.34) this.performHit();
      if (this.attackAnim > 1.15) this.attackAnim = -1;
    }

    // model
    if (this.modelRoot) {
      this.modelRoot.position.copy(this.pos);
      this.modelRoot.rotation.y = this.facing;
      const crouch = this.legsLost >= 1 || this.wheelchairOn;
      const crawl = this.legsLost === 2 && !this.wheelchairOn;
      this.model.animate(dt, {
        move: clamp(this.moveSpeed / 5.7, 0, 1.4),
        attack: this.attackAnim,
        block: this.blocking,
        crouch: crouch && !crawl,
        crawl,
        leftHand: this.inj.armR === 'lost' && this.inj.armL !== 'lost',
      });
      if (this.wheelchairOn) {
        this.model.body.position.y -= 0.32;
        for (const w of this.chairWheels) w.rotation.x -= this.moveSpeed * dt * 1.3;
      }
    }

    this.updateCamera(dt);
  }

  updateDead(dt) {
    if (this.modelRoot) {
      this.modelRoot.rotation.x = Math.min(Math.PI / 2, this.modelRoot.rotation.x + dt * 2.2);
      this.modelRoot.position.y = this.pos.y;
      this.updateCamera(dt, true);
    }
    this.deathTimer -= dt;
    if (this.deathTimer <= 0 && !this.game.ui.deathShown) {
      this.game.ui.showDeath(this.deathCause);
    }
  }

  updateCamera(dt, dead = false) {
    const cam = this.game.camera;
    if (!cam) return;
    const crouch = this.legsLost === 2 && !this.wheelchairOn;
    const target = new THREE.Vector3(this.pos.x, this.pos.y + (crouch ? 0.75 : 1.58), this.pos.z);
    if (this.wheelchairOn) target.y = this.pos.y + 1.15;
    if (dead) target.y = this.pos.y + 0.6;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const sx = (Math.random() - 0.5) * this.shake * 0.35;
    const sy = (Math.random() - 0.5) * this.shake * 0.35;
    cam.position.set(
      target.x + Math.sin(this.yaw) * cp * this.camDist + sx,
      target.y + sp * this.camDist + sy,
      target.z + Math.cos(this.yaw) * cp * this.camDist,
    );
    const gy = this.game.world.heightAt(cam.position.x, cam.position.z) + 0.55;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(target);
  }

  /* ---------------- combat ---------------- */
  startAttack() {
    if (this.attackCd > 0) return;
    if (this.stats.stamina < 9) {
      this.game.ui?.toast('Не хватает выносливости', 'bad');
      return;
    }
    this.attackCd = 0.58;
    this.attackAnim = 0;
    this.attackHitDone = false;
    this.stats.stamina -= 9;
    this.staminaDelay = 1.1;
    this.game.audio?.slash();
  }

  performHit() {
    this.attackHitDone = true;
    const game = this.game;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    let hit = false;
    const arms = this.armsLost;
    let mult = 1;
    if (arms === 1) mult = 0.62;
    if (arms === 2) mult = 0.35;
    const base = (this.gear.weaponDmg + this.stats.level * 2) * mult;
    for (const npc of game.npcs.list) {
      if (npc.dead) continue;
      const to = npc.pos.clone().sub(this.pos);
      to.y = 0;
      const dist = to.length();
      if (dist > 3.5) continue;
      to.normalize();
      if (to.dot(forward) < 0.05) continue;
      const dmg = base * (0.85 + Math.random() * 0.35);
      npc.takeDamage(dmg, this, { critical: Math.random() < 0.16 });
      hit = true;
    }
    game.fx.slash(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), this.yaw, hit);
    if (hit) {
      this.shake = Math.min(1, this.shake + 0.28);
      game.audio?.hit();
    } else {
      game.audio?.miss();
    }
  }

  takeDamage(amount, source = null, opts = {}) {
    if (this.dead) return;
    const game = this.game;
    let dmg = amount;
    const hasArm = this.inj.armL !== 'lost' || this.inj.armR !== 'lost';
    if (this.blocking && hasArm && this.stats.stamina > 0) {
      dmg *= 0.3;
      this.stats.stamina = Math.max(0, this.stats.stamina - amount * 1.2);
      this.staminaDelay = 1.4;
      game.fx.sparks(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
      game.audio?.block();
    }
    dmg *= (1 - this.gear.armorDR);
    dmg = Math.max(1, Math.round(dmg));
    this.stats.hp -= dmg;
    this.shake = Math.min(1.2, this.shake + 0.55);
    game.ui?.damageFlash();
    game.fx.damageNumber(this.pos.clone().add(new THREE.Vector3(0, 1.9, 0)), dmg, 'player');
    game.fx.blood(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 12);
    game.audio?.hurt();

    if (dmg >= 8 && Math.random() < 0.34) this.rollInjury();
    if (this.stats.hp <= 0) {
      this.die(source ? 'Вас сразил ' + (source.name || 'враг') + '.' : 'Раны оказались смертельными.');
    }
    game.ui?.refreshAll();
  }

  rollInjury() {
    const game = this.game;
    const roll = Math.random();
    const canArm = this.inj.armL !== 'lost' || this.inj.armR !== 'lost';
    const canLeg = this.inj.legL !== 'lost' || this.inj.legR !== 'lost';
    const canEye = this.inj.eyeL === 'ok' || this.inj.eyeR === 'ok';
    if (roll < 0.30 && canArm) {
      const side = this.inj.armL === 'ok' ? 'armL' : (this.inj.armR === 'ok' ? 'armR' : null);
      if (side) this.loseLimb(side, 'Вам отрубили руку! Найдите лекаря или протез.');
    } else if (roll < 0.56 && canLeg) {
      const side = this.inj.legL === 'ok' ? 'legL' : (this.inj.legR === 'ok' ? 'legR' : null);
      if (side) this.loseLimb(side, 'Вам отрубили ногу! Без протеза далеко не уйти.');
    } else if (roll < 0.74 && canEye) {
      const side = this.inj.eyeL === 'ok' ? 'eyeL' : 'eyeR';
      this.loseEye(side);
    }
  }

  loseLimb(kind, message) {
    if (this.inj[kind] !== 'ok') return;
    this.inj[kind] = 'lost';
    this.bleeding = true;
    this.stats.hp -= 6;
    this.game.ui?.toast(message || 'Конечность потеряна!', 'bad');
    this.game.audio?.crunch();
    if (this.model) {
      const node = this.model.parts[kind];
      if (node) {
        const wp = new THREE.Vector3();
        node.getWorldPosition(wp);
        this.game.fx.blood(wp, 26);
        this.game.fx.dropLimb(this.model.detach(kind), wp, this.facing);
      }
    }
    this.applyInjuryVisuals();
    this.game.ui?.refreshAll();
  }

  loseEye(side) {
    const key = side === 'eyeL' ? 'eyeL' : 'eyeR';
    if (this.inj[key] !== 'ok') return;
    this.inj[key] = 'lost';
    this.bleeding = true;
    this.stats.hp -= 4;
    this.game.ui?.toast(side === 'eyeL' ? 'Вам выкололи левый глаз!' : 'Вам выкололи правый глаз!', 'bad');
    this.game.audio?.crunch();
    this.applyInjuryVisuals();
    this.game.ui?.refreshAll();
  }

  applyProsthetic(kind) {
    const map = { armL: 'armL', armR: 'armR', legL: 'legL', legR: 'legR', eyeL: 'eyeL', eyeR: 'eyeR' };
    if (!(kind in map)) return false;
    if (this.inj[kind] !== 'lost') return false;
    this.inj[kind] = 'prosthetic';
    if (kind.startsWith('eye')) {
      if (this.model) this.model.setEye(kind === 'eyeL' ? 'left' : 'right', 'prosthetic');
    } else if (this.model) {
      this.model.setLimb(kind, 'prosthetic');
    }
    this.game.ui?.toast('Протез установлен', 'good');
    this.game.ui?.updateEye(this.inj);
    this.game.ui?.refreshAll();
    return true;
  }

  toggleWheelchair() {
    if (!this.gear.wheelchair) return;
    this.wheelchairOn = !this.wheelchairOn;
    if (this.wheelchair) this.wheelchair.visible = this.wheelchairOn;
    this.game.ui?.toast(this.wheelchairOn ? 'Вы сели в коляску' : 'Вы встали с коляски', 'gold');
  }

  useBandage() {
    if (!this.bleeding) {
      this.game.ui?.toast('Кровотечения нет', 'gold');
      return;
    }
    if (this.bandages <= 0) {
      this.game.ui?.toast('Нет бинтов', 'bad');
      return;
    }
    this.bandages--;
    this.bleeding = false;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 4);
    this.game.ui?.toast('Рана перевязана', 'good');
    this.game.audio?.heal();
    this.game.ui?.refreshAll();
  }

  usePotion() {
    if (this.potions <= 0) {
      this.game.ui?.toast('Нет зелий', 'bad');
      return;
    }
    if (this.stats.hp >= this.stats.maxHp) {
      this.game.ui?.toast('Здоровье уже полное', 'gold');
      return;
    }
    this.potions--;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 55);
    this.game.fx.damageNumber(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 55, 'heal');
    this.game.ui?.toast('Зелье выпито', 'good');
    this.game.audio?.heal();
    this.game.ui?.refreshAll();
  }

  heal(amount) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
    this.bleeding = false;
    this.game.fx.damageNumber(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), amount, 'heal');
    this.game.ui?.refreshAll();
  }

  gainGold(n) {
    this.stats.gold += n;
    if (n > 0) this.game.fx.damageNumber(this.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), n, 'gold');
    this.game.ui?.refreshAll();
  }

  gainXp(n) {
    this.stats.xp += n;
    while (this.stats.xp >= this.stats.xpNext) {
      this.stats.xp -= this.stats.xpNext;
      this.stats.level++;
      this.stats.xpNext = Math.round(this.stats.xpNext * 1.55);
      this.stats.maxHp += 10;
      this.stats.hp = this.stats.maxHp;
      this.game.ui?.toast(`Новый уровень: ${this.stats.level}! Здоровье восстановлено.`, 'good');
      this.game.audio?.levelUp();
    }
    this.game.ui?.refreshAll();
  }

  die(cause = 'Вы погибли.') {
    if (this.dead) return;
    this.dead = true;
    this.bleeding = false;
    this.deathCause = cause;
    this.deathTimer = 1.3;
    this.keys.clear();
    this.blocking = false;
    this.game.audio?.death();
    this.game.ui?.setPrompt('');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  respawnAtHealer() {
    this.dead = false;
    this.deathTimer = 0;
    this.game.ui.deathShown = false;
    this.game.ui.hideDeath();
    for (const k of Object.keys(this.inj)) this.inj[k] = 'ok';
    this.bleeding = false;
    this.stats.hp = this.stats.maxHp;
    this.stats.stamina = this.stats.maxStamina;
    const g = Math.max(0, Math.round(this.stats.gold * 0.25));
    this.stats.gold -= g;
    const p = this.game.world.sitePos('neutral', -22, 28);
    this.pos.copy(p);
    this.velY = 0;
    this.yaw = 0.4;
    this.applyInjuryVisuals();
    if (this.modelRoot) {
      this.modelRoot.rotation.x = 0;
      this.modelRoot.position.copy(this.pos);
    }
    this.updateCamera(0);
    this.game.ui?.toast(`Лекарь вернул вас к жизни. Потеряно ${g} золота.`, 'gold');
    this.game.ui?.refreshAll();
    this.game.resumeLock();
  }

  /* ---------------- save / load ---------------- */
  getSaveData() {
    return {
      faction: this.faction,
      name: this.name,
      pos: [this.pos.x, this.pos.z],
      yaw: this.yaw,
      pitch: this.pitch,
      stats: { ...this.stats },
      inj: { ...this.inj },
      bleeding: this.bleeding,
      potions: this.potions,
      bandages: this.bandages,
      gear: { ...this.gear },
      wheelchairOn: this.wheelchairOn,
    };
  }

  applySave(s) {
    this.faction = s.faction || this.faction;
    this.name = s.name || this.name;
    this.stats = { ...this.stats, ...s.stats };
    this.inj = { armL: 'ok', armR: 'ok', legL: 'ok', legR: 'ok', eyeL: 'ok', eyeR: 'ok', ...s.inj };
    this.bleeding = !!s.bleeding;
    this.potions = s.potions ?? this.potions;
    this.bandages = s.bandages ?? this.bandages;
    this.gear = { ...this.gear, ...s.gear };
    this.wheelchairOn = !!s.wheelchairOn;
    this.yaw = s.yaw ?? 0;
    this.pitch = s.pitch ?? 0.22;
    if (s.pos) {
      this.pos.set(s.pos[0], this.game.world.heightAt(s.pos[0], s.pos[1]), s.pos[1]);
      this.game.world.resolveCollision(this.pos, 0.42);
      this.pos.y = this.game.world.heightAt(this.pos.x, this.pos.z);
    }
    this.dead = false;
    this.bleeding = this.bleeding;
    if (this.modelRoot) {
      this.modelRoot.position.copy(this.pos);
      this.modelRoot.rotation.x = 0;
      this.modelRoot.rotation.y = this.facing;
    }
    this.applyInjuryVisuals();
    if (this.wheelchair) this.wheelchair.visible = this.wheelchairOn;
    this.updateCamera(0);
    this.game.ui?.refreshAll();
    this.game.ui?.updateEye(this.inj);
  }
}
