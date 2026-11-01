/**
 * Three.js scenes (react-three-fiber).
 *  - FaceScanScene: holographic face point-cloud with a scanning ring (landing + login)
 *  - RateOrb:       3D torus gauge for the dashboard attendance rate
 */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

/* Generates a head-like point cloud (ellipsoid + facial landmark clusters). */
function useFacePoints(count = 4200) {
  return useMemo(() => {
    const pts = [];
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < count; i += 1) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      let x = 1.0 * Math.sin(phi) * Math.cos(theta);
      let y = 1.32 * Math.cos(phi);
      let z = 1.05 * Math.sin(phi) * Math.sin(theta);
      // flatten the back, push the face forward, narrow the jaw
      if (z < 0) z *= 0.75;
      if (y < -0.3) x *= 1 - (Math.abs(y) - 0.3) * 0.35;
      pts.push(x, y, z);
    }
    // nose ridge
    for (let i = 0; i < 260; i += 1) {
      const t = Math.random();
      pts.push(rnd(-0.06, 0.06) * (0.4 + t), 0.25 - t * 0.6, 1.05 + t * 0.22);
    }
    // eyes
    [-0.36, 0.36].forEach((ex) => {
      for (let i = 0; i < 180; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.13 * Math.sqrt(Math.random());
        pts.push(ex + Math.cos(a) * r * 1.4, 0.28 + Math.sin(a) * r * 0.6, 0.94);
      }
    });
    // mouth
    for (let i = 0; i < 200; i += 1) {
      const t = rnd(-1, 1);
      pts.push(t * 0.32, -0.55 - (1 - t * t) * 0.06 + rnd(-0.02, 0.02), 0.93 - Math.abs(t) * 0.1);
    }
    return new Float32Array(pts);
  }, [count]);
}

function FaceCloud() {
  const group = useRef();
  const mat = useRef();
  const positions = useFacePoints();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.35) * 0.55 + state.pointer.x * 0.35;
      group.current.rotation.x = state.pointer.y * -0.15;
    }
    if (mat.current) mat.current.size = 0.022 + Math.sin(t * 2) * 0.003;
  });
  return (
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial ref={mat} size={0.022} color="#7dd3fc" transparent opacity={0.9} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <mesh>
        <icosahedronGeometry args={[1.42, 2]} />
        <meshBasicMaterial color="#8b5cf6" wireframe transparent opacity={0.07} />
      </mesh>
      <ScanRing />
      <Landmarks />
    </group>
  );
}

function ScanRing() {
  const ref = useRef();
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.position.y = Math.sin(t * 1.2) * 1.25;
      const s = Math.sqrt(Math.max(0.05, 1 - (ref.current.position.y / 1.35) ** 2)) * 1.18;
      ref.current.scale.set(s, s, s);
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.012, 8, 96]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} />
    </mesh>
  );
}

function Landmarks() {
  const pts = [
    [-0.36, 0.28, 0.98], [0.36, 0.28, 0.98], [0, -0.05, 1.27], [-0.26, -0.55, 0.92], [0.26, -0.55, 0.92],
  ];
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.children.forEach((c, i) => c.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * 3 + i) * 0.35));
  });
  return (
    <group ref={ref}>
      {pts.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshBasicMaterial color="#34d399" />
        </mesh>
      ))}
    </group>
  );
}

function OrbitingCards() {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.25;
  });
  const items = [
    { label: 'MATCH 98.4%', color: '#34d399', a: 0 },
    { label: 'LIVENESS OK', color: '#22d3ee', a: (Math.PI * 2) / 3 },
    { label: 'AMB82 ONLINE', color: '#a78bfa', a: (Math.PI * 4) / 3 },
  ];
  return (
    <group ref={ref}>
      {items.map((it) => (
        <Float key={it.label} speed={2} floatIntensity={0.6} rotationIntensity={0.2}>
          <group position={[Math.cos(it.a) * 2.3, Math.sin(it.a * 2) * 0.5, Math.sin(it.a) * 2.3]}>
            <Html center distanceFactor={6} zIndexRange={[10, 0]}>
              <div
                style={{
                  padding: '8px 14px',
                  borderRadius: 12,
                  background: 'rgba(11,16,34,0.85)',
                  border: `1px solid ${it.color}66`,
                  color: it.color,
                  font: '700 13px Space Grotesk, Inter, sans-serif',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                  boxShadow: `0 0 24px ${it.color}33`,
                  pointerEvents: 'none',
                }}
              >
                {it.label}
              </div>
            </Html>
          </group>
        </Float>
      ))}
    </group>
  );
}

export function FaceScanScene({ cards = true }) {
  return (
    <Canvas camera={{ position: [0, 0, 5.2], fov: 45 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.6} />
      <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.5}>
        <FaceCloud />
      </Float>
      {cards && <OrbitingCards />}
      <Sparkles count={90} scale={[7, 5, 4]} size={2.2} speed={0.4} color="#a78bfa" />
    </Canvas>
  );
}

/* ------------------------------------------------------------ dashboard gauge */
function Gauge({ value }) {
  const arc = useRef();
  const group = useRef();
  const v = Math.max(0, Math.min(100, value || 0)) / 100;
  useFrame((s) => {
    if (group.current) {
      group.current.rotation.x = -0.35 + s.pointer.y * 0.2;
      group.current.rotation.y = s.pointer.x * 0.35;
    }
    if (arc.current) arc.current.rotation.z += 0.002;
  });
  return (
    <group ref={group}>
      <mesh>
        <torusGeometry args={[1.25, 0.11, 24, 160]} />
        <meshStandardMaterial color="#1e2546" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.25, 0.16, 24, 160, Math.max(0.0001, v * Math.PI * 2)]} />
        <meshStandardMaterial color="#22d3ee" emissive="#6366f1" emissiveIntensity={0.9} metalness={0.3} roughness={0.25} />
      </mesh>
      <mesh ref={arc}>
        <torusGeometry args={[1.62, 0.008, 8, 120]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
      </mesh>
      <Html center transform distanceFactor={2.6} pointerEvents="none">
        <div style={{ textAlign: 'center', pointerEvents: 'none', userSelect: 'none' }}>
          <div style={{ font: '700 64px Space Grotesk, Inter, sans-serif', color: '#e7ebff', lineHeight: 1 }}>{`${Math.round(v * 100)}%`}</div>
          <div style={{ font: '600 16px Inter, sans-serif', color: '#a3acd1', letterSpacing: '0.18em', marginTop: 8 }}>PRESENT TODAY</div>
        </div>
      </Html>
    </group>
  );
}

export function RateOrb({ value }) {
  return (
    <Canvas camera={{ position: [0, 0, 4.4], fov: 45 }} dpr={[1, 1.8]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 3, 4]} intensity={40} color="#a78bfa" />
      <pointLight position={[-3, -2, 3]} intensity={30} color="#22d3ee" />
      <Float speed={1.5} floatIntensity={0.4} rotationIntensity={0.1}>
        <Gauge value={value} />
      </Float>
      <Sparkles count={40} scale={[5, 3, 2]} size={1.6} speed={0.3} color="#22d3ee" />
    </Canvas>
  );
}
