import { computePosition, computeOrbitalMetrics, type TLERecord } from './tle-service';
import { type SatelliteData } from './constants';

export type SatelliteCategory = 'station' | 'weather' | 'comms' | 'earth-obs' | 'navigation' | 'science' | 'other';
export type OrbitalBand = 'LEO' | 'MEO' | 'GEO' | 'HEO';

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

export const BAND_COLORS: Record<OrbitalBand, string> = {
  'LEO': '#00ff88',
  'MEO': '#4488ff',
  'GEO': '#ff8800',
  'HEO': '#ff4466',
};

export const BAND_LABELS: Record<OrbitalBand, string> = {
  'LEO': 'Low Earth Orbit',
  'MEO': 'Medium Earth Orbit',
  'GEO': 'Geostationary',
  'HEO': 'Highly Elliptical',
};

const CATEGORY_PATTERNS: [RegExp, SatelliteCategory][] = [
  [/\bISS\b|ZARYA|TIANGONG|CSS\b|STATION/i, 'station'],
  [/NOAA|GOES|METOP|METEOSAT|HIMAWARI|DMSP|WEATHER|FENGYUN/i, 'weather'],
  [/STARLINK|ONEWEB|IRIDIUM|INMARSAT|INTELSAT|SES|GLOBALSTAR|ORBCOMM|TELESAT|VIASAT|O3B|TDRS/i, 'comms'],
  [/LANDSAT|SENTINEL|TERRA\b|AQUA\b|SUOMI|WORLDVIEW|PLEIADES|SPOT\b|RESOURCESAT|CBERS|EROS/i, 'earth-obs'],
  [/GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|COSMOS.*NAV|IRNSS/i, 'navigation'],
  [/HUBBLE|CHANDRA|JAMES WEBB|FERMI|SWIFT|NUSTAR|TESS\b|KEPLER|GAIA|PLANCK/i, 'science'],
];

export function categorizeSatellite(tle: TLERecord): SatelliteCategory {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(tle.OBJECT_NAME)) return category;
  }
  return 'other';
}

/** Classify orbital band from MEAN_MOTION (rev/day) and ECCENTRICITY — no SGP4 needed */
export function classifyBand(tle: TLERecord): OrbitalBand {
  if (tle.ECCENTRICITY > 0.25) return 'HEO';
  if (tle.MEAN_MOTION > 11.3) return 'LEO';   // period < ~127 min = alt < ~2000km
  if (tle.MEAN_MOTION > 1.5) return 'MEO';     // between LEO and GEO
  return 'GEO';                                  // ~1 rev/day
}

/** Compressed altitude scale — maps real km to visually distinct shells */
export function compressedAltitude(altKm: number): number {
  if (altKm < 2000)  return 0.04 + (altKm / 2000) * 0.12;        // LEO: 0.04–0.16
  if (altKm < 35786) return 0.22 + ((altKm - 2000) / 33786) * 0.18; // MEO: 0.22–0.40
  return 0.45;                                                      // GEO: fixed ring at 0.45
}

/** Particle group for the particlesData layer */
export interface ParticleGroup {
  band: OrbitalBand;
  color: string;
  satellites: { lat: number; lng: number; alt: number }[];
  count: number;
}

/** Fast batch propagation — positions only, skips expensive orbital metrics.
 *  Returns SatelliteData[] for the sidebar/detail views. */
export function propagateAll(tles: TLERecord[], date: Date = new Date()): SatelliteData[] {
  const results: SatelliteData[] = [];

  for (const tle of tles) {
    const pos = computePosition(tle, date);
    if (!pos) continue;

    const category = categorizeSatellite(tle);
    const band = classifyBand(tle);
    const altKm = Math.round(pos.altitude);

    results.push({
      id: `${tle.NORAD_CAT_ID}`,
      name: tle.OBJECT_NAME,
      noradId: tle.NORAD_CAT_ID,
      inclination: tle.INCLINATION,
      period: (24 * 60) / tle.MEAN_MOTION * 60,
      startLat: pos.lat,
      startLng: pos.lng,
      phase: 0,
      altitude: compressedAltitude(pos.altitude),
      altitudeKm: altKm,
      status: band,
      color: BAND_COLORS[band],
      carbonScore: 0,
      isStationary: tle.MEAN_MOTION < 1.5,
      lat: pos.lat,
      lng: pos.lng,
      category,
    });
  }

  return results;
}

/** Group satellites by orbital band for the particlesData layer */
export function groupByBand(satellites: SatelliteData[]): ParticleGroup[] {
  const bands = new Map<OrbitalBand, { lat: number; lng: number; alt: number }[]>();

  for (const sat of satellites) {
    const band = (sat.status as OrbitalBand) || 'LEO';
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band)!.push({ lat: sat.lat, lng: sat.lng, alt: sat.altitude });
  }

  return (['LEO', 'MEO', 'GEO', 'HEO'] as OrbitalBand[])
    .filter(b => bands.has(b))
    .map(band => ({
      band,
      color: BAND_COLORS[band],
      satellites: bands.get(band)!,
      count: bands.get(band)!.length,
    }));
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
      lat: avgLat, lng: avgLng,
      count: sats.length, satellites: sats,
      dominantCategory: dominant, color: CATEGORY_COLORS[dominant],
    });
  }

  return clusters;
}
