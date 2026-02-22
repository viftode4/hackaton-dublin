import { X, Plus, FileText, Package } from 'lucide-react';
import { getIntensityColor, type GroundRegion, type SatelliteData } from '@/lib/constants';
import type { CO2Estimate } from '@/lib/co2-api';
import type { ExtraterrestrialLocation } from '@/lib/celestial';
import { computeFeasibility, getFeasibilityColor, getFeasibilityLabel } from '@/lib/feasibility';
import { BAND_LABELS, CATEGORY_LABELS, type OrbitalBand, type SatelliteCategory } from '@/lib/satellite-store';

const BODY_BADGE: Record<string, { label: string; classes: string }> = {
  earth: { label: 'Earth', classes: 'bg-white/[0.06] text-white/70 border-white/10' },
  orbit: { label: 'Orbit', classes: 'bg-white/[0.06] text-white/60 border-white/10' },
  moon: { label: 'Moon', classes: 'bg-white/[0.04] text-white/50 border-white/10' },
  mars: { label: 'Mars', classes: 'bg-white/[0.04] text-white/40 border-white/10' },
};

export interface LocationDetail {
  id: string;
  name: string;
  body: string;
  carbon: number;
  region?: GroundRegion;
  satellite?: SatelliteData;
  countryCO2?: CO2Estimate;
  extraterrestrial?: ExtraterrestrialLocation;
}

interface Props {
  location: LocationDetail;
  onDismiss: () => void;
  onGenerateReport: () => void;
  onAddToCompare: () => void;
  onAddToInventory: () => void;
}

export default function LocationDetailCard({ location, onDismiss, onGenerateReport, onAddToCompare, onAddToInventory }: Props) {
  const color = getIntensityColor(location.carbon);
  const isOrbit = location.body === 'orbit';
  const isMoon = location.body === 'moon';
  const isMars = location.body === 'mars';
  const sat = isOrbit ? location.satellite : undefined;
  const badge = BODY_BADGE[location.body] ?? BODY_BADGE.earth;
  const et = location.extraterrestrial;

  // Compute feasibility score for all location types
  const feasibility = et ? computeFeasibility({
    body: et.body,
    illumination_pct: et.illuminationPct,
    avg_temperature_c: et.avgTemperatureC,
    ice_proximity_km: et.iceProximityKm,
    earth_visible: et.earthVisible,
    solar_irradiance_w: et.solarIrradianceW,
    dust_storms_per_year: et.dustStormsPerYear,
    elevation_km: et.elevationKm,
    construction_cost_mw: et.constructionCostMw,
  }) : isOrbit && sat ? computeFeasibility({
    body: 'orbit',
    eclipse_fraction: sat.eclipseFraction,
    radiation_level: sat.radiationLevel,
    power_availability_w: sat.powerAvailabilityW,
    latency_ms: sat.latencyMs,
    altitude_km: sat.altitudeKm,
  }) : location.region ? computeFeasibility({
    body: 'earth',
    carbon_intensity_gco2: location.region.carbonIntensity,
    energy_cost_kwh: location.region.energyCostKwh,
    disaster_risk: location.region.disasterRisk,
    political_stability: location.region.politicalStability,
  }) : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-slide-up relative">
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {isOrbit ? 'Orbital Datacenter' : (isMoon || isMars) ? `${location.body} Datacenter` : 'Datacenter'}
          </p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border ${badge.classes}`}>
            {badge.label}
          </span>
        </div>
        <h3 className="text-lg font-bold text-foreground">{location.name}</h3>
        {location.region && (
          <p className="text-xs text-muted-foreground">{location.region.location}</p>
        )}
        {sat && (
          <p className="text-xs text-muted-foreground">
            {BAND_LABELS[sat.status as OrbitalBand] ?? sat.status}
            {sat.category ? ` · ${CATEGORY_LABELS[sat.category as SatelliteCategory] ?? sat.category}` : ''}
            {sat.noradId ? ` · NORAD ${sat.noradId}` : ''}
          </p>
        )}
        {et && (
          <p className="text-xs text-muted-foreground">{et.location} · {et.powerSource}</p>
        )}
      </div>

      {/* CO2 / Power source */}
      {(isMoon || isMars) && et ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white/50" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.3)' }} />
          <span className="text-sm font-semibold text-white/70">Zero-carbon</span>
          <span className="text-[10px] text-muted-foreground">{et.powerSource}</span>
        </div>
      ) : isOrbit && sat ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white/50" style={{ boxShadow: '0 0 8px rgba(255,255,255,0.3)' }} />
          <span className="text-sm font-semibold text-white/70">Zero-carbon</span>
          <span className="text-[10px] text-muted-foreground">Solar powered</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }} />
          <span className="text-sm font-semibold text-foreground">
            {location.carbon} g CO₂/kWh
          </span>
          {location.countryCO2 && location.countryCO2.confidence >= 0.8 && (
            <span className="text-[9px] px-1.5 py-0.5 bg-white/[0.06] text-white/50 border border-white/10 rounded-full">
              ML predicted
            </span>
          )}
        </div>
      )}

      {/* Feasibility score bar — computed for all bodies */}
      {feasibility && (
        <div className="bg-muted/60 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Feasibility Score</p>
            <span className="text-sm font-bold" style={{ color: getFeasibilityColor(feasibility.overall) }}>
              {feasibility.overall}/100 — {getFeasibilityLabel(feasibility.overall)}
            </span>
          </div>
          <div className="space-y-1.5">
            {([
              ['Power', feasibility.power],
              ['Cooling', feasibility.cooling],
              ['Connectivity', feasibility.connectivity],
              ['Resilience', feasibility.resilience],
              ['Cost', feasibility.cost],
            ] as [string, number][]).map(([label, score]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground w-16">{label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${score}%`, backgroundColor: getFeasibilityColor(score) }}
                  />
                </div>
                <span className="text-[9px] font-medium text-foreground w-6 text-right">{score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Moon-specific metrics */}
      {isMoon && et && (
        <div className="grid grid-cols-2 gap-2">
          {et.illuminationPct != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Solar Illumination</p>
              <p className="text-sm font-semibold text-foreground">{et.illuminationPct}%</p>
            </div>
          )}
          {et.avgTemperatureC != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Temperature</p>
              <p className="text-sm font-semibold text-foreground">{et.avgTemperatureC}°C</p>
            </div>
          )}
          {et.earthVisible != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Earth Line-of-Sight</p>
              <p className="text-sm font-semibold text-foreground">{et.earthVisible ? 'Direct' : 'Relay needed'}</p>
            </div>
          )}
          {et.iceProximityKm != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Water Ice</p>
              <p className="text-sm font-semibold text-foreground">{et.iceProximityKm === 0 ? 'On-site' : `${et.iceProximityKm} km`}</p>
            </div>
          )}
          {et.coolingEfficiency != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Cooling Efficiency</p>
              <p className="text-sm font-semibold text-foreground">{et.coolingEfficiency}/100</p>
            </div>
          )}
          {et.radiationLevel && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Radiation</p>
              <p className="text-sm font-semibold text-foreground capitalize">{et.radiationLevel}</p>
            </div>
          )}
        </div>
      )}

      {/* Mars-specific metrics */}
      {isMars && et && (
        <div className="grid grid-cols-2 gap-2">
          {et.solarIrradianceW != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Solar Irradiance</p>
              <p className="text-sm font-semibold text-foreground">{et.solarIrradianceW} W/m²</p>
            </div>
          )}
          {et.avgTemperatureC != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Avg Temperature</p>
              <p className="text-sm font-semibold text-foreground">{et.avgTemperatureC}°C</p>
            </div>
          )}
          {et.dustStormsPerYear != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Dust Storms</p>
              <p className="text-sm font-semibold text-foreground">{et.dustStormsPerYear}/yr</p>
            </div>
          )}
          {et.elevationKm != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Elevation</p>
              <p className="text-sm font-semibold text-foreground">{et.elevationKm > 0 ? '+' : ''}{et.elevationKm} km</p>
            </div>
          )}
          {et.coolingEfficiency != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Cooling Efficiency</p>
              <p className="text-sm font-semibold text-foreground">{et.coolingEfficiency}/100</p>
            </div>
          )}
          {et.radiationLevel && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Radiation</p>
              <p className="text-sm font-semibold text-foreground capitalize">{et.radiationLevel}</p>
            </div>
          )}
        </div>
      )}

      {/* Latency callout for Moon/Mars */}
      {(isMoon || isMars) && et?.latencyToEarthMs != null && (
        <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Earth Communication</p>
          <p className="text-xs text-foreground">
            One-way latency: <span className="font-semibold text-white">
              {et.latencyToEarthMs < 5000
                ? `${(et.latencyToEarthMs / 1000).toFixed(1)}s`
                : `${(et.latencyToEarthMs / 60000).toFixed(1)} min`}
            </span>
            {isMars && <span className="text-muted-foreground"> (avg, varies 4.3–24 min)</span>}
          </p>
        </div>
      )}

      {/* Energy mix — from countryCO2 or region */}
      {location.countryCO2?.energy_mix && (
        <div className="bg-muted/60 rounded-lg px-3 py-2">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Energy Mix</p>
          <p className="text-xs text-foreground">{location.countryCO2.energy_mix}</p>
        </div>
      )}

      {/* Grid metrics for Earth datacenters */}
      {location.region && (
        <div className="grid grid-cols-2 gap-2">
          {location.region.coolingCostFactor != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Cooling Factor</p>
              <p className="text-sm font-semibold text-foreground">{location.region.coolingCostFactor.toFixed(2)}</p>
            </div>
          )}
          {location.region.disasterRisk != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Disaster Risk</p>
              <p className="text-sm font-semibold text-foreground">{location.region.disasterRisk.toFixed(1)}</p>
            </div>
          )}
          {location.region.politicalStability != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Political Stability</p>
              <p className="text-sm font-semibold text-foreground">{location.region.politicalStability.toFixed(1)}</p>
            </div>
          )}
          {location.region.landCostSqm != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Land Cost</p>
              <p className="text-sm font-semibold text-foreground">${location.region.landCostSqm}/m²</p>
            </div>
          )}
          {location.region.energyCostKwh != null && (
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Energy Cost</p>
              <p className="text-sm font-semibold text-foreground">${location.region.energyCostKwh}/kWh</p>
            </div>
          )}
        </div>
      )}

      {/* Orbital datacenter metrics */}
      {isOrbit && sat && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {sat.powerAvailabilityW != null && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Solar Power</p>
                <p className="text-sm font-semibold text-foreground">{sat.powerAvailabilityW} W/m²</p>
              </div>
            )}
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Cooling</p>
              <p className="text-sm font-semibold text-foreground">Vacuum radiative</p>
            </div>
            {sat.latencyMs != null && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Ground Latency</p>
                <p className="text-sm font-semibold text-foreground">{sat.latencyMs.toFixed(1)} ms</p>
              </div>
            )}
            {sat.radiationLevel && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Radiation</p>
                <p className="text-sm font-semibold text-foreground capitalize">{sat.radiationLevel}</p>
              </div>
            )}
            {sat.eclipseFraction != null && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Eclipse Time</p>
                <p className="text-sm font-semibold text-foreground">{(sat.eclipseFraction * 100).toFixed(1)}%</p>
              </div>
            )}
            {sat.altitudeKm != null && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Altitude</p>
                <p className="text-sm font-semibold text-foreground">{sat.altitudeKm.toLocaleString()} km</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Orbital Band</p>
              <p className="text-sm font-semibold text-foreground">{BAND_LABELS[sat.status as OrbitalBand] ?? sat.status}</p>
            </div>
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Inclination</p>
              <p className="text-sm font-semibold text-foreground">{sat.inclination.toFixed(1)}°</p>
            </div>
            {sat.period > 0 && (
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Orbital Period</p>
                <p className="text-sm font-semibold text-foreground">{(sat.period / 60).toFixed(1)} min</p>
              </div>
            )}
            <div className="bg-muted/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Live Position</p>
              <p className="text-sm font-semibold text-foreground">{sat.lat.toFixed(1)}°, {sat.lng.toFixed(1)}°</p>
            </div>
            {sat.apogeeKm != null && sat.perigeeKm != null && (
              <div className="bg-muted/60 rounded-lg px-3 py-2 col-span-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Orbit Range</p>
                <p className="text-sm font-semibold text-foreground">{sat.perigeeKm.toLocaleString()} – {sat.apogeeKm.toLocaleString()} km</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Regional context — show country grid CO2 if available */}
      {location.countryCO2 && location.region && (
        <div className="bg-muted/40 rounded-lg px-3 py-2 border border-border/50">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Regional Context</p>
          <p className="text-xs text-foreground">
            {location.region.location} grid: <span className="font-semibold" style={{ color }}>{location.countryCO2.co2_intensity_gco2} g CO₂/kWh</span>
          </p>
          {location.countryCO2.risk_score > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-muted-foreground">Risk</span>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, location.countryCO2.risk_score)}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-[10px] font-medium text-foreground">{location.countryCO2.risk_score}/100</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex gap-2">
          <button
            onClick={onGenerateReport}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Report
          </button>
          <button
            onClick={onAddToCompare}
            className="flex-1 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-3 py-2 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Compare
          </button>
        </div>
        <button
          onClick={onAddToInventory}
          className="w-full flex items-center justify-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
        >
          <Package className="w-3.5 h-3.5" />
          Add to Inventory
        </button>
      </div>
    </div>
  );
}
