import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { PROP_CLUSTERS } from './cityData';
import { playerRef, now } from './shared';
import { useGame } from '../store/gameStore';
import { effectsApi } from './effectsApi';
import { audio } from '../audio/audioEngine';

const RESPAWN_DELAY = 12;
const MIN_HIT_SPEED = 5; // m/s

function ConeMesh() {
  return (
    <mesh castShadow>
      <coneGeometry args={[0.35, 0.9, 12]} />
      <meshStandardMaterial
        color={0xff6a00}
        emissive={0xff6a00}
        emissiveIntensity={0.35}
        roughness={0.5}
      />
    </mesh>
  );
}

function BarrierMesh() {
  return (
    <mesh castShadow>
      <boxGeometry args={[2, 0.8, 0.4]} />
      <meshStandardMaterial
        color={0xff7a00}
        emissive={0xff7a00}
        emissiveIntensity={0.2}
        roughness={0.6}
      />
    </mesh>
  );
}

export function Props() {
  // ---- static prop layout (stable across renders) ----
  const props = useMemo(() => {
    const arr = [];
    let id = 0;
    for (const c of PROP_CLUSTERS) {
      for (let k = 0; k < c.n; k++) {
        const cone = Math.random() < 0.6;
        arr.push({
          id: id++,
          cone,
          x: c.x + (Math.random() * 6 - 3),
          z: c.z + (Math.random() * 6 - 3),
          rot: Math.random() * Math.PI * 2,
          y: cone ? 0.45 : 0.4,
        });
      }
    }
    return arr;
  }, []);

  // ---- per-prop runtime state: { body, home:{x,y,z}, hitAt } ----
  const recs = useRef([]);
  const runSeen = useRef(useGame.getState().runId);

  // ---- fresh run: put every prop back home ----
  useEffect(() => {
    const unsub = useGame.subscribe((s) => {
      if (s.runId === runSeen.current) return;
      runSeen.current = s.runId;
      for (const rec of recs.current) {
        if (!rec || !rec.body) continue;
        rec.body.setTranslation(rec.home, true);
        rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        rec.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        rec.hitAt = 0;
      }
    });
    return unsub;
  }, []);

  const onPropHit = (i, e) => {
    const rec = recs.current[i];
    if (!rec || rec.hitAt) return; // already smashed, waiting to respawn
    const otherBody = e.other && e.other.rigidBody ? e.other.rigidBody() : null;
    if (otherBody !== playerRef.body) return;
    if (playerRef.speedMs <= MIN_HIT_SPEED) return;

    rec.hitAt = now();
    const p = rec.body.translation();
    effectsApi.burst(p.x, p.y + 0.5, p.z, {
      count: 14,
      color: 0xffaa33,
      speed: 7,
      up: 6,
    });
    audio.impact(0.25);
    useGame.getState().addScore(25); // silent combo bump, no label
  };

  // ---- single useFrame: respawn smashed props after delay ----
  useFrame(() => {
    const t = now();
    const list = recs.current;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (!rec || !rec.hitAt || !rec.body) continue;
      if (t - rec.hitAt < RESPAWN_DELAY) continue;
      rec.body.setTranslation(rec.home, true);
      rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      rec.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rec.hitAt = 0;
    }
  });

  return (
    <group>
      {props.map((p, i) => (
        <RigidBody
          key={p.id}
          ref={(body) => {
            const rec =
              recs.current[i] ||
              (recs.current[i] = {
                body: null,
                home: { x: p.x, y: p.y, z: p.z },
                hitAt: 0,
              });
            rec.body = body;
          }}
          colliders={p.cone ? 'ball' : 'cuboid'}
          mass={3}
          restitution={0.5}
          linearDamping={0.5}
          angularDamping={0.5}
          canSleep
          position={[p.x, p.y, p.z]}
          rotation={[0, p.rot, 0]}
          onCollisionEnter={(e) => onPropHit(i, e)}
        >
          {p.cone ? <ConeMesh /> : <BarrierMesh />}
        </RigidBody>
      ))}
    </group>
  );
}
