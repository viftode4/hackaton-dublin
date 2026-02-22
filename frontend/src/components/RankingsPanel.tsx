import { useState, useMemo } from 'react';
import { ArrowUpDown, Leaf, Flame, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { COUNTRY_DATA, type CO2Estimate } from '@/lib/co2-api';
import { getIntensityColor } from '@/lib/constants';
import { countryDataToFeatures, predictCO2AtYear, SCENARIOS, type ScenarioId } from '@/lib/regression-model';

interface Props {
  projectionYear?: number;
  scenario?: ScenarioId;
  onCountryClick?: (name: string) => void;
}

export default function RankingsPanel({ projectionYear, scenario, onCountryClick }: Props) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const ranked = useMemo(() => {
    const yr = projectionYear ?? 2025;
    const sc = scenario ?? 'bau';
    return Object.entries(COUNTRY_DATA)
      // Skip alias entries (short names like "W. Sahara")
      .filter(([name]) => name.length > 3)
      .map(([name, co2]) => {
        let ci = co2.co2_intensity_gco2;
        if (yr > 2025) {
          const features = countryDataToFeatures(co2.co2_intensity_gco2, co2.energy_mix, co2.country_trend_pct);
          ci = Math.round(predictCO2AtYear(features, yr, SCENARIOS[sc]));
        }
        return { name, ci, energyMix: co2.energy_mix, riskScore: co2.risk_score };
      })
      .sort((a, b) => a.ci - b.ci);
  }, [projectionYear, scenario]);

  const filtered = useMemo(() => {
    if (!search) return ranked;
    const q = search.toLowerCase();
    return ranked.filter(c => c.name.toLowerCase().includes(q));
  }, [ranked, search]);

  const greenest = filtered.slice(0, 10);
  const dirtiest = [...filtered].sort((a, b) => b.ci - a.ci).slice(0, 10);
  const yr = projectionYear ?? 2025;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            CO₂ Rankings {yr > 2025 ? `(${yr} est.)` : ''}
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search countries..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          {filtered.length} countries · g CO₂/kWh
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!showAll ? (
          <>
            {/* Greenest */}
            <div className="p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-xs font-semibold text-emerald-400">Greenest Grids</p>
              </div>
              {greenest.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => onCountryClick?.(c.name)}
                  className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-accent/30 transition-colors text-left"
                >
                  <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{c.name}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{c.energyMix}</p>
                  </div>
                  <span className="text-xs font-mono font-bold tabular-nums" style={{ color: getIntensityColor(c.ci) }}>
                    {c.ci}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-t border-border" />

            {/* Dirtiest */}
            <div className="p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Flame className="w-3.5 h-3.5 text-red-400" />
                <p className="text-xs font-semibold text-red-400">Highest CO₂</p>
              </div>
              {dirtiest.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => onCountryClick?.(c.name)}
                  className="w-full flex items-center gap-2 py-1.5 px-1 rounded hover:bg-accent/30 transition-colors text-left"
                >
                  <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{c.name}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{c.energyMix}</p>
                  </div>
                  <span className="text-xs font-mono font-bold tabular-nums" style={{ color: getIntensityColor(c.ci) }}>
                    {c.ci}
                  </span>
                </button>
              ))}
            </div>

            <div className="p-3 pt-0">
              <button
                onClick={() => setShowAll(true)}
                className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground py-1.5 rounded border border-border/50 hover:border-border transition-colors"
              >
                View full ranking ({filtered.length} countries)
              </button>
            </div>
          </>
        ) : (
          <div className="p-3 space-y-0.5">
            <button
              onClick={() => setShowAll(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              ← Back to top/bottom
            </button>
            {filtered.map((c, i) => (
              <button
                key={c.name}
                onClick={() => onCountryClick?.(c.name)}
                className="w-full flex items-center gap-2 py-1 px-1 rounded hover:bg-accent/30 transition-colors text-left"
              >
                <span className="text-[10px] text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-foreground truncate">{c.name}</p>
                </div>
                <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: getIntensityColor(c.ci) }}>
                  {c.ci}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
