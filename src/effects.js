import * as THREE from '../vendor/three.module.js';
import { TEX } from './textures.js';

/* ============================================================
   FX — blood, sparks, severed limbs, floating numbers, slashes.
   ============================================================ */

class ParticlePool {
  constructor(scene, count, color, size, texture, blending) {
    this.count = count;
    this.cursor = 0;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) positions[i * 3 + 1] = -9999;
    this.positions = positions;
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000);
    const mat = new THREE.PointsMaterial({
      color, size, map: texture, transparent: true, depthWrite: false,
      sizeAttenuation: true, alphaTest: 0.1, blending: blending || THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, gravity = 18) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity = gravity;
  }

  update(dt) {
    const p = this.positions;
    const v = this.vel;
    let changed = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      changed = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        p[i * 3 + 1] = -9999;
        continue;
      }
      v[i * 3 + 1] -= this.gravity * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < this.groundY) {
        p[i * 3 + 1] = this.groundY;
        v[i * 3 + 1] *= -0.15;
        v[i * 3] *= 0.5;
        v[i * 3 + 2] *= 0.5;
      }
    }
    if (changed) this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.bloodPool = new ParticlePool(game.scene, 700, 0x8f0f08, 0.16, TEX.blood, THREE.NormalBlending);
    this.bloodPool.groundY = 0;
    this.sparksPool = new ParticlePool(game.scene, 260, 0xffc25a, 0.09, TEX.glow, THREE.AdditiveBlending);
    this.sparksPool.groundY = 0;
    this.debris = [];
    this.transients = [];
    this.decals = [];
    this.layer = document.getElementById('floatingLayer');
    this.tmp = new THREE.Vector3();
  }

  bloodAt(pos, count = 16, force = 4) {
    this.bloodPool.groundY = this.game.world.heightAt(pos.x, pos.z) + 0.04;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * force;
      this.bloodPool.spawn(
        pos.x + Math.cos(a) * 0.2, pos.y + Math.random() * 0.4, pos.z + Math.sin(a) * 0.2,
        Math.cos(a) * s, 1.5 + Math.random() * 3.5, Math.sin(a) * s,
        0.7 + Math.random() * 0.9,
      );
    }
    this.addDecal(pos, 0.8 + Math.random() * 0.9);
  }

  blood(pos, force) { this.bloodAt(pos, 20, force || 4); }

  bloodDrip(pos) {
    const p = this.tmp.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 1.0, pos.z + (Math.random() - 0.5) * 0.4);
    this.bloodPool.groundY = this.game.world.heightAt(p.x, p.z) + 0.03;
    for (let i = 0; i < 3; i++) {
      this.bloodPool.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, 0.8);
    }
  }

  sparks(pos) {
    this.sparksPool.groundY = this.game.world.heightAt(pos.x, pos.z) + 0.2;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparksPool.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * (2 + Math.random() * 4), 1 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 4),
        0.25 + Math.random() * 0.3,
      );
    }
  }

  addDecal(pos, scale = 1) {
    const y = this.game.world.heightAt(pos.x, pos.z);
    const mat = new THREE.MeshBasicMaterial({
      map: TEX.blood, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * 2.2, scale * 2.2), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.5, y + 0.045, pos.z + (Math.random() - 0.5) * 0.5);
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 35 + Math.random() * 15 });
    if (this.decals.length > 40) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  dropLimb(obj, pos, facing) {
    if (!obj) return;
    this.scene.add(obj);
    obj.position.y = Math.max(obj.position.y, this.game.world.heightAt(pos.x, pos.z) + 0.25);
    const dir = new THREE.Vector3(
      -Math.sin(facing) * (1 + Math.random() * 2),
      3 + Math.random() * 2.5,
      -Math.cos(facing) * (1 + Math.random() * 2),
    );
    obj.rotation.x += Math.random() * 0.7;
    obj.rotation.z += (Math.random() - 0.5) * 1.2;
    this.debris.push({
      mesh: obj,
      vel: dir,
      spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 8),
      life: 90,
      rest: false,
    });
  }

  damageNumber(pos, amount, kind = '') {
    if (!this.layer) return;
    const v = pos.clone().project(this.game.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const span = document.createElement('span');
    span.className = 'float-dmg ' + kind;
    span.textContent = kind === 'gold' ? '+' + amount + ' 🪙' : (kind === 'heal' ? '+' + amount : '-' + Math.round(amount));
    span.style.left = x + 'px';
    span.style.top = y + 'px';
    this.layer.appendChild(span);
    setTimeout(() => span.remove(), 1050);
  }

  slash(pos, yaw, hit) {
    const geo = new THREE.RingGeometry(1.0, 2.8, 14, 1, -Math.PI * 0.35, Math.PI * 0.7);
    const mat = new THREE.MeshBasicMaterial({
      color: hit ? 0xffe1a0 : 0xd8ddcf, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = yaw;
    mesh.rotation.x = -Math.PI / 2 + 0.15;
    mesh.position.y = 0.1;
    group.add(mesh);
    this.scene.add(group);
    this.transients.push({
      obj: group,
      life: 0.18,
      maxLife: 0.18,
      update: (t, dt, obj) => {
        obj.scale.setScalar(1 + t * 0.35);
        obj.traverse((o) => { if (o.isMesh) o.material.opacity = 0.55 * (1 - t); });
      },
    });
  }

  update(dt) {
    this.bloodPool.update(dt);
    this.sparksPool.update(dt);

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      const mesh = d.mesh;
      if (!d.rest) {
        d.vel.y -= 22 * dt;
        mesh.position.x += d.vel.x * dt;
        mesh.position.y += d.vel.y * dt;
        mesh.position.z += d.vel.z * dt;
        mesh.rotation.x += d.spin.x * dt;
        mesh.rotation.y += d.spin.y * dt;
        mesh.rotation.z += d.spin.z * dt;
        const gy = this.game.world.heightAt(mesh.position.x, mesh.position.z) + 0.18;
        if (mesh.position.y <= gy) {
          mesh.position.y = gy;
          d.vel.set(0, 0, 0);
          d.spin.set(0, 0, 0);
          d.rest = true;
          mesh.rotation.x = Math.PI / 2 * 0.85;
          mesh.rotation.z = (Math.random() - 0.5) * 0.8;
          mesh.rotation.y = Math.random() * Math.PI * 2;
        }
      }
      d.life -= dt;
      if (d.life <= 0) {
        // Dropped limbs are clones that share geometry and materials with the
        // living humanoid. Disposing them here would invalidate every other
        // character using the same buffers, so only detach the group.
        this.scene.remove(mesh);
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 6) d.mesh.material.opacity = Math.max(0, d.life / 6) * 0.55;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.decals.splice(i, 1);
      }
    }

    for (let i = this.transients.length - 1; i >= 0; i--) {
      const t = this.transients[i];
      t.life -= dt;
      const p = 1 - t.life / t.maxLife;
      t.update?.(p, dt, t.obj);
      if (t.life <= 0) {
        this.scene.remove(t.obj);
        t.obj.traverse((o) => {
          if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); }
        });
        this.transients.splice(i, 1);
      }
    }
  }
}
