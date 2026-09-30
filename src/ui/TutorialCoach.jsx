import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/gameStore.js';
import { playerRef } from '../game/shared.js';
import { audio } from '../audio/audioEngine.js';

const NEAR_MISS_RE = /NEAR MISS|VERY CLOSE|INSANE/;

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
    title: 'DERRAPA',
    text: 'Mantén ESPACIO / ○ (círculo) mientras giras para derrapar. Derrapar carga tu combo de puntos.',
    hint: (c) => `${c.drift.toFixed(1)} / 0.8 s derrapando`,
    done: (c) => c.drift >= 0.8,
    timeout: 35,
  },
  {
    title: 'POTENCIADORES',
    text: 'Recoge un potenciador: síguelos en el minimapa (iconos de colores). El nitro da turbo y el EMP fríe a los que te persiguen.',
    hint: () => 'busca un icono de color en el minimapa',
    done: (c) => c.pickups > 0,
    timeout: 45,
  },
  {
    title: 'TE PERSIGUEN',
    text: 'Los coches rojos te dan caza. Un quiebro brusco a último momento esquiva sus embestidas… y si te alejas 95 m de todos, rompes la persecución.',
    hint: () => 'esquívalos de cerca o aléjate mucho',
    done: (c) => c.evaded || c.nearMiss,
    timeout: 45,
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
    speed: 0, turned: 0, drift: 0,
    pickups: 0, evaded: false, nearMiss: false,
    elapsed: 0, lastT: 0, lastHeading: 0,
    stepStartPickups: 0, stepStartEvade: 0,
    advancing: false,
  });

  // reset per-step tracking whenever the step changes
  useEffect(() => {
    const c = ctx.current;
    const s = useGame.getState();
    c.turned = 0;
    c.drift = 0;
    c.pickups = 0;
    c.evaded = false;
    c.nearMiss = false;
    c.elapsed = 0;
    c.lastT = performance.now();
    c.lastHeading = playerRef.heading;
    c.stepStartPickups = s.pickups;
    c.stepStartEvade = s.tutEvadedAt;
    c.advancing = false;
    setFlash(false);
  }, [tutStep]);

  // watch score notifications for near-miss events
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const n = s.notifications;
        if (n.length === prev.notifications.length) return;
        const last = n[n.length - 1];
        if (last && NEAR_MISS_RE.test(last.text)) ctx.current.nearMiss = true;
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
        if (playerRef.drifting) c.drift += dt;
        c.pickups = s.pickups - c.stepStartPickups;
        c.evaded = s.tutEvadedAt > c.stepStartEvade;

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
          Sobrevive, suma puntos con derrapes y quiebros, y rompe la
          persecución para respirar. Si te rodean, el EMP es tu amigo.
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
