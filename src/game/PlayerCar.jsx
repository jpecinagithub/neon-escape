import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { CarModel } from '../vehicles/CarModel';
import { useGame } from '../store/gameStore';
import { playerRef, enemiesRef, timeState, triggerSlowMo, cameraState, bus, now } from './shared';
import { CARS } from './constants';
import { PLAYER_SPAWN } from './cityData';
import { effectsApi } from './effectsApi';
import { enemiesApi } from '../enemies/enemiesApi';
import { audio } from '../audio/audioEngine';
import { pollPad, pollPadButtons, rumble } from './gamepad';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const _fwd = new THREE.Vector3();

/**
 * PlayerCar — arcade driving controller over a Rapier dynamic body.
 * No props. Reads input from window keys, writes per-frame live state into
 * playerRef, throttles HUD store writes, emits FX/audio/events.
 */
export function PlayerCar() {
  const carId = useGame((s) => s.carId);
  const bodyRef = useRef(null);
  const [nitroOn, setNitroOn] = useState(false);

  const sim = useRef({
    speed: 0, // signed scalar m/s
    heading: PLAYER_SPAWN.heading,
    steer: 0,
    velDir: new THREE.Vector3(Math.sin(PLAYER_SPAWN.heading), 0, Math.cos(PLAYER_SPAWN.heading)),
    keys: new Set(),
    collCd: 0,
    skidT: 0,
    smokeT: 0,
    dmgT: 0,
    hudT: 0,
    safeT: 0,
    driftTime: 0,
    driftMax: 0,
    airTime: 0,
    lastSafe: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, heading: PLAYER_SPAWN.heading },
    near: new Map(), // enemyId -> last near-miss time
    nitro: false,
    bodySet: false,
  });
  const wreckHandled = useRef(false);
  const runSeen = useRef(useGame.getState().runId);

  // ---- R reset / C camera (defined before input effect) ----
  const doReset = () => {
    const store = useGame.getState();
    if (store.phase !== 'playing' || playerRef.wrecked) return;
    const body = bodyRef.current;
    if (!body) return;
    const safe = sim.current.lastSafe;
    body.setTranslation({ x: safe.x, y: 1, z: safe.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    sim.current.heading = safe.heading;
    sim.current.speed = 0;
    sim.current.velDir.set(Math.sin(safe.heading), 0, Math.cos(safe.heading));
  };

  const cycleCamera = () => {
    const store = useGame.getState();
    if (store.phase !== 'playing') return;
    cameraState.mode = (cameraState.mode + 1) % 3;
    store.notify('CAMERA', ['CHASE', 'CLOSE', 'HIGH'][cameraState.mode]);
  };

  // ---- input listeners ----
  useEffect(() => {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (
        [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) &&
        useGame.getState().phase === 'playing'
      ) {
        e.preventDefault();
      }
      if (k === 'r') {
        doReset();
        return;
      }
      if (k === 'c') {
        cycleCamera();
        return;
      }
      sim.current.keys.add(k);
    };
    const up = (e) => sim.current.keys.delete(e.key.toLowerCase());
    const blur = () => sim.current.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- mount / wreck / unmount ----
  useEffect(() => {
    playerRef.wrecked = false;
    wreckHandled.current = false;
    audio.engineStart();
    const unsub = useGame.subscribe((s) => {
      if (s.runId !== runSeen.current) {
        // fresh run (RETRY / PLAY): full reset without remount
        runSeen.current = s.runId;
        const S = sim.current;
        const body = bodyRef.current;
        wreckHandled.current = false;
        playerRef.wrecked = false;
        timeState.slowUntil = 0;
        if (body) {
          body.setTranslation({ x: PLAYER_SPAWN.x, y: 1, z: PLAYER_SPAWN.z }, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        }
        S.heading = PLAYER_SPAWN.heading;
        S.speed = 0;
        S.steer = 0;
        S.velDir.set(Math.sin(PLAYER_SPAWN.heading), 0, Math.cos(PLAYER_SPAWN.heading));
        S.collCd = 0;
        S.driftTime = 0;
        S.driftMax = 0;
        S.airTime = 0;
        S.nitro = false;
        S.near.clear();
        S.lastSafe = { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, heading: PLAYER_SPAWN.heading };
        setNitroOn(false);
        audio.engineStart();
      }
      if (s.phase === 'gameover' && !wreckHandled.current) {
        wreckHandled.current = true;
        playerRef.wrecked = true;
        triggerSlowMo(1.1);
        const p = playerRef.position;
        effectsApi.explosion(p.x, p.y, p.z, 1.4);
        audio.explosion();
        rumble(1, 700);
        audio.engineStop();
      }
    });
    return () => {
      unsub();
      audio.engineStop();
      playerRef.wrecked = false;
      playerRef.body = null;
      sim.current.keys.clear();
    };
  }, []);

  // ---- collisions ----
  const onCollisionEnter = (e) => {
    const S = sim.current;
    const store = useGame.getState();
    if (store.phase !== 'playing' || playerRef.wrecked) return;
    if (S.collCd > 0) return;
    S.collCd = 0.25;

    const body = bodyRef.current;
    const pl = body ? body.linvel() : { x: 0, y: 0, z: 0 };
    let rel = 0;
    let otherBody = null;
    try {
      otherBody = e.other.rigidBody ? e.other.rigidBody() : null;
    } catch {
      otherBody = null;
    }
    if (otherBody) {
      const ol = otherBody.linvel();
      const dx = pl.x - ol.x;
      const dy = pl.y - ol.y;
      const dz = pl.z - ol.z;
      rel = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const p = playerRef.position;
    effectsApi.burst(p.x, p.y + 0.5, p.z, {
      count: Math.round(rel * 2) + 6,
      color: 0xffcc66,
    });
    audio.impact(clamp(rel / 25, 0, 1));
    if (rel >= 4) rumble(clamp(rel / 22, 0.15, 1), rel > 14 ? 350 : 150);

    if (rel < 4) return; // tiny tap: sparks only
    const dmg =
      rel < 8 ? 2 + Math.random() * 3 : rel < 14 ? 5 + Math.random() * 10 : 15 + Math.random() * 15;
    store.damage(dmg);
    bus.emit('shake', { power: clamp(rel / 22, 0.2, 1) });
    if (rel > 17) triggerSlowMo(0.45);
    if (otherBody && enemiesApi.damageByBody(otherBody, rel * 2.2)) {
      store.addKill();
      store.addScore(1000, 'ENEMY CRASH');
    }
  };

  // ---- per-frame simulation ----
  useFrame((_, delta) => {
    const S = sim.current;
    const body = bodyRef.current;
    if (!body) return;

    const dtRaw = Math.min(delta, 0.05);
    const dt = dtRaw * timeState.scale;
    const store = useGame.getState();
    const car = CARS[carId] || CARS.vortex;
    const topSpeedMs = car.topSpeed / 3.6;
    const t = now();

    const pos = body.translation();
    const lin = body.linvel();
    playerRef.position.set(pos.x, pos.y, pos.z);
    playerRef.velocity.set(lin.x, lin.y, lin.z);
    if (!S.bodySet) {
      playerRef.body = body;
      S.bodySet = true;
    }
    if (S.collCd > 0) S.collCd -= dtRaw;

    if (store.phase !== 'playing' || playerRef.wrecked) {
      // not driving: let it roll, idle audio
      audio.setEngine(0, 0, 0);
      audio.setSkid(0);
      audio.setWind(0);
      return;
    }

    // ---- input (keyboard + gamepad) ----
    const keys = S.keys;
    const pad = pollPad();
    const throttle = keys.has('w') || keys.has('arrowup') ? 1 : pad.throttle;
    const brakeIn = keys.has('s') || keys.has('arrowdown') ? 1 : pad.brake;
    const fwd = throttle > 0.02;
    const back = brakeIn > 0.02;
    const left = keys.has('a') || keys.has('arrowleft');
    const right = keys.has('d') || keys.has('arrowright');
    const handbrake = keys.has(' ') || pad.handbrake;

    // gamepad one-shot buttons (edge-triggered)
    for (const a of pollPadButtons()) {
      if (a === 'reset') doReset();
      else if (a === 'camera') cycleCamera();
      else if (a === 'pause') {
        const st = useGame.getState();
        if (st.phase === 'playing') st.pauseGame();
        else if (st.phase === 'paused') st.resumeGame();
      }
    }

    const nitroActive = t < store.fx.nitroUntil && fwd;
    if (nitroActive !== S.nitro) {
      S.nitro = nitroActive;
      setNitroOn(nitroActive);
    }
    playerRef.nitro = nitroActive;

    // ---- longitudinal ----
    let speed = S.speed;
    const cap = topSpeedMs * (nitroActive ? 1.32 : 1);
    const accel = car.accel * (nitroActive ? 1.7 : 1);
    if (fwd) {
      speed =
        speed < 0
          ? Math.min(0, speed + accel * dt)
          : Math.min(cap, speed + accel * throttle * dt);
    }
    if (back) {
      if (speed > 1) speed = Math.max(0, speed - car.accel * 2.2 * brakeIn * dt);
      else speed = Math.max(-14, speed - car.accel * 0.6 * brakeIn * dt);
    }
    if (!fwd && !back) {
      speed -= speed * 0.5 * dt;
      if (Math.abs(speed) < 0.15) speed = 0;
    }
    S.speed = speed;

    // ---- steering ----
    const steerTarget = clamp((left ? -1 : 0) + (right ? 1 : 0) + pad.steer, -1, 1);
    S.steer += (steerTarget - S.steer) * Math.min(1, 8 * dt);
    const steer = S.steer;

    const drifting = handbrake && Math.abs(speed) > 10 && steer !== 0;
    const authority =
      car.handling * clamp(1 - Math.abs(speed) / (topSpeedMs * 1.2), 0.3, 1);
    let yawRate =
      steer * 2.5 * authority * (speed >= 0 ? 1 : -1) * clamp(Math.abs(speed) / 6, 0, 1);
    if (drifting) yawRate *= 1.85 * car.drift;
    S.heading = wrapAngle(S.heading + yawRate * dt);
    const heading = S.heading;

    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);

    // ---- drift velocity ----
    const grip = drifting ? 1.7 : 9;
    S.velDir.lerp(_fwd.set(fx, 0, fz), clamp(grip * dt, 0, 1)).normalize();
    body.setLinvel({ x: S.velDir.x * speed, y: lin.y, z: S.velDir.z * speed }, true);

    // PD yaw: rotate body toward heading
    const q = body.rotation();
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const diff = wrapAngle(heading - yaw);
    body.setAngvel({ x: 0, y: clamp(diff * 10, -4.5, 4.5), z: 0 }, true);

    // ---- playerRef writes ----
    const speedKmh = Math.abs(speed) * 3.6;
    const dot = clamp(S.velDir.x * fx + S.velDir.z * fz, -1, 1);
    const cross = fz * S.velDir.x - fx * S.velDir.z;
    const driftAngle = Math.atan2(cross, dot);
    const airborne = pos.y > 1.6;

    playerRef.speedMs = Math.abs(speed);
    playerRef.speedKmh = speedKmh;
    playerRef.drifting = drifting;
    playerRef.driftAngle = driftAngle;
    playerRef.airborne = airborne;
    playerRef.wheelSpin.current = Math.abs(speed) / 0.35;

    // ---- HUD throttle ----
    S.hudT += dtRaw;
    if (S.hudT >= 0.1) {
      S.hudT = 0;
      store.setSpeedHud(speedKmh, car.topSpeed);
    }

    // ---- drift scoring ----
    if (drifting) {
      S.driftTime += dt;
      S.driftMax = Math.max(S.driftMax, Math.abs(driftAngle));
    } else if (S.driftTime > 0) {
      const dtime = S.driftTime;
      const dmax = S.driftMax;
      S.driftTime = 0;
      S.driftMax = 0;
      if (dtime > 0.5) {
        const [label, pts] =
          dtime > 2.6 && dmax > 0.5
            ? ['PERFECT DRIFT', 1500]
            : dtime > 1.4
              ? ['LONG DRIFT', 850]
              : ['DRIFT', 350];
        store.addScore(pts, label);
        store.recordDrift(dtime);
      }
    }

    // ---- skid FX ----
    if (drifting) {
      S.skidT += dt;
      S.smokeT += dt;
      if (S.skidT >= 0.06) {
        S.skidT = 0;
        const bx = pos.x - fx * 1.4;
        const bz = pos.z - fz * 1.4;
        effectsApi.skid(bx + rx * 0.8, bz + rz * 0.8, heading);
        effectsApi.skid(bx - rx * 0.8, bz - rz * 0.8, heading);
      }
      if (S.smokeT >= 0.12) {
        S.smokeT = 0;
        effectsApi.smoke(pos.x - fx * 1.4, 0.4, pos.z - fz * 1.4, {});
      }
    }
    if (store.health < 35) {
      S.dmgT += dt;
      if (S.dmgT >= 0.4) {
        S.dmgT = 0;
        effectsApi.smoke(pos.x, 1.2, pos.z, { dark: true });
      }
    }

    // ---- near miss ----
    const pvx = S.velDir.x * speed;
    const pvz = S.velDir.z * speed;
    if (Math.abs(speed) > 15) {
      for (const e of enemiesRef.list) {
        if (!e.alive) continue;
        const dx = e.position.x - pos.x;
        const dz = e.position.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= 4.3) continue;
        const relS = Math.hypot(pvx - e.velocity.x, pvz - e.velocity.z);
        if (relS <= 12) continue;
        const last = S.near.get(e.id);
        if (last !== undefined && t - last < 3) continue;
        S.near.set(e.id, t);
        const [label, pts] =
          d < 2.9 ? ['INSANE!', 600] : d < 3.6 ? ['VERY CLOSE!', 400] : ['NEAR MISS', 250];
        store.addScore(pts, label);
      }
    }

    // ---- jumps ----
    if (airborne) {
      S.airTime += dt;
    } else if (S.airTime > 0) {
      const at = S.airTime;
      S.airTime = 0;
      if (at > 0.45) store.addScore(at > 1.0 ? 500 : 200, at > 1.0 ? 'BIG AIR' : 'AIR');
      if (lin.y < -13) {
        store.damage(8);
        bus.emit('shake', { power: 0.7 });
      }
    }

    // ---- last safe spot ----
    S.safeT += dt;
    if (S.safeT >= 1.5) {
      S.safeT = 0;
      if (Math.abs(speed) > 4 && !airborne) {
        S.lastSafe = { x: pos.x, z: pos.z, heading };
      }
    }

    // ---- audio ----
    audio.setEngine(
      clamp(Math.abs(speed) / topSpeedMs, 0, 1.2),
      throttle ? 1 : 0.25,
      nitroActive ? 1 : 0
    );
    audio.setSkid(drifting ? clamp(Math.abs(speed) / topSpeedMs, 0, 1) : 0);
    audio.setWind(clamp(Math.abs(speed) / 60, 0, 1));
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      position={[PLAYER_SPAWN.x, 1, PLAYER_SPAWN.z]}
      rotation={[0, PLAYER_SPAWN.heading, 0]}
      enabledRotations={[false, true, false]}
      angularDamping={2.5}
      linearDamping={0.05}
      onCollisionEnter={onCollisionEnter}
    >
      <CuboidCollider args={[1.05, 0.5, 2.15]} restitution={0.35} friction={0.4} density={1.2} />
      <CarModel variant={carId} nitro={nitroOn} speedSource={playerRef.wheelSpin} headlights />
    </RigidBody>
  );
}
