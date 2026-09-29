import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerRef, cameraState, bus } from './shared';
import { useGame } from '../store/gameStore';
import { BUILDINGS, TUNNELS } from './cityData';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---- camera obstruction: expanded solid boxes (buildings + tunnel walls).
   If the chase camera ended up inside one, the screen goes black — so the
   segment car->camera is clamped to stop just before the first wall. ---- */
const CAM_BOXES = [
  ...BUILDINGS.map((b) => ({
    minX: b.x - b.w / 2 - 0.6, maxX: b.x + b.w / 2 + 0.6,
    minY: -1, maxY: b.h + 0.6,
    minZ: b.z - b.d / 2 - 0.6, maxZ: b.z + b.d / 2 + 0.6,
  })),
  ...TUNNELS.flatMap((t) => [-1, 1].map((side) => ({
    minX: t.x - t.len / 2, maxX: t.x + t.len / 2,
    minY: 0, maxY: t.height,
    minZ: t.z + side * t.wallGap - 0.8, maxZ: t.z + side * t.wallGap + 0.8,
  }))),
];

const _head = new THREE.Vector3();

/** Clamp `to` so segment from->to stops before the first solid box. Writes into `out`. */
function resolveCameraPos(from, to, out) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) { out.copy(to); return; }
  let best = 1;
  for (let i = 0; i < CAM_BOXES.length; i++) {
    const b = CAM_BOXES[i];
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (from.x < b.minX || from.x > b.maxX) continue; }
    else {
      let ta = (b.minX - from.x) / dx, tb = (b.maxX - from.x) / dx;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dy) < 1e-9) { if (from.y < b.minY || from.y > b.maxY) continue; }
    else {
      let ta = (b.minY - from.y) / dy, tb = (b.maxY - from.y) / dy;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (from.z < b.minZ || from.z > b.maxZ) continue; }
    else {
      let ta = (b.minZ - from.z) / dz, tb = (b.maxZ - from.z) / dz;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) continue;
    }
    if (t0 < best) best = t0;
  }
  // stop a little before the wall (margin in world units)
  const t = best < 1 ? Math.max(0, best - 0.7 / len) : 1;
  out.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
  if (out.y < 0.5) out.y = 0.5; // never under the street
}

// 0 = chase, 1 = close, 2 = high arcade
const MODES = [
  { back: 6.8, up: 2.9 },
  { back: 4.4, up: 1.8 },
  { back: 10.5, up: 6.0 },
];

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * CameraRig — chase camera. Raw delta drives all smoothing so slow-mo stays
 * smooth. Wrecked => slow orbit. Drift => camera roll. Trauma-based shake
 * from bus 'shake' events, gated by settings.cameraShake.
 */
export function CameraRig() {
  const trauma = useRef(0);
  const orb = useRef(0);

  useEffect(() => {
    const off = bus.on('shake', ({ power }) => {
      trauma.current = Math.min(1, trauma.current + (power || 0));
    });
    return off;
  }, []);

  useFrame((state, rawDelta) => {
    const camera = state.camera;
    const dt = Math.min(rawDelta, 0.05);
    const p = playerRef.position;

    trauma.current = Math.max(0, trauma.current - 1.6 * dt);

    // ---- wrecked: slow orbit ----
    if (playerRef.wrecked) {
      orb.current += rawDelta * 0.55;
      _desired.set(
        p.x + Math.sin(orb.current) * 8.5,
        p.y + 3.2,
        p.z + Math.cos(orb.current) * 8.5
      );
      _head.set(p.x, p.y + 1.6, p.z);
      resolveCameraPos(_head, _desired, _desired);
      camera.position.lerp(_desired, 1 - Math.exp(-3 * dt));
      camera.lookAt(p.x, p.y + 1, p.z);
      return;
    }

    // ---- chase ----
    const h = playerRef.heading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const cfg = MODES[cameraState.mode] || MODES[0];

    _desired.set(p.x - fx * cfg.back, p.y + cfg.up, p.z - fz * cfg.back);
    _head.set(p.x, p.y + 1.6, p.z);
    resolveCameraPos(_head, _desired, _desired); // keep camera out of buildings
    camera.position.lerp(_desired, 1 - Math.exp(-6 * dt));

    _look.set(p.x + fx * 5, p.y + 1.3, p.z + fz * 5);
    camera.lookAt(_look);
    if (playerRef.drifting) camera.rotateZ(-playerRef.driftAngle * 0.18);

    // ---- FOV kick ----
    const speed01 = clamp(playerRef.speedKmh / 220, 0, 1);
    const targetFov = 60 + speed01 * 15 + (playerRef.nitro ? 9 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }

    // ---- shake ----
    const tr = trauma.current;
    if (tr > 0 && useGame.getState().settings.cameraShake) {
      const s = tr * tr * 0.9;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
  });

  return null;
}
