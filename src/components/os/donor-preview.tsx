"use client";

import { Canvas } from "@react-three/fiber";
import { Bounds, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";

const BLUE = "#032489";
const YELLOW = "#FFB100";

function Loading() {
  return (
    <Html center>
      <div style={{
        padding: "12px 16px",
        borderRadius: 12,
        background: "rgba(255,255,255,.94)",
        boxShadow: "0 10px 30px rgba(3,36,137,.12)",
        color: BLUE,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}>
        Loading 3d.city visual assets…
      </div>
    </Html>
  );
}

function DonorWorld() {
  const gltf = useGLTF("/assets/3dcity/world.glb");
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    const names: string[] = [];
    scene.traverse((obj) => {
      if (obj.name) names.push(obj.name);
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    console.log("[EmmyTech OS] 3d.city donor node names:", names);
  }, [scene]);

  return <primitive object={scene} />;
}

export default function DonorPreview() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#eef3f7",
      fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <header style={{
        height: 72,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        background: "white",
        borderBottom: "1px solid #dfe6ee",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: BLUE,
            color: YELLOW,
            fontWeight: 900,
            fontSize: 22,
          }}>E</div>
          <div>
            <div style={{ color: BLUE, fontWeight: 900, fontSize: 20 }}>EmmyTech OS</div>
            <div style={{ color: "#7c8da3", fontSize: 11, fontWeight: 700, letterSpacing: ".16em" }}>
              VISUAL DONOR INSPECTION
            </div>
          </div>
        </div>
        <div style={{ color: "#607086", fontSize: 13 }}>
          Drag to rotate • Scroll to zoom • Right-drag to pan
        </div>
      </header>

      <section style={{ padding: 20 }}>
        <div style={{
          height: "calc(100vh - 112px)",
          minHeight: 620,
          overflow: "hidden",
          borderRadius: 24,
          border: "1px solid #d7e0ea",
          background: "linear-gradient(180deg,#cfe7f7 0%,#eef5f2 48%,#dfe7dc 100%)",
          boxShadow: "0 20px 60px rgba(20,47,86,.10)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            zIndex: 3,
            top: 18,
            left: 18,
            maxWidth: 430,
            padding: "14px 16px",
            borderRadius: 16,
            background: "rgba(255,255,255,.92)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 12px 35px rgba(3,36,137,.10)",
          }}>
            <div style={{ color: BLUE, fontWeight: 900 }}>3d.city asset inspection</div>
            <div style={{ marginTop: 5, color: "#607086", lineHeight: 1.45, fontSize: 13 }}>
              This is only the donor visual library. We will keep useful buildings/environment pieces and discard the game simulation.
            </div>
          </div>

          <Canvas
            shadows
            dpr={[1, 1.75]}
            camera={{ position: [10, 8, 10], fov: 42, near: 0.01, far: 5000 }}
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => {
              gl.setClearColor(new THREE.Color("#d9edf8"), 1);
              gl.shadowMap.enabled = true;
              gl.shadowMap.type = THREE.PCFShadowMap;
            }}
          >
            <ambientLight intensity={1.6} />
            <hemisphereLight args={["#dff3ff", "#73866c", 2.1]} />
            <directionalLight
              castShadow
              position={[20, 30, 15]}
              intensity={3.2}
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
            />

            <Suspense fallback={<Loading />}>
              <Bounds fit clip observe margin={1.15}>
                <DonorWorld />
              </Bounds>
            </Suspense>

            <OrbitControls makeDefault enableDamping dampingFactor={0.06} />
          </Canvas>
        </div>
      </section>
    </main>
  );
}

useGLTF.preload("/assets/3dcity/world.glb");
