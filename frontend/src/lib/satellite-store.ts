import { computePosition, computeOrbitalMetrics, type TLERecord } from './tle-service';
import { type SatelliteData } from './constants';

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
