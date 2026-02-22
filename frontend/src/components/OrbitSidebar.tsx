import { useState, useMemo } from 'react';
import { Search, Satellite, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { type SatelliteData } from '@/lib/constants';
import { type SatelliteCategory, CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/satellite-store';

interface Props {
  satellites: SatelliteData[];
  search: string;
  onSearchChange: (q: string) => void;
  onSatelliteClick: (sat: SatelliteData) => void;
}

export default function OrbitSidebar({ satellites, search, onSearchChange, onSatelliteClick }: Props) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search) return satellites;
    const q = search.toLowerCase();
    return satellites.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.noradId && String(s.noradId).includes(q))
    );
  }, [satellites, search]);

  const grouped = useMemo(() => {
    const map = new Map<SatelliteCategory, SatelliteData[]>();
    for (const sat of filtered) {
      const cat = ((sat as any).category || 'other') as SatelliteCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(sat);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Satellite className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Orbital Tracking</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search satellites..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          {filtered.length.toLocaleString()} satellites
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.map(([cat, sats]) => (
          <div key={cat}>
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors border-b border-border/50"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="text-xs font-medium text-foreground">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({sats.length})
                </span>
              </div>
              <ChevronRight
                className={`w-3 h-3 text-muted-foreground transition-transform ${
                  expandedCat === cat ? 'rotate-90' : ''
                }`}
              />
            </button>
            {expandedCat === cat && (
              <div className="max-h-[300px] overflow-y-auto">
                {sats.slice(0, 100).map(sat => (
                  <button
                    key={sat.id}
                    onClick={() => onSatelliteClick(sat)}
                    className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-accent/30 transition-colors text-left"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground truncate">{sat.name}</p>
                      <p className="text-[9px] text-muted-foreground font-mono">
                        {sat.altitudeKm?.toLocaleString()} km · {sat.status}
                      </p>
                    </div>
                  </button>
                ))}
                {sats.length > 100 && (
                  <p className="text-[9px] text-muted-foreground text-center py-1">
                    +{sats.length - 100} more (use search to filter)
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
