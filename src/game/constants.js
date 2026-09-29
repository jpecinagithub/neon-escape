/**
 * Static game data: cars, enemy archetypes, power-up kinds.
 * Numbers here are the design contract; physics children tune feel around them.
 */

export const CARS = {
  vortex: {
    id: 'vortex',
    name: 'VORTEX',
    desc: 'Balanced street machine. Forgiving and quick.',
    topSpeed: 200, // km/h
    accel: 24, // m/s^2
    handling: 1.0,
    drift: 1.0,
    durability: 1.0, // damage multiplier (lower = tougher)
    color: 0x00e5ff,
    accent: 0x0066ff,
    unlockScore: 0,
  },
  'drift-x': {
    id: 'drift-x',
    name: 'DRIFT-X',
    desc: 'Drift specialist. Slides on demand, holds angles forever.',
    topSpeed: 195,
    accel: 22,
    handling: 1.2,
    drift: 1.6,
    durability: 0.9,
    color: 0x7c4dff,
    accent: 0xff2fd6,
    unlockScore: 25000,
  },
  titan: {
    id: 'titan',
    name: 'TITAN',
    desc: 'Heavy armored brute. Shrugs off impacts.',
    topSpeed: 182,
    accel: 19,
    handling: 0.85,
    drift: 0.7,
    durability: 0.55,
    color: 0xffa726,
    accent: 0xff3d00,
    unlockScore: 75000,
  },
  phantom: {
    id: 'phantom',
    name: 'PHANTOM',
    desc: 'Fastest car in the city. Fragile — drive it like you stole it.',
    topSpeed: 220,
    accel: 28,
    handling: 0.95,
    drift: 1.1,
    durability: 1.45,
    color: 0xff2fd6,
    accent: 0x00e5ff,
    unlockScore: 150000,
  },
};

export const CAR_ORDER = ['vortex', 'drift-x', 'titan', 'phantom'];

export const ENEMY_DEFS = {
  interceptor: {
    name: 'INTERCEPTOR',
    topSpeed: 208, // km/h
    accel: 26,
    turn: 2.6,
    hp: 40,
    mass: 1.0,
    color: 0xff2244,
    accent: 0xff8866,
    behavior: 'chase', // aims slightly ahead of player
  },
  rammer: {
    name: 'RAMMER',
    topSpeed: 178,
    accel: 17,
    turn: 1.7,
    hp: 90,
    mass: 2.2,
    color: 0xff8800,
    accent: 0xffdd44,
    behavior: 'side', // aims at player's flank
  },
  hunter: {
    name: 'HUNTER',
    topSpeed: 198,
    accel: 22,
    turn: 2.2,
    hp: 60,
    mass: 1.3,
    color: 0xaa33ff,
    accent: 0x66ffff,
    behavior: 'intercept', // predicts player position ahead
  },
  elite: {
    name: 'ELITE',
    topSpeed: 228,
    accel: 30,
    turn: 3.0,
    hp: 70,
    mass: 1.1,
    color: 0xffffff,
    accent: 0xff00ff,
    behavior: 'aggressive',
  },
};

export const POWERUP_DEFS = {
  repair: { name: 'REPAIR', color: 0x33ff77, label: '+25 HULL' },
  nitro: { name: 'NITRO', color: 0x33aaff, label: 'NITRO!' },
  shield: { name: 'SHIELD', color: 0x44ddff, label: 'SHIELD UP' },
  emp: { name: 'EMP', color: 0xcc66ff, label: 'EMP BLAST' },
  score: { name: 'SCORE x2', color: 0xffd633, label: 'DOUBLE SCORE' },
};

export const NEON_SIGNS = ['NOVA', 'ION', 'VECTOR', 'ZERO', 'NIGHTCORP', 'NEON CITY', 'SYNTH', 'PULSE', 'VOLT', 'MIRAGE', 'AFTERDARK', 'CHROMA'];
