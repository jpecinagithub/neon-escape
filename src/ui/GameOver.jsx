import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function GameOver() {
  const stats = useGame((s) => s.stats);
  const best = useGame((s) => s.best);
  const carId = useGame((s) => s.carId);
  const startRun = useGame((s) => s.startRun);
  const setPhase = useGame((s) => s.setPhase);

  const s = stats || { score: 0, time: 0, kills: 0, longestDrift: 0, topSpeed: 0, newUnlocks: [], isBest: false };

  return (
    <div className="screen screen-dim">
      <h1 className="go-title">RUN OVER</h1>
      <div className="go-subtitle">THE CITY CLAIMS ANOTHER</div>

      <div className="go-stats">
        <div className="go-stat"><span className="k">TIME</span><span className="v">{fmtTime(s.time)}</span></div>
        <div className="go-stat"><span className="k">SCORE</span><span className="v">{Math.round(s.score).toLocaleString()}</span></div>
        <div className="go-stat">
          <span className="k">BEST</span>
          <span className={`v${s.isBest ? ' newbest' : ''}`}>{best.toLocaleString()}{s.isBest ? ' ★' : ''}</span>
        </div>
        <div className="go-stat"><span className="k">ENEMIES DESTROYED</span><span className="v">{s.kills}</span></div>
        <div className="go-stat"><span className="k">LONGEST DRIFT</span><span className="v">{s.longestDrift.toFixed(1)}s</span></div>
        <div className="go-stat"><span className="k">TOP SPEED</span><span className="v">{Math.round(s.topSpeed)} km/h</span></div>
      </div>

      {s.newUnlocks.map((name) => (
        <div key={name} className="unlock-line">UNLOCKED: {name}</div>
      ))}

      <button className="btn btn-primary" onClick={click(() => { audio.startMusic(); startRun(carId); })}>RETRY</button>
      <button className="btn" onClick={click(() => setPhase('menu'))}>MAIN MENU</button>
    </div>
  );
}
