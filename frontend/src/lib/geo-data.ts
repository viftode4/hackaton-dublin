/** Types, loaders, pre-clustering, and viewport culling for data layers. */

const DEG2RAD = Math.PI / 180;

// ── Viewport culling ─────────────────────────────────────────
// Angular distance on a sphere between two lat/lng points (radians).
function angularDist(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a));
}

/**
 * Filter an array of {lat,lng} items to only those visible from
 * the camera position — in front of the globe and within the
 * altitude-dependent field of view.
 *
 * At altitude 2.5 the whole front hemisphere is visible (~90°).
 * At altitude 0.5 only ~40° around the look-at point is visible.
 */
export function viewportCull<T extends { lat: number; lng: number }>(
  items: T[],
  camLat: number,
  camLng: number,
  altitude: number,
): T[] {
  // Max angular radius (radians) that's visible from the camera.
  // At alt 2.5 → ~π/2 (full hemisphere), at 0.3 → ~0.6 rad (~35°)
  const maxAngle = Math.min(Math.PI / 2, 0.35 + altitude * 0.55);
  const result: T[] = [];
  for (const item of items) {
    if (angularDist(camLat, camLng, item.lat, item.lng) <= maxAngle) {
      result.push(item);
    }
  }
  return result;
}

// ── Power Plants ──────────────────────────────────────────────

export interface PowerPlant {
  lat: number;
  lng: number;
  name: string;
  fuelType: string;
  country: string;
  emissionsTCO2e: number;
  capacityMW: number;
  emissionsFactor: number;
  generationMWh: number;
  year: number;
}

/** A pre-aggregated cluster of nearby power plants. */
export interface PowerPlantCluster {
  lat: number;
  lng: number;
  count: number;
  totalCapacityMW: number;
  totalEmissions: number;
  dominantFuel: string;
  /** Fuel → total MW breakdown for tooltip */
  fuelBreakdown: Record<string, number>;
}

const FUEL_COLORS: Record<string, string> = {
  coal: '#e63946',
  oil: '#b5651d',
  gas: '#f4a261',
  nuclear: '#9b5de5',
  hydro: '#00b4d8',
  wind: '#06d6a0',
  solar: '#ffd60a',
  geothermal: '#e76f51',
  biomass: '#8ac926',
  waste: '#6c757d',
  other: '#adb5bd',
};

export function getFuelColor(fuelType: string): string {
  const key = fuelType.toLowerCase();
  for (const [fuel, color] of Object.entries(FUEL_COLORS)) {
    if (key.includes(fuel)) return color;
  }
  return FUEL_COLORS.other;
}

/** Normalise a raw fuel string to a canonical key */
function canonFuel(raw: string): string {
  const k = raw.toLowerCase();
  for (const fuel of Object.keys(FUEL_COLORS)) {
    if (k.includes(fuel)) return fuel;
  }
  return 'other';
}

export const FUEL_LEGEND = Object.entries(FUEL_COLORS).filter(
  ([k]) => !['other', 'waste'].includes(k),
);

/**
 * Aggregate raw plants into grid clusters.
 * `cellDeg` is the lat/lng grid cell size in degrees.
 */
function clusterPlants(plants: PowerPlant[], cellDeg: number): PowerPlantCluster[] {
  const buckets = new Map<string, PowerPlant[]>();
  for (const p of plants) {
    const gLat = Math.floor(p.lat / cellDeg) * cellDeg;
    const gLng = Math.floor(p.lng / cellDeg) * cellDeg;
    const key = `${gLat},${gLng}`;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(p);
  }

  const clusters: PowerPlantCluster[] = [];
  for (const plants of buckets.values()) {
    let latSum = 0, lngSum = 0, totalCap = 0, totalEm = 0;
    const fuelCap: Record<string, number> = {};
    for (const p of plants) {
      latSum += p.lat;
      lngSum += p.lng;
      totalCap += p.capacityMW;
      totalEm += p.emissionsTCO2e;
      const fuel = canonFuel(p.fuelType);
      fuelCap[fuel] = (fuelCap[fuel] || 0) + p.capacityMW;
    }
    let dominant = 'other', maxCap = 0;
    for (const [f, c] of Object.entries(fuelCap)) {
      if (c > maxCap) { maxCap = c; dominant = f; }
    }
    clusters.push({
      lat: latSum / plants.length,
      lng: lngSum / plants.length,
      count: plants.length,
      totalCapacityMW: totalCap,
      totalEmissions: totalEm,
      dominantFuel: dominant,
      fuelBreakdown: fuelCap,
    });
  }
  return clusters;
}

/** Multi-resolution pre-computed clusters. Computed once at load. */
export interface PowerPlantLOD {
  /** ~150 clusters — coarse continental view (altitude > 2.0) */
  coarse: PowerPlantCluster[];
  /** ~500 clusters — country level (altitude 1.0-2.0) */
  medium: PowerPlantCluster[];
  /** ~1500 clusters — regional level (altitude < 1.0) */
  fine: PowerPlantCluster[];
}

let lodCache: PowerPlantLOD | null = null;

export async function loadPowerPlantLOD(): Promise<PowerPlantLOD> {
  if (lodCache) return lodCache;
  const res = await fetch('/data/power_plants.geojson');
  const json = await res.json();
  const raw: PowerPlant[] = (json.features as any[]).map((f: any) => ({
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    name: f.properties.name,
    fuelType: f.properties.fuel_type ?? 'other',
    country: f.properties.country ?? '',
    emissionsTCO2e: f.properties.emissions_tCO2e ?? 0,
    capacityMW: f.properties.capacity_MW ?? 0,
    emissionsFactor: f.properties.emissions_factor_tCO2e_per_MWh ?? 0,
    generationMWh: f.properties.generation_MWh ?? 0,
    year: f.properties.year ?? 0,
  }));

  lodCache = {
    coarse: clusterPlants(raw, 10),  // ~10° cells → ~150 clusters
    medium: clusterPlants(raw, 4),   // ~4° cells  → ~500 clusters
    fine:   clusterPlants(raw, 1.5), // ~1.5° cells → ~1500 clusters
  };
  return lodCache;
}

/** Pick the right LOD tier + viewport-cull for current camera state. */
export function getVisibleClusters(
  lod: PowerPlantLOD,
  camLat: number,
  camLng: number,
  altitude: number,
): PowerPlantCluster[] {
  const tier = altitude > 2.0 ? lod.coarse : altitude > 1.0 ? lod.medium : lod.fine;
  return viewportCull(tier, camLat, camLng, altitude);
}

// ── Data Centers ──────────────────────────────────────────────

export interface DataCenter {
  lat: number;
  lng: number;
  id: string;
  provider: string;
  zoneKey: string;
  name: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  gcp: '#4285f4',
  aws: '#ff9900',
  azure: '#0078d4',
  meta: '#0668e1',
  oracle: '#f80000',
  alibaba: '#ff6a00',
  tencent: '#00c4b3',
  ibm: '#0530ad',
  equinix: '#ed1c24',
  digitalrealty: '#00a3e0',
};

export function getProviderColor(provider: string): string {
  const key = provider.toLowerCase();
  for (const [p, color] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(p)) return color;
  }
  return '#00d4ff';
}

export const PROVIDER_LEGEND = Object.entries(PROVIDER_COLORS);

let dcCache: DataCenter[] | null = null;

export async function loadDataCenters(): Promise<DataCenter[]> {
  if (dcCache) return dcCache;
  const res = await fetch('/data/data_centers.geojson');
  const json = await res.json();
  dcCache = (json.features as any[]).map((f: any) => ({
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    id: f.properties.id,
    provider: f.properties.provider ?? 'unknown',
    zoneKey: f.properties.zoneKey ?? '',
    name: f.properties.name ?? f.properties.id,
  }));
  return dcCache;
}
