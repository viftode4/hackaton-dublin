# Real-Time Satellite Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fake satellite positions with real SGP4 propagation for 5000+ satellites, add LOD rendering, and provide category filtering + search.

**Architecture:** Fetch all active TLEs from backend on mount, store raw TLE records in a ref, re-propagate positions every 3s using satellite.js SGP4. LOD system renders simple dots when zoomed out (pointsData) and full HTML satellite icons when zoomed in (htmlElementsData). Category filter chips on the globe overlay and a search/list sidebar for orbit mode.

**Tech Stack:** React, react-globe.gl, satellite.js, TypeScript, Tailwind CSS, shadcn/ui

---

### Task 1: Create satellite-store.ts — TLE storage, categorization, batch propagation

**Files:**
- Create: `frontend/src/lib/satellite-store.ts`

**Step 1: Create the satellite store module**

```typescript
import { computePosition, computeOrbitalMetrics, type TLERecord } from './tle-service';
import { getCarbonScoreColor, type SatelliteData } from './constants';

export type SatelliteCategory = 'station' | 'weather' | 'comms' | 'earth-obs' | 'navigation' | 'science' | 'other';

export const CATEGORY_LABELS: Record<SatelliteCategory, string> = {
  'station': 'Stations',
  'weather': 'Weather',
  'comms': 'Comms',
  'earth-obs': 'Earth Obs',
  'navigation': 'Navigation',
  'science': 'Science',
  'other': 'Other',
};

export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  'station': '#ff6b6b',
  'weather': '#4ecdc4',
  'comms': '#45b7d1',
  'earth-obs': '#96ceb4',
  'navigation': '#feca57',
  'science': '#a55eea',
  'other': '#778899',
};

const CATEGORY_PATTERNS: [RegExp, SatelliteCategory][] = [
  [/\bISS\b|ZARYA|TIANGONG|CSS\b|STATION/i, 'station'],
  [/NOAA|GOES|METOP|METEOSAT|HIMAWARI|DMSP|WEATHER|FENGYUN/i, 'weather'],
  [/STARLINK|ONEWEB|IRIDIUM|INMARSAT|INTELSAT|SES|GLOBALSTAR|ORBCOMM|TELESAT|VIASAT|O3B|TDRS/i, 'comms'],
  [/LANDSAT|SENTINEL|TERRA\b|AQUA\b|SUOMI|WORLDVIEW|PLEIADES|SPOT\b|RESOURCESAT|CBERS|EROS/i, 'earth-obs'],
  [/GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|COSMOS.*NAV|IRNSS/i, 'navigation'],
  [/HUBBLE|CHANDRA|JAMES WEBB|FERMI|SWIFT|NUSTAR|TESS\b|KEPLER|GAIA|PLANCK/i, 'science'],
];

/** Categorize a satellite by matching its name against known patterns */
export function categorizeSatellite(tle: TLERecord): SatelliteCategory {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(tle.OBJECT_NAME)) return category;
  }
  return 'other';
}

/** Batch-propagate all TLE records to current positions. Returns SatelliteData[]. */
export function propagateAll(tles: TLERecord[], date: Date = new Date()): SatelliteData[] {
  const results: SatelliteData[] = [];

  for (const tle of tles) {
    const pos = computePosition(tle, date);
    if (!pos) continue;

    const category = categorizeSatellite(tle);
    const metrics = computeOrbitalMetrics(tle);
    const carbonScore = Math.round(Math.max(50, 250 - metrics.powerAvailabilityW / 2));
    const isStationary = metrics.periodMinutes > 1400;

    results.push({
      id: `${tle.NORAD_CAT_ID}`,
      name: tle.OBJECT_NAME,
      noradId: tle.NORAD_CAT_ID,
      inclination: metrics.inclinationDeg,
      period: metrics.periodMinutes * 60,
      startLat: pos.lat,
      startLng: pos.lng,
      phase: 0,
      altitude: Math.min(pos.altitude / 6371 * 0.3, 0.5),
      altitudeKm: Math.round(pos.altitude),
      status: metrics.radiationLevel === 'low' ? 'OPTIMAL'
        : metrics.radiationLevel === 'moderate' ? 'CAUTION'
        : 'HIGH RADIATION',
      color: CATEGORY_COLORS[category],
      carbonScore,
      isStationary,
      lat: pos.lat,
      lng: pos.lng,
      eclipseFraction: metrics.eclipseFraction,
      radiationLevel: metrics.radiationLevel,
      powerAvailabilityW: metrics.powerAvailabilityW,
      latencyMs: metrics.latencyToGroundMs,
      apogeeKm: metrics.apogeeKm,
      perigeeKm: metrics.perigeeKm,
      category,
    });
  }

  return results;
}

/** Grid-based spatial clustering for zoomed-out view */
export interface SatelliteCluster {
  lat: number;
  lng: number;
  count: number;
  satellites: SatelliteData[];
  dominantCategory: SatelliteCategory;
  color: string;
}

export function clusterSatellites(satellites: SatelliteData[], cellSize = 5): SatelliteCluster[] {
  const grid = new Map<string, SatelliteData[]>();

  for (const sat of satellites) {
    const gx = Math.floor(sat.lat / cellSize);
    const gy = Math.floor(sat.lng / cellSize);
    const key = `${gx},${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(sat);
  }

  const clusters: SatelliteCluster[] = [];
  for (const [, sats] of grid) {
    const avgLat = sats.reduce((s, sat) => s + sat.lat, 0) / sats.length;
    const avgLng = sats.reduce((s, sat) => s + sat.lng, 0) / sats.length;

    // Find dominant category
    const catCount = new Map<SatelliteCategory, number>();
    for (const sat of sats) {
      const cat = (sat as any).category as SatelliteCategory || 'other';
      catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }
    let dominant: SatelliteCategory = 'other';
    let maxCount = 0;
    for (const [cat, count] of catCount) {
      if (count > maxCount) { maxCount = count; dominant = cat; }
    }

    clusters.push({
      lat: avgLat,
      lng: avgLng,
      count: sats.length,
      satellites: sats,
      dominantCategory: dominant,
      color: CATEGORY_COLORS[dominant],
    });
  }

  return clusters;
}
```

**Step 2: Add `category` field to SatelliteData interface**

In `frontend/src/lib/constants.ts`, add `category?: string;` to the `SatelliteData` interface (after `perigeeKm`).

**Step 3: Commit**

```bash
git add frontend/src/lib/satellite-store.ts frontend/src/lib/constants.ts
git commit -m "feat: add satellite store with TLE categorization and batch SGP4 propagation"
```

---

### Task 2: Rewire Atlas.tsx — fetch all TLEs, store records, real SGP4 interval

**Files:**
- Modify: `frontend/src/pages/Atlas.tsx`

**Step 1: Update imports**

Replace lines 3-4:

Old:
```typescript
import { GROUND_REGIONS, INITIAL_SATELLITES, updateSatellitePosition, getCarbonScoreColor, type GroundRegion, type SatelliteData } from '@/lib/constants';
import { fetchTLEGroup, computePosition, computeOrbitalMetrics, CURATED_SATELLITE_IDS } from '@/lib/tle-service';
```

New:
```typescript
import { GROUND_REGIONS, INITIAL_SATELLITES, getCarbonScoreColor, type GroundRegion, type SatelliteData } from '@/lib/constants';
import { fetchTLEGroup, type TLERecord } from '@/lib/tle-service';
import { propagateAll, type SatelliteCategory } from '@/lib/satellite-store';
```

**Step 2: Add TLE ref and filter state**

After `const [globalDatacenters, setGlobalDatacenters] = useState<DataCenter[]>([]);` (line 93), add:

```typescript
// TLE records for real-time SGP4 propagation
const tleRecordsRef = useRef<TLERecord[]>([]);
// Active satellite category filters (all on by default)
const [activeCategories, setActiveCategories] = useState<Set<SatelliteCategory>>(
  new Set(['station', 'weather', 'comms', 'earth-obs', 'navigation', 'science', 'other'])
);
const [satelliteSearch, setSatelliteSearch] = useState('');
```

**Step 3: Replace the TLE fetch useEffect (lines 147-210)**

Replace the entire `// Fetch real TLE satellite data` useEffect with:

```typescript
// Fetch ALL active TLE data from CelesTrak via backend proxy
useEffect(() => {
  async function loadAllTLEs() {
    try {
      // Fetch the full active catalog
      const tles = await fetchTLEGroup('active');
      console.log(`Fetched ${tles.length} TLE records from CelesTrak`);
      tleRecordsRef.current = tles;

      // Initial propagation
      const sats = propagateAll(tles);
      if (sats.length > 0) {
        console.log(`Propagated ${sats.length} satellite positions`);
        setSatellites(sats);
      }
    } catch (err) {
      console.warn('TLE fetch failed, trying stations group:', err);
      try {
        const tles = await fetchTLEGroup('stations');
        tleRecordsRef.current = tles;
        const sats = propagateAll(tles);
        if (sats.length > 0) setSatellites(sats);
      } catch {
        console.warn('All TLE fetches failed, using hardcoded satellites');
      }
    }
  }
  loadAllTLEs();
}, []);
```

**Step 4: Replace the satellite motion interval (lines 229-239)**

Replace the `// Satellite motion every 1s` useEffect with:

```typescript
// Real-time SGP4 propagation every 3s
useEffect(() => {
  const interval = setInterval(() => {
    if (tleRecordsRef.current.length === 0) return;
    const sats = propagateAll(tleRecordsRef.current);
    if (sats.length > 0) setSatellites(sats);
  }, 3000);
  return () => clearInterval(interval);
}, []);
```

**Step 5: Pass filter state down to GlobeView**

In the `<GlobeView>` JSX (around line 531), add these new props:

```
activeCategories={activeCategories}
onActiveCategoriesChange={setActiveCategories}
satelliteSearch={satelliteSearch}
onSatelliteSearchChange={setSatelliteSearch}
```

**Step 6: Commit**

```bash
git add frontend/src/pages/Atlas.tsx
git commit -m "feat: fetch all active TLEs and propagate positions with real SGP4 every 3s"
```

---

### Task 3: Update GlobeView — LOD rendering, orbit filter overlay, LIVE badge

**Files:**
- Modify: `frontend/src/components/GlobeView.tsx`

**Step 1: Update Props interface and imports**

Add to imports at top:
```typescript
import { type SatelliteCategory, CATEGORY_LABELS, CATEGORY_COLORS, clusterSatellites } from '@/lib/satellite-store';
```

Add to the `Props` interface (after `globalDatacenters`):
```typescript
activeCategories?: Set<SatelliteCategory>;
onActiveCategoriesChange?: (cats: Set<SatelliteCategory>) => void;
satelliteSearch?: string;
onSatelliteSearchChange?: (search: string) => void;
```

Add to the destructured props in the function signature.

**Step 2: Add filtered satellites memo**

After the `config` line (line 96), add:

```typescript
// Filter satellites by active categories and search
const filteredSatellites = useMemo(() => {
  let filtered = satellites;
  if (activeCategories && celestialBody === 'orbit') {
    filtered = filtered.filter(s => activeCategories.has((s as any).category || 'other'));
  }
  if (satelliteSearch && celestialBody === 'orbit') {
    const q = satelliteSearch.toLowerCase();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.noradId && String(s.noradId).includes(q))
    );
  }
  return filtered;
}, [satellites, activeCategories, satelliteSearch, celestialBody]);
```

**Step 3: LOD — add satellite dots to pointsData**

In the `pointsData` useMemo (line 180), change the opening check from:
```typescript
if (celestialBody !== 'earth') return [];
```
to:
```typescript
if (celestialBody === 'orbit') {
  // LOD: render satellites as simple dots when zoomed out
  const clusters = clusterSatellites(filteredSatellites);
  return clusters.map(c => ({
    lat: c.lat, lng: c.lng, alt: 0.08,
    color: c.color,
    radius: c.count > 5 ? 0.6 : c.count > 1 ? 0.4 : 0.25,
    label: c.count > 1
      ? `<b>${c.count} satellites</b><br/>${CATEGORY_LABELS[c.dominantCategory]}`
      : `<b>${c.satellites[0].name}</b><br/>Alt: ${c.satellites[0].altitudeKm?.toLocaleString()} km`,
  }));
}
if (celestialBody !== 'earth') return [];
```

Add `filteredSatellites` to the dependency array of this useMemo.

**Step 4: LOD — hide HTML elements when zoomed out in orbit mode**

In the `htmlElementsData` useMemo (around line 330), change the orbit block from:
```typescript
if (celestialBody === 'orbit') {
  return satellites.map(s => ({
    lat: s.lat, lng: s.lng, alt: s.altitude + 0.01,
    id: s.id, name: s.name, carbon: s.carbonScore, loc: s.status,
    isSatellite: true, isClickedPin: false, satData: s,
  }));
}
```
to:
```typescript
if (celestialBody === 'orbit') {
  // Only show detailed HTML elements when zoomed in enough
  if (camera.altitude > 1.8) return [];
  // Viewport-limit to nearest ~60 satellites
  return filteredSatellites
    .filter(s => {
      const dLat = Math.abs(s.lat - camera.lat);
      const dLng = Math.abs(((s.lng - camera.lng + 540) % 360) - 180);
      return dLat < 40 && dLng < 40;
    })
    .slice(0, 60)
    .map(s => ({
      lat: s.lat, lng: s.lng, alt: s.altitude + 0.01,
      id: s.id, name: s.name, carbon: s.carbonScore, loc: s.status,
      isSatellite: true, isClickedPin: false, satData: s,
    }));
}
```

Add `camera` and `filteredSatellites` to the dependency array.

**Step 5: Fix MIN_ALT clamping for orbit mode**

The current `handleZoom` clamps altitude to `MIN_ALT = 1.5`. For orbit mode we need actual altitude tracking. Change the clamping line inside `handleZoom` from:
```typescript
const clamped = { lat: pov.lat, lng: pov.lng, altitude: Math.max(pov.altitude, MIN_ALT) };
```
to:
```typescript
const minAlt = celestialBody === 'orbit' ? 0.5 : MIN_ALT;
const clamped = { lat: pov.lat, lng: pov.lng, altitude: Math.max(pov.altitude, minAlt) };
```

Add `celestialBody` to the `handleZoom` useCallback dependency array.

**Step 6: Add the orbit filter overlay**

Replace the orbit legend block (lines 575-583):
```jsx
{celestialBody === 'orbit' && (
  <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 text-[10px] space-y-1.5 max-w-[180px]">
    ...
  </div>
)}
```

With the new orbit overlay:
```jsx
{celestialBody === 'orbit' && (
  <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm border border-border rounded-lg p-3 text-[10px] space-y-2 max-w-[260px]">
    <div className="flex items-center justify-between">
      <p className="text-foreground font-semibold text-xs">Satellites</p>
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-green-400 font-mono text-[9px] font-bold">LIVE</span>
      </span>
    </div>
    <p className="text-muted-foreground font-mono">
      {filteredSatellites.length.toLocaleString()} of {satellites.length.toLocaleString()} visible
    </p>
    <div className="flex flex-wrap gap-1">
      {(Object.entries(CATEGORY_LABELS) as [SatelliteCategory, string][]).map(([cat, label]) => {
        const active = activeCategories?.has(cat) ?? true;
        return (
          <button
            key={cat}
            onClick={() => {
              if (!onActiveCategoriesChange || !activeCategories) return;
              const next = new Set(activeCategories);
              if (active) next.delete(cat); else next.add(cat);
              onActiveCategoriesChange(next);
            }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all ${
              active
                ? 'border-transparent text-white'
                : 'border-border text-muted-foreground bg-transparent opacity-50'
            }`}
            style={active ? { backgroundColor: CATEGORY_COLORS[cat] + 'cc' } : {}}
          >
            {label}
          </button>
        );
      })}
    </div>
  </div>
)}
```

**Step 7: Commit**

```bash
git add frontend/src/components/GlobeView.tsx
git commit -m "feat: add satellite LOD rendering, category filters, and LIVE badge"
```

---

### Task 4: Create OrbitSidebar — search + satellite list

**Files:**
- Create: `frontend/src/components/OrbitSidebar.tsx`

**Step 1: Create the orbit sidebar component**

```tsx
import { useState, useMemo } from 'react';
import { Search, Satellite, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { type SatelliteData } from '@/lib/constants';
import { type SatelliteCategory, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/satellite-store';

interface Props {
  satellites: SatelliteData[];
  search: string;
  onSearchChange: (q: string) => void;
  onSatelliteClick: (sat: SatelliteData) => void;
}

export default function OrbitSidebar({ satellites, search, onSearchChange, onSatelliteClick }: Props) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return satellites;
    const q = search.toLowerCase();
    return satellites.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.noradId && String(s.noradId).includes(q))
    );
  }, [satellites, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<SatelliteCategory, SatelliteData[]>();
    for (const sat of filtered) {
      const cat = ((sat as any).category || 'other') as SatelliteCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(sat);
    }
    // Sort categories by count descending
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Satellite className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Orbital Tracking</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search satellites..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          {filtered.length.toLocaleString()} satellites
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.map(([cat, sats]) => (
          <div key={cat}>
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/50"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="text-xs font-medium text-foreground">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({sats.length})
                </span>
              </div>
              <ChevronRight
                className={`w-3 h-3 text-muted-foreground transition-transform ${
                  expandedCat === cat ? 'rotate-90' : ''
                }`}
              />
            </button>
            {expandedCat === cat && (
              <div className="max-h-[300px] overflow-y-auto">
                {sats.slice(0, 100).map(sat => (
                  <button
                    key={sat.id}
                    onClick={() => onSatelliteClick(sat)}
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-accent/30 transition-colors text-left"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground truncate">{sat.name}</p>
                      <p className="text-[9px] text-muted-foreground font-mono">
                        {sat.altitudeKm?.toLocaleString()} km · {sat.status}
                      </p>
                    </div>
                  </button>
                ))}
                {sats.length > 100 && (
                  <p className="text-[9px] text-muted-foreground text-center py-1">
                    +{sats.length - 100} more (use search to filter)
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/OrbitSidebar.tsx
git commit -m "feat: add OrbitSidebar with search and categorized satellite list"
```

---

### Task 5: Wire OrbitSidebar into Atlas.tsx sidebar panel

**Files:**
- Modify: `frontend/src/pages/Atlas.tsx`

**Step 1: Import OrbitSidebar**

Add to imports:
```typescript
import OrbitSidebar from '@/components/OrbitSidebar';
```

**Step 2: Show OrbitSidebar when in orbit mode with 'map' tab**

In the `renderSidePanel` function, inside the `case 'map':` block (around line 427), wrap the existing sidebar content so OrbitSidebar shows when `celestialBody === 'orbit'`. Replace the `case 'map':` return with:

```tsx
case 'map':
  return (
    <div className="flex flex-col h-full">
      {selectedCountry?.co2 && (
        /* ... keep existing CountryCard block unchanged ... */
      )}
      {selectedLocation && !selectedCountry?.co2 && (
        /* ... keep existing LocationDetailCard block unchanged ... */
      )}
      <div className="flex-1 overflow-y-auto">
        {celestialBody === 'orbit' ? (
          <OrbitSidebar
            satellites={satellites}
            search={satelliteSearch}
            onSearchChange={setSatelliteSearch}
            onSatelliteClick={(sat) => {
              setZoomTarget({ lat: sat.lat, lng: sat.lng });
              handleLocationClick(sat.id, sat.name, 'orbit', sat.carbonScore, undefined, sat);
            }}
          />
        ) : (
          <Sidebar regions={regions} satellites={satellites} onRoutingComplete={setRoutingTarget} />
        )}
      </div>
    </div>
  );
```

**Step 3: Commit**

```bash
git add frontend/src/pages/Atlas.tsx
git commit -m "feat: wire OrbitSidebar into Atlas sidebar panel for orbit mode"
```

---

### Task 6: Remove unused updateSatellitePosition and clean up imports

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/components/GlobeView.tsx`

**Step 1: Remove `updateSatellitePosition` from constants.ts**

Delete the `updateSatellitePosition` export function (lines 116-124 in constants.ts).

**Step 2: Remove the import from GlobeView.tsx**

In line 3 of GlobeView.tsx, remove `updateSatellitePosition` from the import:
```typescript
import { GroundRegion, SatelliteData, getIntensityColor, USER_LOCATION } from '@/lib/constants';
```

**Step 3: Verify no other files reference updateSatellitePosition**

Run: `grep -r "updateSatellitePosition" frontend/src/`
Expected: no matches (Atlas.tsx import was already removed in Task 2)

**Step 4: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/components/GlobeView.tsx
git commit -m "chore: remove unused parametric satellite position model"
```

---

### Task 7: Test end-to-end — verify satellites render and update

**Step 1: Start the dev server**

```bash
cd frontend && bun run dev
```

**Step 2: Manual verification checklist**

- [ ] Navigate to /atlas, click "In Orbit" on the celestial switcher
- [ ] Console shows "Fetched N TLE records" with N > 1000
- [ ] Satellite dots appear on the globe (colored by category)
- [ ] LIVE badge pulses green in bottom-left overlay
- [ ] Category filter chips are visible — clicking one hides that category
- [ ] Count updates: "X of Y visible" reflects filter state
- [ ] Zoom in — dots transition to detailed satellite HTML icons with solar panels
- [ ] Sidebar shows OrbitSidebar with search box and categorized list
- [ ] Search for "ISS" — list filters to matching satellites
- [ ] Click a satellite in the sidebar — globe flies to it
- [ ] Wait 6+ seconds — positions visibly update (watch ISS move)
- [ ] Switch to Earth — normal datacenter view still works
- [ ] Switch back to In Orbit — satellites still rendering

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: real-time satellite tracking with 5000+ TLEs, LOD, filtering, and search"
```
