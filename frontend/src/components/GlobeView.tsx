import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import { GroundRegion, SatelliteData, getIntensityColor, USER_LOCATION, updateSatellitePosition } from '@/lib/constants';
import { CelestialBody, CELESTIAL_CONFIGS, MOON_LOCATIONS, MARS_LOCATIONS, type ExtraterrestrialLocation } from '@/lib/celestial';
import { getCountryFeatures, getCentroid } from '@/lib/geo-countries';
import { estimateCO2, type CO2Estimate } from '@/lib/co2-api';
import { type PowerPlantLOD, type PowerPlantCluster, type DataCenter, getFuelColor, getProviderColor, getVisibleClusters, viewportCull, FUEL_LEGEND, PROVIDER_LEGEND } from '@/lib/geo-data';
import { getMoonFeatures, type MoonFeature } from '@/lib/moon-data';
import { getMarsFeatures, getMarsSolarIrradiance, getMarsDustFrequency, computeMarsFeasibility, type MarsFeature } from '@/lib/mars-data';
import CelestialSwitcher from './CelestialSwitcher';

export interface DataLayers {
  heatmap: boolean;
  powerPlants: boolean;
  datacenters: boolean;
}

interface Props {
  regions: GroundRegion[];
  satellites: SatelliteData[];
  routingTarget: { lat: number; lng: number } | null;
  celestialBody: CelestialBody;
  onCelestialBodyChange: (body: CelestialBody) => void;
  onLocationClick?: (id: string, name: string, body: string, carbon: number, regionData?: GroundRegion, satData?: SatelliteData, etData?: ExtraterrestrialLocation) => void;
  zoomTarget?: { lat: number; lng: number } | null;
  moonLocations?: ExtraterrestrialLocation[];
  marsLocations?: ExtraterrestrialLocation[];
  dataLayers?: DataLayers;
  onDataLayersChange?: (layers: DataLayers) => void;
  onCountryClick?: (country: { name: string; lat: number; lng: number; co2?: CO2Estimate }) => void;
  activeCountry?: { name: string } | null;
  activeLocation?: { id: string } | null;
  powerPlantLOD?: PowerPlantLOD;
  globalDatacenters?: DataCenter[];
}

// Generate orbit trajectory points for a satellite
function generateOrbitPath(sat: SatelliteData, numPoints = 360): { lat: number; lng: number; alt: number }[] {
  if (sat.isStationary) {
    const points: { lat: number; lng: number; alt: number }[] = [];
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      points.push({
        lat: sat.startLat + Math.cos(angle) * 2,
        lng: sat.startLng + Math.sin(angle) * 2,
        alt: sat.altitude,
      });
    }
    return points;
  }
  // Single closed orbit passing through (startLat, startLng)
  const points: { lat: number; lng: number; alt: number }[] = [];
  const phaseOffset = sat.inclination !== 0
    ? Math.asin(Math.max(-1, Math.min(1, sat.startLat / sat.inclination)))
    : 0;
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const angle = 2 * Math.PI * t;
    const lat = sat.inclination * Math.sin(angle + phaseOffset);
    // One full revolution around the globe, anchored at startLng
    const lng = sat.startLng + 360 * t;
    const normalizedLng = ((lng % 360) + 540) % 360 - 180;
    points.push({ lat, lng: normalizedLng, alt: sat.altitude });
  }
  return points;
}

// Satellite size/mass mock data
const SATELLITE_INFO: Record<string, { size: string; mass: string; altitudeKm: number; co2: string }> = {
  'ISS': { size: '109m × 73m', mass: '420,000 kg', altitudeKm: 408, co2: '200 g CO₂/kWh (amortized)' },
  'HUBBLE': { size: '13.2m × 4.2m', mass: '11,110 kg', altitudeKm: 547, co2: '150 g CO₂/kWh (amortized)' },
  'TERRA': { size: '6.8m × 3.5m', mass: '5,190 kg', altitudeKm: 705, co2: '120 g CO₂/kWh (amortized)' },
  'LANDSAT9': { size: '4.3m × 2.4m', mass: '2,711 kg', altitudeKm: 705, co2: '110 g CO₂/kWh (amortized)' },
  'NOAA20': { size: '6.2m × 3.3m', mass: '2,445 kg', altitudeKm: 824, co2: '130 g CO₂/kWh (amortized)' },
  'SENTINEL6': { size: '5.1m × 2.3m', mass: '1,192 kg', altitudeKm: 1336, co2: '100 g CO₂/kWh (amortized)' },
  'TIANGONG': { size: '55m × 30m', mass: '100,000 kg', altitudeKm: 390, co2: '210 g CO₂/kWh (amortized)' },
  'STARLINK': { size: '3.4m × 1.8m', mass: '260 kg', altitudeKm: 550, co2: '170 g CO₂/kWh (amortized)' },
  'GOES16': { size: '6.1m × 5.6m', mass: '5,192 kg', altitudeKm: 35786, co2: '95 g CO₂/kWh (solar only)' },
  'INMARSAT5': { size: '7.8m × 3.4m', mass: '6,070 kg', altitudeKm: 35786, co2: '85 g CO₂/kWh (solar only)' },
};

export default function GlobeView({ regions, satellites, routingTarget, celestialBody, onCelestialBodyChange, onLocationClick, zoomTarget, moonLocations, marsLocations, dataLayers, onDataLayersChange, onCountryClick, activeCountry, activeLocation, powerPlantLOD, globalDatacenters }: Props) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [countries, setCountries] = useState<any[]>([]);
  const [countryCO2, setCountryCO2] = useState<Map<string, CO2Estimate>>(new Map());
  const [clickedPin, setClickedPin] = useState<{ lat: number; lng: number; name: string; co2: number } | null>(null);
  const [camera, setCamera] = useState({ lat: 30, lng: 0, altitude: 2.5 });
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastZoomUpdateRef = useRef(0);
  const [moonFeatures, setMoonFeatures] = useState<MoonFeature[]>([]);
  const [marsFeatures, setMarsFeatures] = useState<MarsFeature[]>([]);
  const [marsGeology, setMarsGeology] = useState<any[]>([]);

  const config = CELESTIAL_CONFIGS[celestialBody];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    globeRef.current.pointOfView({ lat: 30, lng: 0, altitude: 2.5 }, 0);
    const c = globeRef.current.controls();
    if (c) {
      c.autoRotate = true;
      c.autoRotateSpeed = 0.5;
    }
  }, [dims.w, celestialBody]);

  useEffect(() => {
    if (!globeRef.current || !zoomTarget) return;
    globeRef.current.pointOfView({ lat: zoomTarget.lat, lng: zoomTarget.lng, altitude: 1.2 }, 1000);
  }, [zoomTarget]);

  useEffect(() => {
    if (!globeRef.current || !routingTarget) return;
    globeRef.current.pointOfView(
      { lat: routingTarget.lat, lng: routingTarget.lng, altitude: 1.2 },
      1000
    );
  }, [routingTarget]);

  // Clear clicked pin when country/location is dismissed externally
  useEffect(() => {
    if (!activeCountry && !activeLocation) setClickedPin(null);
  }, [activeCountry, activeLocation]);

  // Load country GeoJSON when on Earth; clear clicked pin on body switch
  useEffect(() => {
    setClickedPin(null);
    if (celestialBody !== 'earth') return;
    getCountryFeatures().then(setCountries);
  }, [celestialBody]);

  // Load moon/mars features when switching to those bodies
  useEffect(() => {
    if (celestialBody === 'moon' && moonFeatures.length === 0) {
      getMoonFeatures().then(setMoonFeatures);
    }
    if (celestialBody === 'mars' && marsFeatures.length === 0) {
      getMarsFeatures().then(setMarsFeatures);
      // Load geology for polygon overlay
      fetch('/data/mars-geology.json')
        .then(r => r.json())
        .then(setMarsGeology)
        .catch(() => {});
    }
  }, [celestialBody]);

  // Batch-fetch CO2 for all countries so heatmap colors appear
  useEffect(() => {
    if (countries.length === 0) return;
    Promise.all(
      countries.map(async (c) => {
        const centroid = getCentroid(c.geometry);
        const co2 = await estimateCO2(centroid.lat, centroid.lng, c.properties.name);
        return [c.properties.name, co2] as [string, CO2Estimate];
      }),
    ).then((entries) => {
      setCountryCO2(new Map(entries));
    });
  }, [countries]);

  const currentLocations = useMemo(() => {
    if (celestialBody === 'moon') return moonLocations ?? MOON_LOCATIONS;
    if (celestialBody === 'mars') return marsLocations ?? MARS_LOCATIONS;
    return [];
  }, [celestialBody, moonLocations, marsLocations]);

  // Points: user's own DCs + viewport-culled global DCs (WebGL)
  const pointsData = useMemo(() => {
    if (celestialBody !== 'earth') return [];
    const pts: any[] = regions.map(r => ({
      lat: r.lat, lng: r.lng, alt: 0.01,
      color: getIntensityColor(r.carbonIntensity),
      radius: 0.55, label: `<b>${r.id}</b><br/>${r.carbonIntensity}g CO₂/kWh<br/>${r.location}`,
      regionId: r.id,
    }));

    // Global datacenters — viewport culled, WebGL points
    if (dataLayers?.datacenters && globalDatacenters) {
      const visible = viewportCull(globalDatacenters, camera.lat, camera.lng, camera.altitude);
      for (const dc of visible) {
        pts.push({
          lat: dc.lat, lng: dc.lng, alt: 0.012,
          color: getProviderColor(dc.provider),
          radius: 0.35,
          label: `<b>${dc.name}</b><br/>Provider: ${dc.provider.toUpperCase()}<br/>Zone: ${dc.zoneKey}`,
        });
      }
    }

    return pts;
  }, [regions, celestialBody, dataLayers, globalDatacenters, camera]);

  // Hex bin: power plant clusters rendered as nice hexagonal columns
  const hexBinData = useMemo(() => {
    if (celestialBody !== 'earth' || !dataLayers?.powerPlants || !powerPlantLOD) return [];
    return getVisibleClusters(powerPlantLOD, camera.lat, camera.lng, camera.altitude);
  }, [celestialBody, dataLayers, powerPlantLOD, camera]);

  const hexBinResolution = camera.altitude > 2.5 ? 1
    : camera.altitude > 1.5 ? 2
    : camera.altitude > 0.8 ? 3
    : camera.altitude > 0.4 ? 4
    : 5;

  const labelsData = useMemo(() => {
    if (celestialBody === 'earth') {
      return regions.map(r => ({
        lat: r.lat, lng: r.lng, alt: 0.015,
        text: `${r.id}\n${r.carbonIntensity}g`,
        color: getIntensityColor(r.carbonIntensity),
        size: 0.6,
      }));
    }
    if (celestialBody === 'moon') {
      // Show top 40 moon features as labels (by diameter)
      return moonFeatures.slice(0, 40).map(f => ({
        lat: f.lat, lng: f.lng, alt: 0.01,
        text: f.name,
        color: f.type === 'Mare' ? '#4488aa' : f.type === 'Mons' ? '#aa8844' : '#888888',
        size: Math.min(0.8, Math.max(0.3, f.diameter_km / 500)),
      }));
    }
    if (celestialBody === 'mars') {
      // Show top 40 mars features
      return marsFeatures.slice(0, 40).map(f => ({
        lat: f.lat, lng: f.lng, alt: 0.01,
        text: f.name,
        color: f.type === 'Mons' ? '#cc6633'
          : f.type === 'Planitia' || f.type === 'Planum' ? '#66aa44'
          : f.type === 'Vallis' || f.type === 'Chasma' ? '#4466cc'
          : '#aa8866',
        size: Math.min(0.8, Math.max(0.3, f.diameter_km / 800)),
      }));
    }
    return [];
  }, [regions, celestialBody, moonFeatures, marsFeatures]);

  // Rings: only for Earth datacenters
  const ringsData = useMemo(() => {
    if (celestialBody !== 'earth') return [];
    const rings: any[] = regions.map(r => ({
      lat: r.lat, lng: r.lng, maxR: 3, propagationSpeed: 1, repeatPeriod: 2500,
      color: [getIntensityColor(r.carbonIntensity) + '80'],
    }));
    return rings;
  }, [regions, celestialBody]);

  const arcsData = useMemo(() => [] as any[], []);

  // Orbit trajectory paths
  const pathsData = useMemo(() => [] as any[], [satellites, celestialBody]);

  // Click handler — unified: stop rotation, set pin, call parent
  const handleRegionClickRef = useRef<(region: any) => void>(() => {});
  handleRegionClickRef.current = (data: any) => {
    const c = globeRef.current?.controls();
    if (c) c.autoRotate = false;

    if (celestialBody === 'earth') {
      const region = regions.find(r => r.id === data.id);
      if (region) {
        globeRef.current?.pointOfView({ lat: region.lat, lng: region.lng, altitude: 0.8 }, 800);
        setClickedPin({ lat: region.lat, lng: region.lng, name: region.name, co2: region.carbonIntensity });
        onLocationClick?.(region.id, region.name, 'earth', region.carbonIntensity, region);
      }
    } else if (celestialBody === 'orbit') {
      const sat = satellites.find(s => s.id === data.id);
      if (sat) {
        globeRef.current?.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: 0.8 }, 800);
        setClickedPin({ lat: sat.lat, lng: sat.lng, name: sat.name, co2: sat.carbonScore });
        onLocationClick?.(sat.id, sat.name, 'orbit', sat.carbonScore, undefined, sat);
      }
    } else {
      const loc = currentLocations.find(l => l.id === data.id);
      if (loc) {
        globeRef.current?.pointOfView({ lat: loc.lat, lng: loc.lng, altitude: 0.8 }, 800);
        setClickedPin({ lat: loc.lat, lng: loc.lng, name: loc.name, co2: loc.carbonIntensity });
        onLocationClick?.(loc.id, loc.name, celestialBody, loc.carbonIntensity, undefined, undefined, loc);
      }
    }
  };

  // Polygon click handler for heatmap countries
  const handlePolygonClick = useCallback((polygon: any, _event: MouseEvent, coords: { lat: number; lng: number }) => {
    // Stop auto-rotation so user can examine
    const c = globeRef.current?.controls();
    if (c) c.autoRotate = false;

    const centroid = getCentroid(polygon.geometry);
    estimateCO2(centroid.lat, centroid.lng, polygon.properties.name).then((co2) => {
      setCountryCO2((prev) => new Map(prev).set(polygon.properties.name, co2));
      setClickedPin({ lat: coords.lat, lng: coords.lng, name: polygon.properties.name, co2: co2.co2_intensity_gco2 });
      onCountryClick?.({ name: polygon.properties.name, lat: coords.lat, lng: coords.lng, co2 });
      globeRef.current?.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 1.2 }, 1000);
    });
  }, [onCountryClick]);

  // Globe surface click — works on all bodies (moon/mars have no polygons to click)
  const handleGlobeClick = useCallback(({ lat, lng }: { lat: number; lng: number }) => {
    const c = globeRef.current?.controls();
    if (c) c.autoRotate = false;

    const body = celestialBody;
    const label = `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;

    if (body === 'earth') {
      // On Earth, polygon click handles countries — globe click is fallback for ocean areas
      setClickedPin({ lat, lng, name: label, co2: 0 });
      onLocationClick?.(`custom-${lat.toFixed(2)}-${lng.toFixed(2)}`, label, 'earth', 0);
    } else if (body === 'moon' || body === 'mars') {
      // Find nearest predefined location (snap if within ~10°, otherwise create custom)
      const DEG2RAD = Math.PI / 180;
      let nearest: ExtraterrestrialLocation | undefined;
      let minDist = Infinity;
      for (const loc of currentLocations) {
        const dLat = (loc.lat - lat) * DEG2RAD;
        const dLng = (loc.lng - lng) * DEG2RAD;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat*DEG2RAD)*Math.cos(loc.lat*DEG2RAD)*Math.sin(dLng/2)**2;
        const dist = 2 * Math.asin(Math.sqrt(a)) / DEG2RAD; // degrees
        if (dist < minDist) { minDist = dist; nearest = loc; }
      }

      if (nearest && minDist < 10) {
        // Snap to nearest known location
        setClickedPin({ lat: nearest.lat, lng: nearest.lng, name: nearest.name, co2: nearest.carbonIntensity });
        onLocationClick?.(nearest.id, nearest.name, body, nearest.carbonIntensity, undefined, undefined, nearest);
        globeRef.current?.pointOfView({ lat: nearest.lat, lng: nearest.lng, altitude: 1.2 }, 1000);
      } else {
        // Custom location — build a synthetic ExtraterrestrialLocation with computed metrics
        const siteName = `${body === 'moon' ? 'Lunar' : 'Martian'} Site (${label})`;
        const customET: ExtraterrestrialLocation = {
          id: `custom-${body}-${lat.toFixed(2)}-${lng.toFixed(2)}`,
          name: siteName,
          location: `${lat.toFixed(1)}° lat, ${lng.toFixed(1)}° lng`,
          lat, lng, body: body as CelestialBody,
          carbonIntensity: 0, baseCarbonIntensity: 0,
          powerSource: body === 'moon' ? 'Solar' : 'Solar + Nuclear',
          capacity: 'TBD', status: 'Custom site',
          ...(body === 'moon' ? {
            illuminationPct: Math.abs(lat) > 80 ? 70 + Math.round((90 - Math.abs(lat)) * 2.3) : 50,
            avgTemperatureC: Math.abs(lat) > 80 ? -170 : -23 + Math.abs(lat) * -1.5,
            earthVisible: Math.abs(lng) < 90,
            iceProximityKm: Math.abs(lat) > 80 ? Math.round(Math.abs(90 - Math.abs(lat)) * 5) : 1000,
            latencyToEarthMs: Math.abs(lng) < 90 ? 1300 : 2600,
            coolingEfficiency: Math.abs(lat) > 80 ? 94 : 60,
            radiationLevel: 'high' as const,
            constructionCostMw: 5e8,
          } : {
            solarIrradianceW: Math.abs(lat) < 15 ? 560 : Math.abs(lat) < 30 ? 520 : Math.abs(lat) < 45 ? 440 : 350,
            avgTemperatureC: -33 - Math.abs(lat) * 0.8,
            dustStormsPerYear: 20,
            elevationKm: 0,
            latencyToEarthMs: 750000,
            coolingEfficiency: 80,
            radiationLevel: 'extreme' as const,
            constructionCostMw: 1.2e9,
          }),
        };
        setClickedPin({ lat, lng, name: siteName, co2: 0 });
        onLocationClick?.(customET.id, siteName, body, 0, undefined, undefined, customET);
        globeRef.current?.pointOfView({ lat, lng, altitude: 1.2 }, 1000);
      }
      return;
    }

    globeRef.current?.pointOfView({ lat, lng, altitude: 1.2 }, 1000);
  }, [celestialBody, onLocationClick, currentLocations]);

  // HTML elements: user's datacenter pins on Earth, satellite markers on orbit, plus clicked pin
  const htmlElementsData = useMemo(() => {
    if (celestialBody === 'earth') {
      const els: any[] = regions.map(r => ({
        lat: r.lat, lng: r.lng, alt: 0.02,
        id: r.id, name: r.id, carbon: r.carbonIntensity, loc: r.location,
        isSatellite: false, isClickedPin: false, satData: null as SatelliteData | null,
      }));
      if (clickedPin) {
        els.push({
          lat: clickedPin.lat, lng: clickedPin.lng, alt: 0.02,
          id: `clicked-${clickedPin.name}`, name: clickedPin.name, carbon: clickedPin.co2, loc: clickedPin.name,
          isSatellite: false, isClickedPin: true, satData: null,
        });
      }
      return els;
    }
    if (celestialBody === 'orbit') {
      return satellites.map(s => ({
        lat: s.lat, lng: s.lng, alt: s.altitude + 0.01,
        id: s.id, name: s.name, carbon: s.carbonScore, loc: s.status,
        isSatellite: true, isClickedPin: false, satData: s,
      }));
    }
    // Moon and Mars: render locations as pins
    if (celestialBody === 'moon' || celestialBody === 'mars') {
      const els: any[] = currentLocations.map(loc => ({
        lat: loc.lat, lng: loc.lng, alt: 0.02,
        id: loc.id, name: loc.name, carbon: loc.carbonIntensity,
        loc: loc.location, powerSource: loc.powerSource,
        capacity: loc.capacity, status: loc.status,
        body: loc.body,
        illuminationPct: loc.illuminationPct,
        avgTemperatureC: loc.avgTemperatureC,
        tempRangeC: loc.tempRangeC,
        solarIrradianceW: loc.solarIrradianceW,
        dustStormsPerYear: loc.dustStormsPerYear,
        elevationKm: loc.elevationKm,
        latencyToEarthMs: loc.latencyToEarthMs,
        coolingEfficiency: loc.coolingEfficiency,
        radiationLevel: loc.radiationLevel,
        earthVisible: loc.earthVisible,
        iceProximityKm: loc.iceProximityKm,
        isSatellite: false, isClickedPin: false, isExtraterrestrial: true,
        satData: null as SatelliteData | null,
      }));
      if (clickedPin) {
        els.push({
          lat: clickedPin.lat, lng: clickedPin.lng, alt: 0.02,
          id: `clicked-${clickedPin.name}`, name: clickedPin.name, carbon: clickedPin.co2, loc: clickedPin.name,
          isSatellite: false, isClickedPin: true, isExtraterrestrial: false,
          satData: null,
        });
      }
      return els;
    }
    return [];
  }, [regions, satellites, celestialBody, clickedPin, currentLocations]);

  const htmlElementFn = useCallback((d: any) => {
    if (d.isSatellite) {
      return createSatelliteElement(d, handleRegionClickRef);
    }
    if (d.isClickedPin) {
      return createClickedPinElement(d);
    }
    if (d.isExtraterrestrial) {
      return createExtraterrestrialElement(d, handleRegionClickRef);
    }
    return createDatacenterElement(d, handleRegionClickRef);
  }, []);

  const showHeatmap = dataLayers?.heatmap ?? true;

  // Camera tracking via onZoom prop — leading + trailing throttle
  // Clamp altitude to MIN_ALT so LOD/hex resolution freezes below that threshold
  const MIN_ALT = 1.5;
  const handleZoom = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    const now = Date.now();
    const clamped = { lat: pov.lat, lng: pov.lng, altitude: Math.max(pov.altitude, MIN_ALT) };
    // Leading: immediate update if 800ms since last
    if (now - lastZoomUpdateRef.current > 800) {
      lastZoomUpdateRef.current = now;
      setCamera(clamped);
    }
    // Trailing: final update after interaction stops
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => {
      lastZoomUpdateRef.current = Date.now();
      setCamera(clamped);
    }, 400);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {dims.w > 0 && (
        <Globe
          ref={globeRef}
          width={dims.w}
          height={dims.h}
          globeImageUrl={config.textureUrl}
          backgroundImageUrl={config.backgroundUrl}
          atmosphereColor={config.atmosphereColor}
          atmosphereAltitude={config.atmosphereAltitude}
          showAtmosphere={config.showAtmosphere}
          onGlobeClick={handleGlobeClick}
          onZoom={handleZoom}
          pointsData={pointsData}
          pointLat="lat" pointLng="lng" pointAltitude="alt"
          pointColor="color" pointRadius="radius" pointLabel="label"
          hexBinPointsData={hexBinData}
          hexBinPointLat={(d: any) => d.lat}
          hexBinPointLng={(d: any) => d.lng}
          hexBinPointWeight={(d: any) => d.totalCapacityMW || 1}
          hexBinResolution={hexBinResolution}
          hexTopColor={(d: any) => {
            const pts = d.points as any[];
            const fuelCap: Record<string, number> = {};
            for (const p of pts) {
              for (const [fuel, mw] of Object.entries(p.fuelBreakdown || {})) {
                fuelCap[fuel] = (fuelCap[fuel] || 0) + (mw as number);
              }
            }
            let dominant = 'other', max = 0;
            for (const [f, c] of Object.entries(fuelCap)) { if (c > max) { max = c; dominant = f; } }
            return getFuelColor(dominant) + 'cc';
          }}
          hexSideColor={(d: any) => {
            const pts = d.points as any[];
            const fuelCap: Record<string, number> = {};
            for (const p of pts) {
              for (const [fuel, mw] of Object.entries(p.fuelBreakdown || {})) {
                fuelCap[fuel] = (fuelCap[fuel] || 0) + (mw as number);
              }
            }
            let dominant = 'other', max = 0;
            for (const [f, c] of Object.entries(fuelCap)) { if (c > max) { max = c; dominant = f; } }
            return getFuelColor(dominant) + '88';
          }}
          hexAltitude={(d: any) => Math.max(0.01, Math.min(0.5, d.sumWeight / 200000))}
          hexLabel={(d: any) => {
            const pts = d.points as any[];
            const totalPlants = pts.reduce((s: number, p: any) => s + (p.count || 1), 0);
            const totalMW = Math.round(d.sumWeight);
            const totalEmissions = Math.round(pts.reduce((s: number, p: any) => s + (p.totalEmissions || 0), 0));
            const fuelCap: Record<string, number> = {};
            for (const p of pts) {
              for (const [fuel, mw] of Object.entries(p.fuelBreakdown || {})) {
                fuelCap[fuel] = (fuelCap[fuel] || 0) + (mw as number);
              }
            }
            const sorted = Object.entries(fuelCap).sort((a, b) => b[1] - a[1]).slice(0, 4);
            const breakdown = sorted.map(([f, mw]) => `${f}: ${Math.round(mw).toLocaleString()} MW`).join('<br/>');
            return `<b>${totalPlants.toLocaleString()} Power Plant${totalPlants > 1 ? 's' : ''}</b><br/>` +
              `${totalMW.toLocaleString()} MW total<br/>` +
              `${totalEmissions.toLocaleString()} tCO₂e<br/>` +
              `<hr style="border-color:rgba(255,255,255,0.2);margin:3px 0"/>${breakdown}`;
          }}
          hexMargin={0.2}
          hexTransitionDuration={0}
          ringsData={ringsData}
          ringLat="lat" ringLng="lng"
          ringColor="color" ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed" ringRepeatPeriod="repeatPeriod"
          arcsData={arcsData}
          arcStartLat="startLat" arcStartLng="startLng"
          arcEndLat="endLat" arcEndLng="endLng"
          arcColor="color" arcStroke="stroke"
          arcDashLength={0.6} arcDashGap={0.3} arcDashAnimateTime={1500}
          labelsData={labelsData}
          labelLat="lat" labelLng="lng" labelAltitude="alt"
          labelText="text" labelColor="color" labelSize="size"
          labelDotRadius={0.3} labelResolution={2}
          polygonsData={
            showHeatmap && celestialBody === 'earth' ? countries
            : celestialBody === 'mars' ? marsGeology
            : []
          }
          polygonGeoJsonGeometry={(d: any) => d.geometry}
          polygonCapColor={(d: any) => {
            if (celestialBody === 'mars') {
              // Color by geologic age: Noachian (old, red) -> Hesperian (mid, orange) -> Amazonian (young, blue)
              const age = d.properties?.age || '';
              if (age.startsWith('lA') || age.includes('Amazonian')) return 'rgba(60, 120, 200, 0.3)';
              if (age.startsWith('H') || age.includes('Hesperian')) return 'rgba(200, 140, 60, 0.3)';
              if (age.startsWith('N') || age.includes('Noachian')) return 'rgba(180, 80, 60, 0.3)';
              return 'rgba(120, 100, 80, 0.2)';
            }
            // Earth country heatmap (existing logic)
            const co2 = countryCO2.get(d.properties.name);
            if (!co2) return 'rgba(100, 100, 100, 0.15)';
            return getIntensityColor(co2.co2_intensity_gco2) + '66';
          }}
          polygonSideColor={() => 'rgba(0, 0, 0, 0)'}
          polygonStrokeColor={() => celestialBody === 'mars' ? 'rgba(200, 140, 60, 0.4)' : 'rgba(0, 212, 255, 0.3)'}
          polygonAltitude={0.005}
          polygonLabel={(d: any) => {
            if (celestialBody === 'mars') {
              const name = d.properties?.unit_name || d.properties?.age || 'Unknown';
              const area = d.properties?.area_km2;
              return `<b>${name}</b>${area ? `<br/>${Math.round(area).toLocaleString()} km²` : ''}`;
            }
            const co2 = countryCO2.get(d.properties.name);
            return `<b>${d.properties.name}</b>${co2 ? `<br/>${co2.co2_intensity_gco2} g CO₂/kWh` : ''}`;
          }}
          onPolygonClick={handlePolygonClick as any}
          htmlElementsData={htmlElementsData}
          htmlLat="lat" htmlLng="lng" htmlAltitude="alt"
          htmlElement={htmlElementFn}
          pathsData={pathsData}
          pathPoints="points"
          pathPointLat="lat" pathPointLng="lng" pathPointAlt="alt"
          pathColor="color"
          pathStroke="stroke"
          pathDashLength={1}
          pathDashGap={0}
          pathDashAnimateTime={0}
          animateIn={true}
        />
      )}
      <CelestialSwitcher active={celestialBody} onChange={onCelestialBodyChange} />
      {celestialBody === 'earth' && dataLayers && onDataLayersChange && (
        <div className="absolute bottom-14 right-4 z-20 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 space-y-1.5 max-w-[200px]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Layers</p>
          <p className="text-[8px] text-muted-foreground/60 font-mono">alt:{camera.altitude.toFixed(1)} hex:{hexBinResolution} pts:{hexBinData.length}</p>

          {/* Fuel type legend — shown above checkboxes when power plants active */}
          {dataLayers.powerPlants && (
            <div className="pb-1.5 border-b border-border/50 space-y-0.5">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Fuel Type</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {FUEL_LEGEND.map(([fuel, color]) => (
                  <div key={fuel} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[9px] text-muted-foreground capitalize">{fuel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Provider legend — shown above checkboxes when datacenters active */}
          {dataLayers.datacenters && (
            <div className="pb-1.5 border-b border-border/50 space-y-0.5">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Provider</p>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {PROVIDER_LEGEND.map(([provider, color]) => (
                  <div key={provider} className="flex items-center gap-1">
                    <div className="w-2 h-2 rotate-45" style={{ backgroundColor: color }} />
                    <span className="text-[9px] text-muted-foreground uppercase">{provider}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dataLayers.heatmap}
              onChange={() => onDataLayersChange({ ...dataLayers, heatmap: !dataLayers.heatmap })}
              className="accent-primary w-3 h-3"
            />
            <span className="text-xs text-foreground">CO₂ Heatmap</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dataLayers.powerPlants}
              onChange={() => onDataLayersChange({ ...dataLayers, powerPlants: !dataLayers.powerPlants })}
              className="accent-primary w-3 h-3"
            />
            <span className="text-xs text-foreground">
              Power Plants
              {powerPlantLOD ? <span className="text-muted-foreground ml-1">({powerPlantLOD.totalCount.toLocaleString()})</span> : null}
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dataLayers.datacenters}
              onChange={() => onDataLayersChange({ ...dataLayers, datacenters: !dataLayers.datacenters })}
              className="accent-primary w-3 h-3"
            />
            <span className="text-xs text-foreground">
              Global Datacenters
              {globalDatacenters ? <span className="text-muted-foreground ml-1">({globalDatacenters.length})</span> : null}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

// Create a satellite-shaped HTML element with info panel
function createSatelliteElement(d: any, clickRef: React.MutableRefObject<(data: any) => void>) {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.transition = 'all 0.2s ease';
  el.style.pointerEvents = 'auto';
  el.style.zIndex = '10';

  const info = SATELLITE_INFO[d.id] || { size: 'Unknown', mass: 'Unknown', altitudeKm: 0, co2: 'N/A' };

  // Satellite icon container
  const icon = document.createElement('div');
  icon.style.width = '56px';
  icon.style.height = '56px';
  icon.style.position = 'relative';
  icon.style.display = 'flex';
  icon.style.alignItems = 'center';
  icon.style.justifyContent = 'center';

  // Solar panel wings
  const leftPanel = document.createElement('div');
  leftPanel.style.position = 'absolute';
  leftPanel.style.left = '2px';
  leftPanel.style.top = '50%';
  leftPanel.style.transform = 'translateY(-50%)';
  leftPanel.style.width = '16px';
  leftPanel.style.height = '8px';
  leftPanel.style.background = `linear-gradient(135deg, ${d.satData?.color || '#00d4ff'}88, ${d.satData?.color || '#00d4ff'}44)`;
  leftPanel.style.border = `1px solid ${d.satData?.color || '#00d4ff'}`;
  leftPanel.style.borderRadius = '1px';

  const rightPanel = document.createElement('div');
  rightPanel.style.position = 'absolute';
  rightPanel.style.right = '2px';
  rightPanel.style.top = '50%';
  rightPanel.style.transform = 'translateY(-50%)';
  rightPanel.style.width = '16px';
  rightPanel.style.height = '8px';
  rightPanel.style.background = `linear-gradient(135deg, ${d.satData?.color || '#00d4ff'}88, ${d.satData?.color || '#00d4ff'}44)`;
  rightPanel.style.border = `1px solid ${d.satData?.color || '#00d4ff'}`;
  rightPanel.style.borderRadius = '1px';

  // Body
  const body = document.createElement('div');
  body.style.width = '14px';
  body.style.height = '14px';
  body.style.borderRadius = '2px';
  body.style.background = d.satData?.color || '#00d4ff';
  body.style.boxShadow = `0 0 12px ${d.satData?.color || '#00d4ff'}88, 0 0 24px ${d.satData?.color || '#00d4ff'}44`;
  body.style.zIndex = '2';
  body.style.position = 'relative';

  icon.appendChild(leftPanel);
  icon.appendChild(body);
  icon.appendChild(rightPanel);

  // Info tag - hidden by default, shown on click
  const tag = document.createElement('div');
  tag.style.marginTop = '4px';
  tag.style.background = 'rgba(10, 14, 26, 0.9)';
  tag.style.backdropFilter = 'blur(8px)';
  tag.style.border = `1px solid ${d.satData?.color || '#00d4ff'}55`;
  tag.style.borderRadius = '6px';
  tag.style.padding = '6px 10px';
  tag.style.whiteSpace = 'nowrap';
  tag.style.textAlign = 'center';
  tag.style.minWidth = '120px';
  tag.style.display = 'none';
  tag.style.transition = 'opacity 0.2s ease';
  tag.setAttribute('data-sat-tag', d.id);

  const altKm = d.satData?.altitudeKm || info.altitudeKm || 0;
  const power = d.satData?.powerAvailabilityW;
  const eclipse = d.satData?.eclipseFraction;
  const radiation = d.satData?.radiationLevel;
  const latency = d.satData?.latencyMs;

  tag.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:${d.satData?.color || '#00d4ff'};margin-bottom:3px;">${d.name}</div>
    <div style="font-size:8px;color:#8899aa;line-height:1.5;">
      <span style="color:#ccd;">Alt:</span> ${altKm.toLocaleString()} km<br/>
      ${power ? `<span style="color:#ccd;">Power:</span> ${power} W/m&sup2;<br/>` : `<span style="color:#ccd;">Size:</span> ${info.size}<br/>`}
      ${eclipse !== undefined ? `<span style="color:#ccd;">Eclipse:</span> ${(eclipse * 100).toFixed(1)}%<br/>` : ''}
      ${radiation ? `<span style="color:#ccd;">Radiation:</span> ${radiation}<br/>` : ''}
      ${latency !== undefined ? `<span style="color:#ccd;">Latency:</span> ${latency.toFixed(1)} ms<br/>` : ''}
      <span style="color:#ccd;">CO&#8322;:</span> ${info.co2 || 'Solar powered'}
    </div>
  `;

  el.appendChild(icon);
  el.appendChild(tag);

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1.15)';
    body.style.boxShadow = `0 0 20px ${d.satData?.color || '#00d4ff'}, 0 0 40px ${d.satData?.color || '#00d4ff'}88`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1)';
    body.style.boxShadow = `0 0 12px ${d.satData?.color || '#00d4ff'}88, 0 0 24px ${d.satData?.color || '#00d4ff'}44`;
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Hide all other satellite tags, then show this one
    document.querySelectorAll('[data-sat-tag]').forEach(t => {
      (t as HTMLElement).style.display = 'none';
    });
    tag.style.display = 'block';
    clickRef.current(d);
  });

  el.title = `${d.name} — Click for details`;
  return el;
}

// Create a datacenter HTML element (existing style)
function createDatacenterElement(d: any, clickRef: React.MutableRefObject<(data: any) => void>) {
  const el = document.createElement('div');
  el.style.width = '48px';
  el.style.height = '48px';
  el.style.borderRadius = '50%';
  el.style.cursor = 'pointer';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.transition = 'all 0.2s ease';
  el.style.pointerEvents = 'auto';
  el.style.zIndex = '10';

  const color = d.carbon > 0 ? getIntensityColor(d.carbon) : '#00d4ff';
  el.style.border = `2px solid ${color}`;
  el.style.background = `radial-gradient(circle, ${color}33 0%, transparent 70%)`;
  el.style.boxShadow = `0 0 12px ${color}66`;

  const dot = document.createElement('div');
  dot.style.width = '8px';
  dot.style.height = '8px';
  dot.style.borderRadius = '50%';
  dot.style.background = color;
  dot.style.boxShadow = `0 0 6px ${color}`;
  el.appendChild(dot);

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1.3)';
    el.style.boxShadow = `0 0 24px ${color}aa`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1)';
    el.style.boxShadow = `0 0 12px ${color}66`;
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clickRef.current(d);
  });

  el.title = `${d.name} · ${d.loc} — Click to explore`;
  return el;
}

// Create a pin for a clicked country on the heatmap
function createClickedPinElement(d: any) {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.transform = 'translate(-50%, -100%)';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '20';

  const color = d.carbon > 0 ? getIntensityColor(d.carbon) : '#00d4ff';

  // Pin marker
  const pin = document.createElement('div');
  pin.style.width = '12px';
  pin.style.height = '12px';
  pin.style.borderRadius = '50%';
  pin.style.background = color;
  pin.style.border = '2px solid #fff';
  pin.style.boxShadow = `0 0 10px ${color}, 0 2px 8px rgba(0,0,0,0.5)`;

  // Label tag
  const tag = document.createElement('div');
  tag.style.marginBottom = '4px';
  tag.style.background = 'rgba(10, 14, 26, 0.92)';
  tag.style.backdropFilter = 'blur(8px)';
  tag.style.border = `1px solid ${color}66`;
  tag.style.borderRadius = '6px';
  tag.style.padding = '4px 8px';
  tag.style.whiteSpace = 'nowrap';
  tag.style.textAlign = 'center';
  tag.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:#fff;">${d.name}</div>
    <div style="font-size:9px;color:${color};margin-top:1px;">${d.carbon} g CO₂/kWh</div>
  `;

  el.appendChild(tag);
  el.appendChild(pin);
  return el;
}

// Create an extraterrestrial location pin (moon/mars bases)
function createExtraterrestrialElement(d: any, clickRef: React.MutableRefObject<(data: any) => void>) {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -50%)';
  el.style.transition = 'all 0.2s ease';
  el.style.pointerEvents = 'auto';
  el.style.zIndex = '10';

  const accentColor = d.carbon === 0 ? '#00e5ff' : '#ff9800';

  // Diamond-shaped marker
  const marker = document.createElement('div');
  marker.style.width = '18px';
  marker.style.height = '18px';
  marker.style.transform = 'rotate(45deg)';
  marker.style.background = `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`;
  marker.style.border = `2px solid ${accentColor}`;
  marker.style.boxShadow = `0 0 14px ${accentColor}88, 0 0 28px ${accentColor}44`;
  marker.style.borderRadius = '3px';

  // Pulsing ring
  const ring = document.createElement('div');
  ring.style.position = 'absolute';
  ring.style.width = '36px';
  ring.style.height = '36px';
  ring.style.borderRadius = '50%';
  ring.style.border = `1px solid ${accentColor}55`;
  ring.style.top = '-9px';
  ring.style.left = '-9px';
  ring.style.animation = 'pulse 2s infinite';

  const markerWrap = document.createElement('div');
  markerWrap.style.position = 'relative';
  markerWrap.style.display = 'flex';
  markerWrap.style.alignItems = 'center';
  markerWrap.style.justifyContent = 'center';
  markerWrap.appendChild(ring);
  markerWrap.appendChild(marker);

  // Info tag (shown on hover/click)
  const tag = document.createElement('div');
  tag.style.marginTop = '6px';
  tag.style.background = 'rgba(10, 14, 26, 0.92)';
  tag.style.backdropFilter = 'blur(8px)';
  tag.style.border = `1px solid ${accentColor}55`;
  tag.style.borderRadius = '6px';
  tag.style.padding = '6px 10px';
  tag.style.whiteSpace = 'nowrap';
  tag.style.textAlign = 'center';
  tag.style.minWidth = '120px';
  tag.style.display = 'none';
  tag.style.transition = 'opacity 0.2s ease';
  tag.setAttribute('data-et-tag', d.id);

  // Build body-specific metrics
  let metricsHtml = '';
  if (d.body === 'moon') {
    metricsHtml = `
      ${d.illuminationPct != null ? `<span style="color:#ccd;">Solar:</span> ${d.illuminationPct}% illumination<br/>` : ''}
      ${d.avgTemperatureC != null ? `<span style="color:#ccd;">Temp:</span> ${d.avgTemperatureC}°C` : ''}
      ${d.tempRangeC ? ` <span style="color:#667;">(${d.tempRangeC[0]}° to ${d.tempRangeC[1]}°)</span><br/>` : '<br/>'}
      ${d.earthVisible != null ? `<span style="color:#ccd;">Earth LOS:</span> ${d.earthVisible ? '✓ Direct' : '✗ Relay needed'}<br/>` : ''}
      ${d.iceProximityKm != null ? `<span style="color:#ccd;">Ice:</span> ${d.iceProximityKm === 0 ? 'On-site' : d.iceProximityKm + ' km'}<br/>` : ''}
      ${d.coolingEfficiency != null ? `<span style="color:#ccd;">Cooling:</span> ${d.coolingEfficiency}/100<br/>` : ''}
      ${d.radiationLevel ? `<span style="color:#ccd;">Radiation:</span> ${d.radiationLevel}<br/>` : ''}
    `;
  } else if (d.body === 'mars') {
    metricsHtml = `
      ${d.solarIrradianceW != null ? `<span style="color:#ccd;">Solar:</span> ${d.solarIrradianceW} W/m²<br/>` : ''}
      ${d.avgTemperatureC != null ? `<span style="color:#ccd;">Temp:</span> ${d.avgTemperatureC}°C<br/>` : ''}
      ${d.dustStormsPerYear != null ? `<span style="color:#ccd;">Dust:</span> ${d.dustStormsPerYear} storms/yr<br/>` : ''}
      ${d.elevationKm != null ? `<span style="color:#ccd;">Elevation:</span> ${d.elevationKm > 0 ? '+' : ''}${d.elevationKm} km<br/>` : ''}
      ${d.coolingEfficiency != null ? `<span style="color:#ccd;">Cooling:</span> ${d.coolingEfficiency}/100<br/>` : ''}
      ${d.radiationLevel ? `<span style="color:#ccd;">Radiation:</span> ${d.radiationLevel}<br/>` : ''}
    `;
  }
  const latencyStr = d.latencyToEarthMs != null
    ? d.latencyToEarthMs < 5000 ? `${(d.latencyToEarthMs / 1000).toFixed(1)}s` : `${Math.round(d.latencyToEarthMs / 60000)} min`
    : null;

  tag.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:${accentColor};margin-bottom:3px;">${d.name}</div>
    <div style="font-size:8px;color:#8899aa;line-height:1.5;">
      <span style="color:#ccd;">Power:</span> ${d.powerSource || 'Solar'} · ${d.capacity || 'N/A'}<br/>
      ${metricsHtml}
      ${latencyStr ? `<span style="color:#ccd;">Latency:</span> ${latencyStr}<br/>` : ''}
      <span style="color:#667;font-style:italic;">${d.status || 'Planned'}</span>
    </div>
  `;

  el.appendChild(markerWrap);
  el.appendChild(tag);

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1.2)';
    marker.style.boxShadow = `0 0 20px ${accentColor}, 0 0 40px ${accentColor}88`;
    tag.style.display = 'block';
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'translate(-50%, -50%) scale(1)';
    marker.style.boxShadow = `0 0 14px ${accentColor}88, 0 0 28px ${accentColor}44`;
    tag.style.display = 'none';
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Hide all other tags
    document.querySelectorAll('[data-et-tag]').forEach(t => {
      (t as HTMLElement).style.display = 'none';
    });
    tag.style.display = 'block';
    clickRef.current(d);
  });

  el.title = `${d.name} — ${d.loc} — Click to explore`;
  return el;
}

