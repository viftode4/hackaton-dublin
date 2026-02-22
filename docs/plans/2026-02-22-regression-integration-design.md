# Regression Model Integration Design

**Date:** 2026-02-22
**Status:** Approved

## Overview

Bring the trained Ridge Regression model (R²=0.87, MAE=57 gCO₂/kWh) to the frontend and use it for:
1. **Future CO₂ projections** — time slider + scenario presets (2025–2075)
2. **Live CO₂ on click** — instant client-side prediction, no backend dependency
3. **Compare panel enhancement** — predicted CO₂ + 2050 projection columns
4. **Ranking leaderboard** — top 10 greenest/dirtiest, reactive to year slider

## Part 1: Future CO₂ Prediction System

### Scenarios (3 presets)

| Scenario              | Coal Δ/yr | Clean Δ/yr | Description                   |
|-----------------------|-----------|------------|-------------------------------|
| Business as Usual     | -1%       | +1%        | Current trajectory continues  |
| Net Zero 2050         | -4%       | +4%        | Paris Agreement aligned       |
| Accelerated Transition| -6%       | +6%        | Aggressive decarbonization    |

### Projection Math

For year Y, given baseline features at 2025:
- `pct_coal(Y) = clamp(pct_coal_2025 × (1 - coal_rate)^(Y-2025), 0, 1)`
- `pct_clean(Y) = clamp(pct_clean_2025 × (1 + clean_rate)^(Y-2025), 0, 1)`
- `country_ci(Y)` derived: interpolate based on coal/clean shift ratio
- Other features (`emissions_per_capacity`, `idw_weighted_ci`, `emaps_zone_ci`) decay proportionally to coal decline
- Feed adjusted features into Ridge model → predicted CO₂ for that year

### Client-Side Model

The model is 7 coefficients + scaler (means/scales). Trivially computable in JS:
```
prediction = intercept + Σ(coeff[i] × (feature[i] - mean[i]) / scale[i])
clamp(prediction, 10, 1200)
```

No backend calls needed for projections.

### UI: Bottom Overlay Bar

Appears when CO₂ Heatmap toggle is on, positioned at bottom of globe area:

```
┌────────────────────────────────────────────────┐
│ [Net Zero 2050 ▼]  ▶  ═══════|══════  2045    │
└────────────────────────────────────────────────┘
```

- Scenario dropdown (left)
- Play/pause button (auto-advances ~1 yr/sec)
- Year slider 2025–2075 (center)
- Year readout (right)
- Dragging slider instantly recolors all country polygons on the globe

## Part 2: Live CO₂ on Click

### Current Problem
- `estimateCO2()` calls backend API, falls back to static/random data if unavailable
- Unknown countries get pseudo-random values (seed from lat/lng)

### Solution
- Client-side model replaces backend dependency for predictions
- Every click computes locally using country features from `COUNTRY_DATA`
- Unknown countries: use available partial features (at minimum `country_ci`)
- LocationDetailCard always shows "ML Prediction" badge with real confidence

## Part 3: Compare Panel Enhancement

Add two columns to the comparison table:
- **Predicted CO₂** — current model prediction (gCO₂/kWh)
- **2050 Projection** — predicted value under selected scenario at 2050
- Enables decision-making: "Location A is 420 now but 90 by 2050 under Net Zero"

## Part 4: Ranking Leaderboard

Collapsible section in controls panel or sidebar:
- "Top 10 Greenest" / "Top 10 Highest CO₂" lists
- Reactive to year slider — rankings reshuffle as year changes
- Each entry shows: country flag/name + predicted CO₂ value

## New Files

- `frontend/src/lib/regression-model.ts` — model coefficients, scaler, predict function, scenario definitions, projection logic
- `frontend/src/components/TimelineBar.tsx` — bottom overlay with scenario picker + year slider + play button

## Modified Files

- `frontend/src/lib/co2-api.ts` — use client-side model instead of backend call
- `frontend/src/components/GlobeView.tsx` — accept `projectionYear` + `scenario` props, recolor polygons
- `frontend/src/pages/Atlas.tsx` — manage timeline state, pass to GlobeView + panels
- `frontend/src/components/ComparePanel.tsx` — add prediction + projection columns
- `frontend/src/components/LocationDetailCard.tsx` — show ML prediction prominently

## Technical Notes

- Model JSON: `maps/trained_model.json` (7 coefficients, 7 means, 7 scales, intercept)
- All projections are deterministic given (country, year, scenario)
- Play animation uses `requestAnimationFrame` or `setInterval` at ~1 yr/sec
- Heatmap recolor should be < 16ms per frame (just re-feeding polygon data)
