import { useState } from 'react';
import { ArrowUpDown, X } from 'lucide-react';
import { getIntensityColor } from '@/lib/constants';
import type { CompareLocation } from '@/components/ComparePanel';
import type { Scorecard } from '@/lib/scorecard';

const PALETTE = [
  '#22d3ee', '#f97316', '#a78bfa', '#34d399', '#fb7185', '#facc15',
  '#60a5fa', '#f472b6', '#4ade80', '#e879f9', '#2dd4bf', '#fbbf24',
];

type SortKey = 'name' | 'region' | 'co2now' | 'co2proj' | 'delta' | 'grade';
type SortDir = 'asc' | 'desc';

interface LocationRankTableProps {
  locations: CompareLocation[];
  scorecards: Scorecard[];
  co2NowMap: Record<string, number>;
  co2ProjMap: Record<string, number>;
  selectedIds: string[];
  onRemove: (id: string) => void;
  onHover?: (id: string | null) => void;
  colorStartIndex?: number;
}

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

export default function LocationRankTable({
  locations,
  scorecards,
  co2NowMap,
  co2ProjMap,
  selectedIds,
  onRemove,
  onHover,
  colorStartIndex = 0,
}: LocationRankTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('co2proj');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const rows = selectedIds
    .map((id, idx) => {
      const loc = locations.find(l => l.id === id);
      const sc = scorecards.find(s => s.locationId === id);
      if (!loc || !sc) return null;
      const co2Now = co2NowMap[id] ?? 0;
      const co2Proj = co2ProjMap[id] ?? 0;
      const delta = co2Now > 0 ? ((co2Proj - co2Now) / co2Now) * 100 : 0;
      return { id, loc, sc, co2Now, co2Proj, delta, colorIdx: idx + colorStartIndex };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];

  rows.sort((a: any, b: any) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.loc.name.localeCompare(b.loc.name); break;
      case 'region': cmp = a.loc.region.localeCompare(b.loc.region); break;
      case 'co2now': cmp = a.co2Now - b.co2Now; break;
      case 'co2proj': cmp = a.co2Proj - b.co2Proj; break;
      case 'delta': cmp = a.delta - b.delta; break;
      case 'grade': cmp = GRADE_ORDER.indexOf(a.sc.grade) - GRADE_ORDER.indexOf(b.sc.grade); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const Header = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <ArrowUpDown className={`w-2.5 h-2.5 ${sortKey === col ? 'text-white' : 'opacity-40'}`} />
      </span>
    </th>
  );

  return (
    <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="w-5 px-1 py-1.5" />
            <Header label="Location" col="name" />
            <Header label="Region" col="region" />
            <Header label="CO₂ Now" col="co2now" />
            <Header label="CO₂ Proj." col="co2proj" />
            <Header label="Δ%" col="delta" />
            <Header label="Grade" col="grade" />
            <th className="w-6 px-1 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => {
            const nowColor = getIntensityColor(row.co2Now);
            const projColor = getIntensityColor(row.co2Proj);
            return (
              <tr
                key={row.id}
                className="border-b border-border/50 hover:bg-white/[0.03] transition-colors"
                onMouseEnter={() => onHover?.(row.id)}
                onMouseLeave={() => onHover?.(null)}
              >
                <td className="px-2 py-1.5">
                  <span
                    className="block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PALETTE[row.colorIdx % PALETTE.length] }}
                  />
                </td>
                <td className="px-2 py-1.5 font-medium text-foreground truncate max-w-[140px]">
                  {row.loc.name}
                </td>
                <td className="px-2 py-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground capitalize">
                    {row.loc.region}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums" style={{ color: nowColor }}>
                  {row.co2Now}
                </td>
                <td className="px-2 py-1.5 font-mono tabular-nums" style={{ color: projColor }}>
                  {row.co2Proj}
                </td>
                <td className={`px-2 py-1.5 font-mono tabular-nums ${row.delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {row.delta > 0 ? '+' : ''}{Math.round(row.delta)}%
                </td>
                <td className="px-2 py-1.5 font-bold">
                  {row.sc.grade}
                </td>
                <td className="px-1 py-1.5">
                  <button
                    onClick={() => onRemove(row.id)}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
