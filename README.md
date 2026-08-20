# EmmyTech OS — 3D City Shell V2

Standalone Next.js project for the EmmyTech company operating system.

## What changed from V1

V1 used hand-drawn SVG buildings. V2 replaces the city renderer with a true WebGL 3D scene using Three.js + React Three Fiber.

- Real 3D geometry and perspective/isometric camera
- Directional lighting, soft shadows, glass/windows and emissive details
- Orbit/zoom camera controls
- Clickable department buildings
- Building height driven by module level
- Distinct architecture for CRM, Sales, Operations, Marketing, Finance, Reports and Administration
- EmmyTech brand colors #032489 and #FFB100
- Standalone project: not built inside Ambassador

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000

See `OPEN_SOURCE_NOTES.md` for the open-source foundation and license notes.
