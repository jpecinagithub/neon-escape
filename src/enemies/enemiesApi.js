/**
 * enemiesApi — stable contract so PlayerCar collisions can damage enemies
 * and EMP power-ups can disable them, without importing Enemies.jsx.
 * Implemented by src/enemies/Enemies.jsx via setImpl; safe no-ops until mounted.
 */

const noop = () => {};
let impl = {
  /** Damage the enemy owning rapier body `body`. Returns true if it was destroyed. */
  damageByBody: noop, // (body, amount) => boolean
  /** Disable enemies within radius of (x,z) for `dur` seconds. */
  disableNearby: noop, // (x, z, radius, dur) => void
  /** Current alive enemy count. */
  count: () => 0,
};

export const enemiesApi = {
  setImpl(next) { impl = { ...impl, ...next }; },
  damageByBody: (body, amount) => impl.damageByBody(body, amount),
  disableNearby: (x, z, radius, dur) => impl.disableNearby(x, z, radius, dur),
  count: () => impl.count(),
};
