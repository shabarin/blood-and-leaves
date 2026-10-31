import * as THREE from '../vendor/three.module.js';
import { TEX } from './textures.js';

/* ============================================================
   Low-poly humanoid assembled from primitives.
   Every limb is a separate group so it can be severed.
   ============================================================ */

const PALETTES = {
  elf: {
    skin: 0xd8b48e, cloth: 0x3f5d32, cloth2: 0x6b7a45, leather: 0x5a4128,
    metal: 0x8f947d, hair: 0x3a2a1a, cloak: 0x2c4324, accent: 0xc9b36a,
  },
  guard: {
    skin: 0xd5ad86, cloth: 0x7a2a24, cloth2: 0x9a3a2c, leather: 0x3a2a1e,
    metal: 0xaab0b6, hair: 0x2a211a, cloak: 0x5c1f1a, accent: 0xd9b45e,
  },
  villain: {
    skin: 0xc9a17c, cloth: 0x2a2629, cloth2: 0x3d3036, leather: 0x241a1a,
    metal: 0x6e6a70, hair: 0x141010, cloak: 0x4a1418, accent: 0xb03a34,
  },
  neutral: {
    skin: 0xd9b48d, cloth: 0x6b5a3f, cloth2: 0x8a7551, leather: 0x4a3826,
    metal: 0x9a9a94, hair: 0x3b2b1c, cloak: 0x5b4a32, accent: 0xbfa76a,
  },
  bandit: {
    skin: 0xcda57e, cloth: 0x4a3f2c, cloth2: 0x665437, leather: 0x362a1d,
    metal: 0x8d8674, hair: 0x2a1f14, cloak: 0x3e3121, accent: 0x9a8a5a,
  },
};

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {
    torso: new THREE.BoxGeometry(0.64, 0.72, 0.36),
    hips: new THREE.BoxGeometry(0.58, 0.24, 0.34),
    head: new THREE.SphereGeometry(0.205, 12, 10),
    arm: new THREE.BoxGeometry(0.17, 0.7, 0.19),
    hand: new THREE.BoxGeometry(0.17, 0.16, 0.19),
    leg: new THREE.BoxGeometry(0.22, 0.78, 0.24),
    foot: new THREE.BoxGeometry(0.24, 0.14, 0.34),
    shoulder: new THREE.SphereGeometry(0.15, 8, 6),
    belt: new THREE.BoxGeometry(0.66, 0.1, 0.38),
    skirt: new THREE.CylinderGeometry(0.36, 0.44, 0.36, 8),
    cloak: new THREE.BoxGeometry(0.62, 1.0, 0.05),
    blade: new THREE.BoxGeometry(0.07, 0.92, 0.035),
    guard: new THREE.BoxGeometry(0.24, 0.05, 0.08),
    hilt: new THREE.BoxGeometry(0.055, 0.2, 0.055),
    axeHead: new THREE.BoxGeometry(0.34, 0.26, 0.05),
    shield: new THREE.BoxGeometry(0.5, 0.7, 0.06),
    spearShaft: new THREE.CylinderGeometry(0.03, 0.035, 2.1, 6),
    spearTip: new THREE.ConeGeometry(0.09, 0.3, 6),
    helmet: new THREE.CylinderGeometry(0.225, 0.24, 0.22, 10),
    helmetTop: new THREE.ConeGeometry(0.16, 0.28, 8),
    hood: new THREE.ConeGeometry(0.3, 0.46, 8),
    horn: new THREE.ConeGeometry(0.05, 0.3, 5),
    eye: new THREE.SphereGeometry(0.028, 6, 5),
    quiver: new THREE.CylinderGeometry(0.075, 0.075, 0.7, 6),
    metalArm: new THREE.BoxGeometry(0.16, 0.7, 0.18),
    metalLeg: new THREE.BoxGeometry(0.2, 0.78, 0.22),
    metalEye: new THREE.SphereGeometry(0.045, 6, 5),
    shadow: new THREE.CircleGeometry(0.55, 16),
  };
  return GEO;
}

function mat(color, map = null, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, map, ...opts });
}

export function createHumanoid(faction = 'neutral', opts = {}) {
  const g = geometries();
  const pal = { ...(PALETTES[faction] || PALETTES.neutral), ...(opts.palette || {}) };
  const role = opts.role || 'warrior';
  const isPlayer = !!opts.isPlayer;

  const mats = {
    skin: mat(pal.skin),
    cloth: mat(pal.cloth),
    cloth2: mat(pal.cloth2),
    leather: mat(pal.leather, TEX.wood, { color: pal.leather }),
    metal: mat(pal.metal),
    metalDark: mat(0x4b4d50),
    hair: mat(pal.hair),
    cloak: mat(pal.cloak),
    accent: mat(pal.accent),
    eye: mat(0x1a1210),
    wood: mat(0x6b4c2a, TEX.wood),
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shadow = new THREE.Mesh(g.shadow, new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  root.add(shadow);

  // torso / hips
  const hips = new THREE.Mesh(g.hips, mats.cloth);
  hips.position.y = 1.0;
  body.add(hips);

  const torso = new THREE.Mesh(g.torso, role === 'guard' ? mats.metal : mats.cloth);
  torso.position.y = 1.36;
  body.add(torso);

  const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.02), mats.accent);
  tabard.position.set(0, 1.33, 0.19);
  body.add(tabard);

  if (role === 'guard') {
    const belt = new THREE.Mesh(g.belt, mats.leather);
    belt.position.y = 0.99;
    body.add(belt);
  }
  const skirt = new THREE.Mesh(g.skirt, mats.cloth2);
  skirt.position.y = 1.03;
  body.add(skirt);

  // head
  const head = new THREE.Group();
  head.position.y = 1.86;
  body.add(head);

  const skull = new THREE.Mesh(g.head, mats.skin);
  skull.scale.set(1, 1.15, 0.95);
  head.add(skull);

  const eyeL = new THREE.Mesh(g.eye, mats.eye);
  eyeL.position.set(-0.075, 0.03, 0.185);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(g.eye, mats.eye);
  eyeR.position.set(0.075, 0.03, 0.185);
  head.add(eyeR);

  // metallic eye prosthetics
  const metalEyeL = new THREE.Mesh(g.metalEye, mats.metal);
  metalEyeL.position.copy(eyeL.position);
  metalEyeL.visible = false;
  head.add(metalEyeL);
  const metalEyeR = metalEyeL.clone();
  metalEyeR.position.copy(eyeR.position);
  head.add(metalEyeR);

  // headwear
  if (faction === 'guard' || role === 'captain') {
    const helm = new THREE.Mesh(g.helmet, mats.metal);
    helm.position.y = 0.09;
    head.add(helm);
    const top = new THREE.Mesh(g.helmetTop, mats.metal);
    top.position.y = 0.24;
    head.add(top);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.22), mats.accent);
    crest.position.y = 0.3;
    head.add(crest);
  } else if (faction === 'elf') {
    const hood = new THREE.Mesh(g.hood, mats.cloak);
    hood.position.y = 0.14;
    hood.rotation.x = -0.05;
    head.add(hood);
    const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.018, 5, 16), mats.accent);
    circlet.position.y = 0.06;
    circlet.rotation.x = Math.PI / 2;
    head.add(circlet);
    // pointed ear
    const earGeo = new THREE.ConeGeometry(0.045, 0.22, 4);
    const earL = new THREE.Mesh(earGeo, mats.skin);
    earL.position.set(-0.2, 0.04, -0.02);
    earL.rotation.z = 0.95;
    head.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.2;
    earR.rotation.z = -0.95;
    head.add(earR);
  } else if (faction === 'villain') {
    const helm = new THREE.Mesh(g.helmet, mats.metalDark);
    helm.position.y = 0.1;
    helm.scale.set(1.04, 1.1, 1.04);
    head.add(helm);
    const hornL = new THREE.Mesh(g.horn, mats.accent);
    hornL.position.set(-0.18, 0.26, 0);
    hornL.rotation.z = -0.5;
    head.add(hornL);
    const hornR = hornL.clone();
    hornR.position.x = 0.18;
    hornR.rotation.z = 0.5;
    head.add(hornR);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.06), mats.metalDark);
    mask.position.set(0, -0.06, 0.18);
    head.add(mask);
  } else if (faction === 'neutral') {
    const hair = new THREE.Mesh(g.head, mats.hair);
    hair.scale.set(1.03, 0.7, 1.02);
    hair.position.y = 0.11;
    head.add(hair);
    if (role === 'shop' || role === 'smith') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 10), mats.leather);
      cap.position.y = 0.19;
      head.add(cap);
    }
  }

  // arms
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.41, 1.6, 0);
    body.add(arm);

    const upper = new THREE.Mesh(g.arm, faction === 'guard' ? mats.metal : mats.cloth);
    upper.position.y = -0.34;
    arm.add(upper);

    const hand = new THREE.Mesh(g.hand, mats.skin);
    hand.position.y = -0.73;
    arm.add(hand);

    const shoulder = new THREE.Mesh(g.shoulder, mats.cloth2);
    shoulder.position.y = -0.02;
    arm.add(shoulder);

    const metal = new THREE.Mesh(g.metalArm, mats.metal);
    metal.position.y = -0.34;
    metal.visible = false;
    arm.add(metal);

    arm.userData.metal = metal;
    arm.userData.upper = upper;
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // shield on left arm
  if (role === 'guard' || role === 'captain') {
    const shield = new THREE.Mesh(g.shield, mats.cloth2);
    shield.position.set(-0.17, -0.55, 0.05);
    shield.rotation.z = 0.1;
    armL.add(shield);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.74, 0.03), mats.metal);
    rim.position.set(-0.17, -0.55, 0.01);
    rim.rotation.z = 0.1;
    armL.add(rim);
  }

  // weapon in right hand
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.76, 0.04);
  armR.add(weapon);
  if (opts.unarmed) weapon.visible = false;

  if (role === 'villain' || role === 'captain' || role === 'brute') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 6), mats.wood);
    shaft.position.y = -0.42;
    weapon.add(shaft);
    const headAxe = new THREE.Mesh(g.axeHead, mats.metal);
    headAxe.position.set(0.14, -0.86, 0);
    weapon.add(headAxe);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), mats.metal);
    spike.position.set(-0.06, -0.9, 0);
    spike.rotation.z = Math.PI / 2;
    weapon.add(spike);
  } else if (role === 'guard' && faction !== 'elf') {
    const shaft = new THREE.Mesh(g.spearShaft, mats.wood);
    shaft.position.y = -0.7;
    weapon.add(shaft);
    const tip = new THREE.Mesh(g.spearTip, mats.metal);
    tip.position.y = -1.78;
    tip.rotation.x = Math.PI;
    weapon.add(tip);
  } else {
    const blade = new THREE.Mesh(g.blade, mats.metal);
    blade.position.y = -0.5;
    weapon.add(blade);
    const guard = new THREE.Mesh(g.guard, mats.accent);
    guard.position.y = -0.04;
    weapon.add(guard);
    const hilt = new THREE.Mesh(g.hilt, mats.leather);
    hilt.position.y = 0.07;
    weapon.add(hilt);
  }

  // legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, 0.92, 0);
    body.add(leg);
    const upper = new THREE.Mesh(g.leg, mats.cloth);
    upper.position.y = -0.39;
    leg.add(upper);
    const foot = new THREE.Mesh(g.foot, mats.leather);
    foot.position.set(0, -0.84, 0.06);
    leg.add(foot);
    const metal = new THREE.Mesh(g.metalLeg, mats.metal);
    metal.position.y = -0.39;
    metal.visible = false;
    leg.add(metal);
    leg.userData.metal = metal;
    leg.userData.upper = upper;
    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // cloak / quiver / backpack
  if (faction === 'elf') {
    const quiver = new THREE.Mesh(g.quiver, mats.leather);
    quiver.position.set(0.22, 1.45, -0.22);
    quiver.rotation.z = -0.35;
    body.add(quiver);
    const arrows = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), mats.wood);
    arrows.position.set(0.26, 1.62, -0.25);
    arrows.rotation.z = -0.35;
    body.add(arrows);
  }

  const cloak = new THREE.Mesh(g.cloak, mats.cloak);
  cloak.position.set(0, 1.28, -0.22);
  cloak.rotation.x = 0.06;
  body.add(cloak);

  if (faction === 'villain') {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.05), mats.cloak);
    cape.position.set(0, 1.2, -0.24);
    body.add(cape);
  }

  const parts = { head, armL, armR, legL, legR, torso, body };
  const eyes = { left: eyeL, right: eyeR };
  const metalEyes = { left: metalEyeL, right: metalEyeR };
  const hidden = {};

  let phase = Math.random() * Math.PI * 2;
  let walkAmount = 0;

  const model = {
    root,
    body,
    parts,
    palette: pal,
    shadow,
    setLimb(kind, state) {
      const map = { armL, armR, legL, legR, head };
      const node = map[kind];
      if (!node) return;
      if (state === 'lost') {
        node.visible = false;
        return;
      }
      node.visible = true;
      if (kind === 'head') return;
      const isArm = kind === 'armL' || kind === 'armR';
      const normal = isArm ? node.children[0] : node.children[0];
      const metal = node.userData.metal;
      if (normal) normal.visible = state !== 'prosthetic';
      if (metal) metal.visible = state === 'prosthetic';
    },
    setEye(side, state) {
      const e = eyes[side];
      const m = metalEyes[side];
      if (!e) return;
      e.visible = state === 'ok';
      m.visible = state === 'prosthetic';
    },
    detach(kind) {
      const map = { head, armL, armR, legL, legR };
      const node = map[kind];
      if (!node || hidden[kind]) return null;
      hidden[kind] = true;
      node.updateWorldMatrix(true, true);
      const clone = node.clone(true);
      clone.applyMatrix4(node.matrixWorld);
      node.visible = false;
      return clone;
    },
    animate(dt, params = {}) {
      const move = Math.min(1, params.move || 0);
      walkAmount += (move - walkAmount) * Math.min(1, dt * 10);
      const rate = 3.2 + walkAmount * 7.5;
      phase += dt * rate;
      const swing = Math.sin(phase) * 0.62 * walkAmount;

      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.65;
      armR.rotation.x = swing * 0.65;
      armL.rotation.z = 0.06;
      armR.rotation.z = -0.06;

      // idle breathing
      body.position.y = Math.sin(phase * 0.5) * 0.012 * (1 - walkAmount);
      body.rotation.z = Math.sin(phase * 0.5) * 0.008 * (1 - walkAmount);

      if (params.block) {
        armL.rotation.x = -1.15;
        armL.rotation.z = 0.55;
        armR.rotation.x = -0.85;
        armR.rotation.z = -0.35;
      }

      if (params.attack !== undefined && params.attack >= 0) {
        const t = Math.min(1, params.attack);
        const windup = Math.min(1, t * 2.4);
        const strike = Math.max(0, Math.min(1, (t - 0.35) * 3.4));
        const attackArm = params.leftHand ? armL : armR;
        const offArm = params.leftHand ? armR : armL;
        const side = params.leftHand ? 1 : -1;
        attackArm.rotation.x = -2.6 * windup + strike * 3.3;
        attackArm.rotation.z = side * (0.15 + Math.sin(t * Math.PI) * 0.35);
        offArm.rotation.x = -0.8 * windup + strike * 0.5;
        if (t > 0.9) {
          attackArm.rotation.x *= (1 - (t - 0.9) * 6);
          offArm.rotation.x *= (1 - (t - 0.9) * 6);
        }
      }

      if (params.crouch) {
        body.position.y -= 0.35;
        legL.rotation.x = -1.2;
        legR.rotation.x = -0.8;
        armL.rotation.x = -0.4;
      }
      if (params.crawl) {
        body.position.y -= 0.62;
        body.rotation.x = 0.45;
      } else if (!params.crouch) {
        body.rotation.x = 0;
      }
    },
    resetPose() {
      for (const p of [armL, armR, legL, legR]) {
        p.rotation.set(0, 0, 0);
        p.visible = true;
      }
      head.visible = true;
      body.position.y = 0;
      body.rotation.x = 0;
      body.rotation.z = 0;
    },
    dispose() {
      root.traverse((o) => {
        if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
      });
    },
  };

  return model;
}

export function getFactionColors(faction) {
  return PALETTES[faction] || PALETTES.neutral;
}
