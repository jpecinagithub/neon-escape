import * as THREE from 'three';

/**
 * Mutable per-frame game state. NEVER put this in React state or zustand —
 * it changes every frame. Components read/write these plain objects directly.
 */

export const now = () => performance.now() / 1000;

/** Player vehicle live state, written by PlayerCar every frame. */
export const playerRef = {
  position: new THREE.Vector3(-35, 1, -180),
  velocity: new THREE.Vector3(),
  heading: 0, // radians; forward = (sin(heading), 0, cos(heading)). 0 => +Z.
  speedKmh: 0,
  speedMs: 0,
  drifting: false,
  driftAngle: 0, // radians between velocity dir and heading
  airborne: false,
  nitro: false, // nitro currently boosting
  wrecked: false,
  body: null, // rapier RigidBody handle (set by PlayerCar)
  wheelSpin: { current: 0 }, // rad/s, read by CarModel
};

/** Enemy registry. Enemies.jsx keeps this in sync. */
export const enemiesRef = {
  // entries: { id, type, position:Vector3, velocity:Vector3, speedKmh, hp, alive,
  //            disabledUntil, body (rapier handle), lastHitAt }
  list: [],
};

/** Power-up registry (for minimap). Powerups.jsx keeps this in sync. */
export const powerupsRef = {
  // entries: { id, kind, position:Vector3, active }
  list: [],
};

/** Global time scale for slow-motion effects. */
export const timeState = { scale: 1, slowUntil: 0 };

export function triggerSlowMo(duration = 0.45) {
  timeState.slowUntil = now() + duration;
}

/** Call once per frame (from GameTicker) before other logic. */
export function updateTimeScale() {
  timeState.scale = now() < timeState.slowUntil ? 0.28 : 1;
}

/** Camera mode cycled with C: 0 = chase, 1 = close, 2 = high arcade. */
export const cameraState = { mode: 0 };

/** Tiny event bus for cross-component signals (shake, banners handled in store). */
const _listeners = {};
export const bus = {
  on(ev, fn) {
    (_listeners[ev] = _listeners[ev] || []).push(fn);
    return () => {
      _listeners[ev] = (_listeners[ev] || []).filter((f) => f !== fn);
    };
  },
  emit(ev, data) {
    const arr = _listeners[ev];
    if (arr) for (let i = 0; i < arr.length; i++) arr[i](data);
  },
};

// Events used across the game:
//   bus.emit('shake', { power: 0..1 })            -> CameraRig
//   bus.emit('wrecked')                           -> PlayerCar/GameScene (dramatic crash)
