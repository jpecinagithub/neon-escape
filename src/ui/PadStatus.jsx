import { useEffect, useRef, useState } from 'react';
import { getRawPad } from '../game/gamepad';

/**
 * PadStatus — live gamepad readout mounted at app root (works in menus too).
 * Compact line shows live stick / RT / LT values; click to expand full
 * diagnostics (mapping, all axes, all buttons, last-pressed button index).
 * This tells us exactly what the browser reports for the user's controller.
 */
export function PadStatus() {
  const [snap, setSnap] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const lastBtn = useRef({ index: -1 });
  const prev = useRef([]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 100) return; // ~10fps is plenty
      last = now;
      const p = getRawPad();
      if (!p) {
        setSnap(null);
        prev.current = [];
        return;
      }
      const pressed = p.buttons.map((b) => b.pressed);
      pressed.forEach((pr, i) => {
        if (pr && !prev.current[i]) lastBtn.current = { index: i };
      });
      prev.current = pressed;
      setSnap({
        id: p.id,
        mapping: p.mapping,
        axes: Array.from(p.axes, (v) => v),
        buttons: p.buttons.map((b) => b.value),
        lastBtnIndex: lastBtn.current.index,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!snap) return null;

  const f2 = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);
  const steer = snap.axes.length > 0 ? snap.axes[0] : 0;
  const rt = snap.buttons.length > 7 ? snap.buttons[7] : 0;
  const lt = snap.buttons.length > 6 ? snap.buttons[6] : 0;

  return (
    <div className="padstatus" onClick={() => setExpanded((e) => !e)} title="Click para diagnóstico">
      <div className="padstatus-row">
        <span>🎮</span>
        <span>stick {f2(steer)}</span>
        <span>·</span>
        <span>RT {rt.toFixed(2)}</span>
        <span>·</span>
        <span>LT {lt.toFixed(2)}</span>
        <span className="padstatus-caret">{expanded ? '▴' : '▾'}</span>
      </div>
      {expanded && (
        <div className="padstatus-detail">
          <div>
            mapping: <b>{snap.mapping || '(none — no estándar)'}</b>
          </div>
          <div className="padstatus-id">{snap.id}</div>
          <div>axes [{snap.axes.map((v) => f2(v)).join(', ')}]</div>
          <div className="padstatus-btns">
            {snap.buttons.map((v, i) => (
              <span key={i} className={v > 0 ? 'padbtn-on' : ''}>
                {i}:{v < 1 && v > 0 ? v.toFixed(2) : v.toFixed(0)}
              </span>
            ))}
          </div>
          <div>
            último botón pulsado:{' '}
            <b>{snap.lastBtnIndex >= 0 ? `#${snap.lastBtnIndex}` : '—'}</b>
            <span style={{ opacity: 0.6 }}> (pulsa botones del mando para identificarlos)</span>
          </div>
        </div>
      )}
    </div>
  );
}
