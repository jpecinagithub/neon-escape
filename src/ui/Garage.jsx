import { useGame } from '../store/gameStore.js';
import { CARS, CAR_ORDER } from '../game/constants.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pct = (v) => `${Math.round(clamp01(v) * 100)}%`;

function StatBar({ name, value }) {
  return (
    <div className="stat-row">
      <span className="stat-name">{name}</span>
      <span className="stat-bar"><span className="stat-fill" style={{ width: pct(value) }} /></span>
    </div>
  );
}

export function Garage() {
  const carId = useGame((s) => s.carId);
  const unlocked = useGame((s) => s.unlocked);
  const best = useGame((s) => s.best);
  const selectCar = useGame((s) => s.selectCar);
  const notify = useGame((s) => s.notify);
  const setPhase = useGame((s) => s.setPhase);

  const pick = (id) => click(() => {
    if (unlocked[id]) {
      selectCar(id);
    } else {
      const car = CARS[id];
      notify('LOCKED', `UNLOCK AT ${car.unlockScore.toLocaleString()} PTS`, 'bad');
    }
  });

  return (
    <div className="screen screen-dim">
      <div className="panel">
        <h2>GARAGE</h2>
        <div className="garage-grid">
          {CAR_ORDER.map((id) => {
            const car = CARS[id];
            const isLocked = !unlocked[id];
            const isSelected = carId === id;
            const swatch = hexCss(car.color);
            return (
              <div
                key={id}
                className={`car-card${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                onClick={pick(id)}
              >
                <div className="car-swatch" style={{ background: swatch, color: swatch }} />
                <div className="car-name">{car.name}</div>
                <div className="car-desc">{car.desc}</div>
                {isLocked ? (
                  <>
                    <div className="car-unlock">UNLOCK AT {car.unlockScore.toLocaleString()} PTS</div>
                    <div className="car-unlock" style={{ opacity: 0.7 }}>BEST: {best.toLocaleString()}</div>
                  </>
                ) : (
                  <>
                    <StatBar name="SPEED" value={car.topSpeed / 220} />
                    <StatBar name="ACCEL" value={car.accel / 28} />
                    <StatBar name="HANDLING" value={car.handling / 1.25} />
                    <StatBar name="ARMOR" value={(1.7 - car.durability) / 1.15} />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn" onClick={click(() => setPhase('menu'))}>BACK</button>
        </div>
      </div>
    </div>
  );
}
