import { useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';
import { RankingTable } from './Ranking.jsx';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

function SaveRecord({ score }) {
  const playerName = useGame((s) => s.playerName);
  const saveRankingEntry = useGame((s) => s.saveRankingEntry);
  const [name, setName] = useState(playerName || '');
  const [rank, setRank] = useState(-1);

  if (rank >= 0) {
    return (
      <div className="rk-saved">
        <div className="rk-saved-title">
          {rank === 0 ? '🏆 NEW RECORD!' : `SAVED — RANK #${rank + 1}`}
        </div>
        <RankingTable highlight={rank} />
      </div>
    );
  }

  const onSave = () => {
    audio.unlock();
    audio.uiClick();
    const r = saveRankingEntry(name);
    setRank(r);
  };

  return (
    <div className="rk-save">
      <div className="rk-save-title">★ TOP 10 SCORE — SAVE YOUR RECORD ★</div>
      <div className="rk-save-row">
        <input
          className="name-input"
          value={name}
          maxLength={12}
          placeholder="YOUR NAME"
          onChange={(e) => setName(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
        />
        <button className="btn btn-primary" style={{ margin: 0 }} onClick={onSave}>SAVE</button>
      </div>
    </div>
  );
}

export function GameOver() {
  const stats = useGame((s) => s.stats);
  const best = useGame((s) => s.best);
  const carId = useGame((s) => s.carId);
  const startRun = useGame((s) => s.startRun);
  const setPhase = useGame((s) => s.setPhase);
  const qualifiesForRanking = useGame((s) => s.qualifiesForRanking);

  const s = stats || { score: 0, time: 0, kills: 0, longestDrift: 0, topSpeed: 0, newUnlocks: [], isBest: false };
  const qualifies = qualifiesForRanking(s.score);

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

      {qualifies && <SaveRecord score={s.score} />}

      <button className="btn btn-primary" onClick={click(() => { audio.startMusic(); startRun(carId); })}>RETRY</button>
      <button className="btn" onClick={click(() => setPhase('menu'))}>MAIN MENU</button>
    </div>
  );
}
