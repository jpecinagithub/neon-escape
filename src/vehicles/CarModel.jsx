import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CARS, ENEMY_DEFS } from '../game/constants';

/**
 * Procedural stylized sports car. Built facing +Z (front light bar at +Z).
 * Colors come from CARS (player) or ENEMY_DEFS (enemies).
 * Wheels spin from speedSource.current (rad/s). Nitro exhaust flames flicker
 * when `nitro` is true. Optional headlight SpotLight for the player car.
 */
export function CarModel({ variant, nitro = false, speedSource = null, headlights = false }) {
  const def = CARS[variant] || ENEMY_DEFS[variant] || CARS.vortex;
  const boxy = variant === 'titan' || variant === 'rammer';

  const wheels = useRef([]);
  const flames = useRef(null);
  const lightTarget = useMemo(() => new THREE.Object3D(), []);

  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.6, roughness: 0.35 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0b1016, metalness: 0.9, roughness: 0.12 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.95 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.4, roughness: 0.6 }),
      accent: new THREE.MeshBasicMaterial({ color: def.accent }),
      white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      red: new THREE.MeshBasicMaterial({ color: 0xff2244 }),
      glow: new THREE.MeshBasicMaterial({
        color: def.accent, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      flame: new THREE.MeshBasicMaterial({
        color: 0xff7722, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    }),
    [def]
  );

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useFrame((_, delta) => {
    const spin = speedSource ? speedSource.current : 0;
    if (spin !== 0) {
      const d = Math.min(delta, 0.05);
      const arr = wheels.current;
      for (let i = 0; i < arr.length; i++) {
        const w = arr[i];
        if (w) w.rotation.x += spin * d;
      }
    }
    const f = flames.current;
    if (f) {
      f.visible = nitro;
      if (nitro) {
        const s = 0.75 + Math.random() * 0.55;
        f.scale.set(s, s, 0.65 + Math.random() * 0.9);
      }
    }
  });

  // ---- dimensions ----
  const wheelR = boxy ? 0.44 : 0.36;
  const wheelW = boxy ? 0.36 : 0.32;
  const wx = boxy ? 1.06 : 1.02;
  const wz = boxy ? 1.42 : 1.35;
  const wheelPos = [
    [wx, wheelR, wz],
    [-wx, wheelR, wz],
    [wx, wheelR, -wz],
    [-wx, wheelR, -wz],
  ];

  return (
    <group>
      {/* main body */}
      {boxy ? (
        <mesh position={[0, 0.88, 0]} material={mats.body}>
          <boxGeometry args={[2.1, 0.95, 4.3]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, 0.62, 0]} material={mats.body}>
            <boxGeometry args={[2.0, 0.5, 4.2]} />
          </mesh>
          <mesh position={[0, 0.5, 2.3]} rotation={[0.1, 0, 0]} material={mats.body}>
            <boxGeometry args={[1.85, 0.3, 1.0]} />
          </mesh>
          {/* rear spoiler */}
          <mesh position={[0, 1.12, -2.0]} material={mats.dark}>
            <boxGeometry args={[1.9, 0.07, 0.45]} />
          </mesh>
          {[0.7, -0.7].map((x) => (
            <mesh key={x} position={[x, 0.95, -2.0]} material={mats.dark}>
              <boxGeometry args={[0.08, 0.35, 0.08]} />
            </mesh>
          ))}
        </>
      )}

      {/* cabin canopy (dark glass) */}
      {boxy ? (
        <mesh position={[0, 1.62, -0.2]} material={mats.glass}>
          <boxGeometry args={[1.85, 0.62, 2.5]} />
        </mesh>
      ) : (
        <mesh position={[0, 1.02, -0.35]} material={mats.glass}>
          <boxGeometry args={[1.5, 0.48, 2.0]} />
        </mesh>
      )}

      {/* accent trim: front splitter + side skirts */}
      <mesh position={[0, 0.4, 2.05]} material={mats.accent}>
        <boxGeometry args={[2.02, 0.07, 0.3]} />
      </mesh>
      {[1.0, -1.0].map((x) => (
        <mesh key={x} position={[x, 0.4, 0]} material={mats.accent}>
          <boxGeometry args={[0.07, 0.09, 3.4]} />
        </mesh>
      ))}

      {/* light bars */}
      <mesh position={[0, boxy ? 0.95 : 0.66, boxy ? 2.16 : 2.12]} material={mats.white}>
        <boxGeometry args={[boxy ? 1.8 : 1.7, 0.13, 0.08]} />
      </mesh>
      <mesh position={[0, boxy ? 1.0 : 0.72, boxy ? -2.16 : -2.12]} material={mats.red}>
        <boxGeometry args={[boxy ? 1.85 : 1.75, 0.15, 0.08]} />
      </mesh>
      {boxy && (
        <mesh position={[0, 1.95, 1.05]} material={mats.white}>
          <boxGeometry args={[1.7, 0.1, 0.12]} />
        </mesh>
      )}

      {/* neon underglow */}
      <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glow}>
        <planeGeometry args={[2.5, 4.7]} />
      </mesh>

      {/* exhausts + nitro flames */}
      {[0.45, -0.45].map((x) => (
        <mesh
          key={x}
          position={[x, 0.42, -2.12]}
          rotation={[Math.PI / 2, 0, 0]}
          material={mats.dark}
        >
          <cylinderGeometry args={[0.11, 0.11, 0.22, 10]} />
        </mesh>
      ))}
      <group ref={flames} visible={false}>
        {[0.45, -0.45].map((x) => (
          <mesh
            key={x}
            position={[x, 0.42, -2.45]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={mats.flame}
          >
            <coneGeometry args={[0.16, 1.0, 10]} />
          </mesh>
        ))}
      </group>

      {/* wheels */}
      {wheelPos.map((p, i) => (
        <group
          key={i}
          position={p}
          ref={(g) => {
            wheels.current[i] = g;
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.tire}>
            <cylinderGeometry args={[wheelR, wheelR, wheelW, 18]} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} material={mats.accent}>
            <cylinderGeometry args={[wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 12]} />
          </mesh>
        </group>
      ))}

      {/* headlights */}
      {headlights && (
        <>
          <primitive object={lightTarget} position={[0, 0, 14]} />
          <spotLight
            position={[0, 0.9, 1.9]}
            target={lightTarget}
            angle={0.5}
            penumbra={0.6}
            distance={60}
            intensity={60}
            color={0xcfe4ff}
          />
        </>
      )}
    </group>
  );
}
