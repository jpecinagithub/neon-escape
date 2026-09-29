import { useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';
import { CARS } from '../game/constants.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const MEDALS = ['🥇', '🥈', '🥉'];

const fmtTime = (t) => {
  const m = Math.floor((t || 0) / 60);
  const s = Math.floor((t || 0) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  } catch { return ''; }
};

export function RankingTable({ highlight = -1 }) {
  const rankings = useGame((s) => s.rankings);

  if (rankings.length === 0) {
    return <div className="rk-empty">NO RECORDS YET — BE THE FIRST LEGEND OF NEON CITY</div>;
  }

  return (
    <div className="rk-table">
      {rankings.map((e, i) => {
        const car = CARS[e.carId];
        return (
          <div key={`${e.date}-${i}`} className={`rk-row${i === highlight ? ' hl' : ''}`}>
            <span className="rk-pos">{MEDALS[i] || `#${i + 1}`}</span>
            <span className="rk-name">
              {e.name}
              <span className="rk-sub">{car ? car.name : ''}{e.date ? ` · ${fmtDate(e.date)}` : ''}</span>
            </span>
            <span className="rk-score">
              {Math.round(e.score).toLocaleString()}
              <span className="rk-sub">{fmtTime(e.time)}{typeof e.kills === 'number' ? ` · ${e.kills} kills` : ''}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Ranking() {
  const setPhase = useGame((s) => s.setPhase);
  const clearRankings = useGame((s) => s.clearRankings);
  const count = useGame((s) => s.rankings.length);
  const rankMax = useGame((s) => s.rankMax);
  const [confirmClear, setConfirmClear] = useState(false);

  const onClear = click(() => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    } else {
      clearRankings();
      setConfirmClear(false);
    }
  });

  return (
    <div className="screen screen-dim">
      <h1 className="menu-title" style={{ fontSize: 34 }}>NEON <span className="pink">RANKING</span></h1>
      <div className="menu-subtitle">TOP {rankMax} DRIVERS — THIS MACHINE ONLY</div>
      <RankingTable />
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn" onClick={click(() => setPhase('menu'))}>BACK</button>
        {count > 0 && (
          <button className={`btn${confirmClear ? ' btn-danger' : ''}`} onClick={onClear}>
            {confirmClear ? 'TAP AGAIN TO ERASE' : 'CLEAR'}
          </button>
        )}
      </div>
    </div>
  );
}
