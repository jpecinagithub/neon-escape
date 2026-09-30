import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { playerRef } from '../game/shared.js';
import { audio } from '../audio/audioEngine.js';

const GOOD_NEAR_RE = /¡POR POCO!|¡UY!|ROZANDO/;

const STEPS = [
  {
    title: 'ACELERA',
    text: 'Mantén W / ↑ o el botón X / RT del mando para acelerar.',
    hint: (c) => `${Math.round(c.speed)} / 80 km/h`,
    done: (c) => c.speed >= 80,
    timeout: 25,
  },
  {
    title: 'GIRA',
    text: 'Gira con A / D, ← / → o el stick izquierdo del mando.',
    hint: () => 'gira el coche',
    done: (c) => c.turned >= 0.9,
    timeout: 25,
  },
  {
    title: 'ATROPELLA ROJOS',
    text: 'Los de ROJO son malos (ladrones, punkis): ¡atropéllalos! Cada uno da puntos y no te hacen daño.',
    hint: (c) => `${c.runOver} / 1 atropello`,
    done: (c) => c.runOver >= 1,
    timeout: 50,
  },
  {
    title: 'RESPETA AZULES',
    text: 'Los de AZUL son buenos (niños, abuelas…): no los toques o pierdes casco. Esquivarlos de cerca da puntos.',
    hint: () => 'roza a un azul sin tocarlo',
    done: (c) => c.goodNearMiss,
    timeout: 45,
  },
  {
    title: 'PATINADORES',
    text: 'Los patinadores son rapidísimos: si van de rojo, ¡a por ellos! (valen más); si van de azul, ni los roces.',
    hint: () => 'mira el color de su ropa',
    done: () => false,
    timeout: 25,
  },
];

/**
 * First-run coach: step-by-step prompts driven by real gameplay.
 * Lives inside the HUD; advances on player actions, never soft-locks
 * (every step has a generous timeout).
 */
export function TutorialCoach() {
  const tutStep = useGame((s) => s.tutStep);
  const phase = useGame((s) => s.phase);
  const [flash, setFlash] = useState(false);
  const [, setTick] = useState(0);

  const ctx = useRef({
    speed: 0, turned: 0,
    runOver: 0, goodNearMiss: false,
    elapsed: 0, lastT: 0, lastHeading: 0,
    stepStartRunOver: 0,
    advancing: false,
  });

  // reset per-step tracking whenever the step changes
  useEffect(() => {
    const c = ctx.current;
    const s = useGame.getState();
    c.turned = 0;
    c.runOver = 0;
    c.goodNearMiss = false;
    c.elapsed = 0;
    c.lastT = performance.now();
    c.lastHeading = playerRef.heading;
    c.stepStartRunOver = s.runOver;
    c.advancing = false;
    setFlash(false);
  }, [tutStep]);

  // watch score notifications for good-ped near-miss events
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const n = s.notifications;
        if (n.length === prev.notifications.length) return;
        const last = n[n.length - 1];
        if (last && GOOD_NEAR_RE.test(last.text)) ctx.current.goodNearMiss = true;
      }),
    []
  );

  // per-frame condition checks (no re-render; hints refresh on a timer)
  useEffect(() => {
    let raf = 0;
    let hintT = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      const s = useGame.getState();
      const step = s.tutStep;
      if (step < 0 || step >= STEPS.length) return;
      const c = ctx.current;
      if (s.phase === 'playing' && !c.advancing) {
        const dt = Math.min((t - c.lastT) / 1000, 0.1);
        c.lastT = t;
        c.elapsed += dt;
        c.speed = playerRef.speedKmh;
        // accumulate heading change for the steering step
        let dh = playerRef.heading - c.lastHeading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        c.turned += Math.abs(dh);
        c.lastHeading = playerRef.heading;
        c.runOver = s.runOver - c.stepStartRunOver;

        const def = STEPS[step];
        if (def.done(c) || c.elapsed >= def.timeout) {
          c.advancing = true;
          setFlash(true);
          audio.pickup();
          setTimeout(() => {
            useGame.getState().advanceTut();
          }, 1100);
        }
      } else {
        c.lastT = t;
      }
      if (t - hintT > 300) {
        hintT = t;
        setTick((v) => v + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (tutStep < 0 || phase === 'gameover') return null;

  const end = () => {
    audio.uiClick();
    useGame.getState().endTutorial();
  };

  // completion card
  if (tutStep >= STEPS.length) {
    return (
      <div className="tut-coach">
        <div className="tut-kicker">TUTORIAL COMPLETO</div>
        <div className="tut-title">¡LISTO!</div>
        <div className="tut-text">
          Atropella a los rojos, respeta a los azules y derrapa para subir el
          combo. El EMP congela a todos los peatones: úsalo para apuntar mejor.
        </div>
        <button className="btn btn-primary tut-cta" onClick={end}>¡A JUGAR!</button>
      </div>
    );
  }

  const def = STEPS[tutStep];
  const c = ctx.current;
  return (
    <div className="tut-coach">
      <div className="tut-kicker">TUTORIAL {tutStep + 1}/{STEPS.length}</div>
      <div className="tut-title">{flash ? '¡BIEN!' : def.title}</div>
      {!flash && <div className="tut-text">{def.text}</div>}
      {!flash && <div className="tut-hint">{def.hint(c)}</div>}
      <button className="tut-skip" onClick={end}>saltar tutorial</button>
    </div>
  );
}
