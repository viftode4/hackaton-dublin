import { X, Plus, FileText, Package } from 'lucide-react';
import { getIntensityColor, type GroundRegion, type SatelliteData } from '@/lib/constants';
import type { CO2Estimate } from '@/lib/co2-api';

/** Info for satellite detail display */
const SATELLITE_INFO: Record<string, { size: string; mass: string; altitudeKm: number; co2: string }> = {
  'ISS': { size: '109m x 73m', mass: '420,000 kg', altitudeKm: 408, co2: '200 g CO2/kWh' },
  'HUBBLE': { size: '13.2m x 4.2m', mass: '11,110 kg', altitudeKm: 547, co2: '150 g CO2/kWh' },
  'TERRA': { size: '6.8m x 3.5m', mass: '5,190 kg', altitudeKm: 705, co2: '120 g CO2/kWh' },
  'LANDSAT9': { size: '4.3m x 2.4m', mass: '2,711 kg', altitudeKm: 705, co2: '110 g CO2/kWh' },
  'NOAA20': { size: '6.2m x 3.3m', mass: '2,445 kg', altitudeKm: 824, co2: '130 g CO2/kWh' },
  'SENTINEL6': { size: '5.1m x 2.3m', mass: '1,192 kg', altitudeKm: 1336, co2: '100 g CO2/kWh' },
  'TIANGONG': { size: '55m x 30m', mass: '100,000 kg', altitudeKm: 390, co2: '210 g CO2/kWh' },
  'STARLINK': { size: '3.4m x 1.8m', mass: '260 kg', altitudeKm: 550, co2: '170 g CO2/kWh' },
  'GOES16': { size: '6.1m x 5.6m', mass: '5,192 kg', altitudeKm: 35786, co2: '95 g CO2/kWh' },
  'INMARSAT5': { size: '7.8m x 3.4m', mass: '6,070 kg', altitudeKm: 35786, co2: '85 g CO2/kWh' },
};

export interface LocationDetail {
  id: string;
  name: string;
  body: string;
  carbon: number;
  region?: GroundRegion;
  satellite?: SatelliteData;
  countryCO2?: CO2Estimate;
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
  const satInfo = isOrbit && location.satellite ? SATELLITE_INFO[location.satellite.id] : undefined;

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
            {isOrbit ? 'Satellite' : 'Datacenter'}
          </p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
            isOrbit
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}>
            {isOrbit ? 'Orbit' : 'Earth'}
          </span>
        </div>
        <h3 className="text-lg font-bold text-foreground">{location.name}</h3>
        {location.region && (
          <p className="text-xs text-muted-foreground">{location.region.location}</p>
        )}
        {location.satellite && (
          <p className="text-xs text-muted-foreground">{location.satellite.status}</p>
        )}
      </div>

      {/* CO2 intensity */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }} />
        <span className="text-sm font-semibold text-foreground">
          {location.carbon} g CO₂/kWh
        </span>
        {location.countryCO2 && location.countryCO2.confidence >= 0.8 && (
          <span className="text-[9px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded-full">
            ML predicted
          </span>
        )}
      </div>

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

      {/* Orbital info for satellites */}
      {isOrbit && location.satellite && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/60 rounded-lg px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Inclination</p>
            <p className="text-sm font-semibold text-foreground">{location.satellite.inclination}°</p>
          </div>
          <div className="bg-muted/60 rounded-lg px-3 py-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Carbon Score</p>
            <p className="text-sm font-semibold text-foreground">{location.satellite.carbonScore}</p>
          </div>
          {satInfo && (
            <>
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Altitude</p>
                <p className="text-sm font-semibold text-foreground">{satInfo.altitudeKm.toLocaleString()} km</p>
              </div>
              <div className="bg-muted/60 rounded-lg px-3 py-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Mass</p>
                <p className="text-sm font-semibold text-foreground">{satInfo.mass}</p>
              </div>
              <div className="bg-muted/60 rounded-lg px-3 py-2 col-span-2">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Emissions</p>
                <p className="text-sm font-semibold text-foreground">{satInfo.co2}</p>
              </div>
            </>
          )}
        </div>
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
            className="flex-1 flex items-center justify-center gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
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
          className="w-full flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
        >
          <Package className="w-3.5 h-3.5" />
          Add to Inventory
        </button>
      </div>
    </div>
  );
}
