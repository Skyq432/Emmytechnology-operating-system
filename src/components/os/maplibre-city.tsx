'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, MercatorCoordinate, setWorkerUrl } from 'maplibre-gl';
import { Building2, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

type ModulePoint = {
  name: string;
  short: string;
  coordinates: [number, number];
  description: string;
  accent: 'blue' | 'yellow';
  model?: '/models/emmytech/hq.glb' | '/models/emmytech/crm.glb';
  rotation?: number;
};

const modules: ModulePoint[] = [
  {
    name: 'Headquarters', short: 'HQ', coordinates: [-74.00625, 40.71362],
    description: 'Executive overview and company command centre.', accent: 'blue',
    model: '/models/emmytech/hq.glb', rotation: -0.22,
  },
  {
    name: 'CRM', short: 'CRM', coordinates: [-74.00905, 40.71472],
    description: 'Customers, leads, funnel progress, blockers and next actions.', accent: 'blue',
    model: '/models/emmytech/crm.glb', rotation: 0.34,
  },
  { name: 'Sales', short: 'S', coordinates: [-74.0039, 40.71555], description: 'Quotations, orders, payments and customer conversion.', accent: 'yellow' },
  { name: 'Operations', short: 'OP', coordinates: [-74.0022, 40.71345], description: 'Inventory, fulfillment, delivery and process control.', accent: 'yellow' },
  { name: 'Marketing', short: 'MKT', coordinates: [-74.00325, 40.71125], description: 'Campaigns, ambassadors, referrals and acquisition.', accent: 'blue' },
  { name: 'Finance', short: 'FIN', coordinates: [-74.00615, 40.71055], description: 'Income, expenses, receivables and accounting.', accent: 'blue' },
  { name: 'Administration', short: 'ADM', coordinates: [-74.00935, 40.71165], description: 'Staff, roles, permissions, approvals and system settings.', accent: 'yellow' },
];

function makeModelLayer(mod: ModulePoint) {
  const coordinate = MercatorCoordinate.fromLngLat(mod.coordinates, 1.4);
  const meterScale = coordinate.meterInMercatorCoordinateUnits();
  const rotationX = Math.PI / 2;
  const rotationZ = mod.rotation ?? 0;

  const layer: any = {
    id: `emmy-model-${mod.short.toLowerCase()}`,
    type: 'custom',
    renderingMode: '3d',

    onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x59636e, 2.0));

      const key = new THREE.DirectionalLight(0xffffff, 3.0);
      key.position.set(60, 90, -55).normalize();
      this.scene.add(key);

      const fill = new THREE.DirectionalLight(0xffe4a3, 1.5);
      fill.position.set(-70, 40, 70).normalize();
      this.scene.add(fill);

      const loader = new GLTFLoader();
      loader.load(
        mod.model!,
        (gltf) => {
          gltf.scene.traverse((object: any) => {
            if (object.isMesh) {
              object.frustumCulled = false;
              if (object.material) {
                object.material.envMapIntensity = 0.65;
                object.material.needsUpdate = true;
              }
            }
          });
          this.scene.add(gltf.scene);
          map.triggerRepaint();
        },
        undefined,
        (error) => console.error(`Failed to load ${mod.name} model`, error),
      );

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
        antialias: true,
      });
      this.renderer.autoClear = false;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
    },

    render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: any) {
      const rx = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), rotationX);
      const rz = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), rotationZ);
      const mapProjection = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
      const modelMatrix = new THREE.Matrix4()
        .makeTranslation(coordinate.x, coordinate.y, coordinate.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rx)
        .multiply(rz);

      this.camera.projectionMatrix = mapProjection.multiply(modelMatrix);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };

  return layer;
}

export function EmmyRealCity() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [selected, setSelected] = useState<ModulePoint>(modules[0]);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const initial = useMemo(
    () => ({ center: [-74.0064, 40.7135] as [number, number], zoom: 15.75, pitch: 65, bearing: -26 }),
    [],
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: initial.center,
      zoom: initial.zoom,
      pitch: initial.pitch,
      bearing: initial.bearing,
      maxPitch: 80,
      canvasContextAttributes: { antialias: true },
      attributionControl: {},
    });

    mapRef.current = map;

    map.on('error', (event: any) => {
      const message = event?.error?.message || event?.message;
      if (message && !String(message).includes('sports_centre')) setMapError(String(message));
    });

    map.on('load', () => {
      setReady(true);

      const style = map.getStyle();
      const labelLayerId = style.layers?.find(
        (layer: any) => layer.type === 'symbol' && layer.layout?.['text-field'],
      )?.id;

      const buildingLayer: any = style.layers?.find(
        (layer: any) => layer['source-layer'] === 'building' && typeof layer.source === 'string',
      );

      if (buildingLayer && !map.getLayer('emmy-3d-buildings')) {
        map.addLayer(
          {
            id: 'emmy-3d-buildings',
            source: buildingLayer.source,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14.5,
            filter: ['!=', ['get', 'hide_3d'], true],
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
                0, '#edf1f5', 70, '#d9e0e8', 160, '#c6d0dc', 280, '#aebcca',
              ],
              'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                14.5, 0, 15.5, ['coalesce', ['get', 'render_height'], 12],
              ],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.91,
              'fill-extrusion-vertical-gradient': true,
            },
          } as any,
          labelLayerId,
        );
      }

      // Two architectural benchmark models. Everything else stays as the real city for now.
      modules.filter((mod) => mod.model).forEach((mod) => {
        const layer = makeModelLayer(mod);
        if (!map.getLayer(layer.id)) map.addLayer(layer, labelLayerId);
      });

      markersRef.current = modules.map((mod) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `emmy-map-marker ${mod.accent === 'yellow' ? 'emmy-map-marker-yellow' : ''}`;
        el.innerHTML = `<span>${mod.short}</span><strong>${mod.name}</strong>`;
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          setSelected(mod);
          map.flyTo({
            center: mod.coordinates,
            zoom: mod.model ? 17.5 : 17.0,
            pitch: 69,
            bearing: mod === modules[0] ? -33 : map.getBearing(),
            duration: 1200,
            essential: true,
          });
        });

        return new Marker({ element: el, anchor: 'bottom' }).setLngLat(mod.coordinates).addTo(map);
      });
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [initial]);

  const resetCamera = () => {
    mapRef.current?.flyTo({ ...initial, duration: 900, essential: true });
    setSelected(modules[0]);
  };

  return (
    <div className="min-h-screen bg-[#eef3f9] text-slate-950">
      <header className="flex h-[72px] items-center gap-4 border-b border-slate-200 bg-white px-5 md:px-7">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#032489] text-xl font-black text-[#ffb100]">E</div>
        <div>
          <div className="text-xl font-black tracking-tight text-[#032489]">EmmyTech OS</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Architectural benchmark</div>
        </div>
        <div className="ml-auto hidden rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 md:block">
          HQ + CRM benchmark • real city foundation
        </div>
      </header>

      <main className="relative h-[calc(100vh-72px)] min-h-[650px] overflow-hidden">
        <div ref={mapContainer} className="absolute inset-0" />

        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-[#eef3f9]">
            <div className="rounded-2xl bg-white px-6 py-4 text-sm font-bold text-[#032489] shadow-xl">Loading EmmyTech city…</div>
          </div>
        )}

        {mapError && (
          <div className="absolute right-6 top-20 max-w-sm rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-lg">
            {mapError}
          </div>
        )}

        <section className="pointer-events-none absolute left-5 top-5 max-w-[390px] md:left-8 md:top-8">
          <div className="pointer-events-auto rounded-[24px] border border-white/80 bg-white/94 p-5 shadow-2xl backdrop-blur-xl md:p-6">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#032489]">
              <Sparkles className="h-4 w-4 text-[#ffb100]" /> First architecture benchmark
            </div>
            <h1 className="text-2xl font-black leading-tight tracking-tight md:text-3xl">Judge HQ and CRM first.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              These two buildings set the quality standard. If they pass, the same architectural system expands to the rest of EmmyTech OS.
            </p>
          </div>
        </section>

        <section className="absolute bottom-5 left-5 right-5 md:bottom-8 md:left-8 md:right-auto md:w-[390px]">
          <div className="rounded-[24px] border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-black ${selected.accent === 'yellow' ? 'bg-[#ffb100] text-slate-950' : 'bg-[#032489] text-white'}`}>
                {selected.short}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-black">{selected.name}</div>
                  {selected.model && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">Premium model</span>}
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-500">{selected.description}</p>
              </div>
            </div>
            <button className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#032489] px-4 py-3 text-sm font-bold text-white hover:bg-[#021b68]">
              Enter {selected.name}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <button onClick={resetCamera} className="absolute right-5 top-5 flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-xs font-bold text-slate-600 shadow-lg backdrop-blur hover:bg-white md:right-8 md:top-8">
          <RotateCcw className="h-4 w-4" /> Reset city
        </button>

        <div className="pointer-events-none absolute bottom-4 right-4 hidden rounded-full bg-slate-950/70 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur md:block">
          Click HQ / CRM • drag to rotate • scroll to zoom
        </div>
      </main>
    </div>
  );
}
