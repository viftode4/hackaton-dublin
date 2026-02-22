# Regression Model Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the trained Ridge Regression model client-side and use it for future CO₂ projections (time slider + scenarios), live predictions on click, compare panel enhancements, and a country ranking leaderboard.

**Architecture:** A new `regression-model.ts` module holds the model coefficients, scaler, prediction function, and scenario projection logic. A new `TimelineBar.tsx` component renders the bottom overlay. Atlas.tsx manages `projectionYear` and `scenario` state, passing them down to GlobeView (for heatmap recoloring) and ComparePanel (for projection columns). All computation is client-side — no backend calls needed.

**Tech Stack:** React, TypeScript, react-globe.gl, Tailwind CSS

---

### Task 1: Client-Side Regression Model Module

**Files:**
- Create: `frontend/src/lib/regression-model.ts`

**Step 1: Create the regression model module**

This file contains the model coefficients from `maps/trained_model.json`, the prediction function, scenario definitions, and projection logic.

```typescript
// frontend/src/lib/regression-model.ts

// ── Model coefficients from trained_model.json ──────────────────────
const MODEL = {
  features: [
    'country_ci', 'emissions_per_capacity', 'local_pct_coal',
    'local_pct_clean', 'idw_weighted_ci', 'country_ci_sq', 'emaps_zone_ci',
  ],
  scaler_mean: [362.909, 1349.833, 0.093, 0.682, 683.903, 186.404, 365.001],
  scaler_scale: [233.883, 968.316, 0.115, 0.224, 227.233, 201.939, 214.582],
  coefficients: [224.678, -17.126, 51.300, -4.456, 10.280, -84.809, 28.406],
  intercept: 332.952,
} as const;

// ── Scenario definitions ────────────────────────────────────────────
export type ScenarioId = 'bau' | 'net_zero' | 'accelerated';

export interface Scenario {
  id: ScenarioId;
  label: string;
  coalDeclineRate: number;   // annual fractional decline (e.g. 0.01 = 1%/yr)
  cleanGrowthRate: number;   // annual fractional growth
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  bau:         { id: 'bau',         label: 'Business as Usual',      coalDeclineRate: 0.01, cleanGrowthRate: 0.01 },
  net_zero:    { id: 'net_zero',    label: 'Net Zero 2050',          coalDeclineRate: 0.04, cleanGrowthRate: 0.04 },
  accelerated: { id: 'accelerated', label: 'Accelerated Transition', coalDeclineRate: 0.06, cleanGrowthRate: 0.06 },
};

// ── Feature vector for a single location ────────────────────────────
export interface LocationFeatures {
  country_ci: number;
  emissions_per_capacity: number;
  local_pct_coal: number;
  local_pct_clean: number;
  idw_weighted_ci: number;
  emaps_zone_ci: number;
}

// ── Core prediction ─────────────────────────────────────────────────
export function predictCO2(features: LocationFeatures): number {
  const raw = [
    features.country_ci,
    features.emissions_per_capacity,
    features.local_pct_coal,
    features.local_pct_clean,
    features.idw_weighted_ci,
    features.country_ci ** 2,          // country_ci_sq derived
    features.emaps_zone_ci,
  ];

  let prediction = MODEL.intercept;
  for (let i = 0; i < raw.length; i++) {
    const scaled = (raw[i] - MODEL.scaler_mean[i]) / MODEL.scaler_scale[i];
    prediction += MODEL.coefficients[i] * scaled;
  }

  return Math.max(10, Math.min(1200, prediction));
}

// ── Project features to a future year under a scenario ──────────────
export function projectFeatures(
  base: LocationFeatures,
  year: number,
  scenario: Scenario,
): LocationFeatures {
  const dt = year - 2025;
  if (dt <= 0) return base;

  const coalFactor = Math.pow(1 - scenario.coalDeclineRate, dt);
  const cleanFactor = Math.pow(1 + scenario.cleanGrowthRate, dt);

  const pctCoal = Math.max(0, Math.min(1, base.local_pct_coal * coalFactor));
  const pctClean = Math.max(0, Math.min(1, base.local_pct_clean * cleanFactor));

  // Fossil-linked features decay with coal
  const fossilDecay = coalFactor;
  const ciDecay = 1 - (1 - coalFactor) * 0.8; // CI doesn't drop as fast as coal alone

  return {
    country_ci: base.country_ci * ciDecay,
    emissions_per_capacity: base.emissions_per_capacity * fossilDecay,
    local_pct_coal: pctCoal,
    local_pct_clean: pctClean,
    idw_weighted_ci: base.idw_weighted_ci * ciDecay,
    emaps_zone_ci: base.emaps_zone_ci * ciDecay,
  };
}

// ── Convenience: predict CO2 for a location at a future year ────────
export function predictCO2AtYear(
  base: LocationFeatures,
  year: number,
  scenario: Scenario,
): number {
  const projected = projectFeatures(base, year, scenario);
  return predictCO2(projected);
}

// ── Extract features from COUNTRY_DATA entry ────────────────────────
// Maps the simpler COUNTRY_DATA format into full feature vector
export function countryDataToFeatures(
  co2Intensity: number,
  energyMix: string,
): LocationFeatures {
  const { pctCoal, pctClean } = parseEnergyMixFractions(energyMix);

  return {
    country_ci: co2Intensity,
    emissions_per_capacity: co2Intensity * 3.5,  // approximate from training data correlation
    local_pct_coal: pctCoal,
    local_pct_clean: pctClean,
    idw_weighted_ci: co2Intensity * 1.1,         // nearby zones similar to country avg
    emaps_zone_ci: co2Intensity,                 // zone CI ≈ country CI as default
  };
}

// ── Parse energy mix string to get coal and clean fractions ─────────
function parseEnergyMixFractions(mix: string): { pctCoal: number; pctClean: number } {
  let pctCoal = 0;
  let pctClean = 0;

  const parts = mix.split('/').map(s => s.trim().toLowerCase());
  for (const part of parts) {
    const match = part.match(/^(\d+)%?\s*(.+)/);
    if (!match) continue;
    const pct = parseInt(match[1], 10) / 100;
    const source = match[2].trim();

    if (source.includes('coal')) pctCoal += pct;
    if (['hydro', 'nuclear', 'wind', 'solar', 'geo', 'geothermal'].some(s => source.includes(s))) {
      pctClean += pct;
    }
  }

  return { pctCoal, pctClean };
}
```

**Step 2: Verify module compiles**

Run: `cd frontend && bunx tsc --noEmit src/lib/regression-model.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/lib/regression-model.ts
git commit -m "feat: add client-side regression model with scenario projections"
```

---

### Task 2: TimelineBar Component

**Files:**
- Create: `frontend/src/components/TimelineBar.tsx`

**Step 1: Create the timeline bar component**

```typescript
// frontend/src/components/TimelineBar.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { SCENARIOS, type ScenarioId } from '../lib/regression-model';

interface Props {
  year: number;
  onYearChange: (year: number) => void;
  scenario: ScenarioId;
  onScenarioChange: (scenario: ScenarioId) => void;
}

const MIN_YEAR = 2025;
const MAX_YEAR = 2075;

export default function TimelineBar({ year, onYearChange, scenario, onScenarioChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPlayback = useCallback(() => {
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      onYearChange(prev => {
        // This will be called via a setState updater in Atlas
        return prev;
      });
    }, 1000);
  }, [onYearChange]);

  // Advance year when playing
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onYearChange(year + 1);
    }, 800);
    return () => clearInterval(id);
  }, [playing, year, onYearChange]);

  // Stop at max
  useEffect(() => {
    if (year >= MAX_YEAR) stopPlayback();
  }, [year, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20
                    flex items-center gap-3 px-4 py-2
                    bg-black/70 backdrop-blur-md border border-white/10 rounded-full
                    text-white text-xs select-none">

      {/* Scenario picker */}
      <select
        value={scenario}
        onChange={e => onScenarioChange(e.target.value as ScenarioId)}
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs
                   outline-none cursor-pointer hover:bg-white/15 transition-colors"
      >
        {Object.values(SCENARIOS).map(s => (
          <option key={s.id} value={s.id} className="bg-gray-900">{s.label}</option>
        ))}
      </select>

      {/* Play / Pause */}
      <button
        onClick={() => playing ? stopPlayback() : startPlayback()}
        className="w-6 h-6 flex items-center justify-center rounded-full
                   bg-white/10 hover:bg-white/20 transition-colors"
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Year slider */}
      <input
        type="range"
        min={MIN_YEAR}
        max={MAX_YEAR}
        value={year}
        onChange={e => {
          stopPlayback();
          onYearChange(Number(e.target.value));
        }}
        className="w-48 accent-emerald-400 cursor-pointer"
      />

      {/* Year readout */}
      <span className="font-mono font-bold text-sm min-w-[3ch]">{year}</span>
    </div>
  );
}
```

**Step 2: Verify component compiles**

Run: `cd frontend && bunx tsc --noEmit src/components/TimelineBar.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/TimelineBar.tsx
git commit -m "feat: add TimelineBar component with scenario picker and playback"
```

---

### Task 3: Wire Timeline State into Atlas.tsx

**Files:**
- Modify: `frontend/src/pages/Atlas.tsx`

**Step 1: Add state and imports**

At the top of Atlas.tsx, add import for TimelineBar, ScenarioId, and the new state:

```typescript
// Add to imports (near line 1-15)
import TimelineBar from '../components/TimelineBar';
import { type ScenarioId } from '../lib/regression-model';
```

Add state declarations after existing state (around line 103):

```typescript
const [projectionYear, setProjectionYear] = useState(2025);
const [scenario, setScenario] = useState<ScenarioId>('net_zero');
```

**Step 2: Render TimelineBar conditionally**

In the JSX, after the GlobeView component (around line 559), render the TimelineBar when heatmap is enabled and on Earth:

```typescript
{dataLayers.heatmap && celestialBody === 'earth' && (
  <TimelineBar
    year={projectionYear}
    onYearChange={setProjectionYear}
    scenario={scenario}
    onScenarioChange={setScenario}
  />
)}
```

**Step 3: Pass projection props to GlobeView**

Add `projectionYear` and `scenario` to the GlobeView props (around line 530-559):

```typescript
<GlobeView
  // ...existing props...
  projectionYear={projectionYear}
  scenario={scenario}
/>
```

**Step 4: Verify it compiles (will have type error until Task 4)**

Run: `cd frontend && bun run build`
Expected: Type error about GlobeView not accepting projectionYear/scenario — that's fine, Task 4 fixes it.

**Step 5: Commit**

```bash
git add frontend/src/pages/Atlas.tsx
git commit -m "feat: wire timeline state into Atlas page"
```

---

### Task 4: Integrate Projections into GlobeView Heatmap

**Files:**
- Modify: `frontend/src/components/GlobeView.tsx`

This is the core visual change — the heatmap polygons recolor based on projected year.

**Step 1: Add props and imports**

Add to the Props interface (around line 19-40):

```typescript
projectionYear?: number;
scenario?: ScenarioId;
```

Add imports:

```typescript
import {
  type ScenarioId,
  SCENARIOS,
  countryDataToFeatures,
  predictCO2AtYear,
} from '../lib/regression-model';
```

**Step 2: Modify heatmap color computation**

In the polygon rendering section (around lines 593-625), change the color function to use projected predictions instead of raw `countryCO2` values.

Find the polygons altitude color accessor (the function that computes color from country name). Replace the color logic so that:

1. It looks up the country in `countryCO2`
2. If found, converts to features via `countryDataToFeatures`
3. Calls `predictCO2AtYear(features, projectionYear, SCENARIOS[scenario])`
4. Passes result to `getIntensityColor`

The key change is in the `polygonsCapColor` accessor — instead of:
```typescript
getIntensityColor(co2.co2_intensity_gco2) + '66'
```

It becomes:
```typescript
const features = countryDataToFeatures(co2.co2_intensity_gco2, co2.energy_mix);
const predicted = predictCO2AtYear(features, projectionYear ?? 2025, SCENARIOS[scenario ?? 'bau']);
getIntensityColor(predicted) + '66';
```

Also update the polygon label to show the projected value and year when year > 2025.

**Step 3: Update polygon hover label**

When `projectionYear > 2025`, show: `"Germany — 145 gCO₂/kWh (2045 est.)"` instead of just `"Germany — 380 gCO₂/kWh"`.

**Step 4: Verify heatmap recolors**

Run: `cd frontend && bun run dev`
- Toggle CO₂ Heatmap on
- Move the year slider — countries should visibly shift from red toward green
- "Accelerated Transition" should show dramatic color change by 2050

**Step 5: Commit**

```bash
git add frontend/src/components/GlobeView.tsx
git commit -m "feat: heatmap recolors based on projected year and scenario"
```

---

### Task 5: Client-Side Prediction on Click (Replace Backend Fallback)

**Files:**
- Modify: `frontend/src/lib/co2-api.ts`

**Step 1: Add client-side prediction to estimateCO2**

Import the regression model:

```typescript
import { countryDataToFeatures, predictCO2 } from './regression-model';
```

Modify the `estimateCO2` function (lines 135-191):

1. Keep the cache check as-is
2. Keep the COUNTRY_DATA lookup as-is
3. Replace the backend API call with client-side prediction:
   - If `baseData` exists: compute features via `countryDataToFeatures`, run `predictCO2`, return result with confidence 0.85
   - If no `baseData`: keep the lat/lng fallback but use a reasonable default CI based on latitude bands (equatorial = higher, northern = lower) instead of random

4. Remove the `fetch` call to `/api/predict/co2` entirely (the backend endpoint still exists but the frontend no longer needs it for this purpose).

**Step 2: Verify predictions work**

Run: `cd frontend && bun run dev`
- Click on Germany — should show a real ML prediction (~380 gCO₂/kWh), not random data
- Click on a country not in COUNTRY_DATA — should show a reasonable estimate, not random
- "ML predicted" badge should appear on LocationDetailCard

**Step 3: Commit**

```bash
git add frontend/src/lib/co2-api.ts
git commit -m "feat: use client-side regression model for CO2 predictions"
```

---

### Task 6: Compare Panel — Add Prediction & Projection Columns

**Files:**
- Modify: `frontend/src/components/ComparePanel.tsx`

**Step 1: Add projection columns to compare table**

Import the regression model:

```typescript
import {
  countryDataToFeatures,
  predictCO2,
  predictCO2AtYear,
  SCENARIOS,
} from '../lib/regression-model';
```

Add two new props to ComparePanel (or use a context/prop drill from Atlas):

```typescript
projectionYear?: number;
scenario?: ScenarioId;
```

In the metrics table rendering (around lines 163-183), add a new row at the top of the metrics table:

- **"Predicted CO₂"** — current model prediction in gCO₂/kWh
- **"2050 Projection"** — prediction at year 2050 under current scenario

These should be computed from each location's carbon intensity and energy mix using the regression model.

Color-code the cells: green for low (<200), yellow for medium (200-400), red for high (>400).

**Step 2: Pass scenario props from Atlas**

In Atlas.tsx, pass `projectionYear` and `scenario` to ComparePanel:

```typescript
<ComparePanel
  // ...existing props...
  projectionYear={projectionYear}
  scenario={scenario}
/>
```

**Step 3: Verify compare shows predictions**

Run: `cd frontend && bun run dev`
- Add 2+ locations to compare
- Compare tab should show "Predicted CO₂" and "2050 Projection" rows
- Change scenario in timeline — projection values should update

**Step 4: Commit**

```bash
git add frontend/src/components/ComparePanel.tsx frontend/src/pages/Atlas.tsx
git commit -m "feat: add CO2 prediction and projection columns to compare panel"
```

---

### Task 7: Country Ranking Leaderboard

**Files:**
- Modify: `frontend/src/components/GlobeView.tsx` (controls panel section)

**Step 1: Add ranking section to controls panel**

In the controls panel (around lines 649-719), add a collapsible "Rankings" section below the layer toggles. It should:

1. Compute predictions for all countries in `countryCO2` at the current `projectionYear` and `scenario`
2. Sort by predicted CO₂ ascending
3. Show "Top 5 Greenest" and "Top 5 Highest CO₂" as two mini-lists
4. Each entry: rank number + country name + predicted value in gCO₂/kWh
5. Color-code each entry using `getIntensityColor`

Only show rankings when heatmap is enabled and `projectionYear` is available.

The ranking should be wrapped in a `useMemo` that depends on `countryCO2`, `projectionYear`, and `scenario` to avoid recomputing on every render.

**Step 2: Verify rankings**

Run: `cd frontend && bun run dev`
- Toggle heatmap on — rankings appear below toggles
- Move year slider — rankings reshuffle
- "Accelerated Transition" at 2070 should show most countries very green

**Step 3: Commit**

```bash
git add frontend/src/components/GlobeView.tsx
git commit -m "feat: add country CO2 ranking leaderboard to controls panel"
```

---

### Task 8: Final Integration Test & Cleanup

**Step 1: Full smoke test**

Run: `cd frontend && bun run dev`

Test the complete flow:
1. Load app → globe shows with heatmap colored by current (2025) predictions
2. Timeline bar visible at bottom with "Net Zero 2050" selected
3. Drag slider to 2050 → countries shift noticeably greener
4. Hit play → auto-advances year, heatmap animates smoothly
5. Switch to "Business as Usual" → colors barely change over time
6. Switch to "Accelerated" → dramatic green shift by 2040
7. Click a country → LocationDetailCard shows ML prediction badge
8. Click "Compare" on 2+ locations → compare tab shows prediction + projection columns
9. Rankings in controls panel update as slider moves

**Step 2: Build check**

Run: `cd frontend && bun run build`
Expected: No errors, no warnings

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete regression model integration with projections, compare, and rankings"
```
