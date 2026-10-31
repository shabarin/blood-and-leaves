import { makeTextSprite } from './textures.js';

/* ============================================================
   UI — menus, HUD, minimap, shops, dialogs, saves, death.
   ============================================================ */

export const SHOP_ITEMS = [
  { id: 'potion', icon: '🧪', name: 'Зелье лечения', price: 35, desc: 'Восстанавливает 55 здоровья. Клавиша 1.', cats: ['merchant', 'healer'] },
  { id: 'bandage', icon: '🩹', name: 'Бинт', price: 16, desc: 'Останавливает кровотечение. Клавиша H.', cats: ['merchant', 'healer'] },
  { id: 'prostheticArm', icon: '🦾', name: 'Протез руки', price: 180, desc: 'Заменяет потерянную руку. Дорого, но жить можно.', cats: ['merchant', 'smith'], limb: 'arm' },
  { id: 'prostheticLeg', icon: '🦿', name: 'Протез ноги', price: 210, desc: 'Заменяет потерянную ногу. Возвращает ходьбу.', cats: ['merchant', 'smith'], limb: 'leg' },
  { id: 'prostheticEye', icon: '👁', name: 'Глазной протез', price: 160, desc: 'Возвращает обзор на потерянной стороне.', cats: ['merchant', 'smith'], limb: 'eye' },
  { id: 'wheelchair', icon: '♿', name: 'Коляска', price: 90, desc: 'Позволяет кататься без ног. Клавиша 2.', cats: ['merchant', 'smith', 'healer'] },
  { id: 'steelSword', icon: '⚔️', name: 'Стальной меч', price: 260, desc: 'Урон 26. Хороший размен за звонкую монету.', cats: ['merchant', 'smith'], weapon: { name: 'Стальной меч', dmg: 26 } },
  { id: 'elfBlade', icon: '🗡️', name: 'Эльфийский клинок', price: 520, desc: 'Урон 34. Лёгкий, как лесной ветер.', cats: ['smith'], weapon: { name: 'Эльфийский клинок', dmg: 34 } },
  { id: 'darkAxe', icon: '🪓', name: 'Топор Тьмы', price: 480, desc: 'Урон 32. Помнит вкус крови.', cats: ['smith'], weapon: { name: 'Топор Тьмы', dmg: 32 } },
  { id: 'chainmail', icon: '🛡️', name: 'Кольчуга', price: 300, desc: 'Снижает получаемый урон на 18%.', cats: ['merchant', 'smith'], armor: { name: 'Кольчуга', dr: 0.18 } },
  { id: 'plate', icon: '🏰', name: 'Латы стража', price: 650, desc: 'Снижает получаемый урон на 28%.', cats: ['smith'], armor: { name: 'Латы стража', dr: 0.28 } },
  { id: 'heal', icon: '✚', name: 'Лечение у лекаря', price: 45, desc: 'Восстанавливает 60 здоровья и останавливает кровь.', cats: ['healer'], service: 'heal' },
  { id: 'fullheal', icon: '💊', name: 'Полное исцеление', price: 90, desc: 'Возвращает всё здоровье и очищает раны.', cats: ['healer'], service: 'fullheal' },
];

const FACTION_LABEL = { elf: 'ЭЛЬФ', guard: 'СТРАЖА', villain: 'ВЛАДЫКА', neutral: 'ПУТНИК' };
const FACTION_COLOR = { elf: '#7fbf6a', guard: '#d9a441', villain: '#c14b4b', neutral: '#a9b8c9' };
const INJ_NAMES = {
  armL: 'Рука Л', armR: 'Рука П', legL: 'Нога Л', legR: 'Нога П', eyeL: 'Глаз Л', eyeR: 'Глаз П',
};

const TIPS = [
  'Потерянную руку можно заменить протезом у кузнеца — и снова держать оружие.',
  'Если вам выкололи глаз, половина экрана останется во тьме. Протез вернёт зрение.',
  'Без ноги вы будете ползти. Коляска быстрее, а протез — лучше всего.',
  'Кровотечение убивает медленно. Бинт (H) или лекарь спасут жизнь.',
  'Лесные эльфы быстрее в чаще. Стража крепче в бою. Владыка сильнее в атаке.',
  'Деревья вдали — картины. Подойдите ближе, и они станут объёмными.',
  'Корованы ходят по дороге между Тихим Бродом и дворцом. Ограбление — прибыльное дело.',
  'Старейшина и командир дают задания. Тёмный Владыка отдаёт приказы сам (T).',
  'Протез не пришивают к ране. Сначала остановите кровотечение!',
  'Сохраняйтесь в паузе (Esc) — смерть не отменяет историю, но откатывает её.',
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class UI {
  constructor(game) {
    this.game = game;
    this.selectedFaction = null;
    this.modal = null;
    this.deathShown = false;
    this.minimapTimer = 0;
    this.zoneKey = null;
    this.lastHp = -1;
    this.lastBleeding = null;
    this.toastTimers = new Set();
    this.bigMapDrawn = false;

    this.el = {
      hud: document.getElementById('hud'),
      menu: document.getElementById('menu'),
      loading: document.getElementById('loading'),
      loadingTip: document.getElementById('loadingTip'),
      startBtn: document.getElementById('startBtn'),
      continueBtn: document.getElementById('continueBtn'),
      nameInput: document.getElementById('nameInput'),
      cards: document.getElementById('factionCards'),
      hpFill: document.getElementById('hpFill'),
      hpText: document.getElementById('hpText'),
      stFill: document.getElementById('stFill'),
      goldText: document.getElementById('goldText'),
      xpText: document.getElementById('xpText'),
      charName: document.getElementById('charName'),
      charLevel: document.getElementById('charLevel'),
      factionBadge: document.getElementById('factionBadge'),
      injuryList: document.getElementById('injuryList'),
      bleedingWarn: document.getElementById('bleedingWarn'),
      potionCount: document.getElementById('potionCount'),
      bandageCount: document.getElementById('bandageCount'),
      zoneName: document.getElementById('zoneName'),
      questTitle: document.getElementById('questTitle'),
      questText: document.getElementById('questText'),
      questBar: document.getElementById('questBar'),
      minimap: document.getElementById('minimap'),
      prompt: document.getElementById('prompt'),
      toasts: document.getElementById('toasts'),
      floating: document.getElementById('floatingLayer'),
      eyeLoss: document.getElementById('eyeLoss'),
      bloodVignette: document.getElementById('bloodVignette'),
      hitFlash: document.getElementById('hitFlash'),
      stance: document.getElementById('stanceTag'),
      dialog: document.getElementById('dialogModal'),
      dialogKicker: document.getElementById('dialogKicker'),
      dialogTitle: document.getElementById('dialogTitle'),
      dialogText: document.getElementById('dialogText'),
      dialogOptions: document.getElementById('dialogOptions'),
      dialogPortrait: document.getElementById('dialogPortrait'),
      shop: document.getElementById('shopModal'),
      shopKicker: document.getElementById('shopKicker'),
      shopTitle: document.getElementById('shopTitle'),
      shopGold: document.getElementById('shopGold'),
      shopItems: document.getElementById('shopItems'),
      inv: document.getElementById('invModal'),
      invBody: document.getElementById('invBody'),
      map: document.getElementById('mapModal'),
      bigmap: document.getElementById('bigmap'),
      command: document.getElementById('commandModal'),
      commandOptions: document.getElementById('commandOptions'),
      pause: document.getElementById('pauseModal'),
      saveSlots: document.getElementById('saveSlots'),
      controlsHelp: document.getElementById('controlsHelp'),
      death: document.getElementById('deathScreen'),
      deathText: document.getElementById('deathText'),
    };

    this.bind();
    this.showMenu();
  }

  /* ---------------- bindings ---------------- */
  bind() {
    const e = this.el;
    e.cards.querySelectorAll('.faction-card').forEach((card) => {
      card.addEventListener('click', () => {
        e.cards.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedFaction = card.dataset.faction;
        e.startBtn.disabled = false;
      });
    });

    e.startBtn.addEventListener('click', () => {
      if (!this.selectedFaction) return;
      const name = (e.nameInput.value || '').trim() || 'Безымянный';
      this.game.startNewGame(this.selectedFaction, name);
    });
    e.nameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && this.selectedFaction) e.startBtn.click();
    });
    e.continueBtn.addEventListener('click', () => this.game.continueGame());

    document.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => this.closeModals());
    });

    document.getElementById('resumeBtn').addEventListener('click', () => this.closeModals());
    document.getElementById('saveMenuBtn').addEventListener('click', () => {
      this.renderSaveSlots();
      e.saveSlots.classList.remove('hidden');
    });
    document.getElementById('loadMenuBtn').addEventListener('click', () => {
      this.renderSaveSlots();
      e.saveSlots.classList.remove('hidden');
    });
    document.getElementById('controlsBtn').addEventListener('click', () => {
      e.controlsHelp.classList.toggle('hidden');
    });
    document.getElementById('quitBtn').addEventListener('click', () => this.game.quitToMenu());

    document.getElementById('respawnBtn').addEventListener('click', () => {
      this.game.player.respawnAtHealer();
    });
    document.getElementById('loadDeathBtn').addEventListener('click', () => {
      this.hideDeath();
      this.openPause();
      this.renderSaveSlots();
      e.saveSlots.classList.remove('hidden');
    });
    document.getElementById('quitDeathBtn').addEventListener('click', () => {
      this.hideDeath();
      this.game.quitToMenu();
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') {
        if (this.deathShown) return;
        if (this.modal) {
          this.closeModals();
          ev.preventDefault();
        } else if (this.game.state === 'playing' && !this.game.paused) {
          this.openPause();
          ev.preventDefault();
        }
        return;
      }
      if (this.game.state !== 'playing' || this.modal || this.deathShown) return;
      if (ev.code === 'KeyM') { this.openMap(); ev.preventDefault(); }
      if (ev.code === 'KeyI') { this.openInventory(); ev.preventDefault(); }
      if (ev.code === 'KeyT' && this.game.player.faction === 'villain') { this.openCommand(); ev.preventDefault(); }
      if (ev.code === 'F5') { this.game.saveGame(false); ev.preventDefault(); }
      if (ev.code === 'F9') { this.game.quickLoad(); ev.preventDefault(); }
    });

    this.el.nameInput.value = 'Кирилл';
  }

  /* ---------------- loading / menu ---------------- */
  showLoading(text = 'Пробуждаем древний лес…') {
    this.el.loading.classList.remove('hidden');
    this.el.loading.querySelector('.loading-title').textContent = text;
    this.el.loadingTip.textContent = TIPS[(Math.random() * TIPS.length) | 0];
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.eyeLoss.classList.add('hidden');
    this.el.bloodVignette.style.opacity = '0';
    this.closeModals(true);
    this.el.continueBtn.classList.toggle('hidden', !this.game.hasSaves());
  }

  hideMenu() {
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  /* ---------------- HUD ---------------- */
  refreshAll() {
    const p = this.game.player;
    if (!p) return;
    this.el.charName.textContent = p.name;
    this.el.charLevel.textContent = p.stats.level + ' ур.';
    this.el.factionBadge.textContent = FACTION_LABEL[p.faction] || 'ПУТНИК';
    this.el.factionBadge.style.color = FACTION_COLOR[p.faction] || '#c8a45c';
    this.el.factionBadge.style.borderColor = (FACTION_COLOR[p.faction] || '#c8a45c') + '88';
    this.el.goldText.textContent = p.stats.gold;
    this.el.xpText.textContent = `${p.stats.xp} / ${p.stats.xpNext} опыта`;
    this.el.potionCount.textContent = p.potions;
    this.el.bandageCount.textContent = p.bandages;
    this.el.bleedingWarn.classList.toggle('hidden', !p.bleeding);
    this.refreshInjuries();
    this.updateEye(p.inj);
  }

  refreshInjuries() {
    const p = this.game.player;
    if (!p) return;
    let html = '';
    for (const key of Object.keys(INJ_NAMES)) {
      if (p.inj[key] === 'lost') html += `<span class="injury">${INJ_NAMES[key]} ✕</span>`;
      else if (p.inj[key] === 'prosthetic') html += `<span class="injury prosthetic">${INJ_NAMES[key]} ⚙</span>`;
    }
    if (p.wheelchairOn) html += '<span class="injury prosthetic">КОЛЯСКА</span>';
    this.el.injuryList.innerHTML = html;
  }

  updateEye(inj) {
    const el = this.el.eyeLoss;
    if (!inj) { el.classList.add('hidden'); el.className = 'hidden'; return; }
    const l = inj.eyeL === 'lost';
    const r = inj.eyeR === 'lost';
    el.classList.remove('hidden', 'left', 'right', 'both');
    if (l && r) el.classList.add('both');
    else if (l) el.classList.add('left');
    else if (r) el.classList.add('right');
    else { el.classList.add('hidden'); }
  }

  setPrompt(html) {
    if (!html) {
      this.el.prompt.classList.add('hidden');
      this.el.prompt.innerHTML = '';
      return;
    }
    if (this.el.prompt.innerHTML !== html) this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }

  toast(text, kind = '') {
    const div = document.createElement('div');
    div.className = 'toast ' + kind;
    div.textContent = text;
    this.el.toasts.appendChild(div);
    const timer = setTimeout(() => {
      div.remove();
      this.toastTimers.delete(timer);
    }, 3900);
    this.toastTimers.add(timer);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  setQuest(title, text, progress = 0, need = 1) {
    this.el.questTitle.textContent = title;
    this.el.questText.textContent = text;
    const ratio = need > 0 ? clamp(progress / need, 0, 1) : 0;
    this.el.questBar.style.width = (ratio * 100) + '%';
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    if (!p || game.state !== 'playing') return;

    const hpRatio = clamp(p.stats.hp / p.stats.maxHp, 0, 1);
    this.el.hpFill.style.width = (hpRatio * 100) + '%';
    this.el.hpFill.classList.toggle('low', hpRatio < 0.3);
    this.el.hpText.textContent = `${Math.max(0, Math.ceil(p.stats.hp))} / ${p.stats.maxHp}`;
    this.el.stFill.style.width = clamp(p.stats.stamina / p.stats.maxStamina, 0, 1) * 100 + '%';
    this.el.goldText.textContent = p.stats.gold;
    this.el.xpText.textContent = `${p.stats.xp} / ${p.stats.xpNext} опыта`;
    this.el.potionCount.textContent = p.potions;
    this.el.bandageCount.textContent = p.bandages;
    this.el.stance.classList.toggle('hidden', !p.blocking);

    if (p.bleeding !== this.lastBleeding) {
      this.lastBleeding = p.bleeding;
      this.el.bleedingWarn.classList.toggle('hidden', !p.bleeding);
    }

    const zone = game.world.zoneAt(p.pos.x, p.pos.z);
    if (zone.key !== this.zoneKey) {
      this.zoneKey = zone.key;
      this.el.zoneName.textContent = zone.name;
      this.toast('Вы вошли: ' + zone.name, 'gold');
    }

    const danger = p.bleeding ? 0.45 : 0;
    const blood = clamp((1 - hpRatio) * 0.9 + danger, 0, 0.85);
    this.el.bloodVignette.style.opacity = (blood * 0.8).toFixed(2);

    this.minimapTimer -= dt;
    if (this.minimapTimer <= 0) {
      this.minimapTimer = 0.16;
      this.drawMinimap();
    }
  }

  damageFlash() {
    const el = this.el.hitFlash;
    el.style.opacity = '1';
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { el.style.opacity = '0'; }, 80);
  }

  /* ---------------- minimap / map ---------------- */
  drawMinimap() {
    const p = this.game.player;
    const world = this.game.world;
    const cv = this.el.minimap;
    const ctx = cv.getContext('2d');
    const size = cv.width;
    const view = 150;
    const map = world.mapCanvas;
    const ms = world.mapSize;
    if (!map) return;
    const zx = ((p.pos.x + 450) / 900) * ms;
    const zy = ((p.pos.z + 450) / 900) * ms;
    const srcHalf = (view / 900) * ms;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(map, zx - srcHalf, zy - srcHalf, srcHalf * 2, srcHalf * 2, 0, 0, size, size);

    const scale = size / (view * 2);
    const toMini = (x, z) => [size / 2 + (x - p.pos.x) * scale, size / 2 + (z - p.pos.z) * scale];

    for (const npc of this.game.npcs.list) {
      if (npc.dead || npc.removed) continue;
      const [x, y] = toMini(npc.pos.x, npc.pos.z);
      if (x < 4 || x > size - 4 || y < 4 || y > size - 4) continue;
      ctx.fillStyle = FACTION_COLOR[npc.faction] || '#aaa';
      ctx.beginPath();
      ctx.arc(x, y, npc.isGiver ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const c = this.game.npcs.caravan;
    if (c) {
      const [x, y] = toMini(c.position.x, c.position.z);
      ctx.fillStyle = '#f0d38a';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    const marker = this.game.quests?.marker;
    if (marker) {
      const [x, y] = toMini(marker.group.position.x, marker.group.position.z);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(x, y, 4.5 + Math.sin(performance.now() * 0.006) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player arrow
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(200,164,92,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  openMap() {
    this.openModal('map');
    const world = this.game.world;
    const p = this.game.player;
    const cv = this.el.bigmap;
    const ctx = cv.getContext('2d');
    const size = cv.width;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(world.mapCanvas, 0, 0, size, size);

    const toMap = (x, z) => [((x + 450) / 900) * size, ((z + 450) / 900) * size];
    for (const npc of this.game.npcs.list) {
      if (npc.dead || npc.removed) continue;
      const [x, y] = toMap(npc.pos.x, npc.pos.z);
      ctx.fillStyle = FACTION_COLOR[npc.faction] || '#aaa';
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(x, y, npc.isGiver ? 4.5 : 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const c = this.game.npcs.caravan;
    if (c) {
      const [x, y] = toMap(c.position.x, c.position.z);
      ctx.fillStyle = '#f0d38a';
      ctx.fillRect(x - 5, y - 5, 10, 10);
    }
    const marker = this.game.quests?.marker;
    if (marker) {
      const [x, y] = toMap(marker.group.position.x, marker.group.position.z);
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke();
    }
    const [px, py] = toMap(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p.yaw + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();

    // zone caption
    ctx.font = '600 18px "Palatino Linotype", Georgia, serif';
    ctx.fillStyle = 'rgba(240,230,200,0.8)';
    ctx.textAlign = 'center';
    const zone = world.zoneAt(p.pos.x, p.pos.z);
    ctx.fillText('Вы: ' + (p.name || 'герой') + ' — ' + zone.name, size / 2, size - 24);
  }

  /* ---------------- modals ---------------- */
  openModal(name) {
    this.closeModals(true);
    this.modal = name;
    const map = { dialog: this.el.dialog, shop: this.el.shop, inv: this.el.inv, map: this.el.map, command: this.el.command, pause: this.el.pause };
    const el = map[name];
    if (el) el.classList.remove('hidden');
    this.game.paused = true;
    this.setPrompt(null);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeModals(force = false) {
    const names = ['dialog', 'shop', 'inv', 'map', 'command', 'pause'];
    for (const n of names) {
      const el = { dialog: this.el.dialog, shop: this.el.shop, inv: this.el.inv, map: this.el.map, command: this.el.command, pause: this.el.pause }[n];
      el.classList.add('hidden');
    }
    this.modal = null;
    if (force) return;
    if (this.game.state === 'playing' && !this.deathShown && !this.game.player.dead) {
      this.game.paused = false;
      this.game.requestLock();
    }
  }

  openPause() {
    this.openModal('pause');
    this.el.controlsHelp.classList.add('hidden');
    this.el.saveSlots.classList.add('hidden');
    this.renderSaveSlots();
  }

  openInventory() {
    const p = this.game.player;
    const gear = p.gear;
    const injRows = Object.keys(INJ_NAMES).map(k => {
      const st = p.inj[k];
      const label = st === 'lost' ? '<span class="bad">потеряно</span>' : st === 'prosthetic' ? '<span class="good">протез</span>' : '<span>цело</span>';
      return `<div class="inv-line"><span>${INJ_NAMES[k]}</span>${label}</div>`;
    }).join('');
    this.el.invBody.innerHTML = `
      <div class="inv-section">
        <h3>Снаряжение</h3>
        <div class="inv-line"><span>Оружие</span><b>${gear.weaponName}</b></div>
        <div class="inv-line"><span>Урон</span><b>${gear.weaponDmg}</b></div>
        <div class="inv-line"><span>Броня</span><b>${gear.armorName}</b></div>
        <div class="inv-line"><span>Защита</span><b>${Math.round(gear.armorDR * 100)}%</b></div>
        <div class="inv-line"><span>Коляска</span><b>${gear.wheelchair ? (p.wheelchairOn ? 'едете' : 'есть') : 'нет'}</b></div>
        <div class="inv-line"><span>Зелья</span><b>${p.potions}</b></div>
        <div class="inv-line"><span>Бинты</span><b>${p.bandages}</b></div>
      </div>
      <div class="inv-section">
        <h3>Тело</h3>
        ${injRows}
      </div>
      <div class="inv-tip">Кровотечение убивает. Бинт (H) или лекарь остановят кровь. Протезы продаются у кузнеца и торговца. Если потеряны обе ноги — купите коляску и нажмите 2.</div>
    `;
    this.openModal('inv');
  }

  /* ---------------- dialog ---------------- */
  showDialog({ kicker = 'РАЗГОВОР', title = '', text = '', portrait = '!', options = [] }) {
    this.el.dialogKicker.textContent = kicker;
    this.el.dialogTitle.textContent = title;
    this.el.dialogText.textContent = text;
    this.el.dialogPortrait.textContent = portrait;
    this.el.dialogOptions.innerHTML = '';
    for (const opt of options) {
      const b = document.createElement('button');
      b.className = 'btn' + (opt.primary ? ' primary' : '');
      b.textContent = opt.label;
      b.disabled = !!opt.disabled;
      b.addEventListener('click', () => {
        if (opt.close !== false) this.closeModals();
        opt.action?.();
      });
      this.el.dialogOptions.appendChild(b);
    }
    this.openModal('dialog');
  }

  /* ---------------- shop ---------------- */
  openShop(kind = 'merchant', npcName = 'Торговец') {
    this.shopKind = kind;
    const titles = { merchant: 'Торговец Марк', smith: 'Кузнец Гар', healer: 'Лекарь Вилена' };
    const kickers = { merchant: 'ТОВАРЫ И СНАРЯЖЕНИЕ', smith: 'КУЗНЕЦ', healer: 'ЛЕКАРЬ' };
    this.el.shopTitle.textContent = titles[kind] || npcName;
    this.el.shopKicker.textContent = kickers[kind] || 'ЛАВКА';
    this.el.shopGold.textContent = this.game.player.stats.gold;
    this.renderShopItems();
    this.openModal('shop');
  }

  renderShopItems() {
    const p = this.game.player;
    const kind = this.shopKind || 'merchant';
    const items = SHOP_ITEMS.filter(i => i.cats.includes(kind));
    this.el.shopGold.textContent = p.stats.gold;
    this.el.shopItems.innerHTML = '';
    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'shop-item';
      const owned = this.ownsItem(item, p);
      div.innerHTML = `
        <div class="icon">${item.icon}</div>
        <div class="info">
          <div class="name">${item.name}</div>
          <div class="desc">${item.desc}</div>
        </div>
        <button class="buy" ${p.stats.gold < item.price || owned ? 'disabled' : ''}>${owned ? 'есть' : item.price + ' 🪙'}</button>
      `;
      div.querySelector('.buy').addEventListener('click', () => {
        const ok = this.game.buyItem(item);
        if (ok) {
          this.renderShopItems();
          this.refreshAll();
          this.game.audio?.coin();
        }
      });
      this.el.shopItems.appendChild(div);
    }
  }

  ownsItem(item, p) {
    if (item.weapon && p.gear.weaponDmg >= item.weapon.dmg) return true;
    if (item.armor && p.gear.armorDR >= item.armor.dr) return true;
    if (item.id === 'wheelchair' && p.gear.wheelchair) return true;
    if (item.limb) {
      const keys = item.limb === 'arm' ? ['armL', 'armR'] : item.limb === 'leg' ? ['legL', 'legR'] : ['eyeL', 'eyeR'];
      return keys.every(k => p.inj[k] !== 'lost');
    }
    return false;
  }

  /* ---------------- command ---------------- */
  openCommand() {
    if (this.game.player.faction !== 'villain') return;
    const opts = this.game.quests.getCommandOptions();
    this.el.commandOptions.innerHTML = '';
    if (this.game.quests.active) {
      const note = document.createElement('p');
      note.className = 'dialog-text';
      note.textContent = 'Текущий приказ ещё не выполнен: ' + this.game.quests.active.title + '.';
      this.el.commandOptions.appendChild(note);
    }
    for (const opt of opts) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = `<b>${opt.title}</b><span>${opt.desc}</span>`;
      b.disabled = !!this.game.quests.active;
      b.addEventListener('click', () => this.game.quests.commandQuest(opt.index));
      this.el.commandOptions.appendChild(b);
    }
    const follow = document.createElement('button');
    follow.className = 'btn';
    follow.innerHTML = '<b>Собрать отряд</b><span>Отряд следует за вами и атакует врагов рядом.</span>';
    follow.addEventListener('click', () => {
      this.game.npcs.setSquadOrder('follow');
      this.closeModals();
    });
    this.el.commandOptions.appendChild(follow);
    this.openModal('command');
  }

  /* ---------------- saves ---------------- */
  renderSaveSlots() {
    const slots = this.game.getSaveMeta();
    this.el.saveSlots.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const meta = slots[i];
      const row = document.createElement('div');
      row.className = 'save-slot';
      row.innerHTML = `
        <div class="slot-info">${meta ? `<b>Слот ${i}</b> · ${meta.factionName} · ${meta.level} ур. · ${meta.date}` : `<b>Слот ${i}</b> · пусто`}</div>
      `;
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn small';
      saveBtn.textContent = 'Сохранить';
      saveBtn.addEventListener('click', () => {
        this.game.saveToSlot(i);
        this.renderSaveSlots();
      });
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn small';
      loadBtn.textContent = 'Загрузить';
      loadBtn.disabled = !meta;
      loadBtn.addEventListener('click', () => this.game.loadFromSlot(i));
      row.appendChild(saveBtn);
      row.appendChild(loadBtn);
      this.el.saveSlots.appendChild(row);
    }
  }

  /* ---------------- death ---------------- */
  showDeath(cause) {
    if (this.deathShown) return;
    this.deathShown = true;
    this.el.deathText.textContent = cause || 'Тьма сомкнулась над вами.';
    this.el.death.classList.remove('hidden');
    this.game.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  hideDeath() {
    this.deathShown = false;
    this.el.death.classList.add('hidden');
  }
}
