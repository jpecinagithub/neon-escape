/**
 * effectsApi — stable contract between gameplay code (PlayerCar, Enemies, ...)
 * and the Effects component (particle pools, skid marks).
 * Implemented by src/game/Effects.jsx via setImpl; safe no-ops until mounted.
 */

const noop = () => {};
let impl = {
  /** Spark/debris burst: burst(x, y, z, { count, color, speed, up, size }) */
  burst: noop,
  /** Explosion fireball + shockwave: explosion(x, y, z, scale=1) */
  explosion: noop,
  /** Smoke puff: smoke(x, y, z, { big, dark }) */
  smoke: noop,
  /** Skid-mark stamp: skid(x, z, heading) */
  skid: noop,
};

export const effectsApi = {
  setImpl(next) { impl = { ...impl, ...next }; },
  burst: (x, y, z, opts) => impl.burst(x, y, z, opts),
  explosion: (x, y, z, scale) => impl.explosion(x, y, z, scale),
  smoke: (x, y, z, opts) => impl.smoke(x, y, z, opts),
  skid: (x, z, heading) => impl.skid(x, z, heading),
};
