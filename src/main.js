import * as THREE from '../vendor/three.module.js';
import { initTextures } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { NPCManager } from './npcs.js';
import { QuestSystem } from './quests.js';
import { Effects } from './effects.js';
import { UI, SHOP_ITEMS } from './ui.js';
import { AudioFX } from './audio.js';

const FACTION_NAMES = { elf: 'Лесные эльфы', guard: 'Стража дворца', villain: 'Тёмный Владыка' };

class Game {
  constructor() {
    this.state = 'menu';
    this.paused = true;
    this.ready = false;
    this.time = 0;
    this.menuT = 0;
    this.lastSlot = 1;
    this.interaction = null;
    this.canvas = document.getElementById('game');

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(0, 30, 60);

    this.clock = new THREE.Clock();
    this.audio = new AudioFX();
    this.fx = null;
    this.world = null;
    this.player = null;
    this.npcs = null;
    this.quests = null;

    initTextures();
    this.ui = new UI(this);
    this.ui.showLoading('Пробуждаем древний лес…');
    this.ui.el.menu.classList.add('hidden');

    window.addEventListener('resize', () => this.onResize());
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.paused && !this.player.dead && document.pointerLockElement !== this.canvas) {
        this.requestLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) return;
      if (this.state === 'playing' && !this.paused && !this.ui.modal && !this.player?.dead && !this.ui.deathShown) {
        this.ui.openPause();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) {
        if (this.state === 'playing' && !this.paused && !this.ui.modal && !this.ui.deathShown) this.useInteraction();
      }
    });

    setTimeout(() => this.build(), 80);
  }

  build() {
    try {
      this.fx = new Effects(this);
      this.world = new World(this);
      this.player = new Player(this);
      this.npcs = new NPCManager(this);
      this.quests = new QuestSystem(this);
      this.ui.hideLoading();
      this.ui.showMenu();
      this.ready = true;
      this.world.updateBillboardProjection();
      this.animate();
    } catch (err) {
      console.error(err);
      const title = this.ui.el.loading.querySelector('.loading-title');
      title.textContent = 'Не удалось пробудить лес. Откройте консоль (F12).';
      title.style.color = '#e08c7f';
      const tip = this.ui.el.loadingTip;
      tip.textContent = String(err);
    }
  }

  /* ---------------- flow ---------------- */
  startNewGame(faction, name) {
    if (!this.ready) return;
    this.audio.ensure();
    this.audio.startAmbience();
    this.ui.showLoading(faction === 'elf' ? 'Лес принимает вас…' : (faction === 'guard' ? 'Дворец ждёт стража…' : 'Форт пробуждается…'));
    this.ui.el.menu.classList.add('hidden');
    this.ui.hideDeath();
    this.ui.deathShown = false;

    setTimeout(() => {
      try {
        this.world.clearMarkers();
        this.npcs.reset();
        this.quests = new QuestSystem(this);
        this.npcs.buildWorld();
        this.player.name = name;
        this.player.spawn(faction);
        if (this.player.modelRoot) this.player.modelRoot.visible = true;
        this.ui.hideLoading();
        this.ui.hideMenu();
        this.state = 'playing';
        this.paused = false;
        this.lastSlot = 1;
        this.ui.refreshAll();
        this.ui.hideDeath();
        this.requestLock();
        setTimeout(() => {
          if (document.pointerLockElement !== this.canvas && !this.ui.modal) {
            this.ui.toast('Кликните по экрану, чтобы захватить мышь', 'gold');
          }
        }, 900);
      } catch (err) {
        console.error(err);
        this.ui.toast('Ошибка запуска: ' + err.message, 'bad');
        this.ui.hideLoading();
      }
    }, 120);
  }

  continueGame() {
    const key = this.findLastSaveKey();
    if (!key) {
      this.ui.toast('Сохранений не найдено', 'bad');
      return;
    }
    const data = this.readSave(key);
    if (!data) {
      this.ui.toast('Сохранение повреждено', 'bad');
      return;
    }
    this.loadData(data);
  }

  loadFromSlot(slot) {
    const key = 'bloodleaves_slot_' + slot;
    const data = this.readSave(key);
    if (!data) {
      this.ui.toast('В этом слоте пусто', 'bad');
      return;
    }
    // Remember the loaded slot so F5 saves back into it instead of an
    // unrelated slot chosen earlier.
    this.lastSlot = slot;
    localStorage.setItem('bloodleaves_last', key);
    this.loadData(data);
  }

  loadData(data) {
    if (!this.ready || !data?.player) return;
    this.ui.closeModals(true);
    this.ui.showLoading('Возвращаемся в историю…');
    this.ui.el.menu.classList.add('hidden');
    this.ui.hideDeath();
    this.ui.deathShown = false;
    setTimeout(() => {
      try {
        this.audio.ensure();
        this.audio.startAmbience();
        this.world.clearMarkers();
        this.npcs.reset();
        this.quests = new QuestSystem(this);
        this.npcs.buildWorld();
        this.player.spawn(data.player.faction, data.player);
        if (this.player.modelRoot) this.player.modelRoot.visible = true;
        if (data.quest) this.quests.restore(data.quest);
        this.ui.hideLoading();
        this.ui.hideMenu();
        this.state = 'playing';
        this.paused = false;
        this.ui.refreshAll();
        this.ui.updateEye(this.player.inj);
        this.requestLock();
        this.ui.toast('История продолжается', 'good');
      } catch (err) {
        console.error(err);
        this.ui.hideLoading();
        this.ui.toast('Ошибка загрузки: ' + err.message, 'bad');
      }
    }, 120);
  }

  quitToMenu() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.stopAmbience();
    this.state = 'menu';
    this.paused = true;
    this.ui.closeModals(true);
    this.ui.hideDeath();
    this.ui.deathShown = false;
    if (this.player?.modelRoot) this.player.modelRoot.visible = false;
    this.ui.showMenu();
    this.menuT = 0;
  }

  requestLock() {
    if (this.state !== 'playing' || this.paused || this.ui?.modal) return;
    if (this.player?.dead) return;
    if (document.pointerLockElement === this.canvas) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  resumeLock() {
    this.paused = false;
    this.ui.hideDeath();
    this.ui.deathShown = false;
    this.ui.refreshAll();
    this.requestLock();
  }

  /* ---------------- interaction ---------------- */
  updateInteraction() {
    if (!this.player || this.player.dead) { this.interaction = null; this.ui.setPrompt(null); return; }
    const npc = this.npcs.findGiver(this.player.pos);
    if (npc) {
      this.interaction = { type: 'npc', npc };
      const prompts = {
        commander: 'Поговорить с командиром Дорном',
        elder: 'Поговорить со старейшиной Эларионом',
        shop: 'Торговать с Марком',
        smith: 'Кузнец: оружие, броня, протезы',
        healer: 'Лекарь: исцеление и бинты',
      };
      this.ui.setPrompt(`<b>E</b> ${prompts[npc.giverRole] || 'Поговорить'}`);
      return;
    }
    const cart = this.npcs.findCaravanNear(this.player.pos);
    if (cart) {
      if (cart.looted) {
        this.interaction = null;
        this.ui.setPrompt('<b>E</b> Корован уже ограблен');
      } else {
        this.interaction = { type: 'caravan' };
        this.ui.setPrompt('<b>E</b> Ограбить корован <span style="color:#c9a25c">(охрана рядом)</span>');
      }
      return;
    }
    this.interaction = null;
    this.ui.setPrompt(null);
  }

  useInteraction() {
    if (!this.interaction) return;
    if (this.interaction.type === 'npc') this.talkTo(this.interaction.npc);
    else if (this.interaction.type === 'caravan') {
      const c = this.npcs.caravan;
      if (c && c.looted) {
        this.ui.toast('Здесь уже пусто', 'gold');
        return;
      }
      this.npcs.lootCaravan();
      this.updateInteraction();
    }
  }

  talkTo(npc) {
    if (npc.giverRole === 'shop') { this.ui.openShop('merchant', npc.name); return; }
    if (npc.giverRole === 'smith') { this.ui.openShop('smith', npc.name); return; }
    if (npc.giverRole === 'healer') { this.ui.openShop('healer', npc.name); return; }

    const active = this.quests.active;
    if (active) {
      const progress = active.type === 'patrol' ? `${active.progress}/${active.need} постов`
        : active.type === 'caravan' ? (active.progress ? 'корован ограблен' : 'корован ещё не ограблен')
        : `${Math.min(active.progress, active.need)}/${active.need} убито`;
      this.ui.showDialog({
        kicker: npc.giverRole === 'commander' ? 'ПРИКАЗ' : 'СОВЕТ ЛЕСА',
        title: npc.name,
        portrait: npc.giverRole === 'commander' ? '🛡️' : '🍃',
        text: `Задание «${active.title}» ещё в силе.\n${active.desc}\n\nПрогресс: ${progress}.`,
        options: [
          { label: 'Продолжить', primary: true },
          {
            label: 'Отказаться от задания (без награды)', close: true,
            action: () => this.quests.abandon(),
          },
        ],
      });
      return;
    }

    const offer = this.quests.getOffer(npc);
    if (!offer) {
      this.ui.showDialog({
        kicker: 'РАЗГОВОР', title: npc.name, portrait: '…',
        text: 'Пока дел нет. Отдохните, залечите раны — и приходите.',
        options: [{ label: 'Уйти', primary: true }],
      });
      return;
    }
    const intro = npc.giverRole === 'commander'
      ? 'Стража дворца не спит, солдат. Слушай приказ и не подведи Империю.'
      : 'Лес слышит каждый шаг. Эльфы ждут твоего клинка, дитя чащи.';
    this.ui.showDialog({
      kicker: npc.giverRole === 'commander' ? 'ПРИКАЗ КОМАНДИРА' : 'СОВЕТ СТАРЕЙШИНЫ',
      title: npc.name,
      portrait: npc.giverRole === 'commander' ? '🛡️' : '🍃',
      text: `${intro}\n\n${offer.desc}\n\nНаграда: ${offer.rewardGold} золота, ${offer.rewardXp} опыта.`,
      options: [
        {
          label: 'Взять задание', primary: true,
          action: () => this.quests.startOffer(offer, npc),
        },
        { label: 'Не сейчас' },
      ],
    });
  }

  /* ---------------- shop ---------------- */
  buyItem(item) {
    const p = this.player;
    if (!p || p.dead) return false;
    if (p.stats.gold < item.price) {
      this.ui.toast('Не хватает золота', 'bad');
      return false;
    }
    const pay = () => { p.stats.gold -= item.price; this.audio?.coin(); };

    if (item.id === 'potion') {
      pay(); p.potions++; this.ui.toast('Зелье куплено', 'good'); return true;
    }
    if (item.id === 'bandage') {
      pay(); p.bandages++; this.ui.toast('Бинт куплен', 'good'); return true;
    }
    if (item.limb) {
      const keys = item.limb === 'arm' ? ['armL', 'armR'] : item.limb === 'leg' ? ['legL', 'legR'] : ['eyeL', 'eyeR'];
      const lost = keys.find(k => p.inj[k] === 'lost');
      if (!lost) {
        this.ui.toast(item.limb === 'eye' ? 'Оба глаза целы' : 'Вам не нужен этот протез', 'gold');
        return false;
      }
      pay();
      p.applyProsthetic(lost);
      this.audio.heal();
      return true;
    }
    if (item.id === 'wheelchair') {
      if (p.gear.wheelchair) { this.ui.toast('Коляска уже есть', 'gold'); return false; }
      if (p.legsLost === 0) { this.ui.toast('Коляска вам пока ни к чему', 'gold'); return false; }
      pay();
      p.gear.wheelchair = true;
      p.wheelchairOn = true;
      if (p.wheelchair) p.wheelchair.visible = true;
      this.ui.toast('Коляска куплена. Клавиша 2 — сесть или встать.', 'good');
      this.ui.refreshAll();
      return true;
    }
    if (item.service) {
      if (item.service === 'heal') {
        if (p.stats.hp >= p.stats.maxHp && !p.bleeding) { this.ui.toast('Вы здоровы', 'gold'); return false; }
        pay(); p.heal(60); this.audio.heal();
        this.ui.toast('Лекарь обработал раны', 'good');
      } else {
        if (p.stats.hp >= p.stats.maxHp && !p.bleeding) { this.ui.toast('Вы здоровы', 'gold'); return false; }
        pay(); p.heal(p.stats.maxHp);
        this.ui.toast('Полное исцеление', 'good');
      }
      this.ui.refreshAll();
      return true;
    }
    if (item.weapon) {
      if (p.gear.weaponDmg >= item.weapon.dmg) { this.ui.toast('У вас уже не хуже', 'gold'); return false; }
      pay();
      p.gear.weaponName = item.weapon.name;
      p.gear.weaponDmg = item.weapon.dmg;
      this.ui.toast('Куплено: ' + item.weapon.name, 'good');
      this.ui.refreshAll();
      return true;
    }
    if (item.armor) {
      if (p.gear.armorDR >= item.armor.dr) { this.ui.toast('У вас уже не хуже', 'gold'); return false; }
      pay();
      p.gear.armorName = item.armor.name;
      p.gear.armorDR = item.armor.dr;
      this.ui.toast('Куплено: ' + item.armor.name, 'good');
      this.ui.refreshAll();
      return true;
    }
    return false;
  }

  /* ---------------- saves ---------------- */
  getSaveData() {
    return {
      version: 1,
      savedAt: Date.now(),
      factionName: FACTION_NAMES[this.player.faction] || 'Странник',
      level: this.player.stats.level,
      player: this.player.getSaveData(),
      quest: this.quests.serialize(),
    };
  }

  saveToSlot(slot) {
    const data = this.getSaveData();
    try {
      localStorage.setItem('bloodleaves_slot_' + slot, JSON.stringify(data));
      localStorage.setItem('bloodleaves_last', 'bloodleaves_slot_' + slot);
      this.lastSlot = slot;
      this.ui.toast('Игра сохранена в слот ' + slot, 'good');
      this.audio?.coin();
      this.ui.renderSaveSlots();
    } catch (e) {
      this.ui.toast('Не удалось сохранить', 'bad');
    }
  }

  saveGame(auto = false) {
    if (!this.player || this.player.dead) return;
    const key = auto ? 'bloodleaves_auto' : 'bloodleaves_slot_' + (this.lastSlot || 1);
    try {
      localStorage.setItem(key, JSON.stringify(this.getSaveData()));
      localStorage.setItem('bloodleaves_last', key);
      if (!auto) this.ui.toast('Игра сохранена', 'good');
      else this.ui.toast('Автосохранение', 'good');
    } catch (e) { /* ignore */ }
  }

  readSave(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  findLastSaveKey() {
    const last = localStorage.getItem('bloodleaves_last');
    if (last && localStorage.getItem(last)) return last;
    for (const key of ['bloodleaves_auto', 'bloodleaves_slot_1', 'bloodleaves_slot_2', 'bloodleaves_slot_3']) {
      if (localStorage.getItem(key)) return key;
    }
    return null;
  }

  hasSaves() {
    return !!this.findLastSaveKey();
  }

  quickLoad() {
    const key = this.findLastSaveKey();
    if (!key) { this.ui.toast('Сохранений нет', 'bad'); return; }
    const data = this.readSave(key);
    if (data) this.loadData(data);
  }

  getSaveMeta() {
    const meta = {};
    for (let i = 1; i <= 3; i++) {
      const data = this.readSave('bloodleaves_slot_' + i);
      if (!data) continue;
      meta[i] = {
        factionName: data.factionName || '—',
        level: data.level || 1,
        date: data.savedAt ? new Date(data.savedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—',
      };
    }
    return meta;
  }

  /* ---------------- loop ---------------- */
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.world?.updateBillboardProjection();
  }

  updateMenuCamera(dt) {
    this.menuT += dt * 0.06;
    const s = this.world.sites.elf;
    const r = 150;
    const x = s.x + Math.cos(this.menuT) * r;
    const z = s.z + Math.sin(this.menuT) * r;
    const y = Math.max(s.h + 46, this.world.heightAt(x, z) + 22);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(s.x, s.h + 12, s.z);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;

    if (this.state === 'menu') {
      if (this.world) {
        this.updateMenuCamera(dt);
        this.world.update(dt * 0.7);
      }
    } else if (this.state === 'playing') {
      if (!this.paused) {
        this.player.update(dt);
        this.npcs.update(dt);
        this.quests.update(dt);
        this.fx.update(dt);
        this.world.update(dt);
        this.updateInteraction();
      }
      this.ui.update(dt);
    } else {
      this.world?.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.game = new Game();
