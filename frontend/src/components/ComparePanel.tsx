import { useState, useMemo } from 'react';
import { BarChart3, Filter, Search, X } from 'lucide-react';
import { GROUND_REGIONS, INITIAL_SATELLITES, getIntensityColor } from '@/lib/constants';
import { generateScorecard } from '@/lib/scorecard';
import { type ScenarioId, SCENARIOS, countryDataToFeatures, predictCO2, predictCO2AtYear } from '@/lib/regression-model';

export type Region = 'all' | 'earth' | 'orbit' | 'moon' | 'mars';

export interface CompareLocation {
  id: string;
  name: string;
  body: string;
  carbon: number;
  region: Region;
  location: string;
  energyMix?: string;
}

export const ALL_COMPARE_LOCATIONS: CompareLocation[] = [
  ...GROUND_REGIONS.map(r => ({ id: r.id, name: `${r.name} (${r.location})`, body: 'earth' as const, carbon: r.carbonIntensity, region: 'earth' as Region, location: r.location })),
  ...INITIAL_SATELLITES.map(s => ({ id: s.id, name: s.name, body: 'orbit' as const, carbon: s.carbonScore, region: 'orbit' as Region, location: s.status })),
];

const REGION_OPTIONS: { id: Region; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'earth', label: 'Earth' },
  { id: 'orbit', label: 'In Orbit' },
  { id: 'moon', label: 'Moon' },
  { id: 'mars', label: 'Mars' },
];

interface Props {
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  locations?: CompareLocation[];
  projectionYear?: number;
  scenario?: ScenarioId;
}

export default function ComparePanel({ selected, onSelectedChange, locations, projectionYear, scenario }: Props) {
  const [regionFilter, setRegionFilter] = useState<Region>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allLocations = locations && locations.length > 0 ? locations : ALL_COMPARE_LOCATIONS;

  const filteredLocations = useMemo(() => {
    let result = allLocations;
    if (regionFilter !== 'all') result = result.filter(l => l.region === regionFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.name.toLowerCase().includes(q) || l.location.toLowerCase().includes(q));
    }
    return result;
  }, [regionFilter, searchQuery, allLocations]);

  const scorecards = selected
    .map(id => {
      const loc = allLocations.find(l => l.id === id);
      if (!loc) return null;
      return generateScorecard(id, loc.name, loc.body, loc.carbon);
    })
    .filter(Boolean) as ReturnType<typeof generateScorecard>[];

  const toggleLocation = (id: string) => {
    onSelectedChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  };

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-white/50" />
        <h2 className="text-lg font-semibold text-foreground">Compare Locations</h2>
      </div>

      {/* Region filter */}
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Region:</span>
        <div className="flex gap-1 flex-wrap">
          {REGION_OPTIONS.map(r => (
            <button
              key={r.id}
              onClick={() => setRegionFilter(r.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                regionFilter === r.id
                  ? 'bg-white/[0.06] text-white border border-white/20'
                  : 'bg-muted text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search with suggestions */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search and add locations..."
          className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/30"
        />
        {searchQuery.trim() && filteredLocations.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[200px] overflow-y-auto">
            {filteredLocations.slice(0, 10).map(loc => (
              <button
                key={loc.id}
                onClick={() => {
                  toggleLocation(loc.id);
                  setSearchQuery('');
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-muted ${
                  selected.includes(loc.id) ? 'text-white' : 'text-foreground'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  selected.includes(loc.id) ? 'bg-white' : 'bg-muted-foreground/40'
                }`} />
                <span className="truncate">{loc.name}</span>
                <span className="ml-auto text-[9px] text-muted-foreground capitalize">{loc.region}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {selected.map(id => {
            const loc = allLocations.find(l => l.id === id);
            return loc ? (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.06] text-white/70 border border-white/10">
                {loc.name}
                <button onClick={() => toggleLocation(id)} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Comparison table */}
      {scorecards.length >= 2 && (
        <div className="overflow-x-auto">
          <div className="space-y-3" style={{ minWidth: `${100 + scorecards.length * 100}px` }}>
            {/* Header */}
            <div className="grid gap-2" style={{ gridTemplateColumns: `80px repeat(${scorecards.length}, minmax(80px, 1fr))` }}>
              <div />
              {scorecards.map(sc => (
                <div key={sc.locationId} className="text-center min-w-0">
                  <p className="text-[10px] font-semibold text-foreground truncate">{sc.locationName}</p>
                  <p className={`text-xl font-black ${sc.grade.startsWith('A') ? 'text-white/90' : sc.grade.startsWith('B') ? 'text-white/60' : 'text-white/30'}`}>
                    {sc.grade}
                  </p>
                </div>
              ))}
            </div>

            {/* ML Prediction rows */}
            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: `80px repeat(${scorecards.length}, minmax(80px, 1fr))` }}>
              <span className="text-[10px] text-muted-foreground">CO₂ Now</span>
              {scorecards.map(sc => {
                const loc = allLocations.find(l => l.id === sc.locationId);
                const ci = loc?.carbon ?? 0;
                const features = countryDataToFeatures(ci, loc?.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other');
                const predicted = Math.round(predictCO2(features));
                const color = getIntensityColor(predicted);
                return (
                  <div key={sc.locationId} className="rounded-lg p-1.5 text-center bg-muted">
                    <p className="text-xs font-bold" style={{ color }}>{predicted}</p>
                    <p className="text-[8px] text-muted-foreground">g CO₂/kWh</p>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: `80px repeat(${scorecards.length}, minmax(80px, 1fr))` }}>
              <span className="text-[10px] text-muted-foreground">
                {(projectionYear ?? 2025) > 2025 ? `${projectionYear} est.` : '2050 est.'}
              </span>
              {scorecards.map(sc => {
                const loc = allLocations.find(l => l.id === sc.locationId);
                const ci = loc?.carbon ?? 0;
                const features = countryDataToFeatures(ci, loc?.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other');
                const yr = (projectionYear ?? 2025) > 2025 ? projectionYear! : 2050;
                const sc2 = scenario ?? 'net_zero';
                const projected = Math.round(predictCO2AtYear(features, yr, SCENARIOS[sc2]));
                const color = getIntensityColor(projected);
                return (
                  <div key={sc.locationId} className="rounded-lg p-1.5 text-center bg-muted">
                    <p className="text-xs font-bold" style={{ color }}>{projected}</p>
                    <p className="text-[8px] text-muted-foreground">g CO₂/kWh</p>
                  </div>
                );
              })}
            </div>

            {/* Metrics rows */}
            {scorecards[0].metrics.map((_, mi) => {
              const metricName = scorecards[0].metrics[mi].name;
              const scores = scorecards.map(sc => sc.metrics[mi].score);
              const maxScore = Math.max(...scores);

              return (
                <div key={metricName} className="grid gap-2 items-center" style={{ gridTemplateColumns: `80px repeat(${scorecards.length}, minmax(80px, 1fr))` }}>
                  <span className="text-[10px] text-muted-foreground">{metricName}</span>
                  {scorecards.map(sc => {
                    const m = sc.metrics[mi];
                    const isWinner = m.score === maxScore;
                    return (
                      <div key={sc.locationId} className={`rounded-lg p-1.5 text-center ${isWinner ? 'bg-white/[0.06] border border-white/20' : 'bg-muted'}`}>
                        <p className={`text-xs font-bold ${isWinner ? 'text-white' : 'text-foreground'}`}>{m.score}</p>
                        <p className="text-[8px] text-muted-foreground truncate">{m.label}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scorecards.length < 2 && (
        <p className="text-xs text-muted-foreground text-center py-8">Search and select at least 2 locations to compare</p>
      )}
    </div>
  );
}
