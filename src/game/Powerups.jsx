import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { POWERUP_SPOTS } from './cityData';
import { POWERUP_DEFS } from './constants';
import { playerRef, powerupsRef, now } from './shared';
import { useGame } from '../store/gameStore';
import { effectsApi } from './effectsApi';
import { pedsApi } from '../peds/pedsApi';
import { audio } from '../audio/audioEngine';

const KINDS = ['repair', 'nitro', 'shield', 'emp', 'score'];
const PICKUP_RADIUS_SQ = 25; // 5m radius
const CHECK_INTERVAL = 0.15;
const RESPAWN_DELAY = 20;

export function Powerups() {
  const [items, setItems] = useState(() =>
    POWERUP_SPOTS.map((s, i) => ({
      id: `pu-${i}`,
      kind: KINDS[i % KINDS.length],
      x: s.x,
      z: s.z,
      active: true,
      respawnAt: 0,
    }))
  );

  const groupRef = useRef(null);
  const checkAcc = useRef(0);
  // mirror for useFrame without stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const runSeen = useRef(useGame.getState().runId);

  // ---- fresh run: reactivate every pickup ----
  useEffect(() => {
    const unsub = useGame.subscribe((s) => {
      if (s.runId === runSeen.current) return;
      runSeen.current = s.runId;
      setItems((prev) => prev.map((it) => ({ ...it, active: true, respawnAt: 0 })));
    });
    return unsub;
  }, []);

  const pickupItem = (item) => {
    const def = POWERUP_DEFS[item.kind];
    const store = useGame.getState();
    if (store.phase !== 'playing') return;

    store.collectPowerup(item.kind);
    if (item.kind === 'emp') {
      pedsApi.freezeNearby(item.x, item.z, 50, 6);
    }
    audio.pickup();
    effectsApi.burst(item.x, 1.5, item.z, {
      count: 30,
      color: def.color,
      speed: 10,
      up: 8,
    });

    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, active: false, respawnAt: now() + RESPAWN_DELAY } : it
      )
    );
  };

  const respawnItem = (item) => {
    const def = POWERUP_DEFS[item.kind];
    effectsApi.burst(item.x, 1.4, item.z, {
      count: 15,
      color: def.color,
      speed: 6,
      up: 5,
    });
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, active: true, respawnAt: 0 } : it))
    );
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = now();

    // ---- float + spin (single pass over rendered groups) ----
    const g = groupRef.current;
    if (g) {
      const clockT = state.clock.elapsedTime;
      const kids = g.children;
      for (let k = 0; k < kids.length; k++) {
        const c = kids[k];
        c.position.y = 1.4 + Math.sin(clockT * 2 + c.userData.i) * 0.3;
        c.rotation.y += dt * 1.5;
      }
    }

    // ---- respawn check (cheap; state update only on change) ----
    const list = itemsRef.current;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it.active && t >= it.respawnAt) {
        respawnItem(it);
        break; // one state update per frame max
      }
    }

    // ---- pickup check (throttled) ----
    checkAcc.current += dt;
    if (checkAcc.current < CHECK_INTERVAL) return;
    checkAcc.current = 0;

    const store = useGame.getState();
    if (store.phase !== 'playing') return;

    const px = playerRef.position.x;
    const pz = playerRef.position.z;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it.active) continue;
      const dx = px - it.x;
      const dz = pz - it.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS_SQ) {
        pickupItem(it);
        break; // one pickup per check
      }
    }
  });

  // ---- sync minimap registry (only runs when items change) ----
  useEffect(() => {
    powerupsRef.list = items
      .filter((it) => it.active)
      .map((it) => ({
        id: it.id,
        kind: it.kind,
        position: tmpV.set(it.x, 1.4, it.z).clone(),
        active: true,
      }));
  }, [items, tmpV]);

  // reset registry on unmount
  useEffect(() => {
    return () => {
      powerupsRef.list = [];
    };
  }, []);

  return (
    <group ref={groupRef}>
      {items.map((it, i) => {
        const color = POWERUP_DEFS[it.kind].color;
        return (
          <group
            key={it.id}
            position={[it.x, 1.4, it.z]}
            userData={{ i }}
            visible={it.active}
          >
            <mesh>
              <icosahedronGeometry args={[0.9, 0]} />
              <meshStandardMaterial
                color={0x111111}
                emissive={color}
                emissiveIntensity={2}
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
            <mesh>
              <torusGeometry args={[1.4, 0.08, 12, 32]} />
              <meshStandardMaterial
                color={0x111111}
                emissive={color}
                emissiveIntensity={1.2}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
