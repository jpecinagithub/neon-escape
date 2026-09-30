// Headless logic test for the pedestrian reconversion.
// Stubs browser APIs, then exercises gameStore scoring/damage rules and
// replicates PlayerCar's ped hit-resolution logic exactly as written.
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const { useGame } = await import('../src/store/gameStore.js');
const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
};

// ---- replicate PlayerCar hit resolution (must match src/game/PlayerCar.jsx) ----
function pedPoints(type) { return type === 'skater' ? 750 : 500; }
function resolvePedHit(st, ped) {
  // copied logic: spdKmh > 11 assumed; bad -> points, no damage; good -> damage+combo reset
  pd_alive_false(ped);
  if (ped.alignment === 'bad') {
    st.addKill();
    st.addScore(pedPoints(ped.type), 'X');
  } else {
    const hpBefore = st.health;
    st.damage(12);
    st.resetCombo();
    return hpBefore - useGame.getState().health;
  }
  return 0;
}
function pd_alive_false(ped) { ped.alive = false; }

// ---- run ----
const S = () => useGame.getState();
S().startRun();
assert(S().phase === 'playing', 'run starts in playing phase');
assert(S().runOver === 0, 'runOver counter starts at 0');
assert(S().health === 100, 'hull starts at 100');

// 1. bad ped (thief): points, NO self damage
const hp0 = S().health;
resolvePedHit(useGame.getState(), { type: 'thief', alignment: 'bad', alive: true });
assert(S().runOver === 1, 'bad run-over increments runOver');
assert(S().score >= 500, `bad run-over scores >= 500 (got ${Math.round(S().score)})`);
assert(S().health === hp0, 'bad run-over deals NO hull damage (perverse incentive fixed)');

// 2. bad skater: 750
const s0 = S().score;
resolvePedHit(useGame.getState(), { type: 'skater', alignment: 'bad', alive: true });
assert(S().score - s0 >= 750, `bad skater scores >= 750`);

// 3. good ped (grandma): damage, combo reset, no points burst
S().addScore(100, 'X'); // build some combo first
const comboBefore = S().combo;
assert(comboBefore > 1, 'combo built up before good hit');
const dmg = resolvePedHit(useGame.getState(), { type: 'grandma', alignment: 'good', alive: true });
assert(dmg > 0, `good hit damages hull (lost ${dmg.toFixed(1)})`);
assert(S().combo === 1 && S().comboCount === 0, 'good hit resets combo');

// 4. combo scoring still works
S().resetCombo();
const p1 = S().addScore(500, '¡LADRÓN!');
const p2 = S().addScore(500, '¡LADRÓN!');
assert(p2 > p1, `combo multiplies repeat hits (${p1} -> ${p2})`);

// 5. EMP notify text updated
S().collectPowerup('emp');
const lastNotif = S().notifications[S().notifications.length - 1];
assert(lastNotif && lastNotif.sub === 'PEATONES CONGELADOS', 'EMP notify says PEATONES CONGELADOS');

// 6. death still ends run
S().damage(1000);
assert(S().phase === 'gameover', 'hull 0 ends the run');
assert(typeof S().stats.kills === 'number', 'stats carry kill count');

console.log('\nAll pedestrian logic tests passed.');
