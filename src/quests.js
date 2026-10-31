import * as THREE from '../vendor/three.module.js';

/* ============================================================
   QUESTS & COMMANDS — three very different chains of duty.
   ============================================================ */

export class QuestSystem {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.completed = 0;
    this.marker = null;
    this._uiTimer = 0;
    this._lastUi = '';
  }

  applyFactionStart(faction) {
    const npcs = this.game.npcs;
    if (this.commander) this.commander = npcs.commander;
    if (this.elder) this.elder = npcs.elder;
    this.commander = npcs.commander;
    this.elder = npcs.elder;
    if (faction === 'guard') {
      npcs.commander?.setQuestMark(true);
      this.game.ui?.toast('Вы — страж дворца. Командир ждёт вас у ворот. Слушайтесь приказов.', 'gold');
      this.game.ui?.setQuest('Служба', 'Подойдите к командиру Дорну у ворот дворца и получите приказ.', 0, 1);
    } else if (faction === 'elf') {
      npcs.elder?.setQuestMark(true);
      this.game.ui?.toast('Вы — дитя леса. Старейшина Эларион ждёт у Древа Совета.', 'gold');
      this.game.ui?.setQuest('Совет леса', 'Подойдите к старейшине у Древа Совета и получите задание.', 0, 1);
    } else {
      npcs.setSquadOrder('follow');
      this.game.ui?.toast('Вы — Тёмный Владыка. Нажмите T, чтобы отдать приказ войску.', 'gold');
      this.game.ui?.setQuest('Власть', 'Откройте приказы (T) и ведите отряд на дворец, эльфов или корован.', 0, 1);
    }
  }

  refreshMarks() {
    const npcs = this.game.npcs;
    if (npcs.commander) npcs.commander.setQuestMark(!this.active && this.game.player.faction === 'guard');
    if (npcs.elder) npcs.elder.setQuestMark(!this.active && this.game.player.faction === 'elf');
  }

  /* ---------------- offers ---------------- */
  offersFor(faction) {
    const w = this.game.world;
    const palaceGate = w.sitePos('palace', 0, 44);
    const palaceCourt = w.sitePos('palace', 0, 20);
    const elfGate = w.sitePos('elf', 0, 40);
    const elfHeart = w.sitePos('elf', 0, 0);
    const fort = w.sitePos('villain', 0, 26);
    const town = w.sitePos('neutral', 0, 10);

    if (faction === 'guard') {
      return [
        {
          id: 'g_elves', title: 'Набег на эльфийский лагерь',
          desc: 'Командир приказал проучить лесных партизан. Убейте 4 эльфов в лесу — их лагерь к северо-западу, за Тихим Бродом.',
          type: 'kill', targetFaction: 'elf', need: 4, targetPos: elfGate,
          rewardGold: 190, rewardXp: 95,
          spawn: { faction: 'elf', count: 4, center: elfGate, assault: elfHeart },
        },
        {
          id: 'g_defend', title: 'Отразить набег на дворец',
          desc: 'Эльфийские партизаны идут к воротам! Встаньте на защиту дворца и уничтожьте 4 налётчиков.',
          type: 'defend', targetFaction: 'elf', need: 4, targetPos: palaceGate,
          rewardGold: 220, rewardXp: 110,
          spawn: { faction: 'elf', count: 4, center: w.sitePos('palace', -10, 85), assault: palaceCourt },
        },
        {
          id: 'g_patrol', title: 'Патруль крепостной стены',
          desc: 'Командир велел обойти три поста у стен дворца. Найдите отмеченные точки.',
          type: 'patrol', need: 3,
          points: [
            w.sitePos('palace', -38, 40), w.sitePos('palace', 38, 24), w.sitePos('palace', 0, -38),
          ],
          rewardGold: 130, rewardXp: 65,
        },
        {
          id: 'g_spy', title: 'Эльфийский шпион',
          desc: 'В Тихом Броде прячется эльфийский шпион. Найдите его среди людей и убейте.',
          type: 'kill', targetFaction: 'elf', need: 1, targetPos: town,
          rewardGold: 170, rewardXp: 85,
          spawn: { faction: 'elf', count: 1, center: w.sitePos('neutral', 14, 8), role: 'spy', name: 'Шпион Сильван' },
        },
      ];
    }
    if (faction === 'elf') {
      return [
        {
          id: 'e_defend', title: 'Защитить лес',
          desc: 'Имперские солдаты вошли в чащу. Убейте 4 захватчиков, пока они не сожгли деревню.',
          type: 'defend', targetFaction: 'guard', need: 4, targetPos: elfGate,
          rewardGold: 200, rewardXp: 100,
          spawn: { faction: 'guard', count: 4, center: w.sitePos('elf', 0, 58), assault: elfHeart },
        },
        {
          id: 'e_raid', title: 'Набег на дворец',
          desc: 'Проучите имперцев. Убейте 4 стражников у дворца — путь лежит через Тихой Брод.',
          type: 'kill', targetFaction: 'guard', need: 4, targetPos: palaceGate,
          rewardGold: 230, rewardXp: 115,
          spawn: null,
        },
        {
          id: 'e_caravan', title: 'Ограбить корован',
          desc: 'По дороге между Тихим Бродом и дворцом идёт имперский корован. Ограбьте его — золото принадлежит лесу.',
          type: 'caravan', need: 1, targetPos: this.game.npcs.caravan?.position?.clone() || town,
          rewardGold: 210, rewardXp: 90,
        },
        {
          id: 'e_villain', title: 'Выжечь старый форт',
          desc: 'Слуги Тёмного Владыки угрожают лесу. Убейте 4 его прислужников возле старого форта в горах.',
          type: 'kill', targetFaction: 'villain', need: 4, targetPos: fort,
          rewardGold: 240, rewardXp: 120,
          spawn: { faction: 'villain', count: 3, center: w.sitePos('villain', 0, 32) },
        },
      ];
    }
    // villain
    return [
      {
        id: 'v_palace', title: 'Штурм дворца',
        desc: 'Ведите отряд на дворец. Убейте 5 имперских стражников и покажите Империи, кто здесь власть.',
        type: 'kill', targetFaction: 'guard', need: 5, targetPos: palaceGate,
        rewardGold: 300, rewardXp: 160,
        squadPos: palaceGate,
      },
      {
        id: 'v_elves', title: 'Набег на лес',
        desc: 'Лесные эльфы слишком долго живут спокойно. Убейте 5 эльфов в их деревне.',
        type: 'kill', targetFaction: 'elf', need: 5, targetPos: elfGate,
        rewardGold: 320, rewardXp: 160,
        squadPos: elfGate,
      },
      {
        id: 'v_defend', title: 'Оборона форта',
        desc: 'Эльфы решили напасть на форт. Убейте 4 налётчиков у стен старого форта.',
        type: 'defend', targetFaction: 'elf', need: 4, targetPos: fort,
        rewardGold: 260, rewardXp: 130,
        spawn: { faction: 'elf', count: 4, center: w.sitePos('villain', 0, 45), assault: w.sitePos('villain', 0, 10) },
        squadPos: w.sitePos('villain', 0, 15),
      },
      {
        id: 'v_caravan', title: 'Дань с корована',
        desc: 'Корован людей — лёгкая добыча. Ограбьте его и принесите золото в форт.',
        type: 'caravan', need: 1, targetPos: this.game.npcs.caravan?.position?.clone() || town,
        rewardGold: 280, rewardXp: 120,
        squadPos: this.game.npcs.caravan?.position?.clone() || town,
      },
    ];
  }

  getOffer(npc) {
    if (this.active) return null;
    if (!npc || !npc.isGiver) return null;
    if (npc.giverRole !== 'commander' && npc.giverRole !== 'elder') return null;
    const offers = this.offersFor(this.game.player.faction);
    // never repeat the same quest twice in a row
    let available = offers.filter(o => o.id !== this.lastId);
    if (!available.length) available = offers;
    const q = available[(Math.random() * available.length) | 0];
    return q;
  }

  startOffer(quest, npc = null) {
    this.startQuest(quest);
    if (npc) npc.setQuestMark(false);
  }

  commandQuest(index) {
    if (this.active) {
      this.game.ui?.toast('Сначала завершите текущее задание', 'bad');
      return;
    }
    const offers = this.offersFor('villain');
    const q = offers[index];
    if (!q) return;
    if (q.type === 'caravan' && this.game.npcs.caravan) {
      this.game.npcs.caravan.looted = false;
    }
    this.startQuest(q);
    if (q.squadPos) this.game.npcs.setSquadOrder('assault', q.squadPos);
    this.game.ui?.closeModals();
  }

  startQuest(q, restore = null) {
    this.lastId = q.id;
    const progress = restore?.progress || 0;
    const active = {
      ...q,
      progress,
      targetPos: q.targetPos ? q.targetPos.clone() : null,
      points: q.points ? q.points.map(p => p.clone()) : null,
    };
    this.active = active;
    this.game.ui?.closeModals();
    this.game.ui?.toast(`Новое задание: ${q.title}`, 'gold');
    this.game.audio?.quest();

    if (q.spawn) {
      const spawn = q.spawn;
      let count = q.type === 'kill' ? Math.max(0, q.need - progress) : spawn.count;
      if (q.id === 'g_spy') count = progress >= q.need ? 0 : 1;
      if (q.type === 'defend' && restore) count = Math.max(0, q.need - progress);
      if (count > 0) {
        this.game.npcs.spawnWave(spawn.faction, count, spawn.center, {
          role: spawn.role, name: spawn.name, assaultPos: spawn.assault,
          raid: true, aggroRange: 30,
        });
      }
    }

    if (q.type === 'caravan' && this.game.npcs.caravan) {
      this.game.npcs.caravan.looted = false;
      active.targetPos = this.game.npcs.caravan.position.clone();
    }

    this.refreshMarks();
    if (active.type === 'patrol') {
      active.progress = Math.min(active.progress, active.points.length - 1);
      this.setMarker(active.points[active.progress], 'Пост');
    } else if (active.targetPos) {
      this.setMarker(active.targetPos, active.title);
    } else if (active.type === 'caravan' && this.game.npcs.caravan) {
      this.setMarker(this.game.npcs.caravan.position, 'Корован');
    }
    this.updateUI(true);
  }

  setMarker(pos, label) {
    if (this.marker) this.game.world.removeMarker(this.marker);
    this.marker = this.game.world.addMarker(pos, 0xf0d38a, label);
  }

  update(dt) {
    const active = this.active;
    if (!active) return;
    const player = this.game.player;

    if (active.type === 'patrol') {
      const p = active.points[active.progress];
      if (p && player.pos.distanceTo(p) < 4.5) {
        active.progress++;
        if (this.marker) {
          const idx = active.progress;
          if (idx >= active.need) {
            this.complete();
            return;
          }
          this.setMarker(active.points[Math.min(idx, active.points.length - 1)], 'Пост');
        }
        this.game.ui?.toast(`Пост пройден (${active.progress}/${active.need})`, 'good');
        this.updateUI(true);
      }
    }

    if (active.type === 'caravan') {
      const c = this.game.npcs.caravan;
      if (c) {
        if (this.marker) {
          this.marker.group.position.set(c.position.x, this.game.world.heightAt(c.position.x, c.position.z), c.position.z);
          active.targetPos.copy(c.position);
        }
      }
    }

    this._uiTimer -= dt;
    if (this._uiTimer <= 0) {
      this._uiTimer = 0.25;
      this.updateUI();
    }
  }

  onKill(npc, source) {
    const active = this.active;
    if (!active) return;
    if (active.type !== 'kill' && active.type !== 'defend') return;
    if (npc.faction !== active.targetFaction) return;
    const byPlayer = source === this.game.player;
    const byAlly = source && source.faction === this.game.player.faction;
    if (!byPlayer && !byAlly) return;
    active.progress++;
    this.game.ui?.toast(`Задание: ${Math.min(active.progress, active.need)} / ${active.need}`, 'good');
    this.updateUI(true);
    if (active.progress >= active.need) this.complete();
  }

  onCaravanLooted() {
    if (this.active && this.active.type === 'caravan') {
      this.active.progress = 1;
      this.complete();
    }
  }

  abandon() {
    if (!this.active) return false;
    const title = this.active.title;
    if (this.marker) {
      this.game.world.removeMarker(this.marker);
      this.marker = null;
    }
    this.active = null;
    this.refreshMarks();
    this.updateUI(true);
    this.game.ui?.toast(`Задание «${title}» отменено`, 'gold');
    return true;
  }

  complete() {
    const active = this.active;
    if (!active) return;
    if (this.marker) {
      this.game.world.removeMarker(this.marker);
      this.marker = null;
    }
    this.active = null;
    this.completed++;
    this.game.player.gainGold(active.rewardGold);
    this.game.player.gainXp(active.rewardXp);
    this.game.ui?.toast(`Задание выполнено: ${active.title}! +${active.rewardGold} золота, +${active.rewardXp} опыта.`, 'good');
    this.game.audio?.questComplete();
    this.refreshMarks();
    this.updateUI(true);
    this.game.saveGame(true);
  }

  updateUI(force = false) {
    const active = this.active;
    if (!active) {
      if (force || this._lastUi !== 'none') {
        this._lastUi = 'none';
        const faction = this.game.player.faction;
        if (faction === 'villain') {
          this.game.ui?.setQuest('Власть', 'Откройте приказы (T) и ведите отряд. Свобода — вот ваша награда.', 0, 1);
        } else {
          this.game.ui?.setQuest('Свободное время', 'Найдите командира или старейшину за новым заданием.', 0, 1);
        }
      }
      return;
    }
    let text = active.desc;
    if (active.type === 'kill' || active.type === 'defend') {
      text = active.desc + `\nУбито: ${Math.min(active.progress, active.need)} / ${active.need}`;
    } else if (active.type === 'patrol') {
      text = active.desc + `\nПосты: ${active.progress} / ${active.need}`;
    } else if (active.type === 'caravan') {
      text = active.desc + (active.progress ? '\nКорован ограблен.' : '\nНайдите корован на дороге.');
    }
    const sig = active.id + ':' + active.progress;
    if (!force && sig === this._lastUi) return;
    this._lastUi = sig;
    this.game.ui?.setQuest(active.title, text, active.progress, active.need);
  }

  serialize() {
    if (!this.active) return null;
    return { id: this.active.id, progress: this.active.progress };
  }

  restore(data) {
    if (!data) return false;
    const offers = this.offersFor(this.game.player.faction);
    const q = offers.find(o => o.id === data.id);
    if (!q) return false;
    this.startQuest(q, { progress: data.progress });
    return true;
  }

  getCommandOptions() {
    const offers = this.offersFor('villain');
    const descs = {
      v_palace: 'Ведите отряд к воротам дворца и уничтожьте 5 стражников.',
      v_elves: 'Идите в лес эльфов и убейте 5 защитников чащи.',
      v_defend: 'Эльфы атакуют форт — удержите его, уничтожив 4 налётчиков.',
      v_caravan: 'Перехватите корован на дороге и заберите дань.',
    };
    return offers.map((q, i) => ({ index: i, title: q.title, desc: descs[q.id] || q.desc }));
  }
}
