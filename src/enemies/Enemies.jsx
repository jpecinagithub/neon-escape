/**
 * Enemies.jsx — enemy spawn director + enemy entities.
 *
 * Enemies: spawn director lives here; each Enemy is a physics-driven
 * RigidBody with a behavior-based pursuit AI. Mutable per-frame state stays
 * in refs (enemiesRef.list entries); React state (`roster`) changes only on
 * spawn/destroy.
 *
 * Contract notes (see ../vehicles/CarModel.jsx, ../audio/audioEngine.js):
 *  - <CarModel variant={type} speedSource={wheelRef} />
 *  - audio.impact(s01) / audio.explosion()
 *  - effectsApi: burst(x,y,z,opts) / explosion(x,y,z,scale) / smoke(x,y,z,opts)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { ENEMY_DEFS } from '../game/constants';
import { randomRoadPoint, pathBlocked, clampToWorld } from '../game/cityData';
import { playerRef, enemiesRef, timeState, now } from '../game/shared';
import { useGame } from '../store/gameStore';
import { enemiesApi } from './enemiesApi';
import { effectsApi } from '../game/effectsApi';
import { audio } from '../audio/audioEngine';
import { CarModel } from '../vehicles/CarModel';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function desiredCount(t, heavyUntil) {
  let d = t < 30 ? 2 : t < 90 ? 4 : t < 180 ? 6 : t < 300 ? 8 : 10;
  if (now() < heavyUntil) d += 2;
  return d;
}

function pickType(t) {
  const w = [['interceptor', 1.0]];
  if (t > 40) w.push(['rammer', 0.5]);
  if (t > 80) w.push(['hunter', 0.5]);
  if (t > 170) w.push(['elite', Math.min(0.25, 0.08 + (t - 170) / 600)]);
  let total = 0;
  for (let i = 0; i < w.length; i++) total += w[i][1];
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i][1];
    if (r <= 0) return w[i][0];
  }
  return 'interceptor';
}

export function Enemies() {
  const [roster, setRoster] = useState([]); // [{id, type, x, z}] — React state, infrequent
  const mgr = useRef({
    nextId: 1,
    spawnTimer: 8, // first enemy ~10s in (spec: never instantly)
    eventTimer: 60, // first special event 60s in
    heavyPursuitUntil: 0,
  });
  const bodyMap = useRef(new Map()); // rapier RigidBody -> entry
  const runSeen = useRef(useGame.getState().runId);

  // ---- fresh run: clear the whole roster (RETRY without remount) ----
  useEffect(() => {
    const unsub = useGame.subscribe((s) => {
      if (s.runId === runSeen.current) return;
      runSeen.current = s.runId;
      setRoster([]);
      enemiesRef.list.length = 0;
      bodyMap.current.clear();
      mgr.current.nextId = 1;
      mgr.current.spawnTimer = 8;
      mgr.current.eventTimer = 60;
      mgr.current.heavyPursuitUntil = 0;
    });
    return unsub;
  }, []);

  const removeFromRoster = useCallback((id) => {
    setRoster((r) => (r.some((e) => e.id === id) ? r.filter((e) => e.id !== id) : r));
  }, []);

  const spawnEnemy = useCallback((t, forceType) => {
    const type = forceType || pickType(t);
    const pt = randomRoadPoint(playerRef.position, 95); // never near the player
    const c = clampToWorld(pt.x, pt.z);
    const id = mgr.current.nextId++;
    setRoster((r) => [...r, { id, type, x: c.x, z: c.z }]);
  }, []);

  const runEvent = useCallback((t) => {
    const gs = useGame.getState();
    const n = now();
    const roll = Math.random();
    if (roll < 0.3) {
      // HEAVY PURSUIT: +2 desired enemies for 25s
      mgr.current.heavyPursuitUntil = n + 25;
      gs.setBanner('HEAVY PURSUIT', 'hostiles converging — hold on', 3);
    } else if (roll < 0.55) {
      // ELITE HUNTER INBOUND: force-spawn an elite
      spawnEnemy(t, 'elite');
      gs.setBanner('ELITE HUNTER INBOUND', 'fastest unit on the grid', 3);
    } else if (roll < 0.8) {
      // DOUBLE SCORE: 10s score boost
      gs.set({ fx: { ...gs.fx, scoreBoostUntil: n + 10 } });
      gs.setBanner('DOUBLE SCORE', '10s — make it count', 3);
    } else {
      // POWER SURGE: nitro + hull
      gs.set({ fx: { ...gs.fx, nitroUntil: n + 5 } });
      gs.heal(12);
      gs.setBanner('POWER SURGE', 'nitro +12 hull', 3);
    }
  }, [spawnEnemy]);

  // ---- enemiesApi: lets PlayerCar damage enemies & EMP disable them ----
  useEffect(() => {
    enemiesApi.setImpl({
      damageByBody: (body, amount) => {
        const entry = bodyMap.current.get(body);
        if (!entry || !entry.alive) return false;
        effectsApi.burst(entry.position.x, entry.position.y + 0.6, entry.position.z, {
          count: 8,
          color: 0xffaa33,
        });
        entry.takeDamage(amount);
        return !entry.alive; // true if destroyed
      },
      disableNearby: (x, z, r, dur) => {
        const n = now();
        const r2 = r * r;
        for (const e of enemiesRef.list) {
          if (!e.alive) continue;
          const dx = e.position.x - x;
          const dz = e.position.z - z;
          if (dx * dx + dz * dz <= r2) e.disabledUntil = Math.max(e.disabledUntil, n + dur);
        }
      },
      count: () => {
        let n = 0;
        for (const e of enemiesRef.list) if (e.alive) n++;
        return n;
      },
    });
    // component persists for the run; impl intentionally left in place
  }, []);

  // ---- spawn director ----
  useFrame((_, delta) => {
    const gs = useGame.getState();
    if (gs.phase !== 'playing') return;
    const m = mgr.current;
    const t = gs.survivalTime;

    m.spawnTimer -= delta;
    if (m.spawnTimer <= 0) {
      m.spawnTimer = 2.2;
      if (enemiesRef.list.length < desiredCount(t, m.heavyPursuitUntil)) spawnEnemy(t);
    }

    m.eventTimer -= delta;
    if (m.eventTimer <= 0) {
      m.eventTimer = 50 + Math.random() * 30; // every 50-80s
      runEvent(t);
    }
  });

  return (
    <>
      {roster.map((e) => (
        <Enemy
          key={e.id}
          id={e.id}
          type={e.type}
          x={e.x}
          z={e.z}
          bodyMap={bodyMap}
          onDestroyed={removeFromRoster}
          onGone={removeFromRoster}
        />
      ))}
    </>
  );
}

function Enemy({ id, type, x, z, bodyMap, onDestroyed, onGone }) {
  const def = ENEMY_DEFS[type] || ENEMY_DEFS.interceptor;
  const bodyRef = useRef(null);
  const wheelRef = useRef({ current: 0 }); // rad/s, read by CarModel via speedSource
  const entryRef = useRef(null);

  // lazy-init: mutable AI state, never in React state
  const stRef = useRef(null);
  if (stRef.current === null) {
    stRef.current = {
      heading: Math.random() * Math.PI * 2,
      speed: 0,
      hp: def.hp,
      alive: true,
      disabledUntil: 0,
      sideSign: Math.random() < 0.5 ? -1 : 1,
      sideFlipAt: now() + 6,
      hitCooldown: 0,
      farTimer: 0,
      smokeTimer: 0,
      gone: false,
      lastHitAt: 0,
    };
  }

  const destroyEnemy = useCallback(() => {
    const s = stRef.current;
    const entry = entryRef.current;
    if (!s || !s.alive) return; // double-destroy guard (self collision + PlayerCar's damageByBody)
    s.alive = false;
    if (entry) entry.alive = false;
    const p = bodyRef.current ? bodyRef.current.translation() : { x, y: 1, z };
    effectsApi.explosion(p.x, p.y + 0.5, p.z, 1.2);
    if (audio && audio.explosion) audio.explosion();
    const gs = useGame.getState();
    gs.addKill();
    gs.addScore(1000, 'ENEMY CRASH');
    onDestroyed(id);
  }, [id, onDestroyed, x, z]);

  const takeDamage = useCallback(
    (amount) => {
      const s = stRef.current;
      const entry = entryRef.current;
      if (!s || !s.alive) return;
      s.hp -= amount;
      s.lastHitAt = now();
      if (entry) entry.hp = s.hp;
      if (s.hp <= 0) destroyEnemy();
    },
    [destroyEnemy]
  );

  // register / unregister the shared enemiesRef.list entry
  useEffect(() => {
    const entry = {
      id,
      type,
      position: new THREE.Vector3(x, 1, z),
      velocity: new THREE.Vector3(),
      speedKmh: 0,
      hp: def.hp,
      alive: true,
      disabledUntil: 0,
      body: null, // rapier RigidBody, filled below
      lastHitAt: 0,
      takeDamage, // external write path for enemiesApi.damageByBody
    };
    entryRef.current = entry;
    enemiesRef.list.push(entry);
    const rb = bodyRef.current;
    if (rb) {
      entry.body = rb;
      bodyMap.current.set(rb, entry);
    }
    return () => {
      const i = enemiesRef.list.indexOf(entry);
      if (i >= 0) enemiesRef.list.splice(i, 1);
      if (entry.body) bodyMap.current.delete(entry.body);
      entryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCollision = useCallback(
    (e) => {
      const s = stRef.current;
      const entry = entryRef.current;
      const rb = bodyRef.current;
      if (!s || !s.alive || !rb) return;
      const t = now();
      if (t < s.hitCooldown) return;
      s.hitCooldown = t + 0.3;

      const lv = rb.linvel();
      const otherRb = e.other && e.other.rigidBody;
      let ox = 0, oy = 0, oz = 0;
      if (otherRb) {
        const olv = otherRb.linvel();
        ox = olv.x; oy = olv.y; oz = olv.z;
      }
      const rel = Math.hypot(lv.x - ox, lv.y - oy, lv.z - oz);
      if (rel < 3) return; // ignore gentle taps

      const isPlayer = !!otherRb && otherRb === playerRef.body;
      const dmg = rel * (isPlayer ? 1.4 : 1.8);
      const tp = rb.translation();
      effectsApi.burst(tp.x, tp.y + 0.6, tp.z, {
        count: Math.round(rel * 1.5),
        color: 0xffaa33,
      });
      if (audio && audio.impact) audio.impact(clamp(rel / 22, 0, 1));
      takeDamage(dmg); // guards double-destroy via entry.alive
    },
    [takeDamage]
  );

  useFrame((_, delta) => {
    const rb = bodyRef.current;
    const entry = entryRef.current;
    const s = stRef.current;
    if (!rb || !entry || !s) return;
    const gs = useGame.getState();
    if (gs.phase !== 'playing') return;

    const dt = Math.min(delta, 0.05) * timeState.scale;
    const t = now();
    const tp = rb.translation();

    // late body registration (safety; normally set in the mount effect)
    if (!entry.body) {
      entry.body = rb;
      bodyMap.current.set(rb, entry);
    }

    // adopt externally-set EMP disable time (enemiesApi.disableNearby)
    if (entry.disabledUntil > s.disabledUntil) s.disabledUntil = entry.disabledUntil;

    const syncEntry = () => {
      const lv = rb.linvel();
      entry.position.set(tp.x, tp.y, tp.z);
      entry.velocity.set(lv.x, lv.y, lv.z);
      entry.speedKmh = s.speed * 3.6;
      entry.hp = s.hp;
      entry.disabledUntil = s.disabledUntil;
      entry.lastHitAt = s.lastHitAt;
      wheelRef.current = s.speed / 0.35;
    };

    // --- player wrecked: coast to a stop ---
    if (playerRef.wrecked) {
      s.speed = Math.max(0, s.speed - 30 * dt);
      const lv = rb.linvel();
      rb.setLinvel(
        { x: Math.sin(s.heading) * s.speed, y: lv.y, z: Math.cos(s.heading) * s.speed },
        true
      );
      syncEntry();
      return;
    }

    // --- EMP disabled: power down, vent smoke ---
    if (t < s.disabledUntil) {
      s.speed = Math.max(0, s.speed - 20 * dt);
      const lv = rb.linvel();
      rb.setLinvel({ x: 0, y: lv.y, z: 0 }, true);
      s.smokeTimer -= dt;
      if (s.smokeTimer <= 0) {
        s.smokeTimer = 0.5;
        effectsApi.smoke(tp.x, tp.y + 0.8, tp.z, { big: false, dark: true });
      }
      syncEntry();
      return;
    }

    // --- pursuit target by behavior ---
    const p = playerRef.position;
    const v = playerRef.velocity;
    let tx, tz;
    if (def.behavior === 'chase') {
      tx = p.x + v.x * 0.35;
      tz = p.z + v.z * 0.35;
    } else if (def.behavior === 'side') {
      if (t > s.sideFlipAt) {
        s.sideSign *= -1;
        s.sideFlipAt = t + 6;
      }
      const vl = Math.hypot(v.x, v.z);
      let perpx = 0, perpz = 0;
      if (vl > 0.5) {
        perpx = -v.z / vl;
        perpz = v.x / vl;
      }
      tx = p.x + perpx * 12 * s.sideSign + v.x * 0.2;
      tz = p.z + perpz * 12 * s.sideSign + v.z * 0.2;
    } else if (def.behavior === 'intercept') {
      const dist = Math.hypot(p.x - tp.x, p.z - tp.z);
      const closing = Math.max(12, (def.topSpeed / 3.6) * 0.7);
      const tImp = clamp(dist / closing, 0, 1.6);
      tx = p.x + v.x * tImp;
      tz = p.z + v.z * tImp;
    } else {
      // aggressive (elite)
      tx = p.x + v.x * 0.5;
      tz = p.z + v.z * 0.5;
    }

    // --- obstacle avoidance: probe ahead, sidestep to the clear side ---
    const fwdx = Math.sin(s.heading);
    const fwdz = Math.cos(s.heading);
    let slowForObstacle = false;
    if (pathBlocked(tp.x, tp.z, tp.x + fwdx * 20, tp.z + fwdz * 20)) {
      const rightClear = !pathBlocked(tp.x, tp.z, tp.x + fwdz * 25, tp.z - fwdx * 25);
      const leftClear = !pathBlocked(tp.x, tp.z, tp.x - fwdz * 25, tp.z + fwdx * 25);
      if (rightClear) {
        tx = tp.x + fwdz * 25;
        tz = tp.z - fwdx * 25;
      } else if (leftClear) {
        tx = tp.x - fwdz * 25;
        tz = tp.z + fwdx * 25;
      } else {
        slowForObstacle = true;
      }
    }

    const c = clampToWorld(tx, tz);
    tx = c.x;
    tz = c.z;

    // --- steering ---
    const desiredYaw = Math.atan2(tx - tp.x, tz - tp.z);
    const yawDiff = wrapAngle(desiredYaw - s.heading);
    const turnStep = clamp(yawDiff, -def.turn * dt, def.turn * dt);
    s.heading = wrapAngle(s.heading + turnStep);

    // --- speed ---
    let targetSpeed = (def.topSpeed / 3.6) * (1 - Math.min(1, Math.abs(yawDiff) / 1.2) * 0.45);
    if (slowForObstacle) targetSpeed *= 0.5;
    const rate = targetSpeed > s.speed ? def.accel : 30;
    s.speed += clamp(targetSpeed - s.speed, -rate * dt, rate * dt);
    s.speed = Math.max(0, s.speed);

    // --- apply ---
    const lv = rb.linvel();
    rb.setLinvel({ x: fwdx * s.speed, y: lv.y, z: fwdz * s.speed }, true);
    const q = rb.rotation();
    const curYaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z)
    );
    rb.setAngvel({ x: 0, y: clamp(wrapAngle(s.heading - curYaw) * 6, -4, 4), z: 0 }, true);

    syncEntry();

    // --- despawn: too far from the player for too long ---
    if (!s.gone) {
      const far = Math.hypot(tp.x - p.x, tp.z - p.z) > 280;
      s.farTimer = far ? s.farTimer + dt : 0;
      if (s.farTimer > 8) {
        s.gone = true;
        onGone(id);
      }
    }
  });

  const rammer = type === 'rammer';
  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      position={[x, 1, z]}
      rotation={[0, stRef.current.heading, 0]}
      enabledRotations={[false, true, false]}
      angularDamping={2.2}
      linearDamping={0.05}
      onCollisionEnter={handleCollision}
    >
      <CuboidCollider
        args={rammer ? [1.25, 0.75, 2.5] : [1.05, 0.5, 2.15]}
        restitution={0.4}
        friction={0.4}
        density={rammer ? 2.2 : 1.1}
      />
      <CarModel variant={type} speedSource={wheelRef} />
    </RigidBody>
  );
}
