import { Package, Globe, Moon, Orbit, Trash2, MapPin, Zap, CheckCircle, Loader2, FileText } from 'lucide-react';

export interface InventoryItem {
  id: string;          // location_id (for dedup + location lookup)
  backendId?: number;  // DB id (for API calls: delete, update, mint)
  name: string;
  location: string;
  body: string;
  lat: number;
  lng: number;
  capacityMW: number;
  utilization: number;
  carbonFootprint: number;
  monthlyCost: number;
  solanaTxHash?: string;
  hasBlueprint?: boolean;
}

const bodyIcons: Record<string, React.ReactNode> = {
  earth: <Globe className="w-3.5 h-3.5" />,
  moon: <Moon className="w-3.5 h-3.5" />,
  mars: <Orbit className="w-3.5 h-3.5" />,
  orbit: <Orbit className="w-3.5 h-3.5" />,
};

interface Props {
  items: InventoryItem[];
  onRemove: (id: string) => void;
  onItemClick: (item: InventoryItem) => void;
  onViewBlueprint?: (item: InventoryItem) => void;
  onMint?: (item: InventoryItem) => void;
  mintingId?: string | null;
}

export default function InventoryPanel({ items, onRemove, onItemClick, onViewBlueprint, onMint, mintingId }: Props) {
  const totals = {
    capacity: items.reduce((s, i) => s + i.capacityMW, 0),
    avgUtil: items.length ? Math.round(items.reduce((s, i) => s + i.utilization, 0) / items.length) : 0,
    totalCarbon: Math.round(items.reduce((s, i) => s + i.carbonFootprint * i.capacityMW, 0) / Math.max(1, items.reduce((s, i) => s + i.capacityMW, 0))),
    totalCost: items.reduce((s, i) => s + i.monthlyCost, 0),
  };

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-5 h-5 text-white/50" />
        <h2 className="text-lg font-semibold text-foreground">Inventory</h2>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} sites</span>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No locations added yet. Click on a datacenter or satellite and use "Add to Inventory".</p>
      )}

      {items.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: 'Total MW', value: `${totals.capacity}` },
              { label: 'Avg Util', value: `${totals.avgUtil}%` },
              { label: 'Avg CO₂', value: `${totals.totalCarbon}g` },
              { label: 'Monthly', value: `$${(totals.totalCost / 1e6).toFixed(1)}M` },
            ].map(s => (
              <div key={s.label} className="bg-muted rounded-lg p-2 text-center">
                <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
                <p className="text-sm font-bold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Cards */}
          <div className="space-y-3 flex-1">
            {items.map(item => (
              <div
                key={item.id}
                className="bg-muted rounded-lg p-4 border border-transparent hover:border-white/20 transition-colors cursor-pointer"
                onClick={() => onItemClick(item)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{bodyIcons[item.body]}</span>
                    <span className="text-sm font-semibold text-foreground">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.hasBlueprint && onViewBlueprint && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewBlueprint(item); }}
                        className="text-emerald-400/70 hover:text-emerald-400 transition-colors p-1"
                        title="View Blueprint"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onItemClick(item); }}
                      className="text-muted-foreground hover:text-white/70 transition-colors p-1"
                      title="Zoom to location"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                    {item.solanaTxHash ? (
                      <a
                        href={`https://explorer.solana.com/tx/${item.solanaTxHash}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-white/50 hover:text-white/70 transition-colors p-1"
                        title="View on Solana Explorer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </a>
                    ) : item.backendId && onMint ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMint(item); }}
                        disabled={mintingId === item.id}
                        className="text-muted-foreground hover:text-white/60 transition-colors p-1 disabled:opacity-50"
                        title="Mint on Solana"
                      >
                        {mintingId === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Zap className="w-3.5 h-3.5" />}
                      </button>
                    ) : null}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                      className="text-muted-foreground hover:text-white/40 transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{item.location} · {item.body}</p>
                {item.solanaTxHash && (
                  <a
                    href={`https://explorer.solana.com/tx/${item.solanaTxHash}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] text-white/50 hover:text-white/70 bg-white/[0.06] rounded px-1.5 py-0.5 mb-1 transition-colors"
                  >
                    <span>On-chain</span>
                    <span className="text-white/30">{item.solanaTxHash.slice(0, 8)}…</span>
                  </a>
                )}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div><p className="text-[9px] text-muted-foreground">MW</p><p className="text-xs font-medium text-foreground">{item.capacityMW}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Util</p><p className="text-xs font-medium text-foreground">{item.utilization}%</p></div>
                  <div><p className="text-[9px] text-muted-foreground">CO₂</p><p className="text-xs font-medium text-foreground">{item.carbonFootprint}g</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Cost</p><p className="text-xs font-medium text-foreground">${(item.monthlyCost / 1e3).toFixed(0)}k</p></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
