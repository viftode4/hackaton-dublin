import { X, Plus, FileText } from 'lucide-react';
import { getIntensityColor } from '@/lib/constants';
import type { CO2Estimate } from '@/lib/co2-api';

interface Props {
  name: string;
  co2: CO2Estimate;
  onAddToCompare: () => void;
  onGenerateReport: () => void;
  onDismiss: () => void;
}

export default function CountryCard({ name, co2, onAddToCompare, onGenerateReport, onDismiss }: Props) {
  const color = getIntensityColor(co2.co2_intensity_gco2);
  const riskPct = Math.min(100, co2.risk_score);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-slide-up relative">
      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Country name */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Selected Country</p>
        <h3 className="text-lg font-bold text-foreground">{name}</h3>
      </div>

      {/* CO2 intensity */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}66` }} />
        <span className="text-sm font-semibold text-foreground">{co2.co2_intensity_gco2} g CO₂/kWh</span>
      </div>

      {/* Energy mix */}
      <div className="bg-muted/60 rounded-lg px-3 py-2">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Energy Mix</p>
        <p className="text-xs text-foreground">{co2.energy_mix}</p>
      </div>

      {/* Risk score */}
      <div className="bg-muted/60 rounded-lg px-3 py-2">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Risk Score</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${riskPct}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-semibold text-foreground">{co2.risk_score}/100</span>
        </div>
      </div>

      {/* Confidence */}
      {co2.confidence < 0.5 && (
        <p className="text-[10px] text-white/30">
          Low confidence — stub data (no ML API configured)
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onAddToCompare}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white/70 border border-white/10 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add to Compare
        </button>
        <button
          onClick={onGenerateReport}
          className="flex-1 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-3 py-2 text-xs font-medium transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Full Report
        </button>
      </div>
    </div>
  );
}
