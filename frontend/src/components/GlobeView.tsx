import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import { GroundRegion, SatelliteData, getIntensityColor, USER_LOCATION, updateSatellitePosition } from '@/lib/constants';
import { CelestialBody, CELESTIAL_CONFIGS, MOON_LOCATIONS, MARS_LOCATIONS, type ExtraterrestrialLocation } from '@/lib/celestial';
import CelestialSwitcher from './CelestialSwitcher';
import PlanarView from './PlanarView';

interface Props {
  regions: GroundRegion[];
  satellites: SatelliteData[];
  routingTarget: { lat: number; lng: number } | null;
  celestialBody: CelestialBody;
  onCelestialBodyChange: (body: CelestialBody) => void;
  onLocationClick?: (id: string, name: string, body: string, carbon: number) => void;
  zoomTarget?: { lat: number; lng: number } | null;
  moonLocations?: ExtraterrestrialLocation[];
  marsLocations?: ExtraterrestrialLocation[];
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

export default function GlobeView({ regions, satellites, routingTarget, celestialBody, onCelestialBodyChange, onLocationClick, zoomTarget, moonLocations, marsLocations }: Props) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [selectedRegion, setSelectedRegion] = useState<GroundRegion | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteData | null>(null);

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

  const currentLocations = useMemo(() => {
    if (celestialBody === 'moon') return moonLocations ?? MOON_LOCATIONS;
    if (celestialBody === 'mars') return marsLocations ?? MARS_LOCATIONS;
    return [];
  }, [celestialBody, moonLocations, marsLocations]);

  // Points: Earth datacenters only, orbit shows nothing (uses HTML elements)
  const pointsData = useMemo(() => {
    if (celestialBody === 'earth') {
      return regions.map(r => ({
        lat: r.lat, lng: r.lng, alt: 0.01,
        color: getIntensityColor(r.carbonIntensity),
        radius: 0.55, label: `<b>${r.id}</b><br/>${r.carbonIntensity}g CO₂/kWh<br/>${r.location}`,
        regionId: r.id,
      }));
    }
    return [];
  }, [regions, celestialBody]);

  const labelsData = useMemo(() => {
    if (celestialBody === 'earth') {
      return regions.map(r => ({
        lat: r.lat, lng: r.lng, alt: 0.015,
        text: `${r.id}\n${r.carbonIntensity}g`,
        color: getIntensityColor(r.carbonIntensity),
        size: 0.6,
      }));
    }
    return [];
  }, [regions, celestialBody]);

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

  // Click handler
  const handleRegionClickRef = useRef<(region: any) => void>(() => {});
  handleRegionClickRef.current = (data: any) => {
    if (celestialBody === 'earth') {
      const region = regions.find(r => r.id === data.id);
      if (region) {
        if (globeRef.current) {
          globeRef.current.pointOfView({ lat: region.lat, lng: region.lng, altitude: 0.8 }, 800);
        }
        setTimeout(() => setSelectedRegion(region), 850);
        onLocationClick?.(region.id, region.name, 'earth', region.carbonIntensity);
      }
    } else if (celestialBody === 'orbit') {
      const sat = satellites.find(s => s.id === data.id);
      if (sat) {
        if (globeRef.current) {
          globeRef.current.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: 0.8 }, 800);
        }
        setTimeout(() => setSelectedSatellite(sat), 850);
        onLocationClick?.(sat.id, sat.name, 'orbit', sat.carbonScore);
      }
    } else {
      const loc = currentLocations.find(l => l.id === data.id);
      if (loc) {
        if (globeRef.current) {
          globeRef.current.pointOfView({ lat: loc.lat, lng: loc.lng, altitude: 0.8 }, 800);
        }
        onLocationClick?.(loc.id, loc.name, celestialBody, loc.carbonIntensity);
      }
    }
  };

  // HTML elements: datacenter pins on Earth, satellite markers on orbit
  const htmlElementsData = useMemo(() => {
    if (celestialBody === 'earth') {
      return regions.map(r => ({
        lat: r.lat, lng: r.lng, alt: 0.02,
        id: r.id, name: r.id, carbon: r.carbonIntensity, loc: r.location,
        isSatellite: false, satData: null as SatelliteData | null,
      }));
    }
    if (celestialBody === 'orbit') {
      return satellites.map(s => ({
        lat: s.lat, lng: s.lng, alt: s.altitude + 0.01,
        id: s.id, name: s.name, carbon: s.carbonScore, loc: s.status,
        isSatellite: true, satData: s,
      }));
    }
    return [];
  }, [regions, satellites, celestialBody]);

  const htmlElementFn = useCallback((d: any) => {
    if (d.isSatellite) {
      return createSatelliteElement(d, handleRegionClickRef);
    }
    return createDatacenterElement(d, handleRegionClickRef);
  }, []);

  if (selectedRegion && celestialBody === 'earth') {
    return (
      <div ref={containerRef} className="w-full h-full relative">
        <PlanarView
          regions={regions}
          satellites={satellites}
          focusRegion={selectedRegion}
          onBack={() => setSelectedRegion(null)}
        />
      </div>
    );
  }

  if (selectedSatellite && celestialBody === 'orbit') {
    const satInfo = SATELLITE_INFO[selectedSatellite.id];
    return (
      <div ref={containerRef} className="w-full h-full relative bg-background overflow-hidden animate-slide-up">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }} />

        {/* Back button */}
        <button
          onClick={() => setSelectedSatellite(null)}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border"
        >
          <span className="text-base">←</span>
          Back to Globe
        </button>

        {/* Satellite title */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-border text-center">
          <p className="text-primary font-semibold text-sm">{selectedSatellite.name}</p>
          <p className="text-muted-foreground text-xs">{selectedSatellite.status}</p>
        </div>

        {/* Satellite detail card */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
            {/* Orbit indicator */}
            <div className="flex justify-center mb-2">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border border-primary/30" />
                <div className="absolute inset-3 rounded-full border border-primary/20" />
                <div className="absolute inset-6 rounded-full border border-primary/10" />
                <div
                  className="absolute w-3 h-3 rounded-full bg-primary shadow-lg shadow-primary/40 animate-pulse"
                  style={{ top: '8px', left: '50%', transform: 'translateX(-50%)' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-muted-foreground/20" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Inclination</p>
                <p className="text-sm font-semibold text-foreground">{selectedSatellite.inclination}°</p>
              </div>
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Carbon Score</p>
                <p className="text-sm font-semibold text-foreground">{selectedSatellite.carbonScore}</p>
              </div>
              {satInfo && (
                <>
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Size</p>
                    <p className="text-sm font-semibold text-foreground">{satInfo.size}</p>
                  </div>
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Altitude</p>
                    <p className="text-sm font-semibold text-foreground">{satInfo.altitudeKm.toLocaleString()} km</p>
                  </div>
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Mass</p>
                    <p className="text-sm font-semibold text-foreground">{satInfo.mass}</p>
                  </div>
                  <div className="bg-muted/60 rounded-lg px-3 py-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Emissions</p>
                    <p className="text-sm font-semibold text-foreground">{satInfo.co2}</p>
                  </div>
                </>
              )}
            </div>

            <div className="text-center pt-2">
              <p className="text-[10px] text-muted-foreground">
                Position: {selectedSatellite.lat.toFixed(2)}°, {selectedSatellite.lng.toFixed(2)}°
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          pointsData={pointsData}
          pointLat="lat" pointLng="lng" pointAltitude="alt"
          pointColor="color" pointRadius="radius" pointLabel="label"
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

  tag.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:${d.satData?.color || '#00d4ff'};margin-bottom:3px;">${d.name}</div>
    <div style="font-size:8px;color:#8899aa;line-height:1.5;">
      <span style="color:#ccd;">Alt:</span> ${info.altitudeKm.toLocaleString()} km<br/>
      <span style="color:#ccd;">Size:</span> ${info.size}<br/>
      <span style="color:#ccd;">CO₂:</span> ${info.co2}
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
