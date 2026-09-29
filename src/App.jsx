import React, { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { useGame } from './store/gameStore';
import { updateTimeScale } from './game/shared';
import { audio } from './audio/audioEngine';
import { PlayerCar } from './game/PlayerCar';
import { CameraRig } from './game/CameraRig';
import { CityVisual, CityColliders } from './game/City';
import { Enemies } from './enemies/Enemies';
import { Effects } from './game/Effects';
import { Powerups } from './game/Powerups';
import { Props } from './game/Props';
import { MainMenu, MenuScene } from './ui/MainMenu';
import { HUD } from './ui/HUD';
import { PauseMenu } from './ui/PauseMenu';
import { GameOver } from './ui/GameOver';
import { Garage } from './ui/Garage';
import { Settings } from './ui/Settings';
import { HowToPlay } from './ui/HowToPlay';

/** Per-frame housekeeping: slow-mo clock + zustand run tick. */
function GameTicker() {
  useFrame((_, delta) => {
    updateTimeScale();
    const dt = Math.min(delta, 0.1);
    const s = useGame.getState();
    if (s.phase === 'playing') s.tick(dt);
  });
  return null;
}

function PostFX() {
  const graphics = useGame((s) => s.settings.graphics);
  const motion = useGame((s) => s.settings.motionEffects);
  if (graphics === 'low') return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={graphics === 'high' ? 1.15 : 0.85}
        luminanceThreshold={0.22}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.72}
      />
      {motion && <Vignette darkness={0.62} offset={0.25} />}
    </EffectComposer>
  );
}

function GameScene() {
  const graphics = useGame((s) => s.settings.graphics);
  const phase = useGame((s) => s.phase);
  const dpr = graphics === 'low' ? 1 : graphics === 'medium' ? [1, 1.5] : [1, 2];
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 62, near: 0.4, far: 700, position: [-35, 4, -190] }}
      shadows={false}
    >
      <color attach="background" args={['#05010d']} />
      <fog attach="fog" args={['#0a0618', 35, 340]} />
      <ambientLight intensity={0.5} color="#8a7bd8" />
      <directionalLight position={[60, 90, 30]} intensity={0.55} color="#9db8ff" />
      <hemisphereLight args={['#3a2a6e', '#0a0518', 0.5]} />
      <Physics timeStep={1 / 60} gravity={[0, -24, 0]} paused={phase === 'paused'}>
        <CityColliders />
        <PlayerCar />
        <Enemies />
        <Powerups />
        <Props />
      </Physics>
      <CityVisual />
      <Effects />
      <CameraRig />
      <PostFX />
      <GameTicker />
    </Canvas>
  );
}

function MenuBackground() {
  const graphics = useGame((s) => s.settings.graphics);
  return (
    <Canvas
      dpr={graphics === 'low' ? 1 : [1, 1.5]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 55, near: 0.4, far: 700, position: [10, 4, 10] }}
      shadows={false}
    >
      <color attach="background" args={['#05010d']} />
      <fog attach="fog" args={['#0a0618', 35, 340]} />
      <ambientLight intensity={0.5} color="#8a7bd8" />
      <directionalLight position={[60, 90, 30]} intensity={0.55} color="#9db8ff" />
      <hemisphereLight args={['#3a2a6e', '#0a0518', 0.5]} />
      <MenuScene />
      <PostFX />
    </Canvas>
  );
}

export default function App() {
  const phase = useGame((s) => s.phase);

  // Unlock audio on first user gesture (browser autoplay policy).
  useEffect(() => {
    const unlock = () => {
      audio.unlock();
      const s = useGame.getState().settings;
      audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
      audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Apply volume settings live.
  const settings = useGame((s) => s.settings);
  useEffect(() => {
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);

  // Global ESC handling for pause.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Escape') return;
      const s = useGame.getState();
      if (s.phase === 'playing') { s.pauseGame(); audio.uiClick(); }
      else if (s.phase === 'paused') { s.resumeGame(); audio.uiClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inGame = phase === 'playing' || phase === 'paused' || phase === 'gameover';

  return (
    <>
      {inGame ? <GameScene /> : <MenuBackground />}
      {(phase === 'playing' || phase === 'paused') && <HUD />}
      {phase === 'menu' && <MainMenu />}
      {phase === 'garage' && <Garage />}
      {phase === 'howto' && <HowToPlay />}
      {phase === 'settings' && <Settings />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'gameover' && (
        <>
          <HUD />
          <GameOver />
        </>
      )}
    </>
  );
}
