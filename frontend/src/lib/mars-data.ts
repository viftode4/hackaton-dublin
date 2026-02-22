export interface MarsFeature {
  name: string;
  type: string;
  lat: number;
  lng: number;
  diameter_km: number;
}

export interface MarsDustRegion {
  lat_min: number;
  lat_max: number;
  lng_min: number;
  lng_max: number;
  storms_per_mars_year: number;
  region_name: string;
}

/** Solar irradiance on Mars by latitude (W/m², annual average)
 *  Source: NASA TM-102299 (Appelbaum & Flood, 1990) */
export function getMarsSolarIrradiance(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat < 15) return 560;  // equatorial
  if (absLat < 30) return 520;  // low latitude
  if (absLat < 45) return 440;  // mid latitude
  if (absLat < 60) return 350;  // mid-high latitude
  return 200;                    // polar
}

/** Communication delay to Earth (one-way, minutes) */
export const MARS_EARTH_DELAY = {
  min: 4.3,    // closest approach (~56M km)
  avg: 12.5,   // average (~187M km)
  max: 24.0,   // conjunction (~401M km)
};

/** Mars dust storm frequency by region (storms per Mars year, ~687 Earth days)
 *  Source: Battalio & Wang 2021, Mars Dust Activity Database */
export const MARS_DUST_REGIONS: MarsDustRegion[] = [
  { region_name: 'Hellas Basin', lat_min: -60, lat_max: -20, lng_min: 40, lng_max: 100, storms_per_mars_year: 45 },
  { region_name: 'Acidalia Planitia', lat_min: 30, lat_max: 60, lng_min: -60, lng_max: 0, storms_per_mars_year: 35 },
  { region_name: 'Utopia Planitia', lat_min: 20, lat_max: 50, lng_min: 80, lng_max: 140, storms_per_mars_year: 28 },
  { region_name: 'Chryse Planitia', lat_min: 10, lat_max: 40, lng_min: -60, lng_max: -20, storms_per_mars_year: 32 },
  { region_name: 'Solis Planum', lat_min: -30, lat_max: 0, lng_min: -110, lng_max: -80, storms_per_mars_year: 25 },
  { region_name: 'Noachis Terra', lat_min: -60, lat_max: -30, lng_min: -30, lng_max: 30, storms_per_mars_year: 38 },
  { region_name: 'Amazonis Planitia', lat_min: 0, lat_max: 30, lng_min: -170, lng_max: -130, storms_per_mars_year: 15 },
  { region_name: 'Elysium Planitia', lat_min: -10, lat_max: 20, lng_min: 120, lng_max: 170, storms_per_mars_year: 20 },
  { region_name: 'Syrtis Major', lat_min: -5, lat_max: 20, lng_min: 55, lng_max: 85, storms_per_mars_year: 12 },
  { region_name: 'Tharsis Region', lat_min: -20, lat_max: 30, lng_min: -140, lng_max: -90, storms_per_mars_year: 22 },
  { region_name: 'Arcadia Planitia', lat_min: 35, lat_max: 55, lng_min: -180, lng_max: -150, storms_per_mars_year: 15 },
  { region_name: 'Isidis Planitia', lat_min: 5, lat_max: 25, lng_min: 80, lng_max: 100, storms_per_mars_year: 18 },
];

/** Get dust storm frequency for a Mars lat/lng */
export function getMarsDustFrequency(lat: number, lng: number): number {
  for (const region of MARS_DUST_REGIONS) {
    if (lat >= region.lat_min && lat <= region.lat_max &&
        lng >= region.lng_min && lng <= region.lng_max) {
      return region.storms_per_mars_year;
    }
  }
  return 20; // default average
}

/** Compute datacenter feasibility score for a Mars location (0-100, higher = better) */
export function computeMarsFeasibility(lat: number, lng: number, elevationKm: number = 0): number {
  const solar = getMarsSolarIrradiance(lat);
  const dust = getMarsDustFrequency(lat, lng);

  // Solar factor (equatorial = best, max 40 points)
  const solarFactor = (solar / 590) * 40;
  // Dust factor (fewer storms = better, max 25 points)
  const dustFactor = Math.max(0, (1 - dust / 50)) * 25;
  // Elevation factor (lower = warmer + thicker atmo, but higher = less dust, 10-20 points)
  const elevFactor = elevationKm > 10 ? 18 : elevationKm < -4 ? 20 : 12;
  // Terrain factor (flat = easier construction, 5-15 points)
  const terrainFactor = 10;

  return Math.round(Math.min(100, solarFactor + dustFactor + elevFactor + terrainFactor));
}

let cachedFeatures: MarsFeature[] | null = null;

export async function getMarsFeatures(): Promise<MarsFeature[]> {
  if (cachedFeatures) return cachedFeatures;
  try {
    const res = await fetch('/data/mars-features.json');
    if (!res.ok) return [];
    const raw: MarsFeature[] = await res.json();
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
