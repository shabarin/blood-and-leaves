import * as THREE from '../vendor/three.module.js';
import { TEX, makeTextSprite, makeRuneSprite } from './textures.js';

/* ============================================================
   WORLD — 900×900 m, four lands, roads, buildings, LOD forest.
   ============================================================ */

export const SIZE = 900;
export const HALF = 450;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash2(i, j) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, z, oct = 4) {
  let val = 0, amp = 0.5, total = 0, fx = x, fz = z;
  for (let i = 0; i < oct; i++) {
    val += vnoise(fx, fz) * amp;
    total += amp;
    amp *= 0.5;
    fx *= 2.03; fz *= 2.03;
  }
  return val / total;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SITE_DEFS = {
  neutral: { x: -170, z: 150, r: 64, name: 'Долина людей', short: 'Люди', color: '#b7c4cf' },
  palace: { x: 170, z: -150, r: 80, name: 'Имперские земли', short: 'Империя', color: '#d9a441' },
  elf: { x: -180, z: -160, r: 88, name: 'Лес эльфов', short: 'Эльфы', color: '#7fbf6a' },
  villain: { x: 185, z: 165, r: 72, name: 'Пустоши', short: 'Пустоши', color: '#c14b4b' },
};

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.materials = {};
    this.colliders = [];
    this.circleColliders = [];
    this.trees = [];
    this.treeGrid = new Map();
    this.fires = [];
    this.labels = [];
    this.markers = [];
    this.roadSamples = [];
    this.roadGrid = new Map();
    this.time = 0;
    this.lodTimer = 0;
    this.clouds = [];
    this.nearTreeRadius = 52;

    this.sites = {};
    for (const key of Object.keys(SITE_DEFS)) {
      const s = { ...SITE_DEFS[key] };
      s.h = this.rawHeight(s.x, s.z);
      this.sites[key] = s;
    }
    this.siteList = Object.values(this.sites);

    this.makeMaterials();
    this.buildSkyAndLights();
    this.buildTerrain();
    this.buildRoads();
    this.buildSites();
    this.buildForest();
    this.buildGrassAndRocks();
    this.buildMapCanvas();
    this.buildWorldLabels();
    this.buildBillboards();
  }

  /* ---------------- height / zones ---------------- */
  rawHeight(x, z) {
    let h = (fbm(x * 0.0034 + 11, z * 0.0034 - 7, 4) - 0.5) * 24;
    h += (fbm(x * 0.014 - 21, z * 0.014 + 9, 3) - 0.5) * 4.5;

    // south-east mountain ridge
    const m = smoothstep(-100, 300, x + z - 170);
    h += m * (fbm(x * 0.007 + 51, z * 0.007 + 17, 4) - 0.22) * 52;

    // raise outer rim so the world feels enclosed by mountains
    const edge = smoothstep(300, 442, Math.max(Math.abs(x), Math.abs(z)));
    h += edge * (26 + fbm(x * 0.011, z * 0.011, 2) * 42);

    return h;
  }

  heightAt(x, z) {
    let h = this.rawHeight(x, z);
    for (const s of this.siteList) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) {
        const t = 1 - smoothstep(s.r * 0.74, s.r, d);
        h = h * (1 - t) + s.h * t;
      }
    }
    return h;
  }

  zoneAt(x, z) {
    if (x < 0 && z < 0) return { key: 'elf', name: this.sites.elf.name };
    if (x >= 0 && z < 0) return { key: 'palace', name: this.sites.palace.name };
    if (x < 0 && z >= 0) return { key: 'neutral', name: this.sites.neutral.name };
    return { key: 'villain', name: this.sites.villain.name };
  }

  sitePos(key, dx = 0, dz = 0) {
    const s = this.sites[key];
    return new THREE.Vector3(s.x + dx, this.heightAt(s.x + dx, s.z + dz), s.z + dz);
  }

  /* ---------------- materials ---------------- */
  makeMaterials() {
    const M = this.materials;
    const repeatTex = (tex, rx, ry) => {
      const t = tex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return t;
    };
    M.dirt = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.dirt, 4, 4) });
    M.stone = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.stone, 3, 2) });
    M.stoneBig = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.stone, 6, 4) });
    M.stoneDark = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.stone, 3, 2), color: 0x7e7f7a });
    M.wood = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.wood, 3, 2) });
    M.woodDark = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.wood, 2, 1), color: 0x8a6f4d });
    M.bark = new THREE.MeshLambertMaterial({ map: TEX.bark });
    M.plaster = new THREE.MeshLambertMaterial({ color: 0xd6ccb2 });
    M.shingle = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.shingle, 3, 2), color: 0xb98a63 });
    M.shingleGreen = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.shingle, 3, 2), color: 0x6f7c48 });
    M.shingleDark = new THREE.MeshLambertMaterial({ map: repeatTex(TEX.shingle, 3, 2), color: 0x686b64 });
    M.clothRed = new THREE.MeshLambertMaterial({ color: 0x7c2a24 });
    M.clothGreen = new THREE.MeshLambertMaterial({ color: 0x3f5a2e });
    M.clothBlue = new THREE.MeshLambertMaterial({ color: 0x2e445c });
    M.clothGold = new THREE.MeshLambertMaterial({ color: 0x9a742f });
    M.clothBrown = new THREE.MeshLambertMaterial({ color: 0x6b5334 });
    M.metal = new THREE.MeshLambertMaterial({ color: 0x8e949a });
    M.metalDark = new THREE.MeshLambertMaterial({ color: 0x4b4d50 });
    M.iron = new THREE.MeshLambertMaterial({ color: 0x5f6266 });
    M.gold = new THREE.MeshLambertMaterial({ color: 0xc8a45c, emissive: 0x2a1c05 });
    M.darkWood = new THREE.MeshLambertMaterial({ color: 0x3b2c1e });
    M.straw = new THREE.MeshLambertMaterial({ color: 0xb59a62 });
    M.water = new THREE.MeshLambertMaterial({ color: 0x3e5f68, transparent: true, opacity: 0.8 });
    M.window = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
    M.fire = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 });
    M.fireCore = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  }

  /* ---------------- sky ---------------- */
  buildSkyAndLights() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x9fb0a0);
    scene.fog = new THREE.Fog(0xb8c4ae, 110, 430);

    const hemi = new THREE.HemisphereLight(0xd7e6ff, 0x4c5738, 1.15);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff0cf, 1.55);
    sun.position.set(-0.45, 0.85, 0.3);
    scene.add(sun);
    this.sun = sun;

    const skyGeo = new THREE.SphereGeometry(1300, 24, 14);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x6d8aa6) },
        mid: { value: new THREE.Color(0xb9c6be) },
        bottom: { value: new THREE.Color(0xdfe2cf) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 c = mix(bottom, mid, smoothstep(-0.05, 0.28, h));
          c = mix(c, top, smoothstep(0.25, 0.85, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: 0xfff2c4, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sunSprite.scale.set(190, 190, 1);
    sunSprite.position.set(-500, 560, 340);
    scene.add(sunSprite);

    const cloudMat = new THREE.SpriteMaterial({
      map: TEX.cloud, transparent: true, opacity: 0.34, depthWrite: false,
    });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(cloudMat.clone());
      const scale = 130 + Math.random() * 200;
      s.scale.set(scale, scale * 0.45, 1);
      s.position.set((Math.random() - 0.5) * 1500, 130 + Math.random() * 130, (Math.random() - 0.5) * 1500);
      s.material.opacity = 0.16 + Math.random() * 0.24;
      this.clouds.push({ sprite: s, speed: 0.7 + Math.random() * 1.5 });
      scene.add(s);
    }

    // distant mountain silhouettes beyond the playable rim
    const mtnMat = new THREE.MeshLambertMaterial({ color: 0x77847c, flatShading: true, fog: false });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = 470 + Math.random() * 170;
      const h = 80 + Math.random() * 120;
      const geo = new THREE.ConeGeometry(55 + Math.random() * 65, h, 5 + (Math.random() * 3 | 0));
      const m = new THREE.Mesh(geo, mtnMat);
      m.position.set(Math.cos(a) * r, h * 0.4 - 20, Math.sin(a) * r);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
    }
  }

  /* ---------------- terrain ---------------- */
  buildTerrain() {
    const seg = 236;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      uv.setXY(i, (x + HALF) / 7, (z + HALF) / 7);

      const n = fbm(x * 0.06 + 3, z * 0.06 - 4, 2);
      let r = 76 + n * 36;
      let g = 100 + n * 40;
      let b = 58 + n * 22;

      // dark, mossy forest floor
      const elfD = Math.hypot(x - this.sites.elf.x, z - this.sites.elf.z);
      const forest = 1 - smoothstep(30, 250, elfD);
      r -= forest * 30; g -= forest * 20; b -= forest * 12;

      // rocky highlands
      const rock = clamp(smoothstep(18, 60, y) * 1.1 + smoothstep(120, 320, x + z) * 0.45, 0, 1);
      r = r * (1 - rock) + 116 * rock;
      g = g * (1 - rock) + 112 * rock;
      b = b * (1 - rock) + 102 * rock;
      // moss patches
      const moss = smoothstep(0.55, 0.8, n) * (1 - rock) * 0.5;
      r -= moss * 18; g += moss * 6; b -= moss * 14;

      // trampled ground around settlements
      for (const s of this.siteList) {
        const d = Math.hypot(x - s.x, z - s.z);
        const t = 1 - smoothstep(s.r * 0.28, s.r * 0.85, d);
        if (t > 0) {
          r = r * (1 - t * 0.75) + 120 * t * 0.75;
          g = g * (1 - t * 0.75) + 103 * t * 0.75;
          b = b * (1 - t * 0.75) + 76 * t * 0.75;
        }
      }

      color.setRGB(r / 255, g / 255, b / 255).convertSRGBToLinear();
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      map: TEX.grass, vertexColors: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  /* ---------------- roads ---------------- */
  buildRoads() {
    this.roadDefs = [
      { pts: [[-170, 150], [-75, 80], [10, 0], [95, -78], [170, -150]], width: 7 },
      { pts: [[-170, 150], [-240, 70], [-252, -40], [-225, -120], [-180, -160]], width: 6 },
      { pts: [[170, -150], [228, -60], [238, 55], [212, 120], [185, 165]], width: 6.5 },
      { pts: [[-180, -160], [-75, -125], [30, -55], [115, 35], [185, 165]], width: 5.5 },
      { pts: [[-180, -160], [-95, -200], [20, -195], [100, -175], [170, -150]], width: 5 },
    ];

    const roadMat = new THREE.MeshLambertMaterial({
      map: TEX.dirt, color: 0xb9a98e, polygonOffset: true,
      polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.roadMaterial = roadMat;

    for (const def of this.roadDefs) {
      const points = def.pts.map(p => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.25);
      const N = 220;
      const positions = [];
      const uvs = [];
      const indices = [];
      let dist = 0;
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const nx = -tan.z, nz = tan.x;
        const len = Math.hypot(nx, nz) || 1;
        const ox = (nx / len) * def.width * 0.5;
        const oz = (nz / len) * def.width * 0.5;
        const lx = p.x + ox, lz = p.z + oz;
        const rx = p.x - ox, rz = p.z - oz;
        const ly = this.heightAt(lx, lz) + 0.08;
        const ry = this.heightAt(rx, rz) + 0.08;
        positions.push(lx, ly, lz, rx, ry, rz);
        if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
        uvs.push(0, dist / 8, 1, dist / 8);
        if (i < N) {
          const k = i * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
        if (i % 3 === 0) {
          this.roadSamples.push({ x: p.x, z: p.z });
          const key = `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`;
          if (!this.roadGrid.has(key)) this.roadGrid.set(key, []);
          this.roadGrid.get(key).push({ x: p.x, z: p.z });
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roadMat);
      this.scene.add(mesh);
      this.roads = this.roads || [];
      this.roads.push({ mesh, points, width: def.width, curve });
    }
  }

  roadNearby(x, z, r = 6) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.roadGrid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const p of arr) {
          if (Math.hypot(p.x - x, p.z - z) < r) return true;
        }
      }
    }
    return false;
  }

  /* ---------------- collision ---------------- */
  addBox(cx, cz, w, d, rot = 0) {
    this.colliders.push({ type: 'box', x: cx, z: cz, hw: w / 2, hd: d / 2, rot });
  }

  addCircle(cx, cz, r) {
    this.circleColliders.push({ x: cx, z: cz, r });
  }

  resolveCollision(pos, radius = 0.45) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      if (Math.abs(dx) > c.hw + radius + 1 || Math.abs(dz) > c.hd + radius + 1) continue;
      const px = clamp(dx, -c.hw, c.hw);
      const pz = clamp(dz, -c.hd, c.hd);
      const ox = dx - px;
      const oz = dz - pz;
      const d2 = ox * ox + oz * oz;
      if (d2 > radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        pos.x += (ox / d) * push;
        pos.z += (oz / d) * push;
      } else {
        const left = dx + c.hw;
        const right = c.hw - dx;
        const top = dz + c.hd;
        const bottom = c.hd - dz;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.x - c.hw - radius;
        else if (m === right) pos.x = c.x + c.hw + radius;
        else if (m === top) pos.z = c.z - c.hd - radius;
        else pos.z = c.z + c.hd + radius;
      }
    }

    for (const c of this.circleColliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = radius + c.r;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d);
        pos.z += (dz / d) * (min - d);
      }
    }

    const tx = Math.floor(pos.x / 8), tz = Math.floor(pos.z / 8);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.treeGrid.get(`${tx + i},${tz + j}`);
        if (!arr) continue;
        for (const t of arr) {
          const dx = pos.x - t.x;
          const dz = pos.z - t.z;
          const min = radius + t.radius;
          if (dx * dx + dz * dz < min * min) {
            const d = Math.hypot(dx, dz) || 0.001;
            pos.x += (dx / d) * (min - d);
            pos.z += (dz / d) * (min - d);
          }
        }
      }
    }

    pos.x = clamp(pos.x, -432, 432);
    pos.z = clamp(pos.z, -432, 432);
    return pos;
  }

  /* ---------------- building helpers ---------------- */
  makeGroup(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, this.heightAt(x, z), z);
    g.rotation.y = ry;
    this.scene.add(g);
    return g;
  }

  box(parent, w, h, d, material, x, y, z, ry = 0, rx = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.rotation.x = rx;
    parent.add(m);
    return m;
  }

  cyl(parent, rTop, rBottom, h, seg, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  cone(parent, r, h, seg, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  gableRoof(parent, w, d, h, material, x, y, z) {
    const hw = w / 2, hd = d / 2;
    const verts = [];
    const uvs = [];
    const push = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      uvs.push(0, 0, 1, 0, 1, 1);
    };
    // left slope
    push(-hw, 0, -hd, -hw, 0, hd, 0, h, hd);
    push(-hw, 0, -hd, 0, h, hd, 0, h, -hd);
    // right slope
    push(hw, 0, hd, hw, 0, -hd, 0, h, -hd);
    push(hw, 0, hd, 0, h, -hd, 0, h, hd);
    // gables
    push(-hw, 0, hd, hw, 0, hd, 0, h, hd);
    push(hw, 0, -hd, -hw, 0, -hd, 0, h, -hd);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  addCampfire(x, z, scale = 1) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.scene.add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 * scale, 0.18 * scale, 5, 12), this.materials.stone);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.14;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const log = this.cyl(g, 0.1 * scale, 0.13 * scale, 1.5 * scale, 6, this.materials.darkWood, 0, 0.22, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 5) * Math.PI;
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55 * scale, 1.6 * scale, 7), this.materials.fire);
    flame.position.y = 0.9 * scale;
    g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.28 * scale, 0.9 * scale, 6), this.materials.fireCore);
    core.position.y = 0.62 * scale;
    g.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: 0xffa04a, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(6 * scale, 6 * scale, 1);
    glow.position.y = 1.2 * scale;
    g.add(glow);
    const light = new THREE.PointLight(0xff9a4a, 2.2, 26 * scale, 2);
    light.position.set(0, 1.6 * scale, 0);
    g.add(light);
    this.fires.push({ flame, core, light, glow, base: 1, phase: Math.random() * 10, y: 0 });
    this.addCircle(x, z, 1.15 * scale);
    return g;
  }

  addBanner(parent, texture, x, y, z, w = 2.2, h = 3.4, ry = 0) {
    const mat = new THREE.MeshLambertMaterial({
      map: texture, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x, y, z);
    plane.rotation.y = ry;
    parent.add(plane);
    return plane;
  }

  addLabel(text, x, z, yOffset = 3.2, opts = {}) {
    const sprite = makeTextSprite(text, {
      worldWidth: opts.width || 5.5, color: opts.color || '#f0e2bc',
      fontSize: 30, depthTest: false,
    });
    const y = this.heightAt(x, z) + yOffset;
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.labels.push({ sprite, x, z, y, maxDist: opts.maxDist || 80 });
    return sprite;
  }

  addFence(x1, z1, x2, z2, parent, material) {
    const dist = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(2, Math.round(dist / 2.4));
    const g = new THREE.Group();
    this.scene.add(g);
    const dirX = (x2 - x1) / dist, dirZ = (z2 - z1) / dist;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const y = this.heightAt(x, z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), material || this.materials.darkWood);
      post.position.set(x, y + 0.75, z);
      g.add(post);
    }
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      const y = this.heightAt(x, z);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(dist / n, 0.12, 0.1), material || this.materials.darkWood);
      rail.position.set(x, y + 0.95, z);
      rail.rotation.y = Math.atan2(dirZ, dirX);
      g.add(rail);
    }
    return g;
  }

  addBarrel(x, z, parent) {
    const onScene = !parent || parent === this.scene;
    const localX = onScene ? x : x - parent.position.x;
    const localZ = onScene ? z : z - parent.position.z;
    const localY = onScene ? this.heightAt(x, z) + 0.5 : 0.5;
    const b = this.cyl(parent || this.scene, 0.32, 0.38, 1.0, 9, this.materials.woodDark, localX, localY, localZ);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.03, 4, 10), this.materials.iron);
    band.rotation.x = Math.PI / 2;
    b.add(band);
    return b;
  }

  addCrates(parent, x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      const s = 0.55 + Math.random() * 0.35;
      const c = this.box(parent, s, s, s, this.materials.woodDark,
        x + (Math.random() - 0.5) * 1.8, y + s / 2 + (i > 1 ? 0.6 : 0), z + (Math.random() - 0.5) * 1.5,
        Math.random() * 0.6);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, 0.06, s * 1.02), this.materials.darkWood);
      brace.position.y = 0.01;
      c.add(brace);
    }
  }

  addMarketStall(x, z, ry, fabricMat, signText) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
    for (const [px, pz] of [[-1.9, -1.2], [1.9, -1.2], [-1.9, 1.2], [1.9, 1.2]]) {
      this.box(g, 0.14, 2.6, 0.14, this.materials.darkWood, px, 1.3, pz);
    }
    const awning = this.box(g, 4.6, 0.1, 3.0, fabricMat, 0, 2.6, 0, 0, -0.12);
    awning.rotation.z = 0.08;
    this.box(g, 4.0, 0.9, 1.2, this.materials.woodDark, 0, 0.45, 0.45);
    this.addCrates(g, 0, 0, -0.4, 2);
    this.addCircle(x, z, 2.4);
    if (signText) this.addLabel(signText, x, z, 3.4, { width: 2.6 });
    return g;
  }

  addTrainingDummy(x, z) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.scene.add(g);
    this.cyl(g, 0.09, 0.12, 1.9, 6, this.materials.darkWood, 0, 0.95, 0);
    this.box(g, 1.3, 0.16, 0.16, this.materials.darkWood, 0, 1.45, 0);
    this.cyl(g, 0.32, 0.38, 0.8, 7, this.materials.straw, 0, 1.55, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), this.materials.straw);
    head.position.y = 2.15;
    g.add(head);
    this.addCircle(x, z, 0.55);
    return g;
  }

  addWell(x, z) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.scene.add(g);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.95, 12, 1, true), this.materials.stone);
    ring.position.y = 0.48;
    g.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 16), this.materials.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.7;
    g.add(water);
    this.box(g, 0.18, 2.4, 0.18, this.materials.wood, -1.35, 1.6, 0);
    this.box(g, 0.18, 2.4, 0.18, this.materials.wood, 1.35, 1.6, 0);
    this.gableRoof(g, 3.4, 2.2, 1.2, this.materials.shingle, 0, 2.8, 0);
    this.addCircle(x, z, 1.9);
    return g;
  }

  addTent(x, z, ry, clothMat, signText) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
    this.cone(g, 3.0, 3.0, 8, clothMat, 0, 1.5, 0);
    this.box(g, 1.4, 2.0, 0.08, this.materials.darkWood, 0, 1.0, 2.35, 0, 0.12);
    this.box(g, 0.08, 2.0, 1.6, this.materials.darkWood, 2.35, 1.0, 0);
    this.addCircle(x, z, 3.1);
    if (signText) this.addLabel(signText, x, z, 4.2, { width: 3.8, color: '#d6e3c4' });
    return g;
  }

  addVillagerHouse(parent, w, d, h, wallMat) {
    this.box(parent, w + 0.4, 0.5, d + 0.4, this.materials.stone, 0, 0.25, 0);
    this.box(parent, w, h, d, wallMat || this.materials.plaster, 0, 0.5 + h / 2, 0);
    for (const [px, pz] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) {
      this.box(parent, 0.18, h, 0.18, this.materials.darkWood, px, 0.5 + h / 2, pz);
    }
    this.box(parent, w, 0.18, 0.16, this.materials.darkWood, 0, 0.6, d / 2 + 0.02);
    this.box(parent, w, 0.16, 0.16, this.materials.darkWood, 0, 0.5 + h - 0.1, d / 2 + 0.02);
    this.box(parent, 0.16, h, 0.16, this.materials.darkWood, 0, 0.5 + h / 2, d / 2 + 0.02);
    this.box(parent, 1.1, 2.0, 0.1, this.materials.darkWood, 0, 1.5, d / 2 + 0.06);
    const winL = this.box(parent, 0.8, 0.8, 0.1, this.materials.window, -w / 2 + 1.5, 1.7, d / 2 + 0.07);
    this.box(parent, 1.0, 0.12, 0.12, this.materials.darkWood, -w / 2 + 1.5, 2.15, d / 2 + 0.12);
    const winR = this.box(parent, 0.8, 0.8, 0.1, this.materials.window, w / 2 - 1.5, 1.7, d / 2 + 0.07);
    if (Math.random() > 0.5) {
      this.box(parent, 0.8, 0.8, 0.1, this.materials.window, w / 2 + 0.02, 1.7, 0);
    }
    this.gableRoof(parent, w + 1.6, d + 1.6, 2.3, this.materials.shingle, 0, 0.5 + h, 0);
    const chim = this.box(parent, 0.75, 2.2, 0.75, this.materials.stone, w / 2 - 1.4, 0.5 + h + 0.9, -d / 2 + 1.5);
    this.box(parent, 0.95, 0.15, 0.95, this.materials.stoneDark, w / 2 - 1.4, 0.5 + h + 2.05, -d / 2 + 1.5);
    this.box(parent, 1.4, 0.18, 0.5, this.materials.stone, 0, 0.1, d / 2 + 0.4);
  }

  addElfHut(parent, r, wallMat) {
    this.cyl(parent, r, r * 1.04, 2.8, 8, wallMat, 0, 1.4, 0);
    this.cone(parent, r + 1.2, 2.6, 8, this.materials.shingleGreen, 0, 3.9, 0);
    this.box(parent, 1.0, 1.9, 0.1, this.materials.darkWood, 0, 1.25, r + 0.03);
    const win = this.box(parent, 0.6, 0.6, 0.12, this.materials.window, r * 0.55, 1.65, r * 0.55, Math.PI / 4);
    const porch = this.box(parent, 2.2, 0.16, 1.0, this.materials.woodDark, 0, 0.15, r + 0.5);
    for (const px of [-0.95, 0.95]) {
      this.box(parent, 0.12, 1.5, 0.12, this.materials.darkWood, px, 0.75, r + 0.85);
    }
  }

  /* ---------------- sites ---------------- */
  buildSites() {
    this.buildNeutralTown();
    this.buildPalace();
    this.buildElfVillage();
    this.buildVillainFort();
    this.addSignpost(-24, 42);
    this.addSignpost(24, -30);
  }

  addSignpost(dx, dz) {
    // central crossroads sign
    const x = dx, z = dz;
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.scene.add(g);
    this.cyl(g, 0.12, 0.15, 2.4, 6, this.materials.darkWood, 0, 1.2, 0);
    const dirs = [
      { text: 'ЛЕС ЭЛЬФОВ', ry: -0.7 },
      { text: 'ДВОРЕЦ', ry: 0.8 },
      { text: 'ТИХИЙ БРОД', ry: 2.4 },
      { text: 'СТАРЫЙ ФОРТ', ry: -2.4 },
    ];
    dirs.forEach((d, i) => {
      const plank = this.box(g, 2.2, 0.34, 0.12, this.materials.woodDark, 0.9, 2.05 - i * 0.32, 0, d.ry);
      const label = makeTextSprite(d.text, { worldWidth: 1.75, fontSize: 26, background: 'rgba(30,22,12,0.9)', border: 'rgba(120,90,50,0.7)' });
      label.position.set(0.9 + Math.cos(d.ry) * 0.2, 2.05 - i * 0.32, -Math.sin(d.ry) * 0.2);
      label.scale.multiplyScalar(0.55);
      g.add(label);
    });
    this.addCircle(x, z, 0.4);
  }

  buildNeutralTown() {
    const s = this.sites.neutral;
    // inn / tavern
    const inn = this.makeGroup(s.x - 27, s.z - 20, 0.16);
    this.addVillagerHouse(inn, 9, 7, 3.4, this.materials.wood);
    this.box(inn, 1.6, 1.0, 0.15, this.materials.woodDark, 0, 2.4, 3.6);
    const sign = makeTextSprite('ТАВЕРНА', { worldWidth: 2.6, fontSize: 30 });
    sign.position.set(3.0, 3.0, 3.7);
    inn.add(sign);
    this.addCircle(s.x - 27, s.z - 20, 5.6);
    this.addBarrel(s.x - 21, s.z - 24, inn);

    const houses = [
      [-10, -32, 0.2, 7, 6], [12, -26, -0.35, 8, 6.5], [-38, 2, 0.5, 7, 6],
      [28, 4, 0.9, 7.5, 6], [26, 27, 0.3, 7, 6], [-2, 33, -0.15, 8, 6],
      [-24, 29, -0.6, 6.5, 5.5], [40, 14, 0.6, 6, 5],
    ];
    for (const [dx, dz, ry, w, d] of houses) {
      const g = this.makeGroup(s.x + dx, s.z + dz, ry);
      this.addVillagerHouse(g, w, d, 2.8 + Math.random() * 0.7);
      this.addCircle(s.x + dx, s.z + dz, Math.max(w, d) * 0.55);
    }

    // market square
    this.addMarketStall(s.x + 3, s.z - 2, -0.25, this.materials.clothRed, 'ТОРГОВЕЦ');
    this.addMarketStall(s.x - 5, s.z + 8, 0.4, this.materials.clothBlue, null);
    this.addWell(s.x - 7, s.z - 8);
    this.addLabel('ТИХИЙ БРОД', s.x, s.z, 8, { width: 8, color: '#e8d9b0', maxDist: 120 });
    // smithy
    const smithX = s.x + 26, smithZ = s.z + 17;
    const smith = this.makeGroup(smithX, smithZ, -0.35);
    for (const [px, pz] of [[-3.2, -2.2], [3.2, -2.2], [-3.2, 2.2], [3.2, 2.2]]) {
      this.box(smith, 0.22, 3.2, 0.22, this.materials.darkWood, px, 1.6, pz);
    }
    this.gableRoof(smith, 7.4, 5.4, 1.8, this.materials.shingleDark, 0, 3.1, 0);
    const forge = this.box(smith, 2.2, 1.2, 1.8, this.materials.stoneDark, -1.3, 0.6, -0.6);
    const fire = this.box(smith, 1.1, 0.5, 0.9, this.materials.fire, -1.3, 1.35, -0.6);
    const forgeLight = new THREE.PointLight(0xff7a2a, 2.2, 16, 2);
    forgeLight.position.set(smithX - 1.3, this.heightAt(smithX, smithZ) + 1.8, smithZ - 0.6);
    this.scene.add(forgeLight);
    this.fires.push({ flame: fire, core: null, light: forgeLight, glow: null, base: 1, phase: 2, y: 0 });
    this.box(smith, 0.7, 0.5, 0.4, this.materials.iron, 1.1, 0.8, 0.7);
    this.box(smith, 0.22, 0.6, 0.22, this.materials.darkWood, 1.1, 0.3, 0.7);
    this.box(smith, 2.6, 0.16, 0.7, this.materials.woodDark, 2.0, 1.2, -1.9);
    for (let i = 0; i < 4; i++) {
      this.box(smith, 0.08, 1.0, 0.1, this.materials.metal, 1.2 + i * 0.5, 0.75, -1.9);
    }
    this.addCircle(smithX, smithZ, 4.2);
    this.addLabel('КУЗНЕЦ', smithX, smithZ, 4.6, { width: 2.8, color: '#f0c090' });

    // healer tent
    const healX = s.x - 26, healZ = s.z + 22;
    this.addTent(healX, healZ, 0.35, this.materials.plaster, 'ЛЕКАРЬ');
    this.addCampfire(healX + 5, healZ + 1, 0.5);

    // fences and props
    this.addFence(s.x - 44, s.z + 10, s.x - 44, s.z - 12, null, this.materials.woodDark);
    this.addFence(s.x + 44, s.z - 8, s.x + 44, s.z + 8, null, this.materials.woodDark);
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 20;
      this.addBarrel(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, this.scene);
    }
    // cart near entrance
    const cartX = s.x + 16, cartZ = s.z + 26;
    const cg = this.makeGroup(cartX, cartZ, 0.6);
    this.box(cg, 2.6, 0.7, 1.4, this.materials.woodDark, 0, 0.9, 0);
    this.cyl(cg, 0.55, 0.55, 0.12, 10, this.materials.darkWood, -0.9, 0.55, 0.78).rotation.x = Math.PI / 2;
    this.cyl(cg, 0.55, 0.55, 0.12, 10, this.materials.darkWood, 0.9, 0.55, 0.78).rotation.x = Math.PI / 2;
    this.cyl(cg, 0.55, 0.55, 0.12, 10, this.materials.darkWood, -0.9, 0.55, -0.78).rotation.x = Math.PI / 2;
    this.cyl(cg, 0.55, 0.55, 0.12, 10, this.materials.darkWood, 0.9, 0.55, -0.78).rotation.x = Math.PI / 2;
    this.addCircle(cartX, cartZ, 2.0);
  }

  buildPalace() {
    const s = this.sites.palace;
    const X = s.x, Z = s.z;
    const stone = this.materials.stoneBig;
    const dark = this.materials.stoneDark;

    // outer curtain walls
    const walls = [
      { x: X, z: Z - 48, w: 96, d: 3 },
      { x: X - 28, z: Z + 48, w: 40, d: 3 },
      { x: X + 28, z: Z + 48, w: 40, d: 3 },
      { x: X - 48, z: Z, w: 3, d: 96 },
      { x: X + 48, z: Z, w: 3, d: 96 },
    ];
    for (const w of walls) {
      const g = this.makeGroup(w.x, w.z, 0);
      this.box(g, w.w, 8.5, w.d, stone, 0, 4.25, 0);
      this.box(g, w.w + 0.3, 0.5, w.d + 0.3, dark, 0, 8.6, 0);
      // merlons
      const alongX = w.w > w.d;
      const n = Math.floor((alongX ? w.w : w.d) / 4);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        this.box(g, alongX ? 1.3 : w.w, 1.1, alongX ? w.d : 1.3, stone,
          alongX ? t * w.w : 0, 9.2, alongX ? 0 : t * w.d);
      }
      this.addBox(w.x, w.z, w.w, w.d);
    }

    // corner towers
    for (const [dx, dz] of [[-48, -48], [48, -48], [-48, 48], [48, 48]]) {
      const g = this.makeGroup(X + dx, Z + dz, 0);
      this.cyl(g, 5.2, 5.8, 15, 12, stone, 0, 7.5, 0);
      this.cone(g, 6.4, 5.5, 12, this.materials.shingleDark, 0, 18.2, 0);
      this.box(g, 2.0, 3.4, 0.2, this.materials.window, 0, 10.5, 5.1);
      this.addBanner(g, TEX.bannerGold, 0, 7, 5.5, 2.4, 4.0);
      this.addCircle(X + dx, Z + dz, 5.8);
    }

    // gate towers + arch
    for (const dx of [-9.5, 9.5]) {
      const g = this.makeGroup(X + dx, Z + 48, 0);
      this.cyl(g, 4.0, 4.4, 13, 10, stone, 0, 6.5, 0);
      this.cone(g, 5.0, 4.2, 10, this.materials.shingleDark, 0, 15.4, 0);
      this.addBanner(g, TEX.bannerRed, 0, 6.2, 4.2, 2.2, 3.8);
      this.addCircle(X + dx, Z + 48, 4.4);
    }
    const gateG = this.makeGroup(X, Z + 48, 0);
    this.box(gateG, 19, 2.8, 4.5, stone, 0, 9.5, 0);
    this.box(gateG, 21, 0.5, 5, dark, 0, 11.1, 0);
    this.box(gateG, 19, 0.3, 4.6, dark, 0, 13, 0);
    // open portcullis teeth
    for (let i = 0; i < 7; i++) {
      this.box(gateG, 0.18, 1.6, 0.18, this.materials.iron, -6 + i * 2, 9.4, 2.3);
    }

    // keep
    const keep = this.makeGroup(X, Z - 20, 0);
    this.box(keep, 34, 6, 32, stone, 0, 3, 0);
    this.box(keep, 30, 16, 26, stone, 0, 8 + 6, 0);
    this.box(keep, 31, 0.7, 27, dark, 0, 16.6, 0);
    this.box(keep, 32, 0.5, 28, dark, 0, 0.4, 0);
    // keep battlements
    for (let i = 0; i < 8; i++) {
      this.box(keep, 1.4, 1.4, 1.2, stone, -14 + i * 4, 17.7, 13.2);
      this.box(keep, 1.4, 1.4, 1.2, stone, -14 + i * 4, 17.7, -13.2);
    }
    for (let i = 0; i < 7; i++) {
      this.box(keep, 1.2, 1.4, 1.4, stone, 15.2, 17.7, -12 + i * 4);
      this.box(keep, 1.2, 1.4, 1.4, stone, -15.2, 17.7, -12 + i * 4);
    }
    // central tower
    this.cyl(keep, 6.5, 7.0, 22, 12, stone, 0, 27, -2);
    this.cone(keep, 8.0, 7, 12, this.materials.shingleDark, 0, 41.5, -2);
    this.addBanner(keep, TEX.bannerGold, 0, 29.5, 4.5, 3.2, 5.5);
    // keep towers
    for (const [dx, dz] of [[-17, -13], [17, -13], [-17, 13], [17, 13]]) {
      this.cyl(keep, 4.2, 4.6, 22, 10, stone, dx, 17, dz);
      this.cone(keep, 5.2, 4.5, 10, this.materials.shingleDark, dx, 30.2, dz);
      this.addBanner(keep, TEX.bannerRed, dx, 15, dz + (dz > 0 ? 4.6 : -4.6), 2, 3.4);
    }
    // main door & windows
    this.box(keep, 7, 9, 0.4, this.materials.darkWood, 0, 10.5, 13.2);
    this.box(keep, 8, 0.6, 0.6, this.materials.gold, 0, 15.3, 13.4);
    for (const dx of [-10, 10]) {
      this.box(keep, 2.4, 3.6, 0.3, this.materials.window, dx, 12, 13.15);
      this.box(keep, 2.4, 3.6, 0.3, this.materials.window, dx, 19.3, 13.15);
    }
    // stairs
    for (let i = 0; i < 3; i++) {
      this.box(keep, 12, 0.5, 1.4, dark, 0, 0.25 + i * 0.5, 14.4 + i * 0.7);
    }
    this.addBox(X, Z - 20, 34, 32);
    this.addCircle(X, Z - 20, 15); // extra safety for the keep
    this.addLabel('ДВОРЕЦ', X, Z + 20, 26, { width: 8, color: '#f0d38a', maxDist: 160 });

    // courtyard props
    this.addBrazier(X - 8, Z + 34);
    this.addBrazier(X + 8, Z + 34);
    this.addTrainingDummy(X - 16, Z + 22);
    this.addTrainingDummy(X - 12, Z + 28);
    this.addTrainingDummy(X + 14, Z + 24);
    this.addCrates(keep, 8, 0, 17, 4);
    this.addBarrel(X + 20, Z + 10, this.scene);
    this.addBarrel(X + 22, Z + 12, this.scene);

    // banners on outer wall
    const wallBanner = this.makeGroup(X - 20, Z + 49.7, 0);
    this.addBanner(wallBanner, TEX.bannerRed, 0, 4.6, 0, 3, 5);
    this.addBanner(wallBanner, TEX.bannerGold, 6, 4.6, 0, 3, 5);
  }

  addBrazier(x, z) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.scene.add(g);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.45, 0.6, 9), this.materials.iron);
    bowl.position.y = 1.1;
    g.add(bowl);
    this.cyl(g, 0.15, 0.25, 1.0, 6, this.materials.iron, 0, 0.5, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 6), this.materials.fire);
    flame.position.y = 1.9;
    g.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glow, color: 0xffb060, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(5, 5, 1);
    glow.position.y = 1.9;
    g.add(glow);
    const light = new THREE.PointLight(0xff9a4a, 1.8, 20, 2);
    light.position.y = 2.0;
    g.add(light);
    this.fires.push({ flame, core: null, light, glow, base: 1, phase: Math.random() * 8, y: 0 });
    this.addCircle(x, z, 0.9);
  }

  buildElfVillage() {
    const s = this.sites.elf;
    const X = s.x, Z = s.z;

    // great council tree
    const treeG = this.makeGroup(X + 2, Z - 16, 0);
    this.cyl(treeG, 2.6, 3.6, 17, 10, this.materials.bark, 0, 8.5, 0);
    this.cyl(treeG, 0.8, 1.2, 8, 7, this.materials.bark, -3.2, 12, 1.4).rotation.z = 0.5;
    this.cyl(treeG, 0.7, 1.0, 7, 7, this.materials.bark, 3.0, 11, -1.2).rotation.z = -0.6;
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4d7435 });
    const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x5f8840 });
    const blobs = [[0, 15, 0, 5.2], [-5, 17, 2, 4.2], [5, 17, -1, 4.4], [1, 19, -4, 3.8], [-2, 20, 3, 3.6], [3, 22, 2, 3.2]];
    for (let i = 0; i < blobs.length; i++) {
      const [bx, by, bz, r] = blobs[i];
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leafMat2 : leafMat);
      b.position.set(bx, by, bz);
      b.scale.y = 0.8;
      treeG.add(b);
    }
    // platform
    this.cyl(treeG, 5.2, 5.2, 0.45, 12, this.materials.wood, 0, 8.5, 0);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.box(treeG, 0.16, 1.1, 0.16, this.materials.darkWood, Math.cos(a) * 4.9, 9.2, Math.sin(a) * 4.9);
    }
    this.cyl(treeG, 5.0, 5.0, 0.12, 12, this.materials.woodDark, 0, 9.75, 0);
    // ladder
    for (let i = 0; i < 8; i++) {
      this.box(treeG, 1.4, 0.14, 0.14, this.materials.darkWood, 0, 1 + i * 1.05, 4.0);
    }
    this.box(treeG, 0.14, 9, 0.14, this.materials.darkWood, -0.7, 4.5, 4.0);
    this.box(treeG, 0.14, 9, 0.14, this.materials.darkWood, 0.7, 4.5, 4.0);
    this.addCircle(X + 2, Z - 16, 3.6);
    this.addLabel('СТАРЕЙШИНА', X + 2, Z - 9, 4.4, { width: 4.2, color: '#cfe8b0' });

    // huts
    const huts = [
      [26, -2, 0.3, 3.6], [20, 26, -0.4, 3.2], [-22, 24, 0.8, 3.4],
      [-30, -4, 1.2, 3.8], [-8, 30, 0.1, 3.1], [6, -32, -0.6, 3.5],
    ];
    for (const [dx, dz, ry, r] of huts) {
      const g = this.makeGroup(X + dx, Z + dz, ry);
      this.addElfHut(g, r, this.materials.wood);
      this.addCircle(X + dx, Z + dz, r + 0.6);
    }

    // rope bridges were removed: the floating planks read as debris from below

    this.addCampfire(X + 10, Z + 6, 0.9);
    this.addLabel('ЛЕС ЭЛЬФОВ', X, Z + 20, 10, { width: 8, color: '#cfe8b0', maxDist: 150 });

    // totems at the south entrance
    for (const [dx, dz] of [[-7, 42], [7, 42]]) {
      const g = this.makeGroup(X + dx, Z + dz, 0);
      this.cyl(g, 0.35, 0.45, 3.6, 6, this.materials.bark, 0, 1.8, 0);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.5, 7, 6), this.materials.woodDark);
      face.position.y = 3.3;
      face.scale.set(1, 1.2, 0.8);
      g.add(face);
      this.box(g, 0.18, 0.18, 0.1, this.materials.window, -0.16, 3.4, 0.4);
      this.box(g, 0.18, 0.18, 0.1, this.materials.window, 0.16, 3.4, 0.4);
      this.addCircle(X + dx, Z + dz, 0.5);
    }

    // elf rune lanterns
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const lx = X + Math.cos(a) * 13;
      const lz = Z + Math.sin(a) * 13;
      const y = this.heightAt(lx, lz) + 1.8 + Math.random() * 2.5;
      const rune = makeRuneSprite('✦', '#bff19a', 0.7);
      rune.position.set(lx, y, lz);
      this.scene.add(rune);
      this.labels.push({ sprite: rune, x: lx, z: lz, y, maxDist: 70 });
    }

    // fences / thorny palisade on the outer ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const r = 44;
      const x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
      if (Math.abs(x - (X)) < 14 && z > Z + 30) continue;
      const y = this.heightAt(x, z);
      const post = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 5), this.materials.bark);
      post.position.set(x, y + 1.3, z);
      post.rotation.z = (Math.random() - 0.5) * 0.3;
      this.scene.add(post);
    }
  }

  buildVillainFort() {
    const s = this.sites.villain;
    const X = s.x, Z = s.z;
    const stone = this.materials.stoneDark;

    // broken outer wall
    const segs = [
      { x: X - 32, z: Z - 32, w: 26, d: 3 }, { x: X + 8, z: Z - 32, w: 18, d: 3 },
      { x: X - 32, z: Z + 8, w: 3, d: 24 }, { x: X + 32, z: Z + 8, w: 3, d: 26 },
      { x: X - 26, z: Z + 32, w: 16, d: 3 }, { x: X + 28, z: Z + 32, w: 10, d: 3 },
    ];
    for (const w of segs) {
      const g = this.makeGroup(w.x, w.z, 0);
      this.box(g, w.w, 6.5, w.d, stone, 0, 3.25, 0);
      this.box(g, w.w, 0.4, w.d + 0.3, this.materials.metalDark, 0, 6.6, 0);
      const alongX = w.w > w.d;
      const n = Math.floor((alongX ? w.w : w.d) / 5);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.3) continue;
        const t = (i + 0.5) / n - 0.5;
        this.box(g, alongX ? 1.2 : w.d, 1.0, alongX ? w.d : 1.2, stone,
          alongX ? t * w.w : 0, 7.1, alongX ? 0 : t * w.d);
      }
      this.addBox(w.x, w.z, w.w, w.d);
    }

    // towers
    for (const [dx, dz] of [[-32, -32], [32, -26], [-32, 26]]) {
      const g = this.makeGroup(X + dx, Z + dz, 0);
      this.cyl(g, 4.4, 4.8, 13, 9, stone, 0, 6.5, 0);
      this.cone(g, 5.4, 4.0, 9, this.materials.shingleDark, 0, 15, 0);
      this.addBanner(g, TEX.bannerRed, 0, 6, 4.7, 2.2, 3.6);
      this.addCircle(X + dx, Z + dz, 4.9);
    }

    // keep
    const keep = this.makeGroup(X, Z - 12, 0);
    this.box(keep, 30, 5, 26, stone, 0, 2.5, 0);
    this.box(keep, 26, 13, 22, this.materials.stone, 0, 11.5, 0);
    this.box(keep, 27, 0.6, 23, this.materials.metalDark, 0, 18.2, 0);
    this.cyl(keep, 5.0, 5.4, 19, 9, this.materials.stone, -7, 26, 0);
    this.cone(keep, 6.2, 5, 9, this.materials.shingleDark, -7, 38, 0);
    this.cyl(keep, 4.2, 4.6, 15, 9, this.materials.stone, 8, 23, -2);
    this.cone(keep, 5.2, 4, 9, this.materials.shingleDark, 8, 32.5, -2);
    this.box(keep, 6, 8, 0.4, this.materials.darkWood, 0, 9.5, 11.2);
    this.box(keep, 2.2, 3.2, 0.3, this.materials.window, -5, 12, 11.1);
    this.box(keep, 2.2, 3.2, 0.3, this.materials.window, 5, 12, 11.1);
    this.box(keep, 3.4, 5.5, 0.3, this.materials.fire, 0, 8, 11.15);
    this.addBanner(keep, TEX.bannerRed, 0, 14, 11.5, 3, 5);
    this.addBanner(keep, TEX.bannerGold, 4, 8, 11.5, 1.8, 3);
    this.addBox(X, Z - 12, 31, 27);

    // broken gate
    const gate = this.makeGroup(X, Z + 32, 0);
    this.box(gate, 2.0, 8, 2.0, stone, -8, 4, 0);
    this.box(gate, 2.0, 5, 2.0, stone, 8, 2.5, 0);
    const fallen = this.box(gate, 14, 0.8, 2.6, stone, -4, 0.4, 1.8, 0.4);
    fallen.rotation.z = 0.08;
    this.addBanner(gate, TEX.bannerRed, -8, 5.5, 1.1, 1.6, 2.8);
    this.addCircle(X - 8, Z + 32, 1.3);
    this.addCircle(X + 8, Z + 32, 1.3);
    this.addLabel('СТАРЫЙ ФОРТ', X, Z + 38, 8, { width: 7, color: '#e0a090', maxDist: 140 });

    this.addCampfire(X + 9, Z + 15, 1.0);
    this.addCampfire(X - 13, Z + 10, 0.7);

    // skull spikes
    for (let i = 0; i < 6; i++) {
      const x = X - 20 + i * 8, z = Z + 24;
      const y = this.heightAt(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.4, 5), this.materials.darkWood);
      pole.position.set(x, y + 1.2, z);
      this.scene.add(pole);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 6), new THREE.MeshLambertMaterial({ color: 0xd9d2b8 }));
      skull.position.set(x, y + 2.5, z);
      skull.scale.set(1, 1.15, 0.9);
      this.scene.add(skull);
    }
    // cages
    for (const [dx, dz] of [[-15, 20], [14, 22]]) {
      const g = this.makeGroup(X + dx, Z + dz, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.box(g, 0.1, 2.2, 0.1, this.materials.iron, Math.cos(a) * 1.1, 1.1, Math.sin(a) * 1.1);
      }
      this.cyl(g, 1.2, 1.2, 0.15, 8, this.materials.iron, 0, 0.1, 0);
      this.cyl(g, 1.15, 1.15, 0.15, 8, this.materials.iron, 0, 2.2, 0);
      this.addCircle(X + dx, Z + dz, 1.2);
    }

    // warband area: weapon racks and banners
    const rack = this.makeGroup(X - 10, Z + 24, 0);
    this.box(rack, 3.4, 0.16, 1.0, this.materials.darkWood, 0, 1.4, 0);
    for (let i = 0; i < 4; i++) {
      const w = this.box(rack, 0.1, 1.6, 0.1, this.materials.metal, -1.2 + i * 0.8, 0.7, 0);
      w.rotation.z = (i - 1.5) * 0.15;
    }
    this.addBanner(this.makeGroup(X + 24, Z + 26, 0), TEX.bannerRed, 0, 4, 0, 3, 5);
  }

  /* ---------------- forest ---------------- */
  buildForest() {
    const rand = mulberry(913377);
    const trees = [];
    const spacing = new Map();

    const canPlace = (x, z, minDist) => {
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = spacing.get(`${cx + i},${cz + j}`);
          if (!arr) continue;
          for (const p of arr) {
            if (Math.hypot(p.x - x, p.z - z) < minDist) return false;
          }
        }
      }
      return true;
    };
    const register = (x, z) => {
      const key = `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
      if (!spacing.has(key)) spacing.set(key, []);
      spacing.get(key).push({ x, z });
    };

    const validSpot = (x, z, siteClearFactor = 0.72) => {
      for (const s of this.siteList) {
        if (Math.hypot(x - s.x, z - s.z) < s.r * siteClearFactor) return false;
      }
      if (this.roadNearby(x, z, 7)) return false;
      for (const c of this.colliders) {
        if (Math.abs(x - c.x) < c.hw + 3 && Math.abs(z - c.z) < c.hd + 3) return false;
      }
      for (const c of this.circleColliders) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + 3) return false;
      }
      return true;
    };

    const makeTree = (x, z, type) => {
      trees.push({ x, z, type });
      register(x, z);
    };

    // dense elven forest
    for (let i = 0; i < 8000 && trees.length < 1320; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const x = this.sites.elf.x + Math.cos(a) * r * 265;
      const z = this.sites.elf.z + Math.sin(a) * r * 240;
      if (x < -440 || x > 440 || z < -440 || z > 440) continue;
      if (!validSpot(x, z, 0.52)) continue;
      if (!canPlace(x, z, 3.1)) continue;
      makeTree(x, z, rand() < 0.64 ? 'pine' : 'broad');
    }
    // scattered trees across the rest of the map
    for (let i = 0; i < 1600 && trees.length < 1700; i++) {
      const x = (rand() - 0.5) * 860;
      const z = (rand() - 0.5) * 860;
      if (!validSpot(x, z, 0.8)) continue;
      if (!canPlace(x, z, 6.2)) continue;
      if (this.sites.neutral && Math.hypot(x - this.sites.neutral.x, z - this.sites.neutral.z) < 62) continue;
      makeTree(x, z, rand() < 0.45 ? 'pine' : 'broad');
    }

    this.trees = trees.map((t) => {
      const scale = 0.75 + rand() * 0.65;
      const height = (t.type === 'pine' ? 8.2 : 7.2) * scale;
      const y = this.heightAt(t.x, t.z);
      const entry = {
        ...t, scale, height, y, ground: y,
        radius: 0.32 * scale, obj: null, rotation: rand() * Math.PI * 2,
      };
      const key = `${Math.floor(t.x / 8)},${Math.floor(t.z / 8)}`;
      if (!this.treeGrid.has(key)) this.treeGrid.set(key, []);
      this.treeGrid.get(key).push({ x: t.x, z: t.z, radius: entry.radius });
      return entry;
    });

    this.treeBillboards = { pine: [], broad: [] };
  }

  makeTreeObject(tree) {
    const g = new THREE.Group();
    const s = tree.scale;
    if (!this.treeMats) {
      this.treeMats = {
        bark: new THREE.MeshLambertMaterial({ map: TEX.bark }),
        pineA: new THREE.MeshLambertMaterial({ color: 0x365027, flatShading: true }),
        pineB: new THREE.MeshLambertMaterial({ color: 0x456236, flatShading: true }),
        pineC: new THREE.MeshLambertMaterial({ color: 0x2c4722, flatShading: true }),
        leafA: new THREE.MeshLambertMaterial({ color: 0x4d7035, flatShading: true }),
        leafB: new THREE.MeshLambertMaterial({ color: 0x5e8440, flatShading: true }),
        leafC: new THREE.MeshLambertMaterial({ color: 0x3d5b2b, flatShading: true }),
      };
    }
    const M = this.treeMats;
    if (tree.type === 'pine') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 3.4 * s, 6), M.bark);
      trunk.position.y = 1.7 * s;
      g.add(trunk);
      const layers = 4;
      const mats = [M.pineC, M.pineA, M.pineB, M.pineA];
      for (let i = 0; i < layers; i++) {
        const r = (2.5 - i * 0.48) * s;
        const h = 3.0 * s;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mats[i % mats.length]);
        cone.position.y = (3.0 + i * 1.35) * s;
        cone.rotation.y = i * 0.5 + tree.rotation;
        g.add(cone);
      }
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.38 * s, 3.0 * s, 6), M.bark);
      trunk.position.y = 1.5 * s;
      g.add(trunk);
      const blobs = [
        [0, 4.6, 0, 2.3], [-1.4, 4.2, 0.6, 1.6], [1.5, 4.4, -0.5, 1.7],
        [0.3, 5.8, 0.4, 1.65], [-0.6, 5.3, -1.1, 1.45],
      ];
      const mats = [M.leafA, M.leafB, M.leafC];
      blobs.forEach((b, i) => {
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(b[3] * s, 1), mats[i % mats.length]);
        mesh.position.set(b[0] * s, b[1] * s, b[2] * s);
        mesh.scale.y = 0.85;
        g.add(mesh);
      });
    }
    g.position.set(tree.x, tree.ground, tree.z);
    g.rotation.y = tree.rotation;
    return g;
  }

  buildBillboards() {
    const makePoints = (type) => {
      const list = this.trees.filter(t => t.type === type);
      if (!list.length) return;
      const positions = new Float32Array(list.length * 3);
      const sizes = new Float32Array(list.length);
      const tints = new Float32Array(list.length * 3);
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        positions[i * 3] = t.x;
        positions[i * 3 + 1] = t.ground + t.height * 0.5;
        positions[i * 3 + 2] = t.z;
        sizes[i] = t.height;
        const v = 0.82 + Math.random() * 0.3;
        const warm = 0.94 + Math.random() * 0.12;
        tints[i * 3] = v * warm;
        tints[i * 3 + 1] = v;
        tints[i * 3 + 2] = v * 0.9;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1400);

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: type === 'pine' ? TEX.pine : TEX.broad },
          uProj: { value: 900 },
          uNear: { value: 44 },
          uFogColor: { value: new THREE.Color(0xb8c4ae) },
          uFogNear: { value: 110 },
          uFogFar: { value: 430 },
        },
        vertexShader: `
          attribute float aSize;
          attribute vec3 aTint;
          uniform float uProj;
          uniform float uNear;
          uniform float uFogNear;
          uniform float uFogFar;
          varying vec3 vTint;
          varying float vFog;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float d = -mv.z;
            if (d < uNear) {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              gl_PointSize = 0.0;
            } else {
              gl_PointSize = clamp(aSize * uProj / d, 1.0, 420.0);
              gl_Position = projectionMatrix * mv;
            }
            vTint = aTint;
            vFog = smoothstep(uFogNear, uFogFar, d);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform vec3 uFogColor;
          varying vec3 vTint;
          varying float vFog;
          void main() {
            vec4 tex = texture2D(uMap, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
            if (tex.a < 0.42) discard;
            vec3 col = tex.rgb * vTint;
            col = mix(col, uFogColor, vFog * 0.92);
            gl_FragColor = vec4(col, tex.a);
            #include <colorspace_fragment>
          }
        `,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 2;
      this.scene.add(points);
      this.treeBillboards[type] = { points, mat };
    };
    makePoints('pine');
    makePoints('broad');
    this.updateBillboardProjection();
  }

  updateBillboardProjection() {
    const cam = this.game.camera;
    if (!cam || !this.game.renderer) return;
    const h = this.game.renderer.domElement.height;
    const proj = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    for (const key of ['pine', 'broad']) {
      const b = this.treeBillboards?.[key];
      if (b) b.mat.uniforms.uProj.value = proj;
    }
  }

  /* ---------------- grass, rocks, logs ---------------- */
  buildGrassAndRocks() {
    const rand = mulberry(5521);

    // crossed alpha planes
    const positions = [];
    const uvs = [];
    const normals = [];
    const indices = [];
    const addQuad = (rot) => {
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const base = positions.length / 3;
      const dx = 0.5 * cos, dz = 0.5 * sin;
      positions.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
      for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    addQuad(0);
    addQuad(Math.PI / 2);
    const tuftGeo = new THREE.BufferGeometry();
    tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    tuftGeo.setIndex(indices);

    const count = 4200;
    const tuftMat = new THREE.MeshLambertMaterial({
      map: TEX.tuft, alphaTest: 0.42, side: THREE.DoubleSide, color: 0xc9d3ae,
    });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, count);
    const dummy = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 5) {
      const x = (rand() - 0.5) * 850;
      const z = (rand() - 0.5) * 850;
      if (this.roadNearby(x, z, 3)) continue;
      if (rand() < 0.55) {
        const elfD = Math.hypot(x - this.sites.elf.x, z - this.sites.elf.z);
        if (elfD > 260 && rand() < 0.55) continue;
      }
      const y = this.heightAt(x, z);
      const s = 0.8 + rand() * 1.4;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tufts.setMatrixAt(placed++, dummy.matrix);
    }
    tufts.count = placed;
    tufts.instanceMatrix.needsUpdate = true;
    tufts.frustumCulled = false;
    this.scene.add(tufts);

    // rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8c84, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 190);
    let rc = 0;
    for (let i = 0; i < 900 && rc < 190; i++) {
      const x = (rand() - 0.5) * 840;
      const z = (rand() - 0.5) * 840;
      const y = this.heightAt(x, z);
      const nearMountain = x + z > 150;
      if (!nearMountain && rand() < 0.65) continue;
      if (this.roadNearby(x, z, 5)) continue;
      const s = 0.4 + rand() * 1.7;
      dummy.position.set(x, y + s * 0.25, z);
      dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      dummy.scale.set(s, s * (0.6 + rand() * 0.6), s);
      dummy.updateMatrix();
      rocks.setMatrixAt(rc++, dummy.matrix);
      if (s > 1.4) this.addCircle(x, z, s * 0.7);
    }
    rocks.count = rc;
    rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(rocks);

    // fallen logs
    for (let i = 0; i < 26; i++) {
      const x = this.sites.elf.x + (rand() - 0.5) * 230;
      const z = this.sites.elf.z + (rand() - 0.5) * 210;
      const y = this.heightAt(x, z);
      if (this.roadNearby(x, z, 5)) continue;
      const len = 4.2;
      const yaw = rand() * Math.PI;
      const dx = Math.cos(yaw) * len * 0.5;
      const dz = -Math.sin(yaw) * len * 0.5;
      const h1 = this.heightAt(x - dx, z - dz);
      const h2 = this.heightAt(x + dx, z + dz);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, len, 7), this.treeMats ? this.treeMats.bark : this.materials.bark);
      log.position.set(x, (h1 + h2) * 0.5 + 0.38, z);
      // Lay the trunk along the terrain slope so it never hangs in the air.
      const axis = new THREE.Vector3(dx * 2, h2 - h1, dz * 2).normalize();
      log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      this.scene.add(log);
    }
  }

  /* ---------------- map ---------------- */
  buildMapCanvas() {
    const size = 720;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const toMap = (x, z) => [((x + HALF) / SIZE) * size, ((z + HALF) / SIZE) * size];

    // base
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#1b2a1c');
    grad.addColorStop(0.5, '#2c3826');
    grad.addColorStop(1, '#302a24');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // zone washes
    const blob = (cx, cz, r, color) => {
      const [mx, my] = toMap(cx, cz);
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, (r / SIZE) * size);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, size, size);
    };
    blob(this.sites.elf.x, this.sites.elf.z, 300, 'rgba(62,104,52,0.5)');
    blob(this.sites.palace.x, this.sites.palace.z, 240, 'rgba(128,102,50,0.34)');
    blob(this.sites.neutral.x, this.sites.neutral.z, 210, 'rgba(122,138,142,0.28)');
    blob(this.sites.villain.x, this.sites.villain.z, 230, 'rgba(112,58,54,0.34)');

    // faint quadrant borders
    ctx.save();
    ctx.strokeStyle = 'rgba(210,190,150,0.14)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.stroke();
    ctx.restore();

    // roads
    for (const def of this.roadDefs) {
      const pts = def.pts.map(p => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
      const sampled = curve.getPoints(120);
      ctx.strokeStyle = 'rgba(48,36,24,0.55)';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      sampled.forEach((p, i) => {
        const [mx, my] = toMap(p.x, p.z);
        if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
      });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(164,140,102,0.8)';
      ctx.lineWidth = 7;
      ctx.stroke();
    }

    // forest speckles
    for (let i = 0; i < this.trees.length; i += 2) {
      const t = this.trees[i];
      const [mx, my] = toMap(t.x, t.z);
      ctx.fillStyle = t.type === 'pine' ? 'rgba(32,62,32,0.75)' : 'rgba(56,86,40,0.65)';
      ctx.beginPath();
      ctx.arc(mx, my, 2 + t.scale * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // site icons
    for (const key of Object.keys(this.sites)) {
      const s = this.sites[key];
      const [mx, my] = toMap(s.x, s.z);
      ctx.save();
      ctx.translate(mx, my);
      ctx.strokeStyle = 'rgba(240,220,170,0.65)';
      ctx.fillStyle = 'rgba(15,20,14,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const icons = { elf: '🌲', palace: '🏰', neutral: '🏘', villain: '☠' };
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e9d9ae';
      ctx.fillText(icons[key], 0, 1);
      ctx.restore();
    }

    // labels
    ctx.textAlign = 'center';
    const titles = [
      ['ЛЕС ЭЛЬФОВ', this.sites.elf.x, this.sites.elf.z - 265, '#a9d68f'],
      ['ИМПЕРСКИЕ ЗЕМЛИ', this.sites.palace.x, this.sites.palace.z - 220, '#e8c77a'],
      ['ДОЛИНА ЛЮДЕЙ', this.sites.neutral.x, this.sites.neutral.z + 190, '#c9d6e0'],
      ['ПУСТОШИ', this.sites.villain.x, this.sites.villain.z + 190, '#e2a49a'],
    ];
    for (const [text, x, z, color] of titles) {
      const [mx, my] = toMap(x, z);
      ctx.font = '600 24px "Palatino Linotype", Georgia, serif';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(text, mx + 2, my + 2);
      ctx.fillStyle = color;
      ctx.fillText(text, mx, my);
    }
    // compass
    ctx.save();
    ctx.translate(size - 58, 58);
    ctx.strokeStyle = 'rgba(230,210,170,0.55)';
    ctx.fillStyle = 'rgba(230,210,170,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(5, -4); ctx.lineTo(0, -8); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 13px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('С', 0, 20);
    ctx.restore();

    // frame
    ctx.strokeStyle = 'rgba(200,164,92,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, size - 4, size - 4);

    this.mapCanvas = c;
    this.mapSize = size;
  }

  buildWorldLabels() {
    // central warning sign for the dark lands
    this.addLabel('ЗЕМЛИ ВОЙНЫ', 0, -10, 3, { width: 5, color: '#b5a894', maxDist: 40 });
  }

  /* ---------------- markers ---------------- */
  addMarker(pos, color = 0xf0d38a, label = '') {
    const group = new THREE.Group();
    const y = this.heightAt(pos.x, pos.z);
    group.position.set(pos.x, y, pos.z);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    gem.position.y = 3.2;
    group.add(gem);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.06, 4, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.3, 3.0, 6, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 1.7;
    group.add(beam);
    let text = null;
    if (label) {
      text = makeTextSprite(label, { worldWidth: 3.4, fontSize: 30 });
      text.position.y = 4.4;
      group.add(text);
    }
    this.scene.add(group);
    const marker = { group, gem, ring, beam, text, color, pos: pos.clone(), phase: Math.random() * 6 };
    this.markers.push(marker);
    return marker;
  }

  removeMarker(marker) {
    if (!marker) return;
    const i = this.markers.indexOf(marker);
    if (i >= 0) this.markers.splice(i, 1);
    this.scene.remove(marker.group);
    marker.group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        if (o.material?.map) o.material.map.dispose();
        o.material?.dispose?.();
      }
    });
  }

  clearMarkers() {
    for (const m of [...this.markers]) this.removeMarker(m);
  }

  /* ---------------- spawns ---------------- */
  spawnFor(faction) {
    if (faction === 'elf') return this.sitePos('elf', 0, 18);
    if (faction === 'guard') return this.sitePos('palace', 0, 34);
    return this.sitePos('villain', 0, 16);
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this.time += dt;

    for (const f of this.fires) {
      const flick = 0.75 + Math.sin(this.time * 11 + f.phase) * 0.16 + Math.sin(this.time * 23 + f.phase * 2) * 0.09;
      if (f.light) f.light.intensity = f.base * 2.2 * flick;
      if (f.flame) {
        f.flame.scale.set(0.9 + flick * 0.2, 0.85 + flick * 0.3, 0.9 + flick * 0.2);
        f.flame.rotation.y += dt * 1.5;
      }
      if (f.core) f.core.scale.y = 0.9 + flick * 0.2;
      if (f.glow) f.glow.material.opacity = 0.5 + flick * 0.25;
    }

    const p = this.game.player?.pos;
    for (const l of this.labels) {
      const d = p ? Math.hypot(l.x - p.x, l.z - p.z) : 0;
      l.sprite.visible = d < l.maxDist;
    }

    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 780) c.sprite.position.x = -780;
    }

    if (this.sky && this.game.camera) this.sky.position.copy(this.game.camera.position);

    this.lodTimer -= dt;
    if (this.lodTimer <= 0 && p) {
      this.lodTimer = 0.22;
      this.updateTreeLOD(p);
    }

    for (const m of this.markers) {
      m.gem.rotation.y += dt * 1.7;
      m.gem.position.y = 3.2 + Math.sin(this.time * 2 + m.phase) * 0.25;
      m.ring.rotation.z += dt * 0.4;
      m.ring.material.opacity = 0.4 + Math.sin(this.time * 2 + m.phase) * 0.2;
    }
  }

  updateTreeLOD(p) {
    const R = this.nearTreeRadius;
    for (const t of this.trees) {
      const dx = t.x - p.x, dz = t.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (!t.obj) {
          t.obj = this.makeTreeObject(t);
          this.scene.add(t.obj);
        }
        t.obj.visible = true;
      } else if (t.obj && d2 > (R * 1.25) * (R * 1.25)) {
        t.obj.visible = false;
      }
    }
  }
}
