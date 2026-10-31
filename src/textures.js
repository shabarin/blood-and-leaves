import * as THREE from '../vendor/three.module.js';

/* ============================================================
   Procedural textures — no external assets required.
   ============================================================ */

export const TEX = {};

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(canvas, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Draw something multiple times offset so the tile wraps seamlessly. */
function wrapped(size, draws) {
  const offsets = [
    [0, 0], [-size, 0], [size, 0], [0, -size], [0, size],
    [-size, -size], [size, size], [-size, size], [size, -size],
  ];
  draws(offsets);
}

function noiseFill(ctx, size, base, spread, random) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (random() - 0.5) * spread;
    img.data[i * 4] = Math.max(0, Math.min(255, base[0] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawGrass(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  noiseFill(ctx, s, [150, 160, 125], 26, random);
  const colors = ['rgba(80,105,60,0.55)', 'rgba(120,140,90,0.5)', 'rgba(65,88,48,0.45)', 'rgba(160,170,120,0.35)'];
  wrapped(s, (offsets) => {
    for (let i = 0; i < 340; i++) {
      const x = random() * s, y = random() * s;
      const len = 3 + random() * 8;
      const ang = -Math.PI / 2 + (random() - 0.5) * 0.9;
      ctx.strokeStyle = colors[(random() * colors.length) | 0];
      ctx.lineWidth = 0.6 + random() * 0.9;
      for (const [ox, oy] of offsets) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
  });
}

function drawDirt(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  noiseFill(ctx, s, [118, 99, 74], 30, random);
  wrapped(s, (offsets) => {
    for (let i = 0; i < 260; i++) {
      const x = random() * s, y = random() * s, r = 1 + random() * 4;
      ctx.fillStyle = random() > 0.5 ? 'rgba(80,64,46,0.35)' : 'rgba(160,140,108,0.3)';
      for (const [ox, oy] of offsets) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.7, random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = random() * s, y = random() * s, r = 1 + random() * 2.4;
      ctx.fillStyle = 'rgba(80,78,72,0.5)';
      for (const [ox, oy] of offsets) {
        ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

function drawStone(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  noiseFill(ctx, s, [130, 128, 120], 22, random);
  const rowH = 32;
  for (let row = 0; row < s / rowH; row++) {
    const y = row * rowH;
    ctx.fillStyle = 'rgba(70,68,62,0.55)';
    ctx.fillRect(0, y, s, 2);
    const offset = (row % 2) * 32;
    for (let x = -offset; x < s; x += 64) {
      ctx.fillStyle = 'rgba(70,68,62,0.4)';
      ctx.fillRect((x + s) % s, y, 2, rowH);
      ctx.fillStyle = `rgba(${200 + random() * 30 | 0},${196 + random() * 30 | 0},${184 + random() * 30 | 0},0.07)`;
      ctx.fillRect((x + 3 + s) % s, y + 3, 56, rowH - 6);
    }
  }
  wrapped(s, (offsets) => {
    for (let i = 0; i < 140; i++) {
      const x = random() * s, y = random() * s;
      ctx.fillStyle = 'rgba(60,58,52,0.22)';
      for (const [ox, oy] of offsets) { ctx.fillRect(x + ox, y + oy, 1 + random() * 3, 1 + random() * 2); }
    }
  });
}

function drawWood(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  const rowH = s / 6;
  for (let row = 0; row < 6; row++) {
    const y = row * rowH;
    const tone = 100 + random() * 26;
    ctx.fillStyle = `rgb(${tone + 22 | 0},${tone - 10 | 0},${tone - 42 | 0})`;
    ctx.fillRect(0, y, s, rowH);
    noiseFill(ctx, 1, [0, 0, 0], 0, random); // no-op keeps rng warm
    for (let i = 0; i < 26; i++) {
      const x = random() * s;
      ctx.strokeStyle = `rgba(${45 + random() * 30 | 0},${30 + random() * 20 | 0},${16 + random() * 12 | 0},${0.1 + random() * 0.16})`;
      ctx.lineWidth = 0.6 + random() * 1.6;
      ctx.beginPath();
      const yy = y + 3 + random() * (rowH - 6);
      ctx.moveTo(x, yy);
      ctx.bezierCurveTo(x + 20, yy + 2, x + 40, yy - 2, x + 60 + random() * 40, yy + 1);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,26,14,0.5)';
    ctx.fillRect(0, y, s, 2);
  }
  ctx.fillStyle = 'rgba(30,20,10,0.35)';
  for (let x = 0; x < s; x += 64) ctx.fillRect(x, 0, 2, s);
}

function drawBark(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  noiseFill(ctx, s, [82, 62, 44], 22, random);
  for (let x = 0; x < s; x += 5 + random() * 5) {
    ctx.strokeStyle = `rgba(${30 + random() * 25 | 0},${22 + random() * 18 | 0},${14 + random() * 12 | 0},${0.35 + random() * 0.4})`;
    ctx.lineWidth = 1 + random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x + random() * 4, 0);
    for (let y = 0; y <= s; y += 16) ctx.lineTo(x + Math.sin(y * 0.05 + x) * 2.5, y);
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${120 + random() * 40 | 0},${95 + random() * 35 | 0},${65 + random() * 25 | 0},0.18)`;
    ctx.fillRect(random() * s, random() * s, 1 + random() * 2, 4 + random() * 16);
  }
}

function drawShingle(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  noiseFill(ctx, s, [168, 150, 128], 18, random);
  const rowH = 26;
  for (let row = 0; row < s / rowH; row++) {
    const y = row * rowH;
    const offset = (row % 2) * 18;
    for (let x = -offset; x < s; x += 36) {
      ctx.fillStyle = `rgba(${110 + random() * 60 | 0},${95 + random() * 50 | 0},${72 + random() * 40 | 0},0.28)`;
      ctx.fillRect(x + 1, y + 1, 34, rowH - 3);
      ctx.strokeStyle = 'rgba(60,48,34,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y + rowH);
      ctx.quadraticCurveTo(x + 18, y + rowH - 6, x + 36, y + rowH);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rowH); ctx.stroke();
    }
  }
}

function drawGrassTuft(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2;
  for (let i = 0; i < 13; i++) {
    const bend = (random() - 0.5) * 26;
    const h = s * (0.35 + random() * 0.6);
    const w = 1.5 + random() * 2.5;
    const g = 70 + random() * 60;
    ctx.fillStyle = `rgba(${g * 0.6 | 0},${g | 0},${g * 0.45 | 0},0.95)`;
    ctx.beginPath();
    ctx.moveTo(cx - w, s);
    ctx.quadraticCurveTo(cx + bend * 0.4, s - h * 0.6, cx + bend, s - h);
    ctx.quadraticCurveTo(cx + bend * 0.4 + w, s - h * 0.5, cx + w, s);
    ctx.fill();
  }
}

function drawPine(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  // trunk
  ctx.fillStyle = '#3b2b1d';
  ctx.fillRect(s * 0.46, s * 0.55, s * 0.08, s * 0.44);
  ctx.fillStyle = 'rgba(130,100,60,0.5)';
  ctx.fillRect(s * 0.47, s * 0.55, s * 0.025, s * 0.42);
  // layered canopy
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const topY = s * (0.02 + t * 0.28);
    const botY = s * (0.30 + t * 0.35);
    const halfW = s * (0.13 + t * 0.33);
    const cx = s / 2;
    const dark = i < 2 ? 34 : 44;
    const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    grad.addColorStop(0, `rgb(${dark + 6},${dark + 46},${dark + 18})`);
    grad.addColorStop(0.5, `rgb(${dark + 26},${dark + 76},${dark + 30})`);
    grad.addColorStop(1, `rgb(${dark},${dark + 34},${dark + 14})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    // jagged right
    let y = topY;
    while (y < botY - 4) {
      y += 5;
      ctx.lineTo(cx + halfW * ((y - topY) / (botY - topY)) * (0.85 + random() * 0.2), y);
    }
    ctx.lineTo(cx + halfW, botY);
    // jagged bottom
    const steps = 8;
    for (let k = steps; k >= 0; k--) {
      ctx.lineTo(cx - halfW + (2 * halfW * k) / steps, botY - random() * s * 0.02);
    }
    ctx.lineTo(cx - halfW, botY);
    y = botY;
    while (y > topY + 4) {
      y -= 5;
      ctx.lineTo(cx - halfW * ((y - topY) / (botY - topY)) * (0.85 + random() * 0.2), y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,30,12,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // top highlight
  ctx.fillStyle = 'rgba(170,200,140,0.22)';
  ctx.beginPath();
  ctx.ellipse(s * 0.45, s * 0.12, s * 0.08, s * 0.03, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBroadleaf(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = '#43301f';
  ctx.fillStyle = '#43301f';
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s);
  ctx.quadraticCurveTo(s * 0.48, s * 0.7, s * 0.5, s * 0.5);
  ctx.stroke();
  ctx.fillRect(s * 0.47, s * 0.55, s * 0.06, s * 0.45);

  const blobs = [
    [0.5, 0.32, 0.22], [0.34, 0.38, 0.17], [0.66, 0.38, 0.17],
    [0.43, 0.22, 0.16], [0.58, 0.24, 0.15], [0.5, 0.42, 0.19],
    [0.27, 0.3, 0.12], [0.73, 0.3, 0.12],
  ];
  for (let i = 0; i < blobs.length; i++) {
    const [bx, by, r] = blobs[i];
    const light = i % 2 === 0;
    const grad = ctx.createRadialGradient(s * bx - s * 0.04, s * by - s * 0.05, s * 0.02, s * bx, s * by, s * r);
    grad.addColorStop(0, light ? '#7fa34f' : '#5d8038');
    grad.addColorStop(1, light ? '#3a5824' : '#2a441a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s * bx, s * by, s * r * (0.9 + random() * 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(${150 + random() * 50 | 0},${190 + random() * 40 | 0},${80 + random() * 40 | 0},0.25)`;
    const a = random() * Math.PI * 2, r = random() * s * 0.26;
    ctx.beginPath();
    ctx.arc(s * 0.5 + Math.cos(a) * r, s * 0.31 + Math.sin(a) * r * 0.8, 1 + random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlood(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 9; i++) {
    const x = s * (0.25 + random() * 0.5), y = s * (0.25 + random() * 0.5);
    const r = s * (0.06 + random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(125,12,8,0.95)');
    g.addColorStop(0.7, 'rgba(92,8,6,0.75)');
    g.addColorStop(1, 'rgba(70,4,4,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${90 + random() * 40 | 0},6,4,${0.4 + random() * 0.5})`;
    const a = random() * Math.PI * 2, d = s * (0.15 + random() * 0.32);
    ctx.beginPath();
    ctx.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCloud(canvas, random) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 22; i++) {
    const x = s * (0.15 + random() * 0.7), y = s * (0.35 + random() * 0.3);
    const r = s * (0.06 + random() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.6, 'rgba(245,248,240,0.22)');
    g.addColorStop(1, 'rgba(240,245,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGlow(canvas) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,190,0.65)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

function drawBanner(color) {
  const c = makeCanvas(128, 192);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 192);
  // cloth with swallowtail bottom
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 8); ctx.lineTo(116, 8); ctx.lineTo(116, 150);
  ctx.lineTo(92, 168); ctx.lineTo(64, 150); ctx.lineTo(36, 168);
  ctx.lineTo(12, 150); ctx.closePath(); ctx.fill();
  // folds
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g; ctx.fill();
  // emblem
  ctx.strokeStyle = 'rgba(235,215,160,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 38); ctx.lineTo(90, 70); ctx.lineTo(64, 108); ctx.lineTo(38, 70); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.arc(64, 70, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(235,215,160,0.75)';
  ctx.font = 'bold 20px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('✦', 64, 78);
  return canvasTexture(c, 1);
}

export function initTextures() {
  const random = rng(20260214);

  const grass = makeCanvas(256); drawGrass(grass, random);
  TEX.grass = canvasTexture(grass, 1);

  const dirt = makeCanvas(256); drawDirt(dirt, random);
  TEX.dirt = canvasTexture(dirt, 1);

  const stone = makeCanvas(256); drawStone(stone, random);
  TEX.stone = canvasTexture(stone, 1);

  const wood = makeCanvas(256); drawWood(wood, random);
  TEX.wood = canvasTexture(wood, 1);

  const bark = makeCanvas(128); drawBark(bark, random);
  TEX.bark = canvasTexture(bark, 2);

  const shingle = makeCanvas(256); drawShingle(shingle, random);
  TEX.shingle = canvasTexture(shingle, 1);

  const tuft = makeCanvas(64); drawGrassTuft(tuft, random);
  TEX.tuft = canvasTexture(tuft, 1);

  const pine = makeCanvas(128); drawPine(pine, random);
  TEX.pine = canvasTexture(pine, 1);

  const broad = makeCanvas(128); drawBroadleaf(broad, random);
  TEX.broad = canvasTexture(broad, 1);

  const blood = makeCanvas(128); drawBlood(blood, random);
  TEX.blood = canvasTexture(blood, 1);

  const cloud = makeCanvas(256); drawCloud(cloud, random);
  TEX.cloud = canvasTexture(cloud, 1);

  const glow = makeCanvas(128); drawGlow(glow);
  TEX.glow = canvasTexture(glow, 1);

  TEX.bannerGreen = drawBanner('#2f4a26');
  TEX.bannerRed = drawBanner('#5c1f1a');
  TEX.bannerGold = drawBanner('#7a5a20');
  TEX.bannerBlue = drawBanner('#22384f');

  return TEX;
}

/** Text sprite used for NPC names, labels and "!" markers. */
export function makeTextSprite(text, opts = {}) {
  const {
    color = '#f0e2bc',
    background = 'rgba(8, 12, 9, 0.72)',
    border = 'rgba(200, 164, 92, 0.5)',
    fontSize = 34,
    padding = 16,
    worldWidth = 4.2,
    depthTest = false,
  } = opts;

  const c = makeCanvas(16, 16);
  const ctx = c.getContext('2d');
  const font = `600 ${fontSize}px "Palatino Linotype", Georgia, serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + padding * 2;
  const h = fontSize + padding * 2;
  c.width = w; c.height = h;
  const ctx2 = c.getContext('2d');
  ctx2.font = font;
  ctx2.fillStyle = background;
  ctx2.strokeStyle = border;
  ctx2.lineWidth = 2;
  const r = 6;
  ctx2.beginPath();
  ctx2.moveTo(r, 1); ctx2.lineTo(w - r, 1); ctx2.quadraticCurveTo(w - 1, 1, w - 1, r);
  ctx2.lineTo(w - 1, h - r); ctx2.quadraticCurveTo(w - 1, h - 1, w - r, h - 1);
  ctx2.lineTo(r, h - 1); ctx2.quadraticCurveTo(1, h - 1, 1, h - r);
  ctx2.lineTo(1, r); ctx2.quadraticCurveTo(1, 1, r, 1);
  ctx2.closePath(); ctx2.fill(); ctx2.stroke();
  ctx2.fillStyle = color;
  ctx2.textAlign = 'center';
  ctx2.textBaseline = 'middle';
  ctx2.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = worldWidth / w;
  sprite.scale.set(w * scale, h * scale, 1);
  sprite.userData.aspect = w / h;
  return sprite;
}

/** Version of makeTextSprite that renders a single large rune/letter. */
export function makeRuneSprite(char, color = '#f0d38a', size = 1.4) {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,230,160,0.95)');
  g.addColorStop(0.3, 'rgba(220,180,90,0.25)');
  g.addColorStop(1, 'rgba(220,180,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = 'bold 74px Georgia';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillText(char, 64, 68);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

export function makeCanvasTextureFromDraw(draw, size = 128) {
  const c = makeCanvas(size);
  draw(c.getContext('2d'), size);
  return canvasTexture(c, 1);
}
