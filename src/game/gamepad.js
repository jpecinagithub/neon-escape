// gamepad.js — PlayStation / standard-mapping controller support via the Gamepad API.
// Polled once per frame from PlayerCar; no React state involved. Works alongside keyboard.

import { useGame } from '../store/gameStore';

const DEADZONE = 0.15;

let padIndex = null;
let prevButtons = [];

// PlayStation-first layout: classic (X/Square) AND modern (RT/LT) schemes
// work at the same time, so whatever the player expects just works.
//   X (0) / RT (7) ....... accelerate (X digital, RT analog)
//   Square (2) / LT (6) ... brake / reverse (Square digital, LT analog)
//   Left stick / D-pad .... steer
//   Circle (1) ............ handbrake (drift)
//   Triangle (3) .......... reset car
//   R1 (5) ................ camera
//   Options (9) ........... pause

function findPad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  if (padIndex !== null) {
    const p = pads[padIndex];
    if (p && p.connected) return p;
    padIndex = null;
  }
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected) {
      padIndex = i;
      return p;
    }
  }
  return null;
}

const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));
const btnVal = (p, i) => (p.buttons[i] ? p.buttons[i].value : 0);
const btnDown = (p, i) => !!(p.buttons[i] && p.buttons[i].pressed);

// Analog driving state. Call once per frame.
export function pollPad() {
  const p = findPad();
  if (!p) return { connected: false, steer: 0, throttle: 0, brake: 0, handbrake: false };
  let steer = dz(p.axes[0] || 0);
  if (btnDown(p, 15)) steer = 1;
  else if (btnDown(p, 14)) steer = -1;
  let throttle = btnVal(p, 7);
  if (btnDown(p, 0)) throttle = 1; // X = gas (classic PlayStation layout)
  let brake = btnVal(p, 6);
  if (btnDown(p, 2)) brake = 1; // Square = brake (classic PlayStation layout)
  // some drivers report triggers digital-only — accept pressed as full input
  if (btnDown(p, 7)) throttle = Math.max(throttle, 1);
  if (btnDown(p, 6)) brake = Math.max(brake, 1);
  if (btnDown(p, 12)) throttle = Math.max(throttle, 1);
  if (btnDown(p, 13)) brake = Math.max(brake, 1);
  return { connected: true, steer, throttle, brake, handbrake: btnDown(p, 1) };
}

// Raw live Gamepad object for diagnostics / HUD readouts. Null when none.
export function getRawPad() {
  return findPad();
}

// Edge-triggered one-shot actions. Call once per frame; returns e.g. ['reset', 'pause'].
export function pollPadButtons() {
  const p = findPad();
  const out = [];
  if (!p) {
    prevButtons = [];
    return out;
  }
  const edge = (i) => btnDown(p, i) && !prevButtons[i];
  if (edge(3)) out.push('reset'); // Triangle
  if (edge(5)) out.push('camera'); // R1
  if (edge(9)) out.push('pause'); // Options
  prevButtons = p.buttons.map((b) => b.pressed);
  return out;
}

// Rumble on impacts. Silent no-op when unsupported.
export function rumble(strength = 0.5, durationMs = 250) {
  try {
    const p = findPad();
    const act = p && p.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    const s = Math.max(0, Math.min(1, strength));
    const res = act.playEffect('dual-rumble', {
      duration: durationMs,
      strongMagnitude: s,
      weakMagnitude: s * 0.6,
    });
    if (res && typeof res.catch === 'function') res.catch(() => {});
  } catch {
    /* gamepad vibration not available */
  }
}

function shortName(id) {
  if (/sony|playstation|dualshock|dualsense/i.test(id || '')) return 'PLAYSTATION CONTROLLER';
  return ((id || '').split('(')[0].trim().slice(0, 28).toUpperCase() || 'CONTROLLER');
}

if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', (e) => {
    padIndex = e.gamepad.index;
    prevButtons = [];
    try {
      useGame.getState().notify('CONTROLLER CONNECTED', shortName(e.gamepad.id), 'good');
    } catch {
      /* store not ready */
    }
  });
  window.addEventListener('gamepaddisconnected', () => {
    padIndex = null;
    prevButtons = [];
    try {
      useGame.getState().notify('CONTROLLER DISCONNECTED');
    } catch {
      /* store not ready */
    }
  });
}
