import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { playerRef, enemiesRef, powerupsRef } from '../game/shared.js';
import { ROADS, WORLD_HALF } from '../game/cityData.js';
import { POWERUP_DEFS } from '../game/constants.js';

const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');

/** Small self-contained FPS counter (own rAF loop, cheap re-renders). */
function Fps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now) => {
      frames++;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="fps">{fps} FPS</div>;
}

/** Red vignette flash whenever hull health drops. */
function DmgFlash() {
  const health = useGame((s) => s.health);
  const [on, setOn] = useState(false);
  const prev = useRef(health);
  useEffect(() => {
    if (health < prev.current) {
      setOn(true);
      const id = setTimeout(() => setOn(false), 180);
      prev.current = health;
      return () => clearTimeout(id);
    }
    prev.current = health;
    return undefined;
  }, [health]);
  return <div className={`dmg-flash${on ? ' on' : ''}`} />;
}

const MM = 170; // minimap canvas size

/** Canvas minimap: roads, player triangle, enemies, power-ups. ~12fps redraw. */
function Minimap() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const span = WORLD_HALF * 2 + 20;
    const k = MM / span;
    const px = (x) => (x + WORLD_HALF + 10) * k;
    const pz = (z) => (z + WORLD_HALF + 10) * k;
    let last = 0;
    let raf = 0;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 80) return;
      last = now;

      // dark circular background
      ctx.clearRect(0, 0, MM, MM);
      ctx.fillStyle = '#060313';
      ctx.beginPath();
      ctx.arc(MM / 2, MM / 2, MM / 2, 0, Math.PI * 2);
      ctx.fill();

      // roads
      ctx.fillStyle = '#2a3550';
      for (const r of ROADS) {
        ctx.fillRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), r.w * k, r.d * k);
      }

      // power-ups (colored by kind)
      for (const p of powerupsRef.list) {
        const def = POWERUP_DEFS[p.kind];
        ctx.fillStyle = def ? hexCss(def.color) : '#ffffff';
        ctx.beginPath();
        ctx.arc(px(p.position.x), pz(p.position.z), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // enemies (red dots)
      ctx.fillStyle = '#ff2244';
      for (const e of enemiesRef.list) {
        if (!e.alive) continue;
        ctx.beginPath();
        ctx.arc(px(e.position.x), pz(e.position.z), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // player triangle (cyan, rotated by heading)
      const x = px(playerRef.position.x);
      const y = pz(playerRef.position.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-playerRef.heading);
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(-4, -4.5);
      ctx.lineTo(4, -4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="minimap" width={MM} height={MM} />;
}

export function HUD() {
  const score = useGame((s) => s.score);
  const combo = useGame((s) => s.combo);
  const survivalTime = useGame((s) => s.survivalTime);
  const speedKmh = useGame((s) => s.speedKmh);
  const health = useGame((s) => s.health);
  const powerups = useGame((s) => s.powerups);
  const notifications = useGame((s) => s.notifications);
  const banner = useGame((s) => s.banner);
  const settings = useGame((s) => s.settings);

  const hpColor = health > 50 ? '#33ff77' : health > 25 ? '#ffd633' : '#ff4444';

  return (
    <div className="hud">
      {/* top-left: score + combo */}
      <div className="hud-tl">
        <div className="hud-label">SCORE</div>
        <div className="hud-score">{Math.round(score).toLocaleString()}</div>
        <div className="hud-combo">{combo > 1.05 ? `COMBO x${combo.toFixed(2)}` : ''}</div>
      </div>

      {/* top-right: time + fps */}
      <div className="hud-tr">
        <div className="hud-label">TIME</div>
        <div className="hud-time">{fmtTime(survivalTime)}</div>
      </div>
      {settings.showFps && <Fps />}

      {/* bottom-left: hull + power-up icons */}
      <div className="hud-bl">
        <div className="hud-label">HULL</div>
        <div className="healthbar">
          <div
            className="healthbar-fill"
            style={{ width: `${Math.max(0, Math.min(100, health))}%`, background: hpColor, color: hpColor }}
          />
        </div>
        <div className="health-num">{Math.round(health)}%</div>
        <div className="powerups">
          <div className={`powerup-icon p-nitro${powerups.nitro ? ' active' : ''}`}>N</div>
          <div className={`powerup-icon p-shield${powerups.shield ? ' active' : ''}`}>S</div>
          <div className={`powerup-icon p-score${powerups.scoreBoost ? ' active' : ''}`}>x2</div>
        </div>
      </div>

      {/* bottom-right: speedometer */}
      <div className="hud-br">
        <div className={`speedo-num${powerups.nitro ? ' nitro' : ''}`}>{Math.round(speedKmh)}</div>
        <div className="speedo-unit">KM/H</div>
      </div>

      <Minimap />

      {/* notifications */}
      <div className="notifs">
        {notifications.map((n) => (
          <div key={n.id} className={`notif k-${n.kind || ''}`}>
            <div className="notif-text">{n.text}</div>
            {n.sub && <div className="notif-sub">{n.sub}</div>}
          </div>
        ))}
      </div>

      {/* event banner */}
      {banner && (
        <div className="banner">
          <div className="banner-text">{banner.text}</div>
          {banner.sub && <div className="banner-sub">{banner.sub}</div>}
        </div>
      )}

      {/* full-screen fx */}
      <div className={`speedlines${speedKmh > 135 && settings.motionEffects ? ' on' : ''}`} />
      <DmgFlash />
    </div>
  );
}
