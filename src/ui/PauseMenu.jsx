import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

export function PauseMenu() {
  const carId = useGame((s) => s.carId);
  const resumeGame = useGame((s) => s.resumeGame);
  const startRun = useGame((s) => s.startRun);
  const setPhase = useGame((s) => s.setPhase);

  return (
    <div className="screen screen-dim">
      <h1 className="pause-title">PAUSED</h1>
      <button className="btn btn-primary" onClick={click(() => resumeGame())}>RESUME</button>
      <button className="btn" onClick={click(() => { audio.startMusic(); startRun(carId); })}>RESTART</button>
      <button className="btn" onClick={click(() => setPhase('settings', 'paused'))}>SETTINGS</button>
      <button className="btn" onClick={click(() => setPhase('menu'))}>MAIN MENU</button>
    </div>
  );
}
