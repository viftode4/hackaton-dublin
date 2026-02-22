export interface MoonFeature {
  name: string;
  type: string;
  lat: number;
  lng: number;
  diameter_km: number;
  approval_year: number | null;
}

let cachedFeatures: MoonFeature[] | null = null;

export async function getMoonFeatures(): Promise<MoonFeature[]> {
  if (cachedFeatures) return cachedFeatures;
  try {
    const res = await fetch('/data/moon-features.json');
    if (!res.ok) return [];
    const raw: MoonFeature[] = await res.json();
    // Normalize: convert 0-360 lng to -180..180, simplify type to first word
    cachedFeatures = raw.map(f => ({
      ...f,
      lng: f.lng > 180 ? f.lng - 360 : f.lng,
      type: f.type.split(',')[0].trim(),
    }));
    return cachedFeatures;
  } catch {
    return [];
  }
}

/** Solar illumination data for key lunar locations (from NASA LRO/LOLA) */
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
  'Tsiolkovsky': { illumination_pct: 50, temp_range_k: [100, 370], earth_visible: false, ice_proximity_km: 800 },
  'Peary': { illumination_pct: 76, temp_range_k: [75, 225], earth_visible: true, ice_proximity_km: 10 },
  'Mare Tranquillitatis': { illumination_pct: 50, temp_range_k: [100, 380], earth_visible: true, ice_proximity_km: 2000 },
};
