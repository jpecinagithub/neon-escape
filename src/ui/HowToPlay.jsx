import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

const CONTROLS = [
  ['W / ↑', 'Accelerate'],
  ['S / ↓', 'Brake / reverse'],
  ['A D / ← →', 'Steer'],
  ['SPACE', 'Handbrake — drift!'],
  ['R', 'Reset car'],
  ['C', 'Camera view'],
  ['ESC', 'Pause'],
];

const PAD = [
  ['X / RT', 'Accelerate'],
  ['Square / LT', 'Brake · reverse'],
  ['Left stick', 'Steer'],
  ['Circle', 'Handbrake — drift!'],
  ['Triangle', 'Reset car'],
  ['R1', 'Camera view'],
  ['Options', 'Pause'],
];

export function HowToPlay() {
  const setPhase = useGame((s) => s.setPhase);

  return (
    <div className="screen screen-dim">
      <div className="panel howto">
        <h2>HOW TO PLAY</h2>
        <div className="howto-grid">
          {CONTROLS.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'contents' }}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <h3>CONTROLLER</h3>
        <div className="howto-grid">
          {PAD.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'contents' }}>
              <kbd>{keys}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <p style={{ opacity: 0.75 }}>
          Plug in a PlayStation controller any time — analog triggers, steering and
          rumble on impacts work alongside the keyboard.
        </p>
        <h3>SURVIVE</h3>
        <p>Evade the pursuers hunting you through the neon city.</p>
        <p>Drift and near-miss traffic to build your combo multiplier.</p>
        <p>Wreck enemies head-on or with the EMP for +1000 points.</p>
        <p>Grab power-ups: N (nitro), shield, EMP, repair, and 2x score.</p>
        <p>Watch your hull — when it hits zero, the city claims another.</p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn" onClick={click(() => setPhase('menu'))}>BACK</button>
        </div>
      </div>
    </div>
  );
}
