'use client';

import { Canvas } from '@react-three/fiber';
import { ChevronRight, MousePointer2, Rotate3D, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { modules } from './city-data';
import { CityScene } from './three/city-scene';

export function EmmyCityMap() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState('crm');
  const selected = useMemo(() => modules.find((module) => module.id === selectedId) ?? modules[0], [selectedId]);

  return (
    <section className="relative h-[calc(100vh-100px)] min-h-[690px] w-full overflow-hidden rounded-[30px] border border-white/70 bg-[#ccecff] shadow-[0_24px_70px_rgba(7,31,76,0.16)]">
      <div className="absolute inset-0">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [15, 12, 15], fov: 42, near: 0.1, far: 120 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={({ gl, camera }) => {
            gl.setClearColor('#ccecff', 1);
            camera.lookAt(0, 1.2, 0);
          }}
          onPointerMissed={() => setSelectedId('crm')}
        >
          <CityScene selectedId={selectedId} onSelect={setSelectedId} />
        </Canvas>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/45 via-white/10 to-transparent" />

      <div className="pointer-events-none absolute left-5 top-5 z-20 md:left-8 md:top-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/78 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#032489] shadow-sm backdrop-blur-xl">
          <Sparkles className="h-3.5 w-3.5 text-[#ffb100]" /> EmmyTech world
        </div>
        <div className="mt-3 max-w-lg rounded-[22px] border border-white/70 bg-white/82 px-5 py-4 shadow-[0_15px_35px_rgba(3,36,137,0.10)] backdrop-blur-xl">
          <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-[25px]">Your company, alive in one place.</h1>
          <p className="mt-1.5 max-w-md text-[13px] leading-5 text-slate-600">
            Every building is a real EmmyTech module. Buildings grow as departments mature and their data expands.
          </p>
        </div>
      </div>

      <div className="absolute right-5 top-5 z-20 hidden items-center gap-2 rounded-full border border-white/70 bg-white/78 px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur-xl md:flex">
        <Rotate3D className="h-4 w-4 text-[#032489]" /> Drag to orbit
        <span className="h-4 w-px bg-slate-200" />
        <MousePointer2 className="h-4 w-4 text-[#ffb100]" /> Click a building
      </div>

      <div className="absolute bottom-5 left-5 right-5 z-30 md:bottom-7 md:left-8 md:right-auto md:w-[395px]">
        <div className="rounded-[24px] border border-white/80 bg-white/94 p-4 shadow-[0_22px_60px_rgba(3,36,137,0.20)] backdrop-blur-2xl">
          <div className="flex items-start gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${selected.accent === 'yellow' ? 'bg-[#ffb100] text-slate-950' : 'bg-[#032489] text-white'}`}>
              {selected.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-950">{selected.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">{selected.status}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{selected.description}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="Building level" value={`Level ${selected.level} / 5`} />
            <Metric label="State" value={selected.metric} />
          </div>

          <button
            onClick={() => router.push(`/modules/${selected.id}`)}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-[#032489] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#021b68]"
          >
            Enter {selected.name}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-7 right-7 hidden rounded-2xl border border-white/70 bg-white/72 px-3 py-2 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur-xl lg:block">
        3D shell prototype · scroll to zoom
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
