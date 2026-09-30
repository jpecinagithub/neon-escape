/**
 * Pedestrians.jsx — pedestrian spawn director + pedestrian entities.
 *
 * Neon City's streets are full of people. Two alignments, readable at speed:
 *   BLUE (good) — kid, grandma, pregnant woman, some skaters: do NOT touch.
 *   RED  (bad)  — thief, punk, some skaters: run them over for points.
 *
 * Kinematic (no physics bodies): hit detection is a cheap distance check in
 * PlayerCar against pedsRef.list. Mutable per-frame state stays in refs;
 * React state (`roster`) changes only on spawn/destroy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AVENUES, STREETS, randomRoadPoint, clampToWorld } from '../game/cityData';
import { playerRef, pedsRef, timeState, now } from '../game/shared';
import { useGame } from '../store/gameStore';
import { pedsApi } from './pedsApi';
import { effectsApi } from '../game/effectsApi';
import { audio } from '../audio/audioEngine';

const GOOD = 0x2f7bff; // blue clothes
const BAD = 0xff2f45; // red clothes
const SKIN = 0xe8b98a;
const DARK = 0x1c2230;

export const PED_DEFS = {
  kid:      { alignment: 'good', label: 'NIÑO',       speed: 1.7, scale: 0.62, weight: 0.15 },
  grandma:  { alignment: 'good', label: 'ABUELA',     speed: 1.1, scale: 0.95, weight: 0.13 },
  pregnant: { alignment: 'good', label: 'EMBARAZADA', speed: 1.3, scale: 1.0,  weight: 0.12 },
  thief:    { alignment: 'bad',  label: 'LADRÓN',     speed: 2.7, scale: 1.0,  weight: 0.16, points: 500 },
  punk:     { alignment: 'bad',  label: 'PUNKI',      speed: 2.3, scale: 1.05, weight: 0.12, points: 500 },
  skater:   { alignment: 'mixed',label: 'PATINADOR',  speed: 5.5, scale: 1.0,  weight: 0.32, points: 750 },
};

const PED_POINTS = { bad: 500, skaterBad: 750 };

function pickType() {
  let total = 0;
  for (const k of Object.keys(PED_DEFS)) total += PED_DEFS[k].weight;
  let r = Math.random() * total;
  for (const k of Object.keys(PED_DEFS)) {
    r -= PED_DEFS[k].weight;
    if (r <= 0) return k;
  }
  return 'punk';
}

// ---- shared geometries / materials (one set for all peds) ----
const GEO = {
  leg: new THREE.BoxGeometry(0.16, 0.75, 0.16),
  torso: new THREE.BoxGeometry(0.52, 0.72, 0.3),
  arm: new THREE.BoxGeometry(0.13, 0.62, 0.13),
  head: new THREE.SphereGeometry(0.21, 12, 10),
  belly: new THREE.SphereGeometry(0.24, 10, 8),
  mohawk: new THREE.BoxGeometry(0.09, 0.3, 0.44),
  cap: new THREE.SphereGeometry(0.225, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  cane: new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6),
  board: new THREE.BoxGeometry(0.3, 0.07, 0.9),
};
const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.9 }),
  mohawk: new THREE.MeshStandardMaterial({ color: 0x181020, roughness: 0.9 }),
  board: new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.7 }),
  cane: new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 0.8 }),
};
const clothMatCache = {};
function clothMat(alignment) {
  const key = alignment;
  if (!clothMatCache[key]) {
    clothMatCache[key] = new THREE.MeshStandardMaterial({
      color: alignment === 'bad' ? BAD : GOOD,
      roughness: 0.75,
      emissive: alignment === 'bad' ? 0x550000 : 0x001133,
      emissiveIntensity: 0.35,
    });
  }
  return clothMatCache[key];
}

function nearestLine(lines, v) {
  let best = lines[0];
  let bd = Math.abs(v - best);
  for (const l of lines) {
    const d = Math.abs(v - l);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

function pickTarget(x, z) {
  const ax = nearestLine(AVENUES, x);
  const az = nearestLine(STREETS, z);
  const alongAvenue = Math.abs(x - ax) <= Math.abs(z - az);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const dist = 30 + Math.random() * 60;
  let tx, tz;
  if (alongAvenue) {
    tx = ax + (Math.random() * 8 - 4);
    tz = z + dir * dist;
  } else {
    tx = x + dir * dist;
    tz = az + (Math.random() * 8 - 4);
  }
  const c = clampToWorld(tx, tz, 14);
  return { x: c.x, z: c.z };
}

/** Procedural low-poly person. alignment: 'good' (blue) | 'bad' (red). */
function PedModel({ type, alignment, phase, frozenRef }) {
  const legL = useRef(null);
  const legR = useRef(null);
  const armL = useRef(null);
  const armR = useRef(null);
  const cloth = clothMat(alignment);
  const skater = type === 'skater';
  const grandma = type === 'grandma';

  useFrame((_, delta) => {
    if (frozenRef.current) return;
    const swing = skater ? 0.18 : 0.55;
    const p = phase.current;
    if (legL.current) legL.current.rotation.x = Math.sin(p) * swing;
    if (legR.current) legR.current.rotation.x = Math.sin(p + Math.PI) * swing;
    if (armL.current) armL.current.rotation.x = Math.sin(p + Math.PI) * swing * 0.8;
    if (armR.current) armR.current.rotation.x = Math.sin(p) * swing * 0.8;
  });

  return (
    <group>
      {/* legs */}
      <group position={[-0.13, 0.75, 0]}>
        <mesh ref={legL} geometry={GEO.leg} material={MAT.dark} position={[0, -0.375, 0]} />
      </group>
      <group position={[0.13, 0.75, 0]}>
        <mesh ref={legR} geometry={GEO.leg} material={MAT.dark} position={[0, -0.375, 0]} />
      </group>
      {/* torso */}
      <group position={[0, 1.12, 0]} rotation={[grandma ? 0.28 : 0, 0, 0]}>
        <mesh geometry={GEO.torso} material={cloth} />
        {type === 'pregnant' && (
          <mesh geometry={GEO.belly} material={cloth} position={[0, -0.1, 0.26]} />
        )}
        {/* arms */}
        <group position={[-0.34, 0.28, 0]}>
          <mesh ref={armL} geometry={GEO.arm} material={cloth} position={[0, -0.28, 0]} />
        </group>
        <group position={[0.34, 0.28, 0]}>
          <mesh ref={armR} geometry={GEO.arm} material={cloth} position={[0, -0.28, 0]} />
        </group>
        {/* head */}
        <mesh geometry={GEO.head} material={MAT.skin} position={[0, 0.62, 0.02]} />
        {type === 'punk' && (
          <mesh geometry={GEO.mohawk} material={MAT.mohawk} position={[0, 0.86, 0.02]} />
        )}
        {type === 'thief' && (
          <mesh geometry={GEO.cap} material={MAT.dark} position={[0, 0.66, 0.02]} />
        )}
        {grandma && (
          <mesh geometry={GEO.cane} material={MAT.cane} position={[0.42, -0.5, 0.15]} />
        )}
      </group>
      {skater && (
        <mesh geometry={GEO.board} material={MAT.board} position={[0, 0.05, 0.05]} />
      )}
    </group>
  );
}

function Ped({ id, type, alignment, x, z, onGone }) {
  const def = PED_DEFS[type];
  const group = useRef(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const frozenRef = useRef(false);
  const entryRef = useRef(null);
  const stRef = useRef(null);
  if (stRef.current === null) {
    const t = pickTarget(x, z);
    stRef.current = {
      heading: Math.atan2(t.x - x, t.z - z),
      target: t,
      repathAt: now() + 6 + Math.random() * 8,
      fleeUntil: 0,
      fleeX: 0, fleeZ: 0,
    };
  }

  useEffect(() => {
    const entry = {
      id, type, alignment,
      position: new THREE.Vector3(x, 0, z),
      heading: stRef.current.heading,
      speed: def.speed,
      alive: true,
      frozenUntil: 0,
    };
    entryRef.current = entry;
    pedsRef.list.push(entry);
    return () => {
      const i = pedsRef.list.indexOf(entry);
      if (i >= 0) pedsRef.list.splice(i, 1);
      entryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const entry = entryRef.current;
    const s = stRef.current;
    const g = group.current;
    if (!entry || !s || !g) return;
    const gs = useGame.getState();
    if (gs.phase !== 'playing') return;
    const dt = Math.min(delta, 0.05) * timeState.scale;
    const t = now();
    const frozen = t < entry.frozenUntil;
    frozenRef.current = frozen;

    if (!frozen && !playerRef.wrecked) {
      // --- flee: good peds (and some bad ones) dodge a fast approaching car ---
      const px = playerRef.position.x;
      const pz = playerRef.position.z;
      const dx = entry.position.x - px;
      const dz = entry.position.z - pz;
      const dCar = Math.hypot(dx, dz);
      const carSpeed = playerRef.speedMs;
      const skittish = alignment === 'good' || type === 'thief';
      if (skittish && dCar < (alignment === 'good' ? 14 : 9) && carSpeed > 11 && t > s.fleeUntil) {
        const inv = 1 / Math.max(0.5, dCar);
        s.fleeX = dx * inv;
        s.fleeZ = dz * inv;
        s.fleeUntil = t + 1.3;
      }
      let mx, mz, spd;
      if (t < s.fleeUntil) {
        mx = s.fleeX; mz = s.fleeZ;
        spd = def.speed * 1.9;
      } else {
        const tx = s.target.x - entry.position.x;
        const tz = s.target.z - entry.position.z;
        const d = Math.hypot(tx, tz);
        if (d < 3 || t > s.repathAt) {
          s.target = pickTarget(entry.position.x, entry.position.z);
          s.repathAt = t + 6 + Math.random() * 8;
        } else {
          mx = tx / d; mz = tz / d;
        }
        spd = def.speed;
      }
      if (mx !== undefined) {
        entry.position.x += mx * spd * dt;
        entry.position.z += mz * spd * dt;
        const c = clampToWorld(entry.position.x, entry.position.z, 14);
        entry.position.x = c.x;
        entry.position.z = c.z;
        const want = Math.atan2(mx, mz);
        let diff = want - s.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        s.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        entry.heading = s.heading;
        phase.current += dt * spd * 3.4;
      }
    }

    g.position.set(entry.position.x, 0, entry.position.z);
    g.rotation.y = s.heading;
    const sc = def.scale;
    g.scale.set(sc, sc, sc);

    // --- despawn far away / sweep dead ---
    if (!entry.alive) {
      onGone(id);
      return;
    }
    const pdx = entry.position.x - playerRef.position.x;
    const pdz = entry.position.z - playerRef.position.z;
    if (pdx * pdx + pdz * pdz > 230 * 230) onGone(id);
  });

  return (
    <group ref={group} position={[x, 0, z]} scale={[def.scale, def.scale, def.scale]}>
      <PedModel type={type} alignment={alignment} phase={phase} frozenRef={frozenRef} />
    </group>
  );
}

const DESIRED = 16;

export function Pedestrians() {
  const [roster, setRoster] = useState([]); // [{id, type, alignment, x, z}]
  const mgr = useRef({ nextId: 1, eventTimer: 55 });
  const runSeen = useRef(useGame.getState().runId);

  useEffect(() => {
    const unsub = useGame.subscribe((s) => {
      if (s.runId === runSeen.current) return;
      runSeen.current = s.runId;
      setRoster([]);
      pedsRef.list.length = 0;
      mgr.current.nextId = 1;
      mgr.current.eventTimer = 55;
    });
    return unsub;
  }, []);

  const removeFromRoster = useCallback((id) => {
    setRoster((r) => (r.some((e) => e.id === id) ? r.filter((e) => e.id !== id) : r));
  }, []);

  const spawnPed = useCallback(() => {
    const type = pickType();
    const def = PED_DEFS[type];
    const alignment = def.alignment === 'mixed' ? (Math.random() < 0.5 ? 'good' : 'bad') : def.alignment;
    const pt = randomRoadPoint(playerRef.position, 45);
    const c = clampToWorld(pt.x, pt.z, 14);
    const id = mgr.current.nextId++;
    setRoster((r) => [...r, { id, type, alignment, x: c.x, z: c.z }]);
  }, []);

  // ---- pedsApi ----
  useEffect(() => {
    pedsApi.setImpl({
      freezeNearby: (x, z, r, dur) => {
        const n = now();
        const r2 = r * r;
        for (const e of pedsRef.list) {
          if (!e.alive) continue;
          const dx = e.position.x - x;
          const dz = e.position.z - z;
          if (dx * dx + dz * dz <= r2) e.frozenUntil = Math.max(e.frozenUntil, n + dur);
        }
        const gs = useGame.getState();
        if (gs.phase === 'playing') {
          effectsApi.burst(x, 2, z, { count: 40, color: 0x66ccff, speed: 14, up: 6 });
          audio.pickup();
        }
      },
      count: () => {
        let n = 0;
        for (const e of pedsRef.list) if (e.alive) n++;
        return n;
      },
    });
  }, []);

  // ---- spawn director + light events ----
  useFrame((_, delta) => {
    const gs = useGame.getState();
    if (gs.phase !== 'playing') return;

    let alive = 0;
    for (const e of pedsRef.list) if (e.alive) alive++;
    if (alive < DESIRED && Math.random() < 0.25) spawnPed();

    // no special events while the tutorial coach is active
    if (gs.tutStep < 0) {
      const m = mgr.current;
      m.eventTimer -= delta;
      if (m.eventTimer <= 0) {
        m.eventTimer = 55 + Math.random() * 35;
        const n = now();
        if (Math.random() < 0.5) {
          gs.set({ fx: { ...gs.fx, scoreBoostUntil: n + 10 } });
          gs.setBanner('DOUBLE SCORE', '10s — make it count', 3);
        } else {
          gs.set({ fx: { ...gs.fx, nitroUntil: n + 5 } });
          gs.heal(12);
          gs.setBanner('POWER SURGE', 'nitro +12 hull', 3);
        }
      }
    }
  });

  return (
    <>
      {roster.map((e) => (
        <Ped
          key={e.id}
          id={e.id}
          type={e.type}
          alignment={e.alignment}
          x={e.x}
          z={e.z}
          onGone={removeFromRoster}
        />
      ))}
    </>
  );
}

/** Points for running over a bad pedestrian. */
export function pedPoints(type) {
  if (type === 'skater') return PED_POINTS.skaterBad;
  return PED_POINTS.bad;
}
