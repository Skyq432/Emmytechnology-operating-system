'use client';

import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EmmyModule, modules } from '../city-data';

const BLUE = '#032489';
const BLUE_DARK = '#011858';
const YELLOW = '#ffb100';
const GLASS = '#92c7ef';
const WHITE = '#f7fbff';

export function CityScene({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <>
      <color attach="background" args={['#ccecff']} />
      <ambientLight intensity={1.5} color="#e8f5ff" />
      <hemisphereLight args={['#d8efff', '#9fb574', 1.9]} />
      <directionalLight
        castShadow
        position={[-8, 15, 7]}
        intensity={3.4}
        color="#fff8df"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <WorldGround />
      <RoadNetwork />
      <WaterDetails />
      <Headquarters />
      {modules.map((module) => (
        <DepartmentBuilding
          key={module.id}
          module={module}
          selected={selectedId === module.id}
          onSelect={() => onSelect(module.id)}
        />
      ))}
      <Decorations />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={15}
        maxDistance={32}
        minPolarAngle={Math.PI / 4.7}
        maxPolarAngle={Math.PI / 2.7}
        minAzimuthAngle={-Math.PI / 4.5}
        maxAzimuthAngle={Math.PI / 4.5}
        target={[0, 1.2, 0]}
      />
    </>
  );
}

function WorldGround() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <circleGeometry args={[18, 96]} />
        <meshStandardMaterial color="#a7daf2" roughness={0.48} metalness={0.02} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.36, 0]} scale={[1.28, 0.98, 1]}>
        <circleGeometry args={[10.9, 96]} />
        <meshStandardMaterial color="#c8dca0" roughness={0.96} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} scale={[1.23, 0.93, 1]}>
        <circleGeometry args={[10.45, 96]} />
        <meshStandardMaterial color="#dce9b9" roughness={0.95} />
      </mesh>
    </group>
  );
}

function RoadNetwork() {
  return (
    <group position={[0, -0.21, 0]}>
      <Road position={[0, 0, 0.1]} scale={[15.7, 0.12, 1.12]} rotation={[0, 0.06, 0]} />
      <Road position={[0.2, 0, 3.3]} scale={[14.2, 0.12, 0.9]} rotation={[0, -0.04, 0]} />
      <Road position={[0.15, 0, -3.5]} scale={[13.8, 0.12, 0.94]} rotation={[0, 0.03, 0]} />
      <Road position={[-1.0, 0, 0.2]} scale={[1.0, 0.12, 11.5]} rotation={[0, -0.05, 0]} />
      <Road position={[3.8, 0, 1.2]} scale={[0.85, 0.12, 8.2]} rotation={[0, 0.16, 0]} />
      <Roundabout position={[-0.6, 0.12, 2.6]} />
      <RoadLines position={[0, 0.14, 0.1]} length={13.7} rotation={0.06} />
      <RoadLines position={[0.2, 0.14, -3.5]} length={11.8} rotation={0.03} />
    </group>
  );
}

function Road({ position, scale, rotation }: { position: [number, number, number]; scale: [number, number, number]; rotation: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={[scale[0], 0.08, scale[2]]} radius={0.12} smoothness={4} receiveShadow>
        <meshStandardMaterial color="#7d8793" roughness={0.88} />
      </RoundedBox>
      <RoundedBox args={[scale[0] + 0.3, 0.045, scale[2] + 0.3]} radius={0.14} smoothness={4} position={[0, -0.035, 0]}>
        <meshStandardMaterial color="#f7f8fa" roughness={1} />
      </RoundedBox>
    </group>
  );
}

function RoadLines({ position, length, rotation }: { position: [number, number, number]; length: number; rotation: number }) {
  const marks = Math.floor(length / 1.3);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: marks }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-length / 2 + 0.8 + i * 1.3, 0, 0.03]}>
          <planeGeometry args={[0.55, 0.035]} />
          <meshBasicMaterial color="#f7cf58" transparent opacity={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function Roundabout({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.35, 48]} />
        <meshStandardMaterial color="#7d8793" roughness={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[0.72, 48]} />
        <meshStandardMaterial color="#b8d28a" />
      </mesh>
      <Fountain position={[0, 0.12, 0]} />
    </group>
  );
}

function Fountain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.38, 0.45, 0.18, 32]} />
        <meshStandardMaterial color="#eef5f7" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.31, 0.31, 0.06, 32]} />
        <meshStandardMaterial color="#3fb4e8" roughness={0.25} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.08, 0.55, 18]} />
        <meshStandardMaterial color="#edf5f8" />
      </mesh>
    </group>
  );
}

function WaterDetails() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[7.5, -0.28, -5.1]}>
        <circleGeometry args={[2.1, 48]} />
        <meshStandardMaterial color="#84cce9" transparent opacity={0.72} roughness={0.25} />
      </mesh>
      <Boat position={[9.5, -0.15, 3.5]} rotation={-0.5} />
      <Boat position={[-10.7, -0.15, -2.8]} rotation={0.8} scale={0.78} />
    </group>
  );
}

function Headquarters() {
  return (
    <group position={[-0.6, 0, 0.7]}>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <cylinderGeometry args={[2.05, 2.2, 0.28, 48]} />
        <meshStandardMaterial color="#e5e8e7" roughness={0.9} />
      </mesh>
      <RoundedBox args={[3.1, 1.0, 2.1]} radius={0.16} smoothness={6} position={[0, 0.42, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#eef4fa" roughness={0.54} metalness={0.04} />
      </RoundedBox>
      <RoundedBox args={[2.3, 5.7, 1.65]} radius={0.12} smoothness={5} position={[0, 3.65, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#eef4fb" roughness={0.36} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0.61, 3.65, -0.84]} castShadow>
        <boxGeometry args={[0.92, 5.05, 0.08]} />
        <meshStandardMaterial color={BLUE} metalness={0.35} roughness={0.28} />
      </mesh>
      <mesh position={[-0.6, 3.65, -0.84]} castShadow>
        <boxGeometry args={[0.92, 5.05, 0.08]} />
        <meshStandardMaterial color="#2e71bd" metalness={0.3} roughness={0.25} />
      </mesh>
      <WindowWall width={2.0} height={4.5} rows={7} cols={4} position={[0, 3.7, 0.84]} color="#79b7e8" />
      <RoundedBox args={[2.6, 0.75, 1.0]} radius={0.08} smoothness={4} position={[0, 0.65, 1.1]} castShadow>
        <meshStandardMaterial color={BLUE} roughness={0.34} />
      </RoundedBox>
      <mesh position={[0, 0.64, 1.61]}>
        <planeGeometry args={[2.0, 0.45]} />
        <meshStandardMaterial color={YELLOW} emissive={YELLOW} emissiveIntensity={0.25} />
      </mesh>
      <Html center position={[0, 6.9, 0]} distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div className="city-label city-label-hq">EmmyTech HQ</div>
      </Html>
    </group>
  );
}

function DepartmentBuilding({ module, selected, onSelect }: { module: EmmyModule; selected: boolean; onSelect: () => void }) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const height = 1.25 + module.level * 1.08;
  const main = module.accent === 'yellow' ? YELLOW : BLUE;
  const dark = module.accent === 'yellow' ? '#bf7f00' : BLUE_DARK;

  useFrame((_, delta) => {
    if (!group.current) return;
    const targetY = hovered || selected ? 0.18 : 0;
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, targetY, 9, delta);
    const targetScale = selected ? 1.055 : hovered ? 1.025 : 1;
    const s = THREE.MathUtils.damp(group.current.scale.x, targetScale, 9, delta);
    group.current.scale.setScalar(s);
  });

  const pointer = (e: ThreeEvent<PointerEvent>, inside: boolean) => {
    e.stopPropagation();
    setHovered(inside);
    document.body.style.cursor = inside ? 'pointer' : 'default';
  };

  return (
    <group
      ref={group}
      position={module.position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => pointer(e, true)}
      onPointerOut={(e) => pointer(e, false)}
    >
      <DepartmentBase selected={selected} accent={main} />
      {module.kind === 'operations' ? (
        <OperationsBuilding height={height} main={main} dark={dark} />
      ) : module.kind === 'marketing' ? (
        <MarketingBuilding height={height} main={main} dark={dark} />
      ) : module.kind === 'finance' ? (
        <FinanceBuilding height={height} main={main} />
      ) : module.kind === 'administration' ? (
        <AdministrationBuilding height={height} main={main} dark={dark} />
      ) : module.kind === 'reports' ? (
        <ReportsBuilding height={height} main={main} dark={dark} />
      ) : (
        <TowerBuilding height={height} main={main} dark={dark} kind={module.kind} />
      )}

      <LevelMarker level={module.level} position={[0.86, height + 0.9, 0.2]} accent={main} />
      <Html center position={[0, height + 1.32, 0]} distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div className={`city-label ${module.accent === 'yellow' ? 'city-label-yellow' : ''}`}>{module.name}</div>
      </Html>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[1.18, 1.34, 48]} />
          <meshBasicMaterial color={YELLOW} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

function DepartmentBase({ selected, accent }: { selected: boolean; accent: string }) {
  return (
    <group>
      <RoundedBox args={[2.2, 0.22, 1.85]} radius={0.14} smoothness={5} position={[0, 0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#ecece6" roughness={0.93} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.145, 0]}>
        <ringGeometry args={[0.96, 1.03, 48]} />
        <meshBasicMaterial color={accent} transparent opacity={selected ? 0.85 : 0.24} />
      </mesh>
    </group>
  );
}

function TowerBuilding({ height, main, dark, kind }: { height: number; main: string; dark: string; kind: 'crm' | 'sales' }) {
  return (
    <group>
      <RoundedBox args={[1.45, height, 1.18]} radius={0.11} smoothness={5} position={[0, height / 2 + 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={WHITE} roughness={0.4} metalness={0.06} />
      </RoundedBox>
      <mesh position={[-0.66, height / 2 + 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, height - 0.1, 1.15]} />
        <meshStandardMaterial color={main} roughness={0.34} metalness={0.16} />
      </mesh>
      <mesh position={[0.72, height / 2 + 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, height - 0.1, 1.15]} />
        <meshStandardMaterial color={dark} roughness={0.32} metalness={0.18} />
      </mesh>
      <WindowWall width={1.1} height={height - 0.65} rows={Math.max(3, Math.floor(height * 1.6))} cols={3} position={[0, height / 2 + 0.23, 0.602]} color={kind === 'sales' ? '#78afe0' : GLASS} />
      <RoundedBox args={[0.72, 0.52, 0.42]} radius={0.07} smoothness={4} position={[0, 0.46, 0.78]} castShadow>
        <meshStandardMaterial color={main} />
      </RoundedBox>
      <Rooftop height={height} accent={main} />
    </group>
  );
}

function OperationsBuilding({ height, main, dark }: { height: number; main: string; dark: string }) {
  const h = Math.max(1.7, height * 0.68);
  return (
    <group>
      <RoundedBox args={[2.2, h, 1.55]} radius={0.12} smoothness={5} position={[0, h / 2 + 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f4f5f1" roughness={0.56} />
      </RoundedBox>
      <mesh position={[0.88, h / 2 + 0.18, 0.1]} castShadow>
        <boxGeometry args={[0.32, h - 0.2, 1.45]} />
        <meshStandardMaterial color={main} roughness={0.36} />
      </mesh>
      <mesh position={[-0.82, h * 0.64, 0.79]}>
        <boxGeometry args={[0.36, h * 0.72, 0.05]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      <WindowWall width={1.45} height={h - 0.55} rows={Math.max(2, Math.floor(h * 1.4))} cols={4} position={[-0.18, h / 2 + 0.2, 0.79]} color="#9ac6e8" />
      <mesh position={[-0.35, h + 0.42, 0]} castShadow>
        <boxGeometry args={[0.65, 0.42, 0.7]} />
        <meshStandardMaterial color="#768493" metalness={0.35} roughness={0.42} />
      </mesh>
      <mesh position={[0.45, h + 0.33, -0.15]} castShadow>
        <cylinderGeometry args={[0.27, 0.32, 0.52, 18]} />
        <meshStandardMaterial color="#9da7ae" metalness={0.4} roughness={0.38} />
      </mesh>
    </group>
  );
}

function MarketingBuilding({ height, main, dark }: { height: number; main: string; dark: string }) {
  const h = height * 0.92;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, h / 2 + 0.18, 0]}>
        <cylinderGeometry args={[0.8, 0.95, h, 32]} />
        <meshStandardMaterial color="#edf4f8" roughness={0.36} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, h / 2 + 0.25, 0.81]}>
        <boxGeometry args={[1.22, h * 0.58, 0.08]} />
        <meshStandardMaterial color={dark} emissive={main} emissiveIntensity={0.18} metalness={0.32} roughness={0.26} />
      </mesh>
      <WindowWall width={1.45} height={h - 0.75} rows={Math.max(3, Math.floor(h * 1.5))} cols={4} position={[0, h / 2 + 0.22, -0.805]} color="#6eb3e8" />
      <mesh position={[0, h + 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.92, 0.82, 0.26, 32]} />
        <meshStandardMaterial color={main} metalness={0.2} roughness={0.32} />
      </mesh>
    </group>
  );
}

function FinanceBuilding({ height, main }: { height: number; main: string }) {
  const h = Math.max(1.45, height * 0.58);
  return (
    <group>
      <RoundedBox args={[2.05, h, 1.55]} radius={0.06} smoothness={4} position={[0, h / 2 + 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f8f8f3" roughness={0.5} />
      </RoundedBox>
      {[-0.65, -0.22, 0.22, 0.65].map((x) => (
        <mesh key={x} position={[x, h * 0.48, 0.84]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, h * 0.72, 16]} />
          <meshStandardMaterial color="#dce4eb" roughness={0.54} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.28, 0]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[1.48, 1.48, 0.25]} />
        <meshStandardMaterial color={main} roughness={0.36} />
      </mesh>
      <RoundedBox args={[0.58, 0.55, 0.34]} radius={0.04} smoothness={3} position={[0, 0.45, 0.94]}>
        <meshStandardMaterial color={main} />
      </RoundedBox>
    </group>
  );
}

function AdministrationBuilding({ height, main, dark }: { height: number; main: string; dark: string }) {
  const h = Math.max(1.45, height * 0.62);
  return (
    <group>
      <RoundedBox args={[2.15, h, 1.6]} radius={0.14} smoothness={5} position={[0, h / 2 + 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f3f3ee" roughness={0.56} />
      </RoundedBox>
      <mesh position={[0, h * 0.58, 0.82]} castShadow>
        <boxGeometry args={[0.72, h * 0.72, 0.08]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      <mesh position={[0, h + 0.22, 0]} castShadow>
        <boxGeometry args={[2.0, 0.18, 1.48]} />
        <meshStandardMaterial color={main} roughness={0.34} />
      </mesh>
      <WindowWall width={1.78} height={h - 0.5} rows={Math.max(2, Math.floor(h * 1.35))} cols={5} position={[0, h / 2 + 0.2, -0.815]} color="#a6cbe8" />
    </group>
  );
}

function ReportsBuilding({ height, main, dark }: { height: number; main: string; dark: string }) {
  const h = Math.max(1.5, height * 0.66);
  return (
    <group>
      <RoundedBox args={[1.75, h, 1.5]} radius={0.12} smoothness={5} position={[0, h / 2 + 0.18, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f4f8fb" roughness={0.48} metalness={0.04} />
      </RoundedBox>
      <mesh position={[0, h * 0.54, 0.77]}>
        <boxGeometry args={[1.35, h * 0.58, 0.06]} />
        <meshStandardMaterial color={dark} emissive={main} emissiveIntensity={0.12} roughness={0.28} />
      </mesh>
      {[-0.42, 0, 0.42].map((x, i) => (
        <mesh key={x} position={[x, h * (0.42 + i * 0.07), 0.82]}>
          <boxGeometry args={[0.18, h * (0.22 + i * 0.08), 0.05]} />
          <meshStandardMaterial color={i === 1 ? YELLOW : '#4da6e8'} emissive={i === 1 ? YELLOW : '#4da6e8'} emissiveIntensity={0.32} />
        </mesh>
      ))}
      <Rooftop height={h} accent={main} />
    </group>
  );
}

function WindowWall({ width, height, rows, cols, position, color }: { width: number; height: number; rows: number; cols: number; position: [number, number, number]; color: string }) {
  const cells = useMemo(() => {
    const out: { x: number; y: number; lit: boolean }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          x: -width / 2 + (c + 0.5) * (width / cols),
          y: -height / 2 + (r + 0.5) * (height / rows),
          lit: (r * 3 + c * 5) % 7 === 0,
        });
      }
    }
    return out;
  }, [width, height, rows, cols]);

  return (
    <group position={position}>
      {cells.map((cell, index) => (
        <mesh key={index} position={[cell.x, cell.y, 0]}>
          <planeGeometry args={[Math.max(0.1, width / cols - 0.1), Math.max(0.09, height / rows - 0.13)]} />
          <meshStandardMaterial
            color={cell.lit ? '#ffd767' : color}
            emissive={cell.lit ? '#ffbf24' : '#193f68'}
            emissiveIntensity={cell.lit ? 0.45 : 0.04}
            roughness={0.18}
            metalness={0.22}
          />
        </mesh>
      ))}
    </group>
  );
}

function Rooftop({ height, accent }: { height: number; accent: string }) {
  return (
    <group position={[0, height + 0.32, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.0, 0.18, 0.82]} />
        <meshStandardMaterial color={accent} roughness={0.32} metalness={0.16} />
      </mesh>
      <mesh position={[0.3, 0.26, -0.1]} castShadow>
        <boxGeometry args={[0.28, 0.35, 0.32]} />
        <meshStandardMaterial color="#8797a4" metalness={0.38} roughness={0.42} />
      </mesh>
    </group>
  );
}

function LevelMarker({ level, position, accent }: { level: number; position: [number, number, number]; accent: string }) {
  return (
    <Html center position={position} distanceFactor={10} style={{ pointerEvents: 'none' }}>
      <div className="level-marker" style={{ borderColor: accent, color: accent }}>L{level}</div>
    </Html>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.72, 10]} />
        <meshStandardMaterial color="#7c5f3f" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.88, 0]}>
        <dodecahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color="#5f965b" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[-0.24, 0.77, 0.1]}>
        <dodecahedronGeometry args={[0.30, 0]} />
        <meshStandardMaterial color="#78aa70" roughness={0.96} />
      </mesh>
    </group>
  );
}

function StreetLamp({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.9, 10]} />
        <meshStandardMaterial color="#52606d" metalness={0.5} roughness={0.34} />
      </mesh>
      <mesh position={[0.1, 0.9, 0]} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.1]} />
        <meshStandardMaterial color="#687783" metalness={0.42} />
      </mesh>
      <pointLight position={[0.1, 0.87, 0]} intensity={0.25} distance={2.2} color="#ffd87b" />
    </group>
  );
}

function Boat({ position, rotation, scale = 1 }: { position: [number, number, number]; rotation: number; scale?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[1.0, 0.22, 0.38]} />
        <meshStandardMaterial color="#f7f7f3" roughness={0.48} />
      </mesh>
      <mesh position={[0.16, 0.32, 0]}>
        <boxGeometry args={[0.38, 0.23, 0.28]} />
        <meshStandardMaterial color={BLUE} roughness={0.32} />
      </mesh>
    </group>
  );
}

function Decorations() {
  const trees: [number, number, number, number][] = [
    [-8.2, 0, -4.5, 1.1], [-6.8, 0, -2.7, .85], [-8.6, 0, .7, .95], [-7.6, 0, 4.4, 1.0],
    [-5.8, 0, 5.6, .8], [-4.8, 0, -5.3, 1], [-1.0, 0, -5.8, .85], [1.2, 0, -5.7, .95],
    [4.8, 0, -5.2, 1.08], [7.6, 0, -3.9, .95], [8.2, 0, -1.8, .82], [7.8, 0, 2.2, 1.08],
    [7.0, 0, 5.5, .9], [3.8, 0, 6.5, .82], [.2, 0, 6.7, .95], [-2.5, 0, 6.4, .78],
    [-6.1, 0, 2.9, .76], [2.0, 0, 1.4, .6], [3.2, 0, 1.8, .62], [-2.5, 0, 1.0, .62],
  ];
  const lamps: [number, number, number, number][] = [
    [-6.2, 0, .4, 0], [-4.0, 0, .25, 0], [1.8, 0, .1, 0], [4.6, 0, .1, 0],
    [-2.8, 0, 3.0, 0], [2.3, 0, 3.2, 0], [5.6, 0, 3.5, 0], [-3.4, 0, -3.1, 0], [2.3, 0, -3.15, 0],
  ];
  return (
    <group>
      {trees.map(([x, y, z, s], i) => <Tree key={i} position={[x, y, z]} scale={s} />)}
      {lamps.map(([x, y, z, r], i) => <StreetLamp key={i} position={[x, y, z]} rotation={r} />)}
    </group>
  );
}
