/**
 * roadGraph.js — street-grid routing for enemy pursuit AI.
 *
 * The city is a 6x6 grid (AVENUES along Z, STREETS along X). Intersections
 * form the graph nodes; adjacent intersections are linked by road segments.
 * Enemies use A* over this tiny graph to drive the streets like traffic
 * instead of beelining across city blocks.
 */
import { AVENUES, STREETS } from './cityData.js';

const N = AVENUES.length; // 6

/** node id = avenueIndex * N + streetIndex */
export function nodePos(id) {
  const ai = Math.floor(id / N);
  const si = id % N;
  return { x: AVENUES[ai], z: STREETS[si] };
}

export function nearestNode(x, z) {
  let best = 0;
  let bd = Infinity;
  for (let ai = 0; ai < N; ai++) {
    for (let si = 0; si < N; si++) {
      const dx = x - AVENUES[ai];
      const dz = z - STREETS[si];
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = ai * N + si; }
    }
  }
  return best;
}

function neighbors(id) {
  const ai = Math.floor(id / N);
  const si = id % N;
  const out = [];
  if (ai > 0) out.push(id - N);
  if (ai < N - 1) out.push(id + N);
  if (si > 0) out.push(id - 1);
  if (si < N - 1) out.push(id + 1);
  return out;
}

/**
 * A* from the intersection nearest (sx,sz) to the one nearest (tx,tz).
 * Returns waypoints [{x,z}] excluding the start node. Empty array when
 * both points share the nearest intersection or no route exists.
 */
export function findRoadPath(sx, sz, tx, tz) {
  const start = nearestNode(sx, sz);
  const goal = nearestNode(tx, tz);
  if (start === goal) return [];

  const gp = nodePos(goal);
  const h = (id) => {
    const p = nodePos(id);
    return Math.hypot(p.x - gp.x, p.z - gp.z);
  };

  const open = [start];
  const gScore = new Map([[start, 0]]);
  const fScore = new Map([[start, h(start)]]);
  const cameFrom = new Map();
  const closed = new Set();

  while (open.length > 0) {
    let bi = 0;
    let bf = fScore.get(open[0]);
    if (bf === undefined) bf = Infinity;
    for (let i = 1; i < open.length; i++) {
      const f = fScore.get(open[i]);
      const fv = f === undefined ? Infinity : f;
      if (fv < bf) { bf = fv; bi = i; }
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const ids = [cur];
      let c = cur;
      while (cameFrom.has(c)) {
        c = cameFrom.get(c);
        ids.unshift(c);
      }
      return ids.slice(1).map(nodePos);
    }
    closed.add(cur);
    const cp = nodePos(cur);
    const cg = gScore.get(cur);
    const cgv = cg === undefined ? Infinity : cg;
    for (const nb of neighbors(cur)) {
      if (closed.has(nb)) continue;
      const np = nodePos(nb);
      const tentative = cgv + Math.hypot(np.x - cp.x, np.z - cp.z);
      const ng = gScore.get(nb);
      if (tentative < (ng === undefined ? Infinity : ng)) {
        cameFrom.set(nb, cur);
        gScore.set(nb, tentative);
        fScore.set(nb, tentative + h(nb));
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  return []; // grid is fully connected; this is a safety fallback
}
