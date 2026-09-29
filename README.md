# NEON ESCAPE — Survive the Night

A 3D arcade driving / pursuit game. Drive a neon sports car through a stylized
night city while increasingly aggressive enemy vehicles hunt you down.
Survive, evade, drift, wreck your pursuers, grab power-ups, chase the high score.

## Run it

```bash
cd ~/workspace/neon-escape
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).

## Build

```bash
npm run build
```

No backend, no auth, no API keys. Settings, high scores and garage unlocks
persist in `localStorage`.

## Controls

| Key | Action |
|-----|--------|
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer |
| SPACE | Handbrake / drift |
| R | Reset car if stuck |
| C | Cycle camera (chase / close / high arcade) |
| ESC | Pause |

## Tech

Vite + React 18 + Three.js via @react-three/fiber, @react-three/drei,
@react-three/rapier (physics), @react-three/postprocessing (bloom),
zustand (game state). All audio is synthesized with the Web Audio API —
no external assets.
