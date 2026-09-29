import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../store/gameStore.js';
import { audio } from '../audio/audioEngine.js';
import { CityVisual } from '../game/City.jsx';
import { CarModel } from '../vehicles/CarModel.jsx';

const click = (fn) => () => { audio.unlock(); audio.uiClick(); fn(); };

export function MainMenu() {
  const best = useGame((s) => s.best);
  const carId = useGame((s) => s.carId);
  const setPhase = useGame((s) => s.setPhase);
  const startRun = useGame((s) => s.startRun);

  const play = click(() => { audio.startMusic(); startRun(carId); });

  return (
    <div className="screen screen-dim">
      <div className="corner-tag">NEON ESCAPE</div>
      <h1 className="menu-title">NEON <span className="pink">ESCAPE</span></h1>
      <div className="menu-subtitle">SURVIVE THE NIGHT</div>
      <button className="btn btn-primary" onClick={play}>PLAY</button>
      <button className="btn" onClick={click(() => setPhase('garage'))}>GARAGE</button>
      <button className="btn" onClick={click(() => setPhase('howto'))}>HOW TO PLAY</button>
      <button className="btn" onClick={click(() => setPhase('settings', 'menu'))}>SETTINGS</button>
      {best > 0 && <div className="best-tag">BEST: {best.toLocaleString()}</div>}
      <div className="pad-hint" style={{ marginTop: 10, fontSize: 13, opacity: 0.65 }}>
        🎮 Controller supported — press any button on the pad to connect it
      </div>
      <div className="version-tag">v1.0</div>
    </div>
  );
}

/**
 * 3D background for the main menu, rendered inside App's <Canvas>.
 * Slow orbiting camera around the selected car parked on the plaza.
 */
export function MenuScene() {
  const carId = useGame((s) => s.carId);
  const t = useRef(Math.random() * 100);

  useFrame(({ camera }, delta) => {
    t.current += delta * 0.12;
    const a = t.current;
    camera.position.set(Math.sin(a) * 12, 3.4, Math.cos(a) * 12);
    camera.lookAt(0, 1.2, 0);
  });

  return (
    <>
      <CityVisual />
      <group position={[0, 0, 0]}>
        <CarModel variant={carId} headlights />
      </group>
      {/* ground glow disc under the parked car */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <circleGeometry args={[5.5, 48]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
