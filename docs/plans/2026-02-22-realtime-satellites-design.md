# Real-Time Satellite Tracking — Design

**Date:** 2026-02-22
**Status:** Approved

## Problem

The "In Orbit" tab has TLE infrastructure but:
1. Satellite positions degrade to a fake parametric sine-wave model after initial load
2. Only 13 curated satellites shown — CelesTrak has 5000+ active
3. Orbit trajectory paths are disabled (hardcoded empty array)
4. No filtering/search for managing large satellite counts

## Solution

### Data Flow

```
CelesTrak (via backend /api/tle?group=active)
  → Fetch ALL active TLEs on mount (~5000 records)
  → Store TLERecord[] in useRef
  → Every 3s: batch SGP4 propagation via satellite.js → setSatellites()
  → LOD system picks render mode based on camera.altitude
  → Category + search filters reduce visible set
```

### TLE Storage & Propagation

New file: `frontend/src/lib/satellite-store.ts`
- Module-level TLE record storage
- `propagateAll(tles, date)` — batch SGP4 for all records, returns SatelliteData[]
- `categorizeSatellite(tle)` — parses OBJECT_NAME to assign category
- Categories: Stations, Weather, Comms, EarthObs, Navigation, Science, Other

Performance: 5000 SGP4 propagations × ~0.05ms = ~250ms every 3s. Fine on main thread.

### Rendering LOD

| Zoom (altitude) | Method | Detail |
|---|---|---|
| > 1.5 (far) | `pointsData` | Colored 2px dots, grid-based clustering (5° cells, count badge at 3+) |
| <= 1.5 (close) | `htmlElementsData` | Full satellite icons with solar panels + tooltip (viewport-limited) |

Camera altitude already tracked via existing `handleZoom`. Switch is conditional in useMemo blocks.

### Filter UI

**Globe overlay** (when celestialBody === 'orbit'):
- Category toggle chips: Stations, Weather, Comms, EarthObs, Nav, Science, Other
- All on by default, click to toggle
- Count display: "2,847 of 5,124 visible"
- Pulsing "LIVE" badge

**Sidebar** (orbit mode):
- Search box (filters by name, NORAD ID)
- Scrollable satellite list sorted by name
- Each row: name, category chip, altitude, status dot
- Click → globe flies to satellite, opens detail card

### Changes Summary

| File | Change |
|---|---|
| `lib/satellite-store.ts` | NEW — TLE storage, batch propagation, categorization |
| `pages/Atlas.tsx` | Fetch all active TLEs, store in ref, 3s propagation interval, filter state |
| `components/GlobeView.tsx` | LOD rendering (points vs HTML), orbit overlay panel, LIVE badge |
| `components/OrbitSidebar.tsx` | NEW — search + satellite list for orbit mode |
| `lib/constants.ts` | Remove `updateSatellitePosition` (replaced by real SGP4) |
