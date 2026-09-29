import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { playerRef, cameraState, bus } from './shared';
import { useGame } from '../store/gameStore';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
