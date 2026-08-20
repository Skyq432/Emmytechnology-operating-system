# EmmyTech OS 3D Shell — Open-source foundation

This V2 shell intentionally uses open-source 3D web tooling rather than a custom SVG renderer.

## Runtime dependencies

- Three.js — MIT — 3D/WebGL rendering engine.
- @react-three/fiber — MIT — React renderer for Three.js.
- @react-three/drei — MIT — reusable React Three Fiber helpers.

## Visual/interaction research

The shell was designed after reviewing open-source isometric/city projects, particularly:

- DanieloM83/THREE.js-Interactive-Isometric (MIT): GLTF scene loading, lighting, emissive materials, OrbitControls and smooth isometric interaction.
- amilich/isometric-city (MIT): Next.js 16 + TypeScript city UI, depth/layered isometric interaction, city growth concepts.
- lo-th/3d.city (MIT): browser-based Three.js city rendering and city-scale 3D interaction.
- pmndrs/react-three-next (MIT): Next.js + React Three Fiber application architecture.

No third-party binary building models are bundled in this V2. Buildings are currently generated from native Three.js geometry so the project can run without asset-license ambiguity. The scene is GLTF-ready, so CC0/MIT building packs can be swapped in later while keeping the EmmyTech module/growth logic.
