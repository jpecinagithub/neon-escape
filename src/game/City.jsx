/**
 * NEON ESCAPE — City visuals + physics colliders.
 *
 * CityVisual()  — pure visuals, no physics. Everything instanced, no shadows,
 *                 no per-frame React state. Night cyber-noir look.
 * CityColliders() — physics only, no visible meshes (@react-three/rapier).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import {
  WORLD_HALF, ROAD_W, ROADS, BUILDINGS, TUNNELS, RAMPS,
} from './cityData.js';
import { NEON_SIGNS } from './constants.js';
import { useGame } from '../store/gameStore.js';

/** Streetlight [x, z] positions along every road — shared by visuals and physics. */
export function getLampPositions() {
  const lamps = [];
  for (const r of ROADS) {
    const vertical = r.d > r.w;
    const len = vertical ? r.d : r.w;
    const off = ROAD_W / 2 + 2;
    let i = 0;
    for (let s = -len / 2 + 22; s < len / 2; s += 44, i++) {
      const side = i % 2 === 0 ? off : -off;
      lamps.push(vertical ? [r.x + side, s] : [s, r.z + side]);
    }
  }
  return lamps;
}

/* ---------------- helpers ---------------- */

const V3 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const EULER = new THREE.Euler();
const MATRIX = new THREE.Matrix4();
const SCALE = new THREE.Vector3();
const COLOR = new THREE.Color();

/** Neon-glow text canvas texture for billboards. */
function makeSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#050510';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color; g.lineWidth = 6;
  g.strokeRect(12, 12, 488, 232);
  g.font = '900 92px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 34;
  g.fillStyle = color;
  // shrink text to fit
  let size = 92;
  while (g.measureText(text).width > 440 && size > 24) {
    size -= 6; g.font = `900 ${size}px Arial, sans-serif`;
  }
  g.fillText(text, 256, 132);
  // scanlines for flavor
  g.shadowBlur = 0; g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 512, 2);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/** Lit-window grid canvas texture (used as emissiveMap on buildings). */
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 256);
  const cols = 8, rows = 22;
  const cw = 128 / cols, rh = 256 / rows;
  const palette = ['#ffd9a0', '#ffca7a', '#bfe9ff', '#9fd8ff', '#ffc4e0'];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const r = Math.random();
      if (r < 0.42) {
        g.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        g.globalAlpha = 0.55 + Math.random() * 0.45;
        g.fillRect(i * cw + 2, j * rh + 2, cw - 4, rh - 4);
        g.globalAlpha = 1;
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ================= CityVisual ================= */

export function CityVisual() {
  const graphics = useGame((s) => s.settings?.graphics);

  const data = useMemo(() => {
    /* ---- lane dashes ---- */
    const dashes = [];
    for (const r of ROADS) {
      const vertical = r.d > r.w; // avenues run along Z
      const len = vertical ? r.d : r.w;
      for (let s = -len / 2 + 3; s < len / 2; s += 6) {
        dashes.push(vertical ? [r.x, s] : [s, r.z]);
      }
    }

    /* ---- streetlights ---- */
    const lamps = getLampPositions();

    /* ---- billboard placements ---- */
    const signs = [];
    const signColors = ['#00e5ff', '#ff2fd6', '#7c4dff', '#ffd633', '#33ff77'];
    const spots = [
      { x: 34, z: 34, rotY: -Math.PI / 4 },   // plaza corners
      { x: -34, z: 34, rotY: Math.PI / 4 },
      { x: 34, z: -34, rotY: -Math.PI * 0.75 },
      { x: -34, z: -34, rotY: Math.PI * 0.75 },
      { x: -175, z: -90, rotY: 0 },          // road sides
      { x: 105, z: 90, rotY: Math.PI },
      { x: 60, z: 175, rotY: Math.PI / 2 },
      { x: -90, z: -105, rotY: -Math.PI / 2 },
    ];
    spots.forEach((s, i) => {
      signs.push({
        ...s,
        text: NEON_SIGNS[i % NEON_SIGNS.length],
        color: signColors[i % signColors.length],
      });
    });

    /* ---- stars ---- */
    const starCount = graphics === 'low' ? 150 : 350;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = 60 + Math.random() * 400;
      const r = 500;
      const horiz = Math.sqrt(Math.max(0, r * r - y * y));
      starPos[i * 3] = Math.cos(theta) * horiz;
      starPos[i * 3 + 1] = y;
      starPos[i * 3 + 2] = Math.sin(theta) * horiz;
    }

    return { dashes, lamps, signs, starPos, starCount };
  }, [graphics]);

  const windowTex = useMemo(makeWindowTexture, []);
  const signTexs = useMemo(
    () => data.signs.map((s) => makeSignTexture(s.text, s.color)),
    [data.signs],
  );
  const tunnelSignTex = useMemo(() => makeSignTexture('TUNNEL', '#00e5ff'), []);

  /* ---- building instanced mesh ---- */
  const buildings = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: '#0d1020', roughness: 0.8,
      emissive: '#ffffff', emissiveIntensity: 0.9, emissiveMap: windowTex,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, BUILDINGS.length);
    const tints = ['#0d1020', '#101230', '#140f2a', '#0f1a2a', '#1a1030'];
    BUILDINGS.forEach((b, i) => {
      V3.set(b.x, b.h / 2, b.z);
      Q.identity();
      SCALE.set(b.w, b.h, b.d);
      MATRIX.compose(V3, Q, SCALE);
      mesh.setMatrixAt(i, MATRIX);
      COLOR.set(tints[i % tints.length]).offsetHSL(0, 0, b.hue * 0.04);
      mesh.setColorAt(i, COLOR);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [windowTex]);

  /* ---- streetlight instanced meshes ---- */
  const { poles, heads } = useMemo(() => {
    const n = data.lamps.length;
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 7, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#1a1d2e', roughness: 0.7 });
    const polesMesh = new THREE.InstancedMesh(poleGeo, poleMat, n);
    const headGeo = new THREE.SphereGeometry(0.55, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: '#bfe9ff' });
    const headsMesh = new THREE.InstancedMesh(headGeo, headMat, n);
    data.lamps.forEach(([x, z], i) => {
      V3.set(x, 3.5, z); Q.identity(); SCALE.set(1, 1, 1);
      MATRIX.compose(V3, Q, SCALE);
      polesMesh.setMatrixAt(i, MATRIX);
      V3.set(x, 7.2, z);
      MATRIX.compose(V3, Q, SCALE);
      headsMesh.setMatrixAt(i, MATRIX);
    });
    polesMesh.instanceMatrix.needsUpdate = true;
    headsMesh.instanceMatrix.needsUpdate = true;
    polesMesh.frustumCulled = false;
    headsMesh.frustumCulled = false;
    return { poles: polesMesh, heads: headsMesh };
  }, [data.lamps]);

  /* ---- lane dashes instanced mesh ---- */
  const dashMesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.35, 3);
    const mat = new THREE.MeshStandardMaterial({
      color: '#000000', emissive: '#cfe8ff', emissiveIntensity: 1.2,
      roughness: 0.5,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, data.dashes.length);
    data.dashes.forEach(([x, z], i) => {
      V3.set(x, 0.04, z);
      EULER.set(-Math.PI / 2, 0, 0);
      Q.setFromEuler(EULER);
      SCALE.set(1, 1, 1);
      MATRIX.compose(V3, Q, SCALE);
      mesh.setMatrixAt(i, MATRIX);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [data.dashes]);

  /* ---- stars ---- */
  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.starPos, 3));
    return g;
  }, [data.starPos]);

  const tunnel = TUNNELS[0];

  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[WORLD_HALF * 2, WORLD_HALF * 2]} />
        <meshStandardMaterial color="#07070f" roughness={0.85} />
      </mesh>

      {/* roads */}
      {ROADS.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[r.x, 0.02, r.z]}>
          <planeGeometry args={[r.w, r.d]} />
          <meshStandardMaterial color="#12141f" roughness={0.32} metalness={0.25} />
        </mesh>
      ))}

      <primitive object={dashMesh} />
      <primitive object={buildings} />
      <primitive object={poles} />
      <primitive object={heads} />

      {/* billboards */}
      {data.signs.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.rotY, 0]}>
          <mesh position={[0, 5, 0]}>
            <cylinderGeometry args={[0.35, 0.45, 10, 8]} />
            <meshStandardMaterial color="#1a1d2e" roughness={0.7} />
          </mesh>
          <mesh position={[0, 11, 0]}>
            <planeGeometry args={[13, 6.5]} />
            <meshBasicMaterial map={signTexs[i]} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* ramps */}
      {RAMPS.map((r, i) => {
        const angle = Math.atan2(r.height, r.length);
        const cosA = Math.cos(angle), sinA = Math.sin(angle);
        const L = r.length * 1.05;
        const fx = Math.sin(r.rotY), fz = Math.cos(r.rotY);
        const cx = r.x + fx * (L / 2) * cosA;
        const cz = r.z + fz * (L / 2) * cosA;
        const cy = 0.25 / cosA + (L / 2) * sinA;
        return (
          <group key={i} position={[cx, 0, cz]} rotation={[0, r.rotY, 0]}>
            <mesh position={[0, cy, 0]} rotation={[-angle, 0, 0]}>
              <boxGeometry args={[r.width, 0.5, L]} />
              <meshStandardMaterial color="#141828" roughness={0.5} metalness={0.3} />
            </mesh>
            {/* neon edge strips */}
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * (r.width / 2), cy + 0.35, 0]}
                rotation={[-angle, 0, 0]}
              >
                <boxGeometry args={[0.18, 0.18, L]} />
                <meshBasicMaterial color="#00e5ff" toneMapped={false} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* tunnel */}
      <group position={[tunnel.x, 0, tunnel.z]}>
        <mesh position={[0, tunnel.height, 0]}>
          <boxGeometry args={[tunnel.len, 1.2, tunnel.roadW + 8]} />
          <meshStandardMaterial color="#0b0d18" roughness={0.8} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[0, tunnel.height / 2, side * tunnel.wallGap]}>
              <boxGeometry args={[tunnel.len, tunnel.height, 1.2]} />
              <meshStandardMaterial color="#0b0d18" roughness={0.8} />
            </mesh>
            <mesh position={[0, tunnel.height - 0.8, side * (tunnel.roadW / 2 + 4 - 0.15)]}>
              <boxGeometry args={[tunnel.len, 0.25, 0.25]} />
              <meshBasicMaterial color="#00e5ff" toneMapped={false} />
            </mesh>
          </group>
        ))}
        {/* entrance sign */}
        <mesh
          position={[-tunnel.len / 2 - 1, tunnel.height + 2, 0]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[16, 8]} />
          <meshBasicMaterial map={tunnelSignTex} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>

      {/* plaza */}
      <group position={[0, 0, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <circleGeometry args={[26, 48]} />
          <meshStandardMaterial color="#101222" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
          <torusGeometry args={[24, 0.3, 8, 64]} />
          <meshBasicMaterial color="#00e5ff" toneMapped={false} />
        </mesh>
        {/* obelisk */}
        <mesh position={[0, 7, 0]}>
          <boxGeometry args={[3, 14, 3]} />
          <meshStandardMaterial color="#0b0d18" roughness={0.6} />
        </mesh>
        {[-1.6, 1.6].flatMap((ox) =>
          [-1.6, 1.6].map((oz) => (
            <mesh key={`${ox}${oz}`} position={[ox, 7, oz]}>
              <boxGeometry args={[0.2, 14, 0.2]} />
              <meshBasicMaterial color="#ff2fd6" toneMapped={false} />
            </mesh>
          )),
        )}
      </group>

      {/* stars */}
      <points geometry={starGeo} frustumCulled={false}>
        <pointsMaterial
          color="#cfe8ff" size={1.6} sizeAttenuation={false}
          transparent opacity={0.8} blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

/* ================= CityColliders ================= */

export function CityColliders() {
  const tunnel = TUNNELS[0];
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {/* ground */}
        <CuboidCollider args={[WORLD_HALF, 1, WORLD_HALF]} position={[0, -1, 0]} />
        {/* outer walls */}
        <CuboidCollider args={[WORLD_HALF + 8, 8, 2]} position={[0, 4, -(WORLD_HALF + 1)]} />
        <CuboidCollider args={[WORLD_HALF + 8, 8, 2]} position={[0, 4, WORLD_HALF + 1]} />
        <CuboidCollider args={[2, 8, WORLD_HALF + 8]} position={[-(WORLD_HALF + 1), 4, 0]} />
        <CuboidCollider args={[2, 8, WORLD_HALF + 8]} position={[WORLD_HALF + 1, 4, 0]} />
        {/* buildings */}
        {BUILDINGS.map((b, i) => (
          <CuboidCollider key={i} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2, b.z]} />
        ))}
        {/* tunnel walls */}
        {[-1, 1].map((side) => (
          <CuboidCollider
            key={`tw${side}`}
            args={[tunnel.len / 2, tunnel.height / 2, 0.8]}
            position={[tunnel.x, tunnel.height / 2, tunnel.z + side * tunnel.wallGap]}
          />
        ))}
        {/* plaza obelisk */}
        <CuboidCollider args={[1.5, 7, 1.5]} position={[0, 7, 0]} />
        {/* streetlight poles — solid so cars can't ghost through them */}
        {getLampPositions().map(([x, z], i) => (
          <CuboidCollider key={`lamp${i}`} args={[0.25, 3.5, 0.25]} position={[x, 3.5, z]} />
        ))}
      </RigidBody>

      {/* ramps — tilted rigid bodies so cars can drive up them */}
      {RAMPS.map((r, i) => {
        const angle = Math.atan2(r.height, r.length);
        return (
          <RigidBody
            key={i}
            type="fixed"
            colliders={false}
            position={[r.x, r.height / 2 - 0.2, r.z]}
            rotation={[-angle, r.rotY, 0]}
          >
            <CuboidCollider args={[r.width / 2, 0.3, r.length / 2 + 1]} friction={0.8} />
          </RigidBody>
        );
      })}
    </group>
  );
}
