/**
 * Procedural city layout — pure data, no three.js.
 * Used by City.jsx (visuals + colliders), Enemies.jsx (spawning / avoidance),
 * Powerups.jsx (placement) and the HUD minimap.
 *
 * Units are meters. Roads form a 6x6 grid; blocks sit between them.
 * forward = (sin(heading), 0, cos(heading)); heading 0 => +Z.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);
const rr = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

export const WORLD_HALF = 220;
export const ROAD_W = 16;

// 6 avenues (along Z) and 6 streets (along X)
export const AVENUES = [-175, -105, -35, 35, 105, 175];
export const STREETS = [-175, -105, -35, 35, 105, 175];

export const ROADS = [
  ...AVENUES.map((x) => ({ x, z: 0, w: ROAD_W, d: WORLD_HALF * 2 })),
  ...STREETS.map((z) => ({ x: 0, z, w: WORLD_HALF * 2, d: ROAD_W })),
];

export function isOnRoad(x, z, margin = 2) {
  for (const r of ROADS) {
    if (Math.abs(x - r.x) <= r.w / 2 + margin && Math.abs(z - r.z) <= r.d / 2 + margin) return true;
  }
  return false;
}

// ---- Buildings: 5x5 blocks between the roads ----
const BLOCK_CENTERS = [-140, -70, 0, 70, 140];
export const BUILDINGS = []; // {x, z, w, d, h, hue}

for (const bx of BLOCK_CENTERS) {
  for (const bz of BLOCK_CENTERS) {
    if (bx === 0 && bz === 0) continue; // central plaza stays open
    const style = rand();
    if (style < 0.12) continue; // some blocks are parking lots (open)
    const inset = 8;
    const half = 34 - inset; // block half-size minus inset
    if (style < 0.45) {
      // one big tower
      const w = rr(30, 46), d = rr(30, 46);
      BUILDINGS.push({ x: bx + rr(-6, 6), z: bz + rr(-6, 6), w, d, h: rr(26, 78), hue: rand() });
    } else {
      // 2-4 smaller blocks
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const w = rr(14, 24), d = rr(14, 24);
        BUILDINGS.push({
          x: bx + rr(-half + w / 2, half - w / 2),
          z: bz + rr(-half + d / 2, half - d / 2),
          w, d, h: rr(14, 52), hue: rand(),
        });
      }
    }
  }
}

// ---- Tunnel: road along X at z=-35 passes under an arch from x=40..120 ----
export const TUNNELS = [
  { x: 80, z: -35, len: 90, roadW: ROAD_W, wallGap: 13, height: 9 },
];

// ---- Ramps: {x, z, rotY (facing), width, length, height} ----
export const RAMPS = [
  { x: 0, z: -40, rotY: 0, width: 9, length: 14, height: 3.4 }, // plaza, facing +Z
  { x: -35, z: 150, rotY: Math.PI, width: 9, length: 14, height: 3.4 },
  { x: 105, z: -150, rotY: 0, width: 9, length: 14, height: 3.4 },
  { x: -150, z: 35, rotY: Math.PI / 2, width: 9, length: 14, height: 3.4 },
  { x: 150, z: 105, rotY: -Math.PI / 2, width: 9, length: 14, height: 3.4 },
];

// ---- Power-up spawn spots (on roads, spread out) ----
export const POWERUP_SPOTS = (() => {
  const spots = [];
  const lanes = [...AVENUES, ...STREETS];
  for (let i = 0; i < 16; i++) {
    const vertical = i % 2 === 0;
    const c = lanes[i % lanes.length];
    const along = -190 + (i * 47) % 380;
    const x = vertical ? c : along;
    const z = vertical ? along : c;
    spots.push({ x, z });
  }
  // a couple in the plaza
  spots.push({ x: 18, z: 18 }, { x: -18, z: -18 });
  return spots;
})();

// ---- Destructible prop clusters (cones/barriers near intersections) ----
export const PROP_CLUSTERS = (() => {
  const clusters = [];
  for (let i = 0; i < 10; i++) {
    const x = pick(AVENUES), z = pick(STREETS);
    clusters.push({ x: x + rr(-14, 14), z: z + rr(-14, 14), n: 3 + Math.floor(rand() * 4) });
  }
  return clusters;
})();

export const PLAYER_SPAWN = { x: -35, z: -180, heading: 0 };

/** Random point on a road, optionally far from (x,z). */
export function randomRoadPoint(farFrom = null, minDist = 0) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = rand() < 0.5;
    const c = pick(vertical ? AVENUES : STREETS);
    const along = rr(-WORLD_HALF + 10, WORLD_HALF - 10);
    const x = vertical ? c + rr(-4, 4) : along;
    const z = vertical ? along : c + rr(-4, 4);
    if (!farFrom) return { x, z };
    const dx = x - farFrom.x, dz = z - farFrom.z;
    if (dx * dx + dz * dz >= minDist * minDist) return { x, z };
  }
  return { x: 0, z: 180 };
}

/** Check whether a straight path from (x,z) is blocked by a building (cheap AABB test). */
export function pathBlocked(x, z, tx, tz) {
  for (const b of BUILDINGS) {
    // sample midpoint of the segment
    const mx = (x + tx) / 2, mz = (z + tz) / 2;
    if (Math.abs(mx - b.x) < b.w / 2 + 2 && Math.abs(mz - b.z) < b.d / 2 + 2) return true;
  }
  return false;
}

export function clampToWorld(x, z, margin = 12) {
  const m = WORLD_HALF - margin;
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) };
}
