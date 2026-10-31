import * as THREE from '../vendor/three.module.js';
import { createHumanoid } from './humanoid.js';
import { TEX, makeTextSprite, makeRuneSprite } from './textures.js';

/* ============================================================
   NPCs, AI, caravans, warband, quest waves.
   ============================================================ */

export function factionsHostile(a, b) {
  if (!a || !b || a === b) return false;
  if (a === 'neutral' || b === 'neutral') return false;
  const pair = [a, b].sort().join('-');
  return pair === 'elf-guard' || pair === 'elf-villain' || pair === 'guard-villain';
}

const FACTIONS = {
  elf: { hp: 68, dmg: 10, speed: 3.7, xp: 24, gold: [6, 16] },
  guard: { hp: 96, dmg: 12, speed: 3.1, xp: 30, gold: [10, 24] },
  villain: { hp: 88, dmg: 13, speed: 3.3, xp: 28, gold: [9, 22] },
  neutral: { hp: 55, dmg: 6, speed: 3.2, xp: 8, gold: [2, 10] },
};

const NAMES = {
  elf: ['Аэлас', 'Тиэль', 'Лираэль', 'Фаэрон', 'Ильвен', 'Наэлис', 'Элдарин', 'Сильвана'],
  guard: ['Брандт', 'Рольф', 'Гаральд', 'Тэо', 'Мартин', 'Освальд', 'Курт', 'Леонард'],
  villain: ['Грим', 'Моргот', 'Варг', 'Краг', 'Скайл', 'Друх', 'Ноктис', 'Тень'],
  neutral: ['Марк', 'Вилена', 'Гар', 'Бетта', 'Одо', 'Лиза', 'Том', 'Анна'],
};

function randomName(faction) {
  const arr = NAMES[faction] || NAMES.neutral;
  return arr[(Math.random() * arr.length) | 0];
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const GIVER_ROLES = new Set(['commander', 'elder', 'shop', 'smith', 'healer']);

export class NPC {
  constructor(game, opts = {}) {
    this.game = game;
    this.scene = game.scene;
    this.id = ++NPC.counter || (NPC.counter = 1);
    this.faction = opts.faction || 'neutral';
    this.role = opts.role || 'warrior';
    this.name = opts.name || randomName(this.faction);
    this.essential = !!opts.essential;
    this.isGiver = !!opts.giver || GIVER_ROLES.has(this.role);
    this.giverRole = opts.giver || (GIVER_ROLES.has(this.role) ? this.role : null);
    this.questKind = opts.questKind || null;

    const def = FACTIONS[this.faction] || FACTIONS.neutral;
    this.maxHp = opts.hp || def.hp;
    this.hp = this.maxHp;
    this.dmg = opts.dmg || def.dmg;
    this.baseSpeed = opts.speed || def.speed;
    this.speed = this.baseSpeed;
    this.attackRange = opts.attackRange || (this.role === 'guard' ? 2.9 : 2.3);
    this.aggroRange = opts.aggroRange || 23;
    this.xp = opts.xp || def.xp;
    this.lootGold = opts.lootGold ?? (def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1)));

    this.home = (opts.pos || game.world.spawnFor(this.faction)).clone();
    this.pos = this.home.clone();
    this.pos.y = game.world.heightAt(this.pos.x, this.pos.z);
    this.facing = opts.facing ?? Math.random() * Math.PI * 2;
    this.legsLost = 0;
    this.armsLost = 0;
    this.bleeding = false;
    this.dead = false;
    this.removed = false;
    this.corpseTimer = 0;
    this.fall = 0;
    this.attackCd = 0.5 + Math.random();
    this.attackAnim = -1;
    this.hitTimer = 0;
    this.pendingTarget = null;
    this.retarget = 0;
    this.target = null;
    this.state = 'idle';
    this.wanderTimer = 1 + Math.random() * 3;
    this.wanderTarget = this.home.clone();
    this.patrol = opts.patrol || null;
    this.patrolIndex = 0;
    this.order = opts.order || null;
    this.followPlayer = !!opts.followPlayer;
    this.followOffset = opts.followOffset || new THREE.Vector3();
    this.angry = false;
    this.raid = !!opts.raid;
    this.moveAmount = 0;
    this.flashTimer = 0;
    this.labelText = opts.labelText || (this.isGiver ? this.name : null);
    this.barVisible = false;
    this.reviveTimer = 0;
    this.materials = [];

    this.buildVisual();
    this.spawnPos = this.home.clone();
  }

  buildVisual() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root = null;
    }
    if (this.barGroup) {
      this.scene.remove(this.barGroup);
      this.barGroup = null;
    }
    this.model = createHumanoid(this.faction, {
      role: this.role,
      unarmed: this.role === 'civilian' || this.role === 'child',
      isPlayer: false,
    });
    this.root = this.model.root;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.scene.add(this.root);

    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.material?.emissive) this.materials.push(o.material);
    });

    if (this.labelText) {
      if (this.label) this.scene.remove(this.label);
      this.label = makeTextSprite(this.labelText, {
        worldWidth: this.role === 'commander' ? 4.6 : 4.0,
        fontSize: 28, color: this.faction === 'villain' ? '#f0b0a0' : (this.faction === 'elf' ? '#cfe8b0' : '#f0e2bc'),
        background: 'rgba(8,12,9,0.75)',
      });
      this.label.position.y = this.role === 'commander' ? 2.9 : 2.55;
      this.root.add(this.label);
    }

    this.barGroup = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x080a08, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.barFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.27, 0.085),
      new THREE.MeshBasicMaterial({ color: 0x7fae4c, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.barFill.position.z = 0.01;
    this.barGroup.add(bg, this.barFill);
    this.barGroup.visible = false;
    this.scene.add(this.barGroup);
    this.barBg = bg;
  }

  setQuestMark(on, char = '!') {
    if (on) {
      if (!this.questMark) {
        this.questMark = makeRuneSprite(char, '#f0d38a', 1.0);
        this.questMark.position.y = 3.5;
        this.root.add(this.questMark);
      }
      this.questMark.visible = true;
    } else if (this.questMark) {
      this.questMark.visible = false;
    }
  }

  isHostileToPlayer() {
    if (this.role === 'civilian') return false;
    if (this.angry) return true;
    const pf = this.game.player.faction;
    return factionsHostile(this.faction, pf);
  }

  chooseTarget() {
    const game = this.game;
    const player = game.player;
    let best = null;
    let bestD = 1e9;
    if (this.role !== 'civilian' && this.isHostileToPlayer() && !player.dead) {
      const d = this.pos.distanceTo(player.pos);
      if (d < this.aggroRange * 1.25) { best = player; bestD = d; }
    }
    for (const other of game.npcs.list) {
      if (other === this || other.dead) continue;
      if (!factionsHostile(this.faction, other.faction)) continue;
      const d = this.pos.distanceTo(other.pos);
      if (d < this.aggroRange && d < bestD) {
        best = other;
        bestD = d;
      }
    }
    this.target = best;
  }

  update(dt) {
    if (this.dead) { this.updateCorpse(dt); return; }
    if (this.removed) return;

    const game = this.game;
    const world = game.world;
    const player = game.player;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        for (const m of this.materials) m.emissive.setHex(0x000000);
      }
    }

    if (this.bleeding) {
      this.hp -= 1.35 * dt;
      if (this.hp <= 0) { this.die(null); return; }
    }

    this.attackCd = Math.max(0, this.attackCd - dt);
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.35 + Math.random() * 0.3;
      this.chooseTarget();
    }
    if (this.target && (this.target.dead || (this.target === player && player.dead))) this.target = null;

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0 && this.pendingTarget) this.strike(this.pendingTarget);
    }

    let speed = 0;
    if (this.role === 'civilian') {
      speed = this.civilianBehaviour(dt);
    } else if (this.target) {
      speed = this.combatBehaviour(dt);
    } else {
      speed = this.idleBehaviour(dt);
    }

    // separation from other npcs
    if (speed > 0) this.moveAmount += (Math.min(1.2, speed / 3.2) - this.moveAmount) * Math.min(1, dt * 8);
    else this.moveAmount += (0 - this.moveAmount) * Math.min(1, dt * 8);

    // fetch quest order target while following the warband lead
    if (this.followPlayer && (!this.order || this.order.type === 'follow')) {
      const off = this.followOffset;
      const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      const r = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      const dest = player.pos.clone().addScaledVector(f, off.z).addScaledVector(r, off.x);
      const d = this.pos.distanceTo(dest);
      if (d > 1.4 && !this.target) this.walkToward(dest, dt, Math.min(4.6, this.speed + 1.0));
    }

    // position / facing
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    if (this.root) {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.facing;
      this.model.animate(dt, {
        move: this.moveAmount,
        attack: this.attackAnim,
        crouch: this.legsLost > 0,
        crawl: this.legsLost >= 2,
        leftHand: this.model.parts.armR.visible === false && this.model.parts.armL.visible,
      });
      if (this.attackAnim >= 0) {
        this.attackAnim += dt / 0.42;
        if (this.attackAnim > 1.15) this.attackAnim = -1;
      }
    }

    const distToPlayer = this.pos.distanceTo(player.pos);
    if (this.label) this.label.visible = distToPlayer < 42;
    const showBar = this.hp < this.maxHp && distToPlayer < 30;
    if (showBar !== this.barVisible) {
      this.barVisible = showBar;
      this.barGroup.visible = showBar;
    }
    if (showBar) {
      const ratio = Math.max(0, this.hp / this.maxHp);
      this.barGroup.position.set(this.pos.x, this.pos.y + 2.35, this.pos.z);
      this.barGroup.quaternion.copy(game.camera.quaternion);
      this.barFill.scale.x = Math.max(0.02, ratio);
      this.barFill.position.x = -(1 - ratio) * 0.635;
      this.barFill.material.color.setHex(ratio < 0.3 ? 0xc44a3a : (ratio < 0.6 ? 0xd3a044 : 0x7fae4c));
    }
  }

  civilianBehaviour(dt) {
    const player = this.game.player;
    let threat = null;
    let td = 1e9;
    if (this.angry) {
      const d = this.pos.distanceTo(player.pos);
      if (d < 16) { threat = player; td = d; }
    }
    for (const other of this.game.npcs.list) {
      if (other === this || other.dead) continue;
      if (!other.isHostileToPlayer && !factionsHostile(other.faction, this.faction)) continue;
      if (other.angry) continue;
      const d = this.pos.distanceTo(other.pos);
      if (d < 12 && d < td) { threat = other; td = d; }
    }
    if (this.hp < this.maxHp) threat = null;
    if (threat) {
      const away = this.pos.clone().sub(threat.pos).normalize();
      const dest = this.pos.clone().addScaledVector(away, 6);
      this.walkToward(dest, dt, 4.4);
      return 4.4;
    }
    return this.wander(dt, 2.2);
  }

  combatBehaviour(dt) {
    const target = this.target;
    if (!target) return 0;
    const dist = this.pos.distanceTo(target.pos);
    if (this.legsLost >= 2 && dist > this.attackRange) {
      // crawl desperately
    }
    if (dist > this.attackRange * 0.9) {
      const speed = this.legsLost > 0 ? Math.min(2.0, this.baseSpeed * 0.55) : this.baseSpeed * 1.12;
      this.walkToward(target.pos, dt, speed);
      return speed;
    }
    // face target
    this.faceToward(target.pos, dt);
    if (this.attackCd <= 0) this.beginAttack(target);
    return 0;
  }

  idleBehaviour(dt) {
    // followers are moved by NPCManager after their own idle step
    if (this.followPlayer) return 0;
    // squad order
    if (this.order) {
      if (this.order.type === 'assault' || this.order.type === 'goto' || this.order.type === 'defend') {
        const d = this.pos.distanceTo(this.order.pos);
        if (d > 4) {
          const speed = Math.min(4.2, this.baseSpeed + 0.8);
          this.walkToward(this.order.pos, dt, speed);
          return speed;
        }
      }
    }
    if (this.patrol && this.patrol.length) {
      const dest = this.patrol[this.patrolIndex];
      if (this.pos.distanceTo(dest) < 2) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
      } else {
        this.walkToward(dest, dt, this.baseSpeed * 0.62);
        return this.baseSpeed * 0.62;
      }
    }
    return this.wander(dt, this.baseSpeed * 0.28);
  }

  wander(dt, speed) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2.5 + Math.random() * 5;
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 7;
      const base = this.home;
      this.wanderTarget.set(
        base.x + Math.cos(a) * r,
        base.y,
        base.z + Math.sin(a) * r,
      );
    }
    const d = this.pos.distanceTo(this.wanderTarget);
    if (d > 1.1) {
      this.walkToward(this.wanderTarget, dt, speed);
      return speed;
    }
    return 0;
  }

  walkToward(dest, dt, speed) {
    const dx = dest.x - this.pos.x;
    const dz = dest.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const nx = dx / dist;
    const nz = dz / dist;
    this.pos.x += nx * speed * dt;
    this.pos.z += nz * speed * dt;
    this.facing = angleLerp(this.facing, Math.atan2(nx, nz), Math.min(1, dt * 8));
    this.game.world.resolveCollision(this.pos, 0.4);
  }

  faceToward(dest, dt) {
    const dx = dest.x - this.pos.x;
    const dz = dest.z - this.pos.z;
    this.facing = angleLerp(this.facing, Math.atan2(dx, dz), Math.min(1, dt * 10));
  }

  beginAttack(target) {
    this.attackAnim = 0;
    this.attackCd = 1.15 + Math.random() * 0.7;
    this.hitTimer = 0.24;
    this.pendingTarget = target;
    this.game.audio?.npcSwing();
  }

  strike(target) {
    if (!target || this.dead) return;
    if (target.dead) return;
    const dist = this.pos.distanceTo(target.pos);
    if (dist > this.attackRange + 1.4) return;
    let dmg = this.dmg * (0.85 + Math.random() * 0.35);
    if (this.armsLost === 1) dmg *= 0.6;
    if (this.armsLost >= 2) dmg *= 0.3;
    if (this.legsLost > 0) dmg *= 0.9;
    if (target === this.game.player) {
      this.game.player.takeDamage(dmg, this);
    } else if (target.takeDamage) {
      target.takeDamage(dmg, this);
    }
  }

  takeDamage(amount, source = null, opts = {}) {
    if (this.dead) return;
    const dmg = Math.max(1, Math.round(amount));
    this.hp -= dmg;
    this.flashTimer = 0.12;
    for (const m of this.materials) m.emissive.setHex(0x5a0e0a);
    this.game.fx.blood(this.pos.clone().add(new THREE.Vector3(0, 1.25, 0)), 18);
    this.game.fx.damageNumber(this.pos.clone().add(new THREE.Vector3(0, 2.15, 0)), dmg);

    if (source && source !== this.game.player) {
      this.target = source;
    } else if (source === this.game.player) {
      this.angry = true;
      this.target = this.game.player;
    }

    // injury / dismemberment
    const injuryRoll = Math.random();
    if (dmg >= 9) {
      if (opts.critical || injuryRoll < 0.14) {
        const candidates = [];
        if (this.model.parts.armL.visible) candidates.push('armL');
        if (this.model.parts.armR.visible) candidates.push('armR');
        if (this.model.parts.legL.visible) candidates.push('legL');
        if (this.model.parts.legR.visible) candidates.push('legR');
        if (candidates.length) {
          const kind = candidates[(Math.random() * candidates.length) | 0];
          this.loseLimb(kind, source);
        }
      } else if (injuryRoll < 0.19) {
        this.loseLimb('head', source);
      }
    }

    if (this.hp <= 0) this.die(source);
  }

  loseLimb(kind, source = null) {
    if (this.dead) return;
    if (kind === 'head') {
      const node = this.model.parts.head;
      if (node) {
        const wp = new THREE.Vector3();
        node.getWorldPosition(wp);
        this.game.fx.blood(wp, 30);
        this.game.fx.dropLimb(this.model.detach('head'), wp, this.facing);
        this.game.audio?.crunch();
      }
      this.die(source, true);
      return;
    }
    const node = this.model.parts[kind];
    if (!node || !node.visible) return;
    this.model.setLimb(kind, 'lost');
    this.bleeding = true;
    if (kind === 'armL' || kind === 'armR') this.armsLost++;
    else this.legsLost++;
    const wp = new THREE.Vector3();
    node.getWorldPosition(wp);
    this.game.fx.blood(wp, 24);
    this.game.fx.dropLimb(this.model.detach(kind), wp, this.facing);
    this.game.audio?.crunch();
    this.game.ui?.toast(`${this.name}: потеряна ${kind.startsWith('arm') ? 'рука' : 'нога'}!`, 'bad');
  }

  die(source = null, headless = false) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.corpseTimer = 95;
    this.fall = 0;
    this.target = null;
    this.barVisible = false;
    if (this.barGroup) this.barGroup.visible = false;
    if (this.label) this.label.visible = false;
    if (this.questMark) this.questMark.visible = false;
    this.attackAnim = -1;
    if (this.model.parts.head.visible && !headless) {
      // nothing
    }
    this.game.audio?.deathThud();
    this.game.npcs.onKill(this, source);
    if (this.essential) this.reviveTimer = 10;
  }

  updateCorpse(dt) {
    if (this.removed) return;
    if (this.root) {
      const ground = this.game.world.heightAt(this.pos.x, this.pos.z);
      this.fall = Math.min(1, this.fall + dt * 2.8);
      this.root.rotation.x = -Math.PI / 2 * this.fall;
      this.root.position.set(this.pos.x, ground + 0.18 * this.fall, this.pos.z);
      if (this.corpseTimer < 6) {
        this.root.position.y -= dt * 0.06;
      }
    }
    this.corpseTimer -= dt;
    if (this.corpseTimer <= 0) {
      this.removed = true;
      this.cleanup();
    }
  }

  revive() {
    this.dead = false;
    this.removed = false;
    this.hp = this.maxHp;
    this.bleeding = false;
    this.legsLost = 0;
    this.armsLost = 0;
    this.fall = 0;
    this.angry = false;
    this.questMark = null;
    this.pos.copy(this.home);
    this.pos.y = this.game.world.heightAt(this.pos.x, this.pos.z);
    this.buildVisual();
    this.root.position.copy(this.pos);
    this.root.rotation.x = 0;
    const shouldMark = (this.giverRole === 'commander' || this.giverRole === 'elder')
      && !this.game.quests?.active
      && this.giverRole === (this.game.player.faction === 'guard' ? 'commander' : 'elder');
    this.setQuestMark(shouldMark);
    this.game.ui?.toast(`${this.name} снова на ногах`, 'gold');
  }

  cleanup() {
    if (this.root) this.scene.remove(this.root);
    if (this.barGroup) this.scene.remove(this.barGroup);
    if (this.label) this.scene.remove(this.label);
    if (this.questMark) this.scene.remove(this.questMark);
    this.root = null;
    this.barGroup = null;
    this.label = null;
    this.questMark = null;
    this.dead = true;
  }
}
NPC.counter = 0;

/* ============================================================
   Manager
   ============================================================ */

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.squad = [];
    this.caravan = null;
    this.time = 0;
    this.initialized = false;
  }

  add(opts) {
    const npc = new NPC(this.game, opts);
    this.list.push(npc);
    return npc;
  }

  reset() {
    for (const npc of this.list) {
      if (npc.root || npc.barGroup || npc.label || npc.questMark) npc.cleanup();
    }
    this.list.length = 0;
    this.squad.length = 0;
    if (this.caravan?.group) this.game.scene.remove(this.caravan.group);
    this.caravan = null;
    this.commander = null;
    this.elder = null;
    this.shopkeeper = null;
    this.smith = null;
    this.healer = null;
    this.initialized = false;
  }

  buildWorld() {
    const w = this.game.world;
    const S = w.sites;

    // --- palace ---
    this.commander = this.add({
      faction: 'guard', role: 'commander', name: 'Командир Дорн',
      pos: w.sitePos('palace', 0, 26), hp: 240, dmg: 16, attackRange: 2.9,
      essential: true, giver: 'commander', labelText: 'Командир Дорн', facing: Math.PI,
      patrol: [w.sitePos('palace', 0, 26), w.sitePos('palace', 0, 12)],
    });
    this.commanderLabel = this.commander.label;
    const guardSpots = [
      [-20, 24], [20, 24], [-24, 8], [24, 8], [0, 2], [-12, 38], [12, 38],
    ];
    for (const [dx, dz] of guardSpots) {
      this.add({
        faction: 'guard', role: 'guard', name: randomName('guard'),
        pos: w.sitePos('palace', dx, dz),
        patrol: [w.sitePos('palace', dx, dz), w.sitePos('palace', -dx * 0.6, dz + 8)],
      });
    }

    // --- elves ---
    this.elder = this.add({
      faction: 'elf', role: 'elder', name: 'Старейшина Эларион',
      pos: w.sitePos('elf', 0, -8), hp: 220, dmg: 9, essential: true,
      giver: 'elder', labelText: 'Старейшина Эларион', facing: 0,
    });
    const elfSpots = [[-18, 8], [18, 10], [-10, 26], [14, -10], [-26, -2], [26, 20]];
    for (const [dx, dz] of elfSpots) {
      this.add({
        faction: 'elf', role: 'warrior', name: randomName('elf'),
        pos: w.sitePos('elf', dx, dz),
        patrol: [w.sitePos('elf', dx, dz), w.sitePos('elf', dx + 8, dz - 8)],
      });
    }

    // --- dark fort warband ---
    for (let i = 0; i < 4; i++) {
      const npc = this.add({
        faction: 'villain', role: 'villain', name: randomName('villain'),
        pos: w.sitePos('villain', -9 + i * 6, 22 + (i % 2) * 4),
        followPlayer: true,
        followOffset: new THREE.Vector3(-4 + i * 2.6, 0, 3 + (i % 2) * 2.2),
      });
      this.squad.push(npc);
    }
    this.add({
      faction: 'villain', role: 'captain', name: 'Грим', hp: 140,
      pos: w.sitePos('villain', -10, 18), patrol: [w.sitePos('villain', -10, 18), w.sitePos('villain', 8, 12)],
      labelText: 'Грим',
    });

    // --- neutral town ---
    this.shopkeeper = this.add({
      faction: 'neutral', role: 'shop', name: 'Торговец Марк',
      pos: w.sitePos('neutral', 3, 2), essential: true, giver: 'shop',
      labelText: 'Торговец Марк', facing: Math.PI,
    });
    this.smith = this.add({
      faction: 'neutral', role: 'smith', name: 'Кузнец Гар',
      pos: w.sitePos('neutral', 31, 21), essential: true, giver: 'smith',
      labelText: 'Кузнец Гар', facing: -2.2,
    });
    this.healer = this.add({
      faction: 'neutral', role: 'healer', name: 'Лекарь Вилена',
      pos: w.sitePos('neutral', -29, 25), essential: true, giver: 'healer',
      labelText: 'Лекарь Вилена', facing: 0.8,
    });
    const civSpots = [[-8, 12], [10, 18], [-20, 2], [16, -8], [-30, 12]];
    for (const [dx, dz] of civSpots) {
      this.add({
        faction: 'neutral', role: 'civilian', name: randomName('neutral'),
        pos: w.sitePos('neutral', dx, dz), hp: 35,
      });
    }

    // --- road patrols that can clash on their own ---
    const guardPatrol = [
      w.sitePos('palace', 0, 34), w.sitePos('palace', -40, 90),
      new THREE.Vector3(10, 0, 0), new THREE.Vector3(-60, 0, 60),
    ];
    guardPatrol.forEach(p => { p.y = w.heightAt(p.x, p.z); });
    for (let i = 0; i < 3; i++) {
      this.add({
        faction: 'guard', role: 'guard', name: randomName('guard'),
        pos: guardPatrol[0].clone().add(new THREE.Vector3(i * 2, 0, 0)),
        patrol: guardPatrol,
      });
    }
    const elfPatrol = [w.sitePos('elf', 20, 40), new THREE.Vector3(-80, 0, 40), new THREE.Vector3(0, 0, 60)];
    elfPatrol.forEach(p => { p.y = w.heightAt(p.x, p.z); });
    for (let i = 0; i < 3; i++) {
      this.add({
        faction: 'elf', role: 'warrior', name: randomName('elf'),
        pos: elfPatrol[0].clone().add(new THREE.Vector3(0, 0, i * 2)),
        patrol: elfPatrol,
      });
    }

    this.buildCaravan();
    this.initialized = true;
  }

  buildCaravan() {
    const world = this.game.world;
    const road = world.roads ? world.roads[0] : null;
    if (!road) return;
    const curve = road.curve;
    const group = new THREE.Group();
    const wood = world.materials.woodDark;
    const cloth = new THREE.MeshLambertMaterial({ color: 0x6b4b2d });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 1.5), wood);
    bed.position.y = 1.0;
    group.add(bed);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 1.7), cloth);
    canopy.position.y = 2.2;
    group.add(canopy);
    for (const [x, z] of [[-1.0, -0.85], [1.0, -0.85], [-1.0, 0.85], [1.0, 0.85]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), wood);
      post.position.set(x, 1.6, z);
      group.add(post);
    }
    for (const [x, z] of [[-0.9, 0.8], [0.9, 0.8], [-0.9, -0.8], [0.9, -0.8]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 10), world.materials.darkWood);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.55, z);
      group.add(wheel);
    }
    // horse
    const horse = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.9), new THREE.MeshLambertMaterial({ color: 0x6b4a32 }));
    body.position.y = 1.25;
    horse.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.45), new THREE.MeshLambertMaterial({ color: 0x5d3f2a }));
    neck.position.set(0, 1.75, 0.85);
    neck.rotation.x = -0.5;
    horse.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.7), new THREE.MeshLambertMaterial({ color: 0x5d3f2a }));
    head.position.set(0, 2.05, 1.25);
    horse.add(head);
    for (const [x, z] of [[-0.24, 0.6], [0.24, 0.6], [-0.24, -0.6], [0.24, -0.6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.14), new THREE.MeshLambertMaterial({ color: 0x4a3222 }));
      leg.position.set(x, 0.45, z);
      horse.add(leg);
    }
    horse.position.set(-0.4, 0, 2.1);
    group.add(horse);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), world.materials.wood);
    crate.position.set(0.8, 1.65, 0);
    group.add(crate);
    this.game.scene.add(group);

    const guards = [];
    for (let i = 0; i < 2; i++) {
      guards.push(this.add({
        faction: 'neutral', role: 'caravanGuard', name: 'Охранник корована',
        pos: w_curvePoint(curve, 0.34).add(new THREE.Vector3(1.6 + i * 1.4, 0, 1.5)),
        hp: 90, dmg: 12, attackRange: 2.6,
      }));
    }
    guards.forEach(g => g.pos.y = world.heightAt(g.pos.x, g.pos.z));

    this.caravan = {
      group, curve, guards, t: 0.33, dir: 1, speed: 0.00075,
      looted: false, position: new THREE.Vector3(), angle: 0,
    };
  }

  update(dt) {
    this.time += dt;
    for (const npc of this.list) {
      npc.update(dt);
      if (npc.dead && npc.essential && npc.reviveTimer > 0) {
        npc.reviveTimer -= dt;
        if (npc.reviveTimer <= 0) npc.revive();
      }
    }

    // simple separation between living npcs
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.removed) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.removed) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.8 * 0.8 && d2 > 1e-5) {
          const d = Math.sqrt(d2);
          const push = (0.8 - d) * 0.5;
          a.pos.x -= (dx / d) * push;
          a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
        }
      }
    }

    if (this.caravan) this.updateCaravan(dt);
  }

  updateCaravan(dt) {
    const c = this.caravan;
    c.t += c.speed * dt * c.dir;
    if (c.t > 0.92) { c.t = 0.92; c.dir = -1; }
    if (c.t < 0.08) { c.t = 0.08; c.dir = 1; }
    const p = c.curve.getPoint(c.t);
    const tan = c.curve.getTangent(c.t);
    p.y = this.game.world.heightAt(p.x, p.z);
    c.group.position.copy(p);
    c.angle = Math.atan2(tan.x, tan.z);
    c.group.rotation.y = c.angle;
    c.position.copy(p);
    // guards escort the cart
    for (let i = 0; i < c.guards.length; i++) {
      const g = c.guards[i];
      if (!g.order) g.order = { type: 'goto', pos: p.clone() };
      g.order.pos.copy(p).add(new THREE.Vector3(Math.cos(c.angle) * (i ? 2.2 : -2.2), 0, Math.sin(c.angle) * (i ? 2.2 : -2.2)));
    }
    if (!c.looted) {
      // spin the wheels? visual only, skip
    }
  }

  onKill(npc, source) {
    this.game.quests?.onKill(npc, source);
    if (source === this.game.player) {
      this.game.player.gainGold(npc.lootGold);
      this.game.player.gainXp(npc.xp);
    }
  }

  setSquadOrder(type, pos = null) {
    for (const npc of this.squad) {
      if (npc.dead) continue;
      if (type === 'follow') npc.order = null;
      else npc.order = { type, pos: pos ? pos.clone() : npc.pos.clone() };
    }
    const labels = { follow: 'Следуйте за мной!', assault: 'В атаку!', defend: 'Держать позицию!' };
    this.game.ui?.toast(labels[type] || 'Приказ отдан', 'gold');
    if (type === 'assault') this.game.audio?.horn();
  }

  findGiver(pos) {
    let best = null;
    let bd = 4.2;
    for (const npc of this.list) {
      if (npc.dead || !npc.isGiver) continue;
      const d = npc.pos.distanceTo(pos);
      if (d < bd) { best = npc; bd = d; }
    }
    return best;
  }

  findCaravanNear(pos) {
    if (!this.caravan) return null;
    const d = this.caravan.position.distanceTo(pos);
    return d < 4.2 ? this.caravan : null;
  }

  lootCaravan() {
    const c = this.caravan;
    if (!c || c.looted) return false;
    c.looted = true;
    this.game.player.gainGold(140);
    this.game.player.gainXp(35);
    for (const g of c.guards) {
      if (g.dead) continue;
      g.angry = true;
      g.target = this.game.player;
    }
    this.game.ui?.toast('Корован ограблен! +140 золота. Охрана в ярости.', 'gold');
    this.game.quests?.onCaravanLooted();
    return true;
  }

  spawnWave(faction, count, center, opts = {}) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 7;
      const pos = new THREE.Vector3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r);
      pos.y = this.game.world.heightAt(pos.x, pos.z);
      const npc = this.add({
        faction,
        role: opts.role || (faction === 'guard' ? 'guard' : (faction === 'elf' ? 'warrior' : 'villain')),
        name: opts.name || randomName(faction),
        pos,
        raid: true,
        order: opts.assaultPos ? { type: 'assault', pos: opts.assaultPos.clone() } : null,
        aggroRange: 32,
        hp: opts.hp || undefined,
        dmg: opts.dmg || undefined,
      });
      out.push(npc);
    }
    return out;
  }
}

function w_curvePoint(curve, t) {
  const p = curve.getPoint(t);
  p.y = 0;
  return p;
}
