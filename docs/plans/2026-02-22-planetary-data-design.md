# Planetary Data: Full Planetary Intelligence Design

**Date:** 2026-02-22
**Approach:** A — Maximum Impact
**Goal:** Replace all mocked data with real NASA/ESA/CelesTrak sources across all celestial bodies

## Current State

| Body | Data | Status |
|------|------|--------|
| Earth | 133+ countries real CO2, ML prediction, 7 datacenter regions | Solid |
| Orbit/Satellites | 10 hardcoded fake satellites, trig orbits | 100% mocked |
| Moon | 4 hardcoded locations, carbonIntensity: 0, no visible pins | Placeholder |
| Mars | 5 hardcoded locations, carbonIntensity: 0, no visible pins | Placeholder |

## Target State

### 1. Satellites / Orbit — Real TLE Tracking + Datacenter Feasibility

**Data sources:**
- CelesTrak GP endpoint (`celestrak.org/NORAD/elements/gp.php`) via backend proxy
- `satellite.js` library for real-time position computation from TLE data
- Physics constants for power/eclipse/radiation calculations

**What changes:**
- Replace 10 hardcoded satellites with ~50 real satellites from TLE data
- Real-time positions computed client-side via satellite.js
- Each satellite gets computed feasibility metrics:
  - Power availability (solar irradiance minus eclipse fraction)
  - Latency to nearest ground station
  - Radiation exposure estimate by altitude/inclination
  - Orbital period, altitude from real TLE data
- Frame as "orbital datacenter candidates" with real comparative scores
- Backend: new endpoint to proxy CelesTrak TLE data, cache daily

### 2. Moon — NASA LRO Data + USGS Named Features

**Data sources:**
- NASA SVS CGI Moon Kit: `lroc_color_2k.jpg` (447KB texture), `ldem_3_8bit.jpg` (109KB bump)
- NASA SVS Lunar South Pole Illumination imagery
- USGS Planetary Names: Moon named features shapefile → GeoJSON
- Hardcoded real data from LRO measurements (temperature, illumination %)

**What changes:**
- Replace current moon.jpg with NASA's higher-quality LRO texture
- Add bump/displacement map for 3D terrain
- Render USGS named features as clickable pins/regions on the globe
- ~15-20 curated locations with real feasibility data:
  - Solar illumination % (from LRO polar illumination data)
  - Surface temperature range (from DIVINER published summaries)
  - Terrain difficulty score
  - Distance to permanently shadowed regions (water ice)
- Polar illumination heatmap overlay (static image from NASA SVS)
- Each location gets datacenter feasibility score based on real data

### 3. Mars — USGS Geologic Map + Crater Database + Dust Storms

**Data sources:**
- USGS Mars geologic map units via pygeoapi (polygon regions like countries)
- USGS Mars crater database (filtered to >50km craters)
- Mars Dust Activity Database from Zenodo (storm frequency by region)
- NASA TM-102299 solar irradiance by latitude/season
- MOLA topography data for elevation

**What changes:**
- USGS geologic map unit polygons rendered as clickable regions (like Earth's country heatmap)
- Each region gets real feasibility data:
  - Solar irradiance (W/m^2) by latitude and season
  - Dust storm frequency (events/Mars-year) from Zenodo dataset
  - Elevation from MOLA
  - Geologic unit type (terrain stability)
  - Communication delay to Earth (4-24 min one-way)
- Mars crater overlay showing major features
- Datacenter feasibility heatmap colored by composite score

### 4. Cross-Body Comparison

All bodies feed into the existing Compare panel with real, sourced data:
- Earth: CO2 intensity, energy mix, cost
- Orbit: Power availability, eclipse fraction, latency, radiation
- Moon: Solar illumination, temperature, terrain, water ice proximity
- Mars: Solar irradiance, dust risk, terrain, comms delay

## Data Pipeline

1. **One-time preprocessing** (build script):
   - Download USGS shapefiles → convert to GeoJSON
   - Download Mars crater CSV → filter + convert to JSON
   - Download Mars dust storm CSV → aggregate by region → JSON
   - Download NASA SVS textures → place in public/

2. **Backend additions:**
   - CelesTrak TLE proxy endpoint (cached daily)
   - Serve preprocessed GeoJSON data

3. **Frontend additions:**
   - `satellite.js` for TLE → lat/lng computation
   - New data layers for moon/mars region rendering
   - Feasibility scoring engine per body type
   - Updated pins/markers for moon and mars globes

## Key Libraries

- `satellite.js` — SGP4/SDP4 orbital propagation from TLE data
- `shapefile` (npm) — one-time conversion of USGS shapefiles to GeoJSON
- Existing `react-globe.gl` — already supports polygons, points, labels
