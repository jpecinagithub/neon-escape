import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsApi } from './effectsApi';

const SPARK_COUNT = 500;
const SMOKE_COUNT = 48;
const SKID_COUNT = 600;
const noop = () => {};

/** Shared radial-gradient texture (white core -> transparent) for smoke puffs. */
function makePuffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function Effects() {
  // ---------------- SPARKS (THREE.Points, pool 500) ----------------
  const sparkCursor = useRef(0);
  const sparkData = useMemo(() => {
    const pos = new Float32Array(SPARK_COUNT * 3);
    const col = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) pos[i * 3 + 1] = -999; // parked below world
    const vel = new Float32Array(SPARK_COUNT * 3);
    const life = new Float32Array(SPARK_COUNT); // 0 = dead
    const maxLife = new Float32Array(SPARK_COUNT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { pos, col, vel, life, maxLife, geo };
  }, []);

  // ---------------- SMOKE (48 sprites, shared texture) ----------------
  const puffTex = useMemo(makePuffTexture, []);
  const smokes = useMemo(() => {
    const arr = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: puffTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.frustumCulled = false;
      arr.push({
        sprite, mat,
        life: 0, maxLife: 1,
        startScale: 1.5, growth: 2.2,
        vel: new THREE.Vector3(),
      });
    }
    return arr;
  }, [puffTex]);
  const smokeCursor = useRef(0);

  // ---------------- SKID MARKS (instanced, ring buffer 600) ----------------
  const skidGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.32, 1.4);
    g.rotateX(-Math.PI / 2); // pre-rotate flat; per-instance matrix is yaw-only
    return g;
  }, []);
  const skidMesh = useRef(null);
  const skidCursor = useRef(0);
  const skidTmp = useMemo(() => new THREE.Matrix4(), []);

  useLayoutEffect(() => {
    // hide all instances until first stamped
    const m = skidMesh.current;
    if (!m) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SKID_COUNT; i++) m.setMatrixAt(i, zero);
    m.instanceMatrix.needsUpdate = true;
  }, []);

  // ---------------- EXPLOSION flash light + shockwave ring ----------------
  const flashRef = useRef(null);
  const ringRef = useRef(null);
  const flashState = useRef({ intensity: 0, decay: 0 }); // decay: intensity/sec
  const ringState = useRef({ t: 1, maxScale: 8, maxDur: 0.5 }); // t>=maxDur = idle

  // ---------------- API impl (stable, close only over refs) ----------------
  const api = useMemo(() => {
    const tmpColor = new THREE.Color();

    const burst = (x, y, z, opts = {}) => {
      const { count = 20, color = 0xffcc66, speed = 12, up = 6 } = opts;
      const { pos, col, vel, life, maxLife, geo } = sparkData;
      tmpColor.set(color);
      for (let k = 0; k < count; k++) {
        const i = sparkCursor.current;
        sparkCursor.current = (sparkCursor.current + 1) % SPARK_COUNT;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const r = speed * (0.3 + Math.random() * 0.7);
        vel[i * 3] = Math.cos(a) * r;
        vel[i * 3 + 1] = up * (0.3 + Math.random());
        vel[i * 3 + 2] = Math.sin(a) * r;
        life[i] = maxLife[i] = 0.5 + Math.random() * 0.6;
        col[i * 3] = tmpColor.r;
        col[i * 3 + 1] = tmpColor.g;
        col[i * 3 + 2] = tmpColor.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    };

    const smoke = (x, y, z, opts = {}) => {
      const { big = false, dark = false } = opts;
      const s = smokes[smokeCursor.current];
      smokeCursor.current = (smokeCursor.current + 1) % SMOKE_COUNT;
      s.sprite.position.set(x, y, z);
      s.life = s.maxLife = big ? 2 : 1.2;
      s.startScale = big ? 3.5 : 1.5;
      s.growth = big ? 3 : 2.2;
      s.vel.set((Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5);
      s.mat.color.set(dark ? 0x222222 : 0x9aa4b5);
      s.mat.opacity = 0.55;
      s.sprite.scale.set(s.startScale, s.startScale, 1);
      s.sprite.visible = true;
    };

    const skid = (x, z, heading) => {
      const m = skidMesh.current;
      if (!m) return;
      const i = skidCursor.current;
      skidCursor.current = (skidCursor.current + 1) % SKID_COUNT;
      skidTmp.makeRotationY(heading);
      skidTmp.setPosition(x, 0.045, z);
      m.setMatrixAt(i, skidTmp);
      m.instanceMatrix.needsUpdate = true;
    };

    const explosion = (x, y, z, scale = 1) => {
      burst(x, y, z, { count: Math.round(60 * scale), color: 0xff8833, speed: 18, up: 10 });
      burst(x, y + 1, z, { count: Math.round(25 * scale), color: 0xffdd66, speed: 8 });
      smoke(x, y + 1, z, { big: true, dark: true });
      // flash light
      const f = flashRef.current;
      if (f) {
        f.position.set(x, y + 2, z);
        f.distance = 40 * scale;
        flashState.current.intensity = 300 * scale;
        flashState.current.decay = (300 * scale) / 0.35; // full fade in 0.35s
        f.intensity = flashState.current.intensity;
      }
      // shockwave ring
      const ring = ringRef.current;
      if (ring) {
        ring.position.set(x, y + 0.3, z);
        ringState.current.t = 0;
        ringState.current.maxScale = 8 * scale;
        ring.visible = true;
      }
    };

    return { burst, smoke, skid, explosion };
  }, [sparkData, smokes, skidTmp]);

  // ---------------- per-frame simulation (no allocations) ----------------
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);

    // sparks: integrate, gravity, kill
    const { pos, vel, life, geo } = sparkData;
    let sparkDirty = false;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (life[i] <= 0) continue;
      sparkDirty = true;
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0) {
        pos[i3 + 1] = -999; // park dead particle
        continue;
      }
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      vel[i3 + 1] -= 22 * dt;
    }
    if (sparkDirty) geo.attributes.position.needsUpdate = true;

    // smoke: rise, expand, fade
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const s = smokes[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        continue;
      }
      const k = 1 - s.life / s.maxLife; // 0 -> 1
      const sc = s.startScale + s.growth * k;
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.position.x += s.vel.x * dt;
      s.sprite.position.y += s.vel.y * dt;
      s.sprite.position.z += s.vel.z * dt;
      s.mat.opacity = 0.55 * (1 - k);
    }

    // explosion flash decay
    const fs = flashState.current;
    if (fs.intensity > 0 && flashRef.current) {
      fs.intensity = Math.max(0, fs.intensity - fs.decay * dt);
      flashRef.current.intensity = fs.intensity;
    }

    // shockwave ring expand + fade
    const rs = ringState.current;
    const ring = ringRef.current;
    if (ring && rs.t < rs.maxDur) {
      rs.t += dt;
      const k = Math.min(1, rs.t / rs.maxDur);
      const sc = 1 + (rs.maxScale - 1) * k;
      ring.scale.set(sc, sc, sc);
      ring.material.opacity = 0.8 * (1 - k);
      if (k >= 1) ring.visible = false;
    }
  });

  // ---------------- register impl / cleanup ----------------
  useEffect(() => {
    effectsApi.setImpl(api);
    return () => {
      effectsApi.setImpl({ burst: noop, explosion: noop, smoke: noop, skid: noop });
      sparkData.geo.dispose();
      skidGeo.dispose();
      puffTex.dispose();
      for (const s of smokes) {
        s.mat.dispose();
      }
    };
  }, [api, sparkData, skidGeo, puffTex, smokes]);

  return (
    <group>
      {/* sparks */}
      <points geometry={sparkData.geo} frustumCulled={false}>
        <pointsMaterial
          size={0.4}
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* smoke sprites */}
      {smokes.map((s, i) => (
        <primitive key={i} object={s.sprite} />
      ))}

      {/* skid marks */}
      <instancedMesh
        ref={skidMesh}
        args={[skidGeo, undefined, SKID_COUNT]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={0x050505}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </instancedMesh>

      {/* explosion flash light */}
      <pointLight
        ref={flashRef}
        color={0xffaa44}
        intensity={0}
        distance={40}
        decay={2}
      />

      {/* explosion shockwave ring (flat torus) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <torusGeometry args={[1, 0.08, 8, 48]} />
        <meshBasicMaterial
          color={0xffaa33}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
