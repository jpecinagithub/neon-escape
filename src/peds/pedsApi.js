/**
 * pedsApi — stable contract so PlayerCar hit detection and EMP power-ups can
 * reach the pedestrian director without importing Pedestrians.jsx.
 * Implemented by src/peds/Pedestrians.jsx via setImpl; safe no-ops until mounted.
 */

const noop = () => {};
let impl = {
  /** Freeze pedestrians within radius of (x,z) for `dur` seconds. */
  freezeNearby: noop, // (x, z, radius, dur) => void
  /** Current alive pedestrian count. */
  count: () => 0,
};

export const pedsApi = {
  setImpl(next) { impl = { ...impl, ...next }; },
  freezeNearby: (x, z, radius, dur) => impl.freezeNearby(x, z, radius, dur),
  count: () => impl.count(),
};
