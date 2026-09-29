import { create } from 'zustand';
import { CARS } from '../game/constants';

const SAVE_KEY = 'neon-escape-save-v1';

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return s;
  } catch (e) { /* ignore */ }
  return {};
}
const saved = loadSave();

let notifId = 0;

export const useGame = create((set, get) => {
  const save = () => {
    try {
      const s = get();
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        settings: s.settings,
        best: s.best,
        unlocked: s.unlocked,
        carId: s.carId,
      }));
    } catch (e) { /* ignore */ }
  };

  return {
    // ---- phase ----
    phase: 'menu', // menu | garage | howto | settings | playing | paused | gameover
    settingsReturn: 'menu', // where SETTINGS returns to
    runId: 0, // increments on every fresh run; gameplay components reset on change
    setPhase: (phase, settingsReturn) =>
      set({ phase, ...(settingsReturn ? { settingsReturn } : {}) }),

    // ---- run state ----
    score: 0,
    best: saved.best || 0,
    combo: 1,
    comboCount: 0,
    comboTimer: 0,
    health: 100,
    speedKmh: 0,
    survivalTime: 0,
    enemiesDestroyed: 0,
    longestDrift: 0,
    topSpeed: 0,
    // power-up timestamps (performance.now()/1000 based); powerups flags derived in tick
    fx: { nitroUntil: 0, shieldUntil: 0, scoreBoostUntil: 0 },
    powerups: { nitro: false, shield: false, scoreBoost: false },
    notifications: [], // {id, text, sub, kind}
    banner: null, // {text, sub}
    stats: null,

    // ---- garage ----
    carId: saved.carId || 'vortex',
    unlocked: { vortex: true, 'drift-x': false, titan: false, phantom: false, ...(saved.unlocked || {}) },
    selectCar: (carId) => { set({ carId }); save(); },

    // ---- settings ----
    settings: {
      master: 80, music: 70, sfx: 80,
      graphics: 'high', cameraShake: true, motionEffects: true, showFps: false,
      ...(saved.settings || {}),
    },
    updateSettings: (partial) => {
      set((s) => ({ settings: { ...s.settings, ...partial } }));
      save();
    },

    // ---- actions ----
    startRun: (carId) => set({
      phase: 'playing',
      runId: get().runId + 1,
      score: 0, combo: 1, comboCount: 0, comboTimer: 0,
      health: 100, speedKmh: 0, survivalTime: 0,
      enemiesDestroyed: 0, longestDrift: 0, topSpeed: 0,
      fx: { nitroUntil: 0, shieldUntil: 0, scoreBoostUntil: 0 },
      powerups: { nitro: false, shield: false, scoreBoost: false },
      notifications: [], banner: null, stats: null,
      carId: carId || get().carId,
    }),

    pauseGame: () => { if (get().phase === 'playing') set({ phase: 'paused' }); },
    resumeGame: () => { if (get().phase === 'paused') set({ phase: 'playing' }); },

    /** Per-frame tick, called from GameTicker with real dt (seconds). */
    tick: (dt) => {
      const s = get();
      if (s.phase !== 'playing') return;
      const t = performance.now() / 1000;
      let { combo, comboCount, comboTimer } = s;
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { combo = 1; comboCount = 0; }
      }
      const fx = s.fx;
      const powerups = {
        nitro: t < fx.nitroUntil,
        shield: t < fx.shieldUntil,
        scoreBoost: t < fx.scoreBoostUntil,
      };
      const pwChanged =
        powerups.nitro !== s.powerups.nitro ||
        powerups.shield !== s.powerups.shield ||
        powerups.scoreBoost !== s.powerups.scoreBoost;
      set({
        survivalTime: s.survivalTime + dt,
        score: s.score + dt * 12, // survival trickle
        combo, comboCount, comboTimer,
        ...(pwChanged ? { powerups } : {}),
      });
    },

    /** Award points; bumps the combo multiplier. Returns awarded points. */
    addScore: (base, label) => {
      const s = get();
      if (s.phase !== 'playing') return 0;
      const comboCount = s.comboCount + 1;
      const combo = Math.min(5, 1 + comboCount * 0.25);
      const mult = combo * (performance.now() / 1000 < s.fx.scoreBoostUntil ? 2 : 1);
      const pts = Math.round(base * mult);
      set({
        score: s.score + pts,
        combo, comboCount, comboTimer: 4,
      });
      if (label) get().notify(label, `+${pts.toLocaleString()}${combo > 1 ? `  x${combo.toFixed(2)}` : ''}`);
      return pts;
    },

    setSpeedHud: (speedKmh, topSpeed) => {
      const s = get();
      if (Math.abs(s.speedKmh - speedKmh) < 1 && s.topSpeed >= topSpeed) return;
      set({ speedKmh, topSpeed: Math.max(s.topSpeed, topSpeed) });
    },

    recordDrift: (duration) => {
      const s = get();
      if (duration > s.longestDrift) set({ longestDrift: duration });
    },
    addKill: () => set((s) => ({ enemiesDestroyed: s.enemiesDestroyed + 1 })),

    damage: (amount) => {
      const s = get();
      if (s.phase !== 'playing') return;
      const t = performance.now() / 1000;
      const shielded = t < s.fx.shieldUntil;
      const car = CARS[s.carId] || CARS.vortex;
      const final = amount * (shielded ? 0.35 : 1) * car.durability;
      const health = Math.max(0, s.health - final);
      set({ health });
      if (health <= 0) get().endRun();
    },

    heal: (amount) => set((s) => ({ health: Math.min(100, s.health + amount) })),

    collectPowerup: (kind) => {
      const s = get();
      if (s.phase !== 'playing') return;
      const t = performance.now() / 1000;
      const fx = { ...s.fx };
      if (kind === 'repair') {
        get().heal(25);
        get().notify('REPAIR', '+25 HULL', 'good');
      } else if (kind === 'nitro') {
        fx.nitroUntil = t + 5;
        get().notify('NITRO', '5s BOOST', 'nitro');
      } else if (kind === 'shield') {
        fx.shieldUntil = t + 8;
        get().notify('SHIELD UP', '8s PROTECTION', 'good');
      } else if (kind === 'emp') {
        get().notify('EMP BLAST', 'PURSUERS DISABLED', 'emp');
      } else if (kind === 'score') {
        fx.scoreBoostUntil = t + 10;
        get().notify('DOUBLE SCORE', '10s', 'score');
      }
      set({ fx });
    },

    notify: (text, sub, kind) => {
      const id = ++notifId;
      set((s) => ({ notifications: [...s.notifications.slice(-4), { id, text, sub, kind }] }));
      setTimeout(() => {
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
      }, 2200);
    },

    setBanner: (text, sub, dur = 3) => {
      set({ banner: { text, sub } });
      setTimeout(() => {
        const b = get().banner;
        if (b && b.text === text) set({ banner: null });
      }, dur * 1000);
    },

    endRun: () => {
      const s = get();
      if (s.phase !== 'playing') return;
      const score = Math.round(s.score);
      const best = Math.max(s.best, score);
      const unlocked = { ...s.unlocked };
      const newUnlocks = [];
      for (const [id, car] of Object.entries(CARS)) {
        if (!unlocked[id] && car.unlockScore > 0 && best >= car.unlockScore) {
          unlocked[id] = true;
          newUnlocks.push(car.name);
        }
      }
      set({
        phase: 'gameover',
        best,
        unlocked,
        stats: {
          score,
          time: s.survivalTime,
          kills: s.enemiesDestroyed,
          longestDrift: s.longestDrift,
          topSpeed: s.topSpeed,
          newUnlocks,
          isBest: score >= s.best && score > 0,
        },
      });
      save();
    },
  };
});
