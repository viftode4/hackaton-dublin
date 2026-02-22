import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { BarChart3, Filter, Search, X, Sparkles, RefreshCw } from 'lucide-react';
import { GROUND_REGIONS, INITIAL_SATELLITES, getIntensityColor } from '@/lib/constants';
import { generateScorecard, type Scorecard } from '@/lib/scorecard';
import { type ScenarioId, SCENARIOS, countryDataToFeatures, predictCO2, predictCO2AtYear } from '@/lib/regression-model';
import { advisorChat } from '@/lib/api';
import TrajectoryChart, { PALETTE } from '@/components/compare/TrajectoryChart';
import LocationRankTable from '@/components/compare/LocationRankTable';

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const activeScenario = scenario ?? 'net_zero';
  const activeYear = projectionYear ?? 2025;

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

  const selectedLocations = useMemo(
    () => selected.map(id => allLocations.find(l => l.id === id)).filter(Boolean) as CompareLocation[],
    [selected, allLocations],
  );

  const scorecards = useMemo(
    () => selectedLocations.map(loc => generateScorecard(loc.id, loc.name, loc.body, loc.carbon)),
    [selectedLocations],
  );

  const co2NowMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const loc of selectedLocations) {
      const features = countryDataToFeatures(loc.carbon, loc.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other');
      map[loc.id] = Math.round(predictCO2(features));
    }
    return map;
  }, [selectedLocations]);

  const co2ProjMap = useMemo(() => {
    const map: Record<string, number> = {};
    const yr = activeYear > 2025 ? activeYear : 2050;
    for (const loc of selectedLocations) {
      const features = countryDataToFeatures(loc.carbon, loc.energyMix ?? '40% gas, 30% coal, 20% hydro, 10% other');
      map[loc.id] = Math.round(predictCO2AtYear(features, yr, SCENARIOS[activeScenario]));
    }
    return map;
  }, [selectedLocations, activeYear, activeScenario]);

  const toggleLocation = (id: string) => {
    onSelectedChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
    );
  };

  const count = selected.length;

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
          {selected.map((id, i) => {
            const loc = allLocations.find(l => l.id === id);
            return loc ? (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.06] text-white/70 border border-white/10"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                {loc.name}
                <button onClick={() => toggleLocation(id)} className="hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* === Adaptive content === */}
      {count === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-3">
          <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Search and select locations to compare their future CO₂ trajectories</p>
          <p className="text-[10px] text-muted-foreground/60">Select 1 for detailed analysis, 2-5 for side-by-side, or 6+ for rankings</p>
        </div>
      )}

      {count === 1 && (
        <div className="space-y-4">
          <SingleLocationView
            location={selectedLocations[0]}
            scorecard={scorecards[0]}
            co2Now={co2NowMap[selectedLocations[0].id]}
            co2Proj={co2ProjMap[selectedLocations[0].id]}
            projectionYear={activeYear}
            scenario={activeScenario}
          />
          <AiInsight
            locations={selectedLocations}
            co2NowMap={co2NowMap}
            co2ProjMap={co2ProjMap}
            projectionYear={activeYear}
            scenario={activeScenario}
          />
        </div>
      )}

      {count >= 2 && count <= 5 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">
              CO₂ Trajectory — {SCENARIOS[activeScenario].label}
            </p>
            <TrajectoryChart
              locations={selectedLocations}
              scenario={activeScenario}
              projectionYear={activeYear}
              highlightId={hoveredId}
            />
          </div>
          <AiInsight
            locations={selectedLocations}
            co2NowMap={co2NowMap}
            co2ProjMap={co2ProjMap}
            projectionYear={activeYear}
            scenario={activeScenario}
          />
          <MetricCards
            scorecards={scorecards}
            co2NowMap={co2NowMap}
            co2ProjMap={co2ProjMap}
            selectedIds={selected}
            onHover={setHoveredId}
          />
        </div>
      )}

      {count >= 6 && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">
              CO₂ Trajectory — {SCENARIOS[activeScenario].label}
            </p>
            <TrajectoryChart
              locations={selectedLocations}
              scenario={activeScenario}
              projectionYear={activeYear}
              highlightId={hoveredId}
              compact
            />
          </div>
          <AiInsight
            locations={selectedLocations}
            co2NowMap={co2NowMap}
            co2ProjMap={co2ProjMap}
            projectionYear={activeYear}
            scenario={activeScenario}
          />
          <LocationRankTable
            locations={allLocations}
            scorecards={scorecards}
            co2NowMap={co2NowMap}
            co2ProjMap={co2ProjMap}
            selectedIds={selected}
            onRemove={id => toggleLocation(id)}
            onHover={setHoveredId}
          />
        </div>
      )}
    </div>
  );
}

/* ── Single Location Card ──────────────────────────────────────────── */

function SingleLocationView({
  location,
  scorecard,
  co2Now,
  co2Proj,
  projectionYear,
  scenario,
}: {
  location: CompareLocation;
  scorecard: Scorecard;
  co2Now: number;
  co2Proj: number;
  projectionYear: number;
  scenario: ScenarioId;
}) {
  const delta = co2Now > 0 ? Math.round(((co2Proj - co2Now) / co2Now) * 100) : 0;
  const yr = projectionYear > 2025 ? projectionYear : 2050;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{location.name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{location.region} — {location.location}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-black ${scorecard.grade.startsWith('A') ? 'text-white/90' : scorecard.grade.startsWith('B') ? 'text-white/60' : 'text-white/30'}`}>
            {scorecard.grade}
          </p>
        </div>
      </div>

      {/* CO₂ summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg p-2 bg-muted text-center">
          <p className="text-xs font-bold" style={{ color: getIntensityColor(co2Now) }}>{co2Now}</p>
          <p className="text-[8px] text-muted-foreground">g CO₂/kWh now</p>
        </div>
        <div className="rounded-lg p-2 bg-muted text-center">
          <p className="text-xs font-bold" style={{ color: getIntensityColor(co2Proj) }}>{co2Proj}</p>
          <p className="text-[8px] text-muted-foreground">g CO₂/kWh {yr}</p>
        </div>
        <div className="rounded-lg p-2 bg-muted text-center">
          <p className={`text-xs font-bold ${delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {delta > 0 ? '+' : ''}{delta}%
          </p>
          <p className="text-[8px] text-muted-foreground">change</p>
        </div>
      </div>

      {/* 3-scenario trajectory chart */}
      <div>
        <p className="text-[10px] text-muted-foreground mb-1.5">CO₂ Trajectory — All Scenarios</p>
        <TrajectoryChart
          locations={[location]}
          scenario={scenario}
          projectionYear={projectionYear}
          multiScenario
        />
      </div>

      {/* Scorecard metrics */}
      <div className="grid grid-cols-2 gap-2">
        {scorecard.metrics.map(m => (
          <div key={m.name} className="rounded-lg p-2 bg-muted">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">{m.name}</span>
              <span className="text-xs font-bold text-foreground">{m.score}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${m.score}%`,
                  backgroundColor: m.score >= 70 ? '#34d399' : m.score >= 45 ? '#facc15' : '#fb7185',
                }}
              />
            </div>
            <p className="text-[8px] text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Metric Comparison Cards (2–5 locations) ────────────────────────── */

function MetricCards({
  scorecards,
  co2NowMap,
  co2ProjMap,
  selectedIds,
  onHover,
}: {
  scorecards: Scorecard[];
  co2NowMap: Record<string, number>;
  co2ProjMap: Record<string, number>;
  selectedIds: string[];
  onHover?: (id: string | null) => void;
}) {
  const metricNames = scorecards[0]?.metrics.map(m => m.name) ?? [];

  return (
    <div className="grid grid-cols-2 gap-2">
      {metricNames.map(metricName => {
        const entries = scorecards.map((sc, i) => {
          const metric = sc.metrics.find(m => m.name === metricName)!;
          return { sc, metric, idx: i };
        });
        const maxScore = Math.max(...entries.map(e => e.metric.score));

        return (
          <div key={metricName} className="rounded-lg p-2.5 bg-muted border border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5">{metricName}</p>
            <div className="space-y-1">
              {entries.map(({ sc, metric, idx }) => {
                const isBest = metric.score === maxScore;
                return (
                  <div
                    key={sc.locationId}
                    className="flex items-center gap-1.5 text-[10px]"
                    onMouseEnter={() => onHover?.(sc.locationId)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                    />
                    <span className="truncate text-foreground/80 flex-1 min-w-0">{sc.locationName}</span>
                    <span className={`font-mono tabular-nums font-bold shrink-0 ${isBest ? 'text-white' : 'text-foreground/50'}`}>
                      {metric.score}
                    </span>
                    {isBest && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium shrink-0">
                        best
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── AI Insight Card ─────────────────────────────────────────────────── */

type InsightState = 'idle' | 'loading' | 'ready' | 'error';

function AiInsight({
  locations,
  co2NowMap,
  co2ProjMap,
  projectionYear,
  scenario,
}: {
  locations: CompareLocation[];
  co2NowMap: Record<string, number>;
  co2ProjMap: Record<string, number>;
  projectionYear: number;
  scenario: ScenarioId;
}) {
  const [state, setState] = useState<InsightState>('idle');
  const [insight, setInsight] = useState('');
  const cache = useRef<Map<string, string>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const yr = projectionYear > 2025 ? projectionYear : 2050;
  const scenarioLabel = SCENARIOS[scenario].label;

  const cacheKey = useMemo(() => {
    const ids = locations.map(l => l.id).sort().join(',');
    return `${ids}|${scenario}|${yr}`;
  }, [locations, scenario, yr]);

  const fetchInsight = useCallback(async () => {
    if (locations.length === 0) {
      setState('idle');
      return;
    }

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setInsight(cached);
      setState('ready');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState('loading');

    const isSingle = locations.length === 1;
    let prompt: string;

    if (isSingle) {
      const loc = locations[0];
      const co2Now = co2NowMap[loc.id] ?? loc.carbon;
      const co2Proj = co2ProjMap[loc.id] ?? co2Now;
      const delta = co2Now > 0 ? Math.round(((co2Proj - co2Now) / co2Now) * 100) : 0;
      prompt = `You are analyzing a data center location. Given the following location and its projected CO₂ emissions, provide a 2-3 sentence insight about what makes this location interesting for datacenter placement. Be specific with numbers.

Location (scenario: ${scenarioLabel}):
- ${loc.name}: ${co2Now} g CO₂/kWh now → ${co2Proj} g CO₂/kWh by ${yr} (${delta > 0 ? '+' : ''}${delta}%)

Respond with ONLY the insight, no preamble.`;
    } else {
      const lines = locations.map(loc => {
        const co2Now = co2NowMap[loc.id] ?? loc.carbon;
        const co2Proj = co2ProjMap[loc.id] ?? co2Now;
        const delta = co2Now > 0 ? Math.round(((co2Proj - co2Now) / co2Now) * 100) : 0;
        return `- ${loc.name}: ${co2Now} g CO₂/kWh now → ${co2Proj} g CO₂/kWh by ${yr} (${delta > 0 ? '+' : ''}${delta}%)`;
      }).join('\n');

      prompt = `You are analyzing data center locations for a comparison panel. Given the following locations and their projected CO₂ emissions, provide a 2-3 sentence strategic insight about which location(s) stand out and why. Be specific with numbers. Don't repeat what the user can already see — add reasoning.

Locations (scenario: ${scenarioLabel}):
${lines}

Respond with ONLY the insight, no preamble.`;
    }

    try {
      const res = await advisorChat(prompt);
      if (controller.signal.aborted) return;
      if (res.error) {
        setState('error');
        return;
      }
      const text = res.message;
      cache.current.set(cacheKey, text);
      setInsight(text);
      setState('ready');
    } catch {
      if (controller.signal.aborted) return;
      setState('error');
    }
  }, [locations, co2NowMap, co2ProjMap, cacheKey, scenarioLabel, yr]);

  useEffect(() => {
    const timer = setTimeout(fetchInsight, 800);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [fetchInsight]);

  if (state === 'idle') return null;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-400/80" />
        <span className="text-[10px] font-medium text-muted-foreground">AI Insight</span>
      </div>

      {state === 'loading' && (
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-white/[0.04] animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-white/[0.04] animate-pulse" />
          <div className="h-3 w-3/5 rounded bg-white/[0.04] animate-pulse" />
        </div>
      )}

      {state === 'ready' && (
        <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
      )}

      {state === 'error' && (
        <button
          onClick={fetchInsight}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Failed to load insight. Click to retry.
        </button>
      )}
    </div>
  );
}
