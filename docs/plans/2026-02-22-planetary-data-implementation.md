# Full Planetary Intelligence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mocked satellite, moon, and mars data with real NASA/ESA/CelesTrak sources, making every celestial body as data-rich as Earth.

**Architecture:** Five phases — (1) data preprocessing scripts that download & convert NASA/USGS datasets, (2) backend additions for TLE proxy and enriched location data, (3) frontend satellite.js integration for real orbital positions, (4) moon & mars visual data layers with region overlays, (5) unified cross-body comparison with real feasibility scoring.

**Tech Stack:** satellite.js (orbital propagation), CelesTrak GP API (TLE data), USGS Planetary Names shapefiles (moon/mars features), Mars Dust Activity Database (Zenodo), NASA SVS textures, existing react-globe.gl + Rails 7.1 backend.

---

## Phase 1: Data Preprocessing Pipeline

### Task 1: Create Data Preprocessing Infrastructure

**Files:**
- Create: `scripts/preprocess/package.json`
- Create: `scripts/preprocess/download-textures.mjs`

**Step 1: Create the preprocessing package**

```bash
mkdir -p scripts/preprocess
cd scripts/preprocess
```

Create `scripts/preprocess/package.json`:
```json
{
  "name": "orbital-atlas-preprocessing",
  "private": true,
  "type": "module",
  "scripts": {
    "textures": "node download-textures.mjs",
    "moon-features": "node convert-moon-features.mjs",
    "mars-features": "node convert-mars-features.mjs",
    "mars-dust": "node process-mars-dust.mjs",
    "all": "npm run textures && npm run moon-features && npm run mars-features && npm run mars-dust"
  },
  "dependencies": {
    "shapefile": "^0.6.6",
    "adm-zip": "^0.5.10"
  }
}
```

**Step 2: Create texture downloader**

Create `scripts/preprocess/download-textures.mjs`:
```js
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const TEXTURES = [
  // NASA SVS CGI Moon Kit — 2K color map (447 KB)
  {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg',
    dest: '../../frontend/public/textures/moon-nasa.jpg',
    desc: 'Moon surface (LRO, 2K)',
  },
  // NASA SVS Moon elevation/bump map (109 KB)
  {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
    dest: '../../frontend/public/textures/moon-bump.jpg',
    desc: 'Moon bump map (LOLA)',
  },
];

async function download(url, dest, desc) {
  if (existsSync(dest)) {
    console.log(`  SKIP ${desc} — already exists`);
    return;
  }
  console.log(`  Downloading ${desc}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  DONE ${dest} (${(buf.length / 1024).toFixed(0)} KB)`);
}

console.log('Downloading textures...');
for (const t of TEXTURES) {
  await download(t.url, t.dest, t.desc);
}
console.log('All textures downloaded.');
```

**Step 3: Install deps and run**

```bash
cd scripts/preprocess && npm install && npm run textures
```

Expected: `moon-nasa.jpg` and `moon-bump.jpg` appear in `frontend/public/textures/`.

**Step 4: Commit**

```bash
git add scripts/preprocess/package.json scripts/preprocess/download-textures.mjs frontend/public/textures/moon-nasa.jpg frontend/public/textures/moon-bump.jpg
git commit -m "feat: add data preprocessing pipeline + NASA moon textures"
```

---

### Task 2: Convert USGS Moon Named Features to GeoJSON

**Files:**
- Create: `scripts/preprocess/convert-moon-features.mjs`
- Create: `frontend/public/data/moon-features.json`

**Step 1: Write the converter**

Create `scripts/preprocess/convert-moon-features.mjs`:
```js
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { open } from 'shapefile';
import AdmZip from 'adm-zip';

const SHAPEFILE_URL = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip';
const OUTPUT_PATH = '../../frontend/public/data/moon-features.json';
const TMP_DIR = './tmp';

// Feature types relevant for datacenter placement
const RELEVANT_TYPES = ['Crater', 'Mare', 'Mons', 'Planitia', 'Lacus', 'Palus', 'Promontorium', 'Vallis', 'Rima', 'Sinus'];
const MIN_DIAMETER_KM = 20; // Only features >= 20km diameter

async function run() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });
  if (!existsSync('../../frontend/public/data')) await mkdir('../../frontend/public/data', { recursive: true });

  console.log('Downloading USGS Moon nomenclature shapefile...');
  const res = await fetch(SHAPEFILE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zipPath = `${TMP_DIR}/moon_nomenclature.zip`;
  await writeFile(zipPath, buf);

  console.log('Extracting...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(TMP_DIR, true);

  // Find the .shp file
  const shpFile = zip.getEntries().find(e => e.entryName.endsWith('.shp'));
  if (!shpFile) throw new Error('No .shp found in zip');
  const shpPath = `${TMP_DIR}/${shpFile.entryName}`;
  const dbfPath = shpPath.replace('.shp', '.dbf');

  console.log('Parsing shapefile...');
  const source = await open(shpPath, dbfPath);
  const features = [];

  while (true) {
    const result = await source.read();
    if (result.done) break;
    const props = result.value.properties;
    const geom = result.value.geometry;

    // Filter: only relevant types, minimum size
    if (!RELEVANT_TYPES.includes(props.type)) continue;
    const diam = props.diameter || 0;
    if (diam < MIN_DIAMETER_KM && props.type === 'Crater') continue;

    features.push({
      name: props.name,
      type: props.type,
      lat: geom.coordinates[1],
      lng: geom.coordinates[0],
      diameter_km: diam,
      approval_year: props.approval_year || null,
    });
  }

  console.log(`Extracted ${features.length} moon features (filtered from USGS database)`);
  await writeFile(OUTPUT_PATH, JSON.stringify(features, null, 2));
  console.log(`Saved to ${OUTPUT_PATH}`);
}

run().catch(console.error);
```

**Step 2: Run it**

```bash
cd scripts/preprocess && npm run moon-features
```

Expected: `frontend/public/data/moon-features.json` with ~200-500 named features.

**Step 3: Commit**

```bash
git add scripts/preprocess/convert-moon-features.mjs frontend/public/data/moon-features.json
git commit -m "feat: convert USGS moon nomenclature to JSON (craters, maria, mountains)"
```

---

### Task 3: Convert USGS Mars Features + Geologic Map to GeoJSON

**Files:**
- Create: `scripts/preprocess/convert-mars-features.mjs`
- Create: `frontend/public/data/mars-features.json`
- Create: `frontend/public/data/mars-geology.json`

**Step 1: Write the Mars converter**

Create `scripts/preprocess/convert-mars-features.mjs` — same pattern as moon but from `MARS_nomenclature_center_pts.zip`.

Additionally, fetch Mars geologic map units from the USGS pygeoapi:
```
GET https://astrogeology.usgs.gov/pygeoapi/collections/mars/sim3292_global_geologic_map/units/items?f=json&limit=200
```

This returns actual polygon regions (like countries on Earth). Save as `mars-geology.json`.

If the pygeoapi is unreachable (CORS/availability), fall back to generating approximate region polygons from the named features (cluster craters into regions of ~30° lat/lng).

**Step 2: Run and verify**

```bash
cd scripts/preprocess && npm run mars-features
```

Expected: `mars-features.json` with named craters/volcanoes/plains, `mars-geology.json` with polygon regions.

**Step 3: Commit**

```bash
git add scripts/preprocess/convert-mars-features.mjs frontend/public/data/mars-features.json frontend/public/data/mars-geology.json
git commit -m "feat: add Mars named features + geologic map regions from USGS"
```

---

### Task 4: Process Mars Dust Storm Frequency Data

**Files:**
- Create: `scripts/preprocess/process-mars-dust.mjs`
- Create: `frontend/public/data/mars-dust-frequency.json`

**Step 1: Write the dust storm processor**

The Mars Dust Activity Database from Zenodo (`https://zenodo.org/record/7480334`) has CSV data with individual storm events including lat/lng/area. Download the CSV, aggregate by 30°×30° grid bins, output storm frequency per bin.

If the Zenodo download is too large or complex, create a curated dataset from published summary data (Battalio & Wang 2021 paper). Key regions:

| Region | Lat Range | Lng Range | Storms/Mars-Year |
|--------|-----------|-----------|------------------|
| Hellas Basin | -60 to -20 | 40 to 100 | 45 |
| Acidalia Planitia | 30 to 60 | -60 to 0 | 35 |
| Utopia Planitia | 30 to 60 | 80 to 140 | 28 |
| Chryse Planitia | 10 to 40 | -60 to -20 | 32 |
| Solis Planum | -30 to 0 | -110 to -80 | 25 |
| Noachis Terra | -60 to -30 | -30 to 30 | 38 |
| Amazonis Planitia | 0 to 30 | -170 to -130 | 15 |
| Elysium Planitia | 0 to 30 | 130 to 170 | 20 |
| Syria Planum | -20 to 0 | -110 to -90 | 30 |

**Step 2: Run and commit**

```bash
cd scripts/preprocess && npm run mars-dust
git add scripts/preprocess/process-mars-dust.mjs frontend/public/data/mars-dust-frequency.json
git commit -m "feat: add Mars dust storm frequency data by region"
```

---

## Phase 2: Backend — TLE Proxy + Enhanced Location Data

### Task 5: Add CelesTrak TLE Proxy Endpoint

**Files:**
- Create: `backend/app/controllers/api/tle_controller.rb`
- Modify: `backend/config/routes.rb` (add TLE route)

**Step 1: Create the TLE controller**

Create `backend/app/controllers/api/tle_controller.rb`:
```ruby
# frozen_string_literal: true

module Api
  class TleController < ApplicationController
    # Cache TLE data in memory — refreshes every 24 hours
    @@tle_cache = {}
    @@cache_expiry = {}
    CACHE_DURATION = 24.hours

    # GET /api/tle?group=stations
    # GET /api/tle?catnr=25544
    # GET /api/tle?name=ISS
    def index
      group = params[:group] || 'stations'
      cache_key = params[:catnr] || params[:name] || group

      if cached_fresh?(cache_key)
        render json: @@tle_cache[cache_key]
        return
      end

      query = if params[:catnr]
                "CATNR=#{params[:catnr]}"
              elsif params[:name]
                "NAME=#{params[:name]}"
              else
                "GROUP=#{group}"
              end

      uri = URI("https://celestrak.org/NORAD/elements/gp.php?#{query}&FORMAT=JSON")
      response = Net::HTTP.get_response(uri)

      if response.is_a?(Net::HTTPSuccess)
        data = JSON.parse(response.body)
        @@tle_cache[cache_key] = data
        @@cache_expiry[cache_key] = Time.now + CACHE_DURATION
        render json: data
      else
        render json: { error: "CelesTrak returned #{response.code}" }, status: :bad_gateway
      end
    rescue StandardError => e
      # Return cached data if available, even if expired
      if @@tle_cache[cache_key]
        render json: @@tle_cache[cache_key]
      else
        render json: { error: e.message }, status: :service_unavailable
      end
    end

    private

    def cached_fresh?(key)
      @@tle_cache[key] && @@cache_expiry[key] && Time.now < @@cache_expiry[key]
    end
  end
end
```

**Step 2: Add routes**

In `backend/config/routes.rb`, inside the `namespace :api` block, add:
```ruby
# TLE satellite data (proxied from CelesTrak)
get 'tle', to: 'tle#index'
```

**Step 3: Add `net/http` and `json` requires if needed**

Rails auto-loads these, but verify by testing:
```bash
cd backend && rails routes | grep tle
```
Expected: `GET /api/tle(.:format)  api/tle#index`

**Step 4: Test manually**

```bash
curl "http://localhost:3000/api/tle?group=stations"
```
Expected: JSON array of OMM objects with `OBJECT_NAME`, `TLE_LINE1`, `TLE_LINE2`, etc.

**Step 5: Commit**

```bash
git add backend/app/controllers/api/tle_controller.rb backend/config/routes.rb
git commit -m "feat: add CelesTrak TLE proxy endpoint with 24h cache"
```

---

### Task 6: Expand Backend Location Data with Real NASA-Sourced Entries

**Files:**
- Modify: `backend/data/locations/orbit.json` — expand from 2 to ~15 orbital datacenter candidates
- Modify: `backend/data/locations/moon.json` — expand from 3 to ~10 real locations with NASA data
- Modify: `backend/data/locations/mars.json` — expand from 2 to ~10 real locations with NASA data

**Step 1: Expand orbit.json**

Replace with ~15 entries representing different orbital regimes as datacenter candidates. Each entry should have real physics-based data:

Key orbital datacenter candidates (with real orbital mechanics data):
- **ISS orbit (408 km LEO)** — 93 min period, 35% eclipse, 1361 W/m² solar
- **Sun-synchronous (700 km)** — permanent sun angle, 0% eclipse in summer
- **Starlink altitude (550 km LEO)** — mass production advantage, 37% eclipse
- **MEO (20,200 km, GPS orbit)** — lower radiation than Van Allen, 1.5% eclipse
- **GEO (35,786 km)** — fixed position, <1% eclipse, 600ms round-trip latency
- **L1 Lagrange point** — constant solar, no eclipse, 5s+ latency
- **L2 Lagrange point** — deep space observation, perpetual shade, extreme latency

Each entry follows existing `BackendLocation` schema but with real values:
- `energy_cost_kwh`: derived from solar panel efficiency × irradiance × eclipse fraction
- `avg_temperature_c`: real orbital thermal environment
- `latency_ms`: computed from altitude (speed of light × distance × 2)
- `disaster_risk`: based on debris density and radiation (Van Allen belts)
- `special_factors`: real engineering constraints

**Step 2: Expand moon.json**

Add real locations from NASA Artemis program and LRO data:
- **Shackleton Crater Rim** — 89.9°S, 86% solar illumination (LRO data)
- **Malapert Mountain** — 86.0°S, Earth line-of-sight, 78% solar
- **Connecting Ridge** — 89.5°S, 93% solar (highest known)
- **de Gerlache Crater Rim** — 88.5°S, 82% solar
- **Mare Tranquillitatis Lava Tube** — 8.5°N, radiation shielding
- **Aristarchus Plateau** — 23.7°N, resource-rich (thorium)
- **Copernicus Crater** — 9.6°N, flat terrain, science hub
- **Tsiolkovsky Crater (far side)** — 21.2°S, radio-quiet zone

Real data per location: solar illumination %, surface temp range (K), terrain slope, regolith depth, water ice proximity.

**Step 3: Expand mars.json**

Add real locations from NASA Mars mission data and MOLA topography:
- **Jezero Crater** — 18.4°N, Perseverance site, well-mapped
- **Olympus Mons** — 18.6°N, high altitude = more solar above dust
- **Hellas Planitia** — 42.7°S, deepest point = thickest atmo = warmest
- **Elysium Planitia** — 4.5°N, InSight site, flat terrain
- **Valles Marineris** — 14.0°S, canyon shielding from radiation
- **Gale Crater** — 5.4°S, Curiosity site, well-characterized
- **Arcadia Planitia** — 46.7°N, subsurface ice confirmed
- **Syrtis Major** — 8.4°N, low dust storm frequency
- **Noctis Labyrinthus** — 6.9°S, geothermal potential
- **Utopia Planitia** — 25.1°N, Zhurong site, flat terrain

Real data per location: solar irradiance W/m² by season, dust storm frequency, elevation (MOLA), atmospheric density, communication delay range.

**Step 4: Commit**

```bash
git add backend/data/locations/orbit.json backend/data/locations/moon.json backend/data/locations/mars.json
git commit -m "feat: expand orbital/lunar/martian locations with real NASA data"
```

---

### Task 7: Add Backend Endpoint for Planetary Region Data

**Files:**
- Create: `backend/app/controllers/api/planetary_data_controller.rb`
- Modify: `backend/config/routes.rb`

**Step 1: Create controller**

This endpoint serves the preprocessed GeoJSON/JSON data for moon/mars regions. The frontend fetches these for polygon overlays.

```ruby
# frozen_string_literal: true

module Api
  class PlanetaryDataController < ApplicationController
    DATA_DIR = Rails.root.join('..', 'frontend', 'public', 'data')

    # GET /api/planetary/moon/features
    # GET /api/planetary/mars/features
    # GET /api/planetary/mars/geology
    # GET /api/planetary/mars/dust
    def show
      body = params[:body]
      dataset = params[:dataset]
      file = DATA_DIR.join("#{body}-#{dataset}.json")

      if File.exist?(file)
        render json: File.read(file), content_type: 'application/json'
      else
        render json: { error: "Dataset #{body}/#{dataset} not found" }, status: :not_found
      end
    end
  end
end
```

**Step 2: Add route**

```ruby
# Planetary region data (moon/mars features, geology)
get 'planetary/:body/:dataset', to: 'planetary_data#show'
```

**Step 3: Commit**

```bash
git add backend/app/controllers/api/planetary_data_controller.rb backend/config/routes.rb
git commit -m "feat: add planetary data endpoint for moon/mars region datasets"
```

---

## Phase 3: Frontend — Real Satellite Tracking with satellite.js

### Task 8: Install satellite.js and Create TLE Service

**Files:**
- Modify: `frontend/package.json` (add satellite.js)
- Create: `frontend/src/lib/tle-service.ts`

**Step 1: Install satellite.js**

```bash
cd frontend && bun add satellite.js && bun add -d @types/satellite.js
```

**Step 2: Create TLE service**

Create `frontend/src/lib/tle-service.ts`:
```ts
import * as satellite from 'satellite.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface TLERecord {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  TLE_LINE1: string;
  TLE_LINE2: string;
}

export interface SatellitePosition {
  lat: number;
  lng: number;
  altitude: number; // km
  velocity: number; // km/s
}

export interface OrbitalMetrics {
  periodMinutes: number;
  inclinationDeg: number;
  eccentricity: number;
  apogeeKm: number;
  perigeeKm: number;
  eclipseFraction: number; // 0-1
  solarIrradiance: number; // W/m²
  radiationLevel: string; // 'low' | 'moderate' | 'high' | 'extreme'
  latencyToGroundMs: number;
  powerAvailabilityW: number; // per m² of solar panel
}

const EARTH_RADIUS_KM = 6371;
const SOLAR_CONSTANT = 1361; // W/m² at 1 AU
const SOLAR_PANEL_EFFICIENCY = 0.29; // Triple-junction GaAs

// Compute satellite position at a given time from TLE
export function computePosition(tle: TLERecord, date: Date = new Date()): SatellitePosition | null {
  try {
    const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);
    const positionAndVelocity = satellite.propagate(satrec, date);
    if (!positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean') return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

    const velocity = positionAndVelocity.velocity && typeof positionAndVelocity.velocity !== 'boolean'
      ? Math.sqrt(
          positionAndVelocity.velocity.x ** 2 +
          positionAndVelocity.velocity.y ** 2 +
          positionAndVelocity.velocity.z ** 2
        )
      : 0;

    return {
      lat: satellite.degreesLat(geo.latitude),
      lng: satellite.degreesLong(geo.longitude),
      altitude: geo.height,
      velocity,
    };
  } catch {
    return null;
  }
}

// Compute orbital feasibility metrics from TLE
export function computeOrbitalMetrics(tle: TLERecord): OrbitalMetrics {
  const meanMotion = tle.MEAN_MOTION; // rev/day
  const periodMinutes = (24 * 60) / meanMotion;
  const inclination = tle.INCLINATION;
  const eccentricity = tle.ECCENTRICITY;

  // Semi-major axis from mean motion (Kepler's 3rd law)
  const mu = 398600.4418; // km³/s² (Earth gravitational parameter)
  const n = meanMotion * (2 * Math.PI) / 86400; // rad/s
  const sma = Math.pow(mu / (n * n), 1 / 3); // km
  const apogee = sma * (1 + eccentricity) - EARTH_RADIUS_KM;
  const perigee = sma * (1 - eccentricity) - EARTH_RADIUS_KM;
  const avgAltitude = (apogee + perigee) / 2;

  // Eclipse fraction estimate (simplified)
  const rho = Math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + avgAltitude));
  const eclipseFraction = rho / Math.PI; // fraction of orbit in shadow

  // Radiation level based on altitude (Van Allen belts at 1000-6000 km and 13000-40000 km)
  let radiationLevel: string;
  if (avgAltitude < 1000) radiationLevel = 'low';
  else if (avgAltitude < 6000) radiationLevel = 'high'; // inner Van Allen
  else if (avgAltitude < 13000) radiationLevel = 'moderate';
  else if (avgAltitude < 40000) radiationLevel = 'extreme'; // outer Van Allen
  else radiationLevel = 'moderate';

  // Latency (speed of light round trip)
  const latencyToGroundMs = (avgAltitude * 2) / 299.792;

  // Power availability
  const solarIrradiance = SOLAR_CONSTANT; // approximately constant for Earth orbits
  const powerAvailability = solarIrradiance * SOLAR_PANEL_EFFICIENCY * (1 - eclipseFraction);

  return {
    periodMinutes: Math.round(periodMinutes * 10) / 10,
    inclinationDeg: Math.round(inclination * 10) / 10,
    eccentricity: Math.round(eccentricity * 10000) / 10000,
    apogeeKm: Math.round(apogee),
    perigeeKm: Math.round(perigee),
    eclipseFraction: Math.round(eclipseFraction * 1000) / 1000,
    solarIrradiance,
    radiationLevel,
    latencyToGroundMs: Math.round(latencyToGroundMs * 100) / 100,
    powerAvailabilityW: Math.round(powerAvailability),
  };
}

// Fetch TLE data from our backend proxy
export async function fetchTLEGroup(group: string): Promise<TLERecord[]> {
  const res = await fetch(`${API_BASE}/api/tle?group=${encodeURIComponent(group)}`);
  if (!res.ok) throw new Error(`TLE fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchTLEByNoradId(catnr: number): Promise<TLERecord[]> {
  const res = await fetch(`${API_BASE}/api/tle?catnr=${catnr}`);
  if (!res.ok) throw new Error(`TLE fetch failed: ${res.status}`);
  return res.json();
}

// Curated list of interesting satellites for the orbital datacenter view
export const CURATED_SATELLITE_IDS = {
  // Space stations (existing datacenter-like platforms)
  ISS: 25544,
  TIANGONG: 48274,
  // Earth observation (data processing in orbit)
  TERRA: 25994,
  AQUA: 27424,
  LANDSAT9: 49260,
  SENTINEL6: 46984,
  // Communications (relay infrastructure)
  GOES16: 41866,
  GOES18: 51850,
  // Commercial LEO constellations (edge computing candidates)
  STARLINK_SAMPLE: 44238, // One representative Starlink
  ONEWEB_SAMPLE: 44057,   // One representative OneWeb
  // Navigation (timing reference)
  GPS_SAMPLE: 28874, // GPS IIF-1
  // Weather
  NOAA20: 43013,
  METOP_C: 43689,
  // Science
  HUBBLE: 20580,
  JWST: 50463, // James Webb (L2 — may not have standard TLE)
};
```

**Step 3: Write test for orbital metrics**

Create `frontend/src/lib/__tests__/tle-service.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeOrbitalMetrics } from '../tle-service';

describe('computeOrbitalMetrics', () => {
  it('computes ISS-like LEO metrics correctly', () => {
    const issTle = {
      OBJECT_NAME: 'ISS (ZARYA)',
      NORAD_CAT_ID: 25544,
      EPOCH: '2024-01-01T00:00:00',
      MEAN_MOTION: 15.5, // ~93 min period
      ECCENTRICITY: 0.0001,
      INCLINATION: 51.6,
      RA_OF_ASC_NODE: 0,
      ARG_OF_PERICENTER: 0,
      MEAN_ANOMALY: 0,
      TLE_LINE1: '',
      TLE_LINE2: '',
    };
    const metrics = computeOrbitalMetrics(issTle);
    expect(metrics.periodMinutes).toBeCloseTo(92.9, 0);
    expect(metrics.inclinationDeg).toBe(51.6);
    expect(metrics.radiationLevel).toBe('low');
    expect(metrics.eclipseFraction).toBeGreaterThan(0.2);
    expect(metrics.eclipseFraction).toBeLessThan(0.5);
    expect(metrics.latencyToGroundMs).toBeLessThan(5);
    expect(metrics.powerAvailabilityW).toBeGreaterThan(200);
  });

  it('computes GEO metrics correctly', () => {
    const geoTle = {
      OBJECT_NAME: 'GOES-16',
      NORAD_CAT_ID: 41866,
      EPOCH: '2024-01-01T00:00:00',
      MEAN_MOTION: 1.0027, // ~1 rev/day = GEO
      ECCENTRICITY: 0.0001,
      INCLINATION: 0.1,
      RA_OF_ASC_NODE: 0,
      ARG_OF_PERICENTER: 0,
      MEAN_ANOMALY: 0,
      TLE_LINE1: '',
      TLE_LINE2: '',
    };
    const metrics = computeOrbitalMetrics(geoTle);
    expect(metrics.periodMinutes).toBeCloseTo(1436, -1);
    expect(metrics.apogeeKm).toBeCloseTo(35786, -2);
    expect(metrics.latencyToGroundMs).toBeGreaterThan(200);
    expect(metrics.radiationLevel).toBe('extreme'); // outer Van Allen
  });
});
```

**Step 4: Run test**

```bash
cd frontend && bun run test
```

Expected: tests pass.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/bun.lockb frontend/src/lib/tle-service.ts frontend/src/lib/__tests__/tle-service.test.ts
git commit -m "feat: add satellite.js TLE service with orbital feasibility metrics"
```

---

### Task 9: Replace Hardcoded Satellites with Real TLE Data

**Files:**
- Modify: `frontend/src/lib/constants.ts` (update SatelliteData interface)
- Modify: `frontend/src/pages/Atlas.tsx` (fetch real TLE data)
- Modify: `frontend/src/components/GlobeView.tsx` (use real positions, display real metrics)

**Step 1: Update SatelliteData to include TLE and orbital metrics**

In `frontend/src/lib/constants.ts`, extend `SatelliteData`:
```ts
export interface SatelliteData {
  id: string;
  name: string;
  noradId?: number;
  inclination: number;
  period: number;
  startLat: number;
  startLng: number;
  phase: number;
  altitude: number; // for react-globe.gl rendering (fraction of earth radius)
  altitudeKm: number; // real altitude in km
  status: string;
  color: string;
  carbonScore: number;
  isStationary: boolean;
  lat: number;
  lng: number;
  // Real orbital metrics (from TLE)
  eclipseFraction?: number;
  radiationLevel?: string;
  powerAvailabilityW?: number;
  latencyMs?: number;
  apogeeKm?: number;
  perigeeKm?: number;
}
```

**Step 2: In Atlas.tsx, add TLE data fetching**

Add a `useEffect` that fetches TLE data from the backend proxy, computes positions with `satellite.js`, and replaces the hardcoded satellites with real data. Fall back to hardcoded data if the TLE endpoint is unreachable.

Key logic:
```ts
import { fetchTLEGroup, computePosition, computeOrbitalMetrics, CURATED_SATELLITE_IDS, type TLERecord } from '@/lib/tle-service';

// In Atlas component:
useEffect(() => {
  fetchTLEGroup('stations')
    .then(tles => {
      // Also fetch other groups...
      return Promise.all([
        tles,
        fetchTLEGroup('active').catch(() => []),
      ]);
    })
    .then(([stations, active]) => {
      const allTles = [...stations, ...active];
      const curated = Object.entries(CURATED_SATELLITE_IDS);
      const matched: SatelliteData[] = [];

      for (const [key, noradId] of curated) {
        const tle = allTles.find(t => t.NORAD_CAT_ID === noradId);
        if (!tle) continue;
        const pos = computePosition(tle);
        const metrics = computeOrbitalMetrics(tle);
        if (!pos) continue;

        matched.push({
          id: key,
          name: tle.OBJECT_NAME,
          noradId,
          inclination: metrics.inclinationDeg,
          period: metrics.periodMinutes * 60,
          startLat: pos.lat,
          startLng: pos.lng,
          phase: 0,
          altitude: Math.min(pos.altitude / 6371 * 0.3, 0.5), // scale for globe
          altitudeKm: pos.altitude,
          status: metrics.radiationLevel === 'low' ? 'OPTIMAL' : 'CAUTION',
          color: getCarbonScoreColor(100 - metrics.powerAvailabilityW / 4),
          carbonScore: Math.round(100 - metrics.powerAvailabilityW / 4),
          isStationary: metrics.periodMinutes > 1400,
          lat: pos.lat,
          lng: pos.lng,
          eclipseFraction: metrics.eclipseFraction,
          radiationLevel: metrics.radiationLevel,
          powerAvailabilityW: metrics.powerAvailabilityW,
          latencyMs: metrics.latencyToGroundMs,
          apogeeKm: metrics.apogeeKm,
          perigeeKm: metrics.perigeeKm,
        });
      }

      if (matched.length > 0) setSatellites(matched);
    })
    .catch(() => {
      // Keep hardcoded fallback
    });
}, []);
```

**Step 3: Update satellite position ticker**

Replace the trig-based position update with satellite.js propagation:
```ts
// Instead of updateSatellitePosition(s, elapsed), use:
// Store TLE records in a ref, and recompute positions from them
```

**Step 4: Update SATELLITE_INFO in GlobeView.tsx**

Replace the hardcoded info with dynamic data from the SatelliteData's new fields (altitudeKm, powerAvailabilityW, etc.).

**Step 5: Commit**

```bash
git add frontend/src/lib/constants.ts frontend/src/pages/Atlas.tsx frontend/src/components/GlobeView.tsx
git commit -m "feat: replace hardcoded satellites with real TLE-tracked positions"
```

---

## Phase 4: Frontend — Moon & Mars Data Layers

### Task 10: Fix Moon/Mars Pin Rendering

**Files:**
- Modify: `frontend/src/components/GlobeView.tsx`

**Context:** Currently `htmlElementsData` returns `[]` for moon and mars bodies, so no pins appear. Fix this to render the `currentLocations` (moon/mars locations) as clickable HTML elements on the globe.

**Step 1: Update htmlElementsData to include moon/mars locations**

In GlobeView.tsx, update the `htmlElementsData` useMemo:
```ts
const htmlElementsData = useMemo(() => {
  if (celestialBody === 'earth') {
    // ... existing earth logic with clickedPin ...
    return els;
  }
  if (celestialBody === 'orbit') {
    // ... existing orbit logic ...
    return satellites.map(/* ... */);
  }
  // Moon and Mars: render currentLocations as pins
  if (celestialBody === 'moon' || celestialBody === 'mars') {
    return currentLocations.map(loc => ({
      lat: loc.lat, lng: loc.lng, alt: 0.02,
      id: loc.id, name: loc.name, carbon: loc.carbonIntensity,
      loc: loc.location, powerSource: loc.powerSource,
      capacity: loc.capacity, status: loc.status,
      isSatellite: false, isClickedPin: false, isExtraterrestrial: true,
      satData: null,
    }));
  }
  return [];
}, [regions, satellites, celestialBody, clickedPin, currentLocations]);
```

**Step 2: Create extraterrestrial pin element renderer**

Add a `createExtraterrestrialElement()` function similar to `createDatacenterElement` but with a space/sci-fi visual style (diamond shape, pulsing glow, shows power source and status).

**Step 3: Update htmlElementFn to handle the new type**

```ts
const htmlElementFn = useCallback((d: any) => {
  if (d.isSatellite) return createSatelliteElement(d, handleRegionClickRef);
  if (d.isClickedPin) return createClickedPinElement(d);
  if (d.isExtraterrestrial) return createExtraterrestrialElement(d, handleRegionClickRef);
  return createDatacenterElement(d, handleRegionClickRef);
}, []);
```

**Step 4: Test visually**

Switch to Moon/Mars in the CelestialSwitcher — pins should now appear on the globe.

**Step 5: Commit**

```bash
git add frontend/src/components/GlobeView.tsx
git commit -m "fix: render moon and mars location pins on globe"
```

---

### Task 11: Add Moon Named Features Overlay

**Files:**
- Create: `frontend/src/lib/moon-data.ts`
- Modify: `frontend/src/components/GlobeView.tsx`

**Step 1: Create moon data loader**

Create `frontend/src/lib/moon-data.ts`:
```ts
export interface MoonFeature {
  name: string;
  type: string; // 'Crater' | 'Mare' | 'Mons' | etc.
  lat: number;
  lng: number;
  diameter_km: number;
  approval_year: number | null;
}

let cachedFeatures: MoonFeature[] | null = null;

export async function getMoonFeatures(): Promise<MoonFeature[]> {
  if (cachedFeatures) return cachedFeatures;
  const res = await fetch('/data/moon-features.json');
  cachedFeatures = await res.json();
  return cachedFeatures!;
}

// Solar illumination data for key lunar locations (from NASA LRO/LOLA)
export const LUNAR_ILLUMINATION: Record<string, {
  illumination_pct: number;
  temp_range_k: [number, number];
  earth_visible: boolean;
  ice_proximity_km: number;
}> = {
  'Shackleton': { illumination_pct: 86, temp_range_k: [70, 220], earth_visible: false, ice_proximity_km: 0 },
  'de Gerlache': { illumination_pct: 82, temp_range_k: [60, 210], earth_visible: false, ice_proximity_km: 2 },
  'Malapert': { illumination_pct: 78, temp_range_k: [80, 230], earth_visible: true, ice_proximity_km: 15 },
  'Connecting Ridge': { illumination_pct: 93, temp_range_k: [90, 250], earth_visible: true, ice_proximity_km: 5 },
  'Aristarchus': { illumination_pct: 50, temp_range_k: [100, 380], earth_visible: true, ice_proximity_km: 500 },
  'Copernicus': { illumination_pct: 50, temp_range_k: [100, 390], earth_visible: true, ice_proximity_km: 600 },
  'Tycho': { illumination_pct: 50, temp_range_k: [95, 385], earth_visible: true, ice_proximity_km: 400 },
};
```

**Step 2: In GlobeView, render moon features as labels**

When `celestialBody === 'moon'`, load moon features and render major ones (>100km) as labels on the globe using `labelsData`. Show craters, maria, and mountains as small text labels.

**Step 3: Commit**

```bash
git add frontend/src/lib/moon-data.ts frontend/src/components/GlobeView.tsx
git commit -m "feat: add moon named features overlay from USGS data"
```

---

### Task 12: Add Mars Geologic Region Overlay

**Files:**
- Create: `frontend/src/lib/mars-data.ts`
- Modify: `frontend/src/components/GlobeView.tsx`

**Step 1: Create mars data loader**

Create `frontend/src/lib/mars-data.ts`:
```ts
export interface MarsFeature {
  name: string;
  type: string;
  lat: number;
  lng: number;
  diameter_km: number;
}

export interface MarsGeologyRegion {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] };
  properties: {
    unit_name: string;
    age: string;
    rock_type: string;
  };
}

export interface MarsDustRegion {
  lat_min: number;
  lat_max: number;
  lng_min: number;
  lng_max: number;
  storms_per_mars_year: number;
  region_name: string;
}

// Solar irradiance on Mars by latitude (W/m², annual average)
// Source: NASA TM-102299 (Appelbaum & Flood, 1990)
export const MARS_SOLAR_IRRADIANCE: Record<string, number> = {
  'equator': 590,      // 0° latitude, clear day average
  'low_lat': 520,      // 0-30°
  'mid_lat': 380,      // 30-60°
  'high_lat': 180,     // 60-90°
  'dust_storm': 80,    // during global dust storm
};

// Communication delay to Earth (one-way, minutes)
export const MARS_EARTH_DELAY = {
  min: 4.3,    // closest approach
  avg: 12.5,   // average
  max: 24.0,   // farthest point (conjunction)
};

let cachedFeatures: MarsFeature[] | null = null;
let cachedGeology: MarsGeologyRegion[] | null = null;
let cachedDust: MarsDustRegion[] | null = null;

export async function getMarsFeatures(): Promise<MarsFeature[]> {
  if (cachedFeatures) return cachedFeatures;
  const res = await fetch('/data/mars-features.json');
  cachedFeatures = await res.json();
  return cachedFeatures!;
}

export async function getMarsGeology(): Promise<MarsGeologyRegion[]> {
  if (cachedGeology) return cachedGeology;
  try {
    const res = await fetch('/data/mars-geology.json');
    cachedGeology = await res.json();
  } catch {
    cachedGeology = [];
  }
  return cachedGeology!;
}

export async function getMarsDustFrequency(): Promise<MarsDustRegion[]> {
  if (cachedDust) return cachedDust;
  const res = await fetch('/data/mars-dust-frequency.json');
  cachedDust = await res.json();
  return cachedDust!;
}

// Compute datacenter feasibility score for a Mars location (0-100, higher = better)
export function computeMarsFeasibility(lat: number, dustStormsPerYear: number, elevationKm: number): number {
  // Solar factor (equatorial = best)
  const solarFactor = Math.max(0, 1 - Math.abs(lat) / 90) * 40;
  // Dust factor (fewer storms = better)
  const dustFactor = Math.max(0, 1 - dustStormsPerYear / 50) * 25;
  // Elevation factor (higher = thinner atmosphere = more solar but less shielding)
  const elevFactor = elevationKm > 0 ? 15 : elevationKm < -4 ? 20 : 10;
  return Math.round(solarFactor + dustFactor + elevFactor);
}
```

**Step 2: Render Mars geologic regions as polygons**

In GlobeView, when `celestialBody === 'mars'` and geologic data is available, render regions using `polygonsData` — similar to how Earth country heatmap works, but colored by datacenter feasibility score.

**Step 3: Render Mars named features as labels**

Similar to moon features — major craters, volcanoes, and plains as text labels.

**Step 4: Commit**

```bash
git add frontend/src/lib/mars-data.ts frontend/src/components/GlobeView.tsx
git commit -m "feat: add Mars geologic regions + named features + dust data overlay"
```

---

### Task 13: Update Celestial Config with NASA Textures

**Files:**
- Modify: `frontend/src/lib/celestial.ts`

**Step 1: Update texture URLs**

```ts
moon: {
  id: 'moon',
  name: 'Moon',
  textureUrl: '/textures/moon-nasa.jpg',      // NASA LRO 2K
  bumpUrl: '/textures/moon-bump.jpg',          // NASA LOLA elevation
  backgroundUrl: '//unpkg.com/three-globe/example/img/night-sky.png',
  atmosphereColor: '#888888',
  showAtmosphere: false,
  atmosphereAltitude: 0.05,
},
```

**Step 2: Apply bump map in GlobeView if available**

react-globe.gl supports `bumpImageUrl` prop. Add it conditionally when `config.bumpUrl` exists.

**Step 3: Commit**

```bash
git add frontend/src/lib/celestial.ts frontend/src/components/GlobeView.tsx
git commit -m "feat: upgrade moon texture to NASA LRO with bump mapping"
```

---

## Phase 5: Unified Cross-Body Comparison

### Task 14: Create Unified Feasibility Scoring Engine

**Files:**
- Create: `frontend/src/lib/feasibility.ts`

**Step 1: Create the scoring engine**

This module computes a normalized 0-100 feasibility score for any location across all bodies, allowing apples-to-apples comparison.

```ts
export interface FeasibilityScore {
  overall: number;        // 0-100
  power: number;          // 0-100 (energy availability and cost)
  cooling: number;        // 0-100 (thermal management)
  connectivity: number;   // 0-100 (latency, bandwidth)
  resilience: number;     // 0-100 (radiation, disasters, stability)
  cost: number;           // 0-100 (construction + operational)
  body: string;
}

export function computeFeasibility(location: {
  body: string;
  carbon_intensity?: number;
  energy_cost_kwh?: number;
  avg_temperature_c?: number;
  latency_ms?: number;
  disaster_risk?: number;
  construction_cost_mw?: number;
  eclipse_fraction?: number;
  radiation_level?: string;
  solar_irradiance?: number;
  dust_storm_frequency?: number;
}): FeasibilityScore {
  // Normalize each dimension 0-100 based on body type
  // Earth: low carbon + low cost + low latency = high score
  // Orbit: high power availability + low radiation + low latency = high score
  // Moon: high solar illumination + extreme cold (good cooling) + low risk = high score
  // Mars: high solar + low dust + stable terrain = high score
  // ... (full implementation with body-specific weighting)
}
```

**Step 2: Write tests for edge cases**

Test that Earth locations, orbital platforms, moon bases, and Mars sites all produce reasonable scores in the 0-100 range.

**Step 3: Commit**

```bash
git add frontend/src/lib/feasibility.ts frontend/src/lib/__tests__/feasibility.test.ts
git commit -m "feat: add unified cross-body feasibility scoring engine"
```

---

### Task 15: Update ComparePanel for Body-Specific Metrics

**Files:**
- Modify: `frontend/src/components/ComparePanel.tsx`

**Step 1: Add body-specific metric columns**

When comparing locations across bodies, show relevant metrics per body:
- **Earth:** CO₂ intensity, energy mix, cost, disaster risk
- **Orbit:** Eclipse fraction, radiation, power availability, latency
- **Moon:** Solar illumination %, temperature, ice proximity, terrain
- **Mars:** Solar irradiance, dust frequency, elevation, comms delay

Show the unified feasibility score as the primary comparison metric, with body-specific details expandable.

**Step 2: Commit**

```bash
git add frontend/src/components/ComparePanel.tsx
git commit -m "feat: add body-specific metrics to cross-body comparison panel"
```

---

### Task 16: Update ScorecardPanel for Non-Earth Bodies

**Files:**
- Modify: `frontend/src/components/ScorecardPanel.tsx`

**Step 1: Add conditional sections**

When generating a scorecard for a moon/mars/orbit location, show the relevant metrics instead of Earth-specific ones:
- For orbit: orbital diagram, eclipse timeline, radiation zone indicator
- For moon: illumination chart, temperature cycle, ice distance
- For mars: solar irradiance by season, dust storm calendar, terrain profile

**Step 2: Commit**

```bash
git add frontend/src/components/ScorecardPanel.tsx
git commit -m "feat: add orbital/lunar/martian sections to scorecard panel"
```

---

## Summary of All Tasks

| # | Task | Phase | Effort |
|---|------|-------|--------|
| 1 | Preprocessing infrastructure + NASA textures | 1 | 20 min |
| 2 | USGS Moon features → JSON | 1 | 30 min |
| 3 | USGS Mars features + geology → JSON | 1 | 45 min |
| 4 | Mars dust storm frequency data | 1 | 20 min |
| 5 | CelesTrak TLE backend proxy | 2 | 30 min |
| 6 | Expand orbit/moon/mars location data | 2 | 60 min |
| 7 | Planetary data backend endpoint | 2 | 15 min |
| 8 | satellite.js TLE service + tests | 3 | 45 min |
| 9 | Replace hardcoded satellites with real TLE | 3 | 60 min |
| 10 | Fix moon/mars pin rendering | 4 | 30 min |
| 11 | Moon named features overlay | 4 | 45 min |
| 12 | Mars geologic regions + features overlay | 4 | 60 min |
| 13 | NASA textures + bump mapping | 4 | 15 min |
| 14 | Unified feasibility scoring engine + tests | 5 | 45 min |
| 15 | ComparePanel body-specific metrics | 5 | 45 min |
| 16 | ScorecardPanel for non-Earth bodies | 5 | 45 min |

**Total estimated effort: ~9 hours**

**Critical path:** Tasks 1-4 (data preprocessing) are prerequisites for Phase 4. Tasks 5+8 are prerequisites for Task 9. Task 10 (fix pin rendering) should be done early as it unblocks visual testing of everything else.

**Parallelizable work:**
- Phase 1 (preprocessing) and Phase 2 (backend) can run in parallel
- Tasks 11, 12, 13 within Phase 4 are independent of each other
- Tasks 14, 15, 16 within Phase 5 depend on Task 14 but 15 and 16 are independent

**Recommended execution order for maximum velocity:**
1. Task 10 (fix pin rendering — quick win, unblocks visual testing)
2. Task 5 (TLE proxy — backend, unblocks satellite work)
3. Task 8 (satellite.js service — frontend, can test independently)
4. Tasks 1-4 (preprocessing — can be batched)
5. Task 6 (expand location data)
6. Task 9 (real TLE satellites — needs 5+8)
7. Task 13 (NASA textures — quick)
8. Tasks 7, 11, 12 (data layers — needs preprocessing done)
9. Tasks 14, 15, 16 (comparison — polish phase)
