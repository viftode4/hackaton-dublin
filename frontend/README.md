# Skyly — Frontend

Interactive 3D solar system explorer built with **React 19**, **Three.js**, and **TypeScript**.

## Tech Stack

- **React 19** with Vite bundler
- **Three.js** via React Three Fiber + drei (3D globe rendering)
- **react-globe.gl** (WebGL globe with location markers)
- **shadcn/ui** (Radix UI + Tailwind CSS)
- **Recharts** (portfolio analytics charts)
- **React Query** (data fetching and caching)
- **React Router v6** (client-side routing)
- **Zod + React Hook Form** (form validation)
- **satellite.js** (orbital propagation for satellite visualization)

## Pages

| Page | Description |
|------|-------------|
| `Landing8.tsx` | Cinematic 3D landing page with Earth/Sun/Mars scene |
| `Atlas.tsx` | Main application — 3D globe, AI panels, inventory |
| `Payment.tsx` | Stripe checkout for blueprint reports |
| `PaymentSuccess.tsx` | Post-payment confirmation |
| `Login.tsx` / `Signup.tsx` | Authentication |

## Key Components

| Component | Description |
|-----------|-------------|
| `GlobeView` | Three.js 3D globe with interactive location markers |
| `ChatPanel` | AI advisor chat interface with streaming responses |
| `ScorecardPanel` | 6-axis feasibility scorecard display |
| `InventoryPanel` | User's data center portfolio management |
| `ComparePanel` | Side-by-side location comparison |
| `RankingsPanel` | Location leaderboard by various metrics |
| `OrbitSidebar` | Satellite/orbit visualization controls |
| `LocationDetailCard` | Location details with purchase options |

## Setup

```bash
bun install
cp .env.example .env   # Set VITE_API_URL
bun run dev            # http://localhost:5173
```

## Scripts

```bash
bun run dev        # Development server
bun run build      # Production build
bun run preview    # Preview production build
bun run test       # Run tests (Vitest)
bun run test:watch # Watch mode
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000` | Backend API base URL |
