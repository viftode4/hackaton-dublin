import { useMemo } from 'react';
import { ArrowLeft, MapPin, Cpu, Zap } from 'lucide-react';
import { GroundRegion, SatelliteData, getIntensityColor } from '@/lib/constants';

interface Props {
  regions: GroundRegion[];
  satellites: SatelliteData[];
  focusRegion: GroundRegion;
  onBack: () => void;
}

// Mercator-ish projection for a bounding box around a focus point
function project(lat: number, lng: number, bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

export default function PlanarView({ regions, satellites, focusRegion, onBack }: Props) {
  // Build a bounding box centered on focusRegion with generous padding
  const bounds = useMemo(() => {
    const pad = 35;
    return {
      minLat: Math.max(-85, focusRegion.lat - pad),
      maxLat: Math.min(85, focusRegion.lat + pad),
      minLng: focusRegion.lng - pad * 1.5,
      maxLng: focusRegion.lng + pad * 1.5,
    };
  }, [focusRegion]);

  // Filter to visible items
  const visibleRegions = useMemo(() =>
    regions.filter(r => {
      const p = project(r.lat, r.lng, bounds);
      return p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100;
    }),
  [regions, bounds]);

  const visibleSatellites = useMemo(() =>
    satellites.filter(s => {
      const p = project(s.lat, s.lng, bounds);
      return p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100;
    }),
  [satellites, bounds]);

  return (
    <div className="w-full h-full bg-background relative overflow-hidden animate-slide-up">
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
        onClick={onBack}
        className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Globe
      </button>

      {/* Region title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card/90 backdrop-blur-sm rounded-lg px-4 py-2 border border-border">
        <p className="text-primary font-semibold text-sm">{focusRegion.name} · {focusRegion.location}</p>
        <p className="text-muted-foreground text-xs text-center">{focusRegion.carbonIntensity} g CO₂/kWh</p>
      </div>

      {/* Coordinate axes labels */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/50 z-10">
        Longitude {bounds.minLng.toFixed(0)}° → {bounds.maxLng.toFixed(0)}°
      </div>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-muted-foreground/50 z-10">
        Latitude {bounds.minLat.toFixed(0)}° → {bounds.maxLat.toFixed(0)}°
      </div>

      {/* Map area */}
      <div className="absolute inset-12 z-10">
        {/* Connection lines from focus to others */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {visibleRegions.filter(r => r.id !== focusRegion.id).map(r => {
            const from = project(focusRegion.lat, focusRegion.lng, bounds);
            const to = project(r.lat, r.lng, bounds);
            return (
              <line key={r.id}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="hsl(var(--primary) / 0.15)" strokeWidth="0.3"
                strokeDasharray="1 1"
              />
            );
          })}
        </svg>

        {/* Datacenter pins */}
        {visibleRegions.map(r => {
          const pos = project(r.lat, r.lng, bounds);
          const isFocus = r.id === focusRegion.id;
          return (
            <div
              key={r.id}
              className="absolute -translate-x-1/2 -translate-y-full group"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              {/* Pulse ring for focus */}
              {isFocus && (
                <div
                  className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-8 h-8 rounded-full animate-ping opacity-20"
                  style={{ backgroundColor: getIntensityColor(r.carbonIntensity) }}
                />
              )}

              {/* Pin */}
              <div className="flex flex-col items-center">
                <div
                  className={`rounded-lg px-2.5 py-1.5 text-center border transition-all ${
                    isFocus
                      ? 'bg-card border-primary shadow-lg shadow-primary/20 scale-110'
                      : 'bg-card/80 border-border hover:border-primary/50 hover:scale-105'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Cpu className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold text-foreground">{r.id}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{r.location}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getIntensityColor(r.carbonIntensity) }} />
                    <span className="text-[10px] font-semibold" style={{ color: getIntensityColor(r.carbonIntensity) }}>
                      {r.carbonIntensity}g
                    </span>
                  </div>
                </div>
                {/* Pin stem */}
                <div className="w-px h-3" style={{ backgroundColor: isFocus ? 'hsl(var(--primary))' : 'hsl(var(--border))' }} />
                <MapPin
                  className={`w-5 h-5 ${isFocus ? 'text-primary' : 'text-muted-foreground'}`}
                  fill={isFocus ? 'hsl(var(--primary) / 0.3)' : 'transparent'}
                />
              </div>
            </div>
          );
        })}

        {/* Dot at focus lat/lng */}
        {(() => {
          const pos = project(focusRegion.lat, focusRegion.lng, bounds);
          return (
            <div
              className="absolute w-2 h-2 rounded-full bg-primary -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            />
          );
        })()}
      </div>
    </div>
  );
}
