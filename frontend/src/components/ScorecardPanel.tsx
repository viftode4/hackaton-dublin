import { useState, useEffect } from 'react';
import { X, Globe, Moon, Orbit, FileText, Plus, Loader2, ArrowLeft, CreditCard, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateScorecard as mockScorecard, type Scorecard } from '@/lib/scorecard';
import { generateScorecard as apiScorecard, createCheckout, checkPayment } from '@/lib/api';

interface Props {
  locationId: string;
  locationName: string;
  body: string;
  carbonIntensity: number;
  customerId?: string;
  onClose: () => void;
  onAddToInventory?: (locationId: string, locationName: string, body: string, carbon: number) => void;
}

const bodyIcons: Record<string, React.ReactNode> = {
  earth: <Globe className="w-4 h-4" />,
  orbit: <Orbit className="w-4 h-4" />,
  moon: <Moon className="w-4 h-4" />,
};

const bodyLabels: Record<string, string> = {
  earth: 'Ground Station',
  orbit: 'Orbital Asset',
  moon: 'Lunar Site',
  mars: 'Mars Site',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'hsl(var(--success))';
  if (score >= 45) return 'hsl(var(--warning))';
  return 'hsl(var(--destructive))';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-success';
  if (grade.startsWith('B')) return 'text-primary';
  if (grade.startsWith('C')) return 'text-warning';
  return 'text-destructive';
}

export default function ScorecardPanel({ locationId, locationName, body, carbonIntensity, customerId, onClose, onAddToInventory }: Props) {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [blueprintPaid, setBlueprintPaid] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAiSummary(null);

    // Show mock scorecard immediately for fast UX
    const mock = mockScorecard(locationId, locationName, body, carbonIntensity);
    setScorecard(mock);
    setLoading(false);

    // Then fetch real AI scorecard in background
    apiScorecard(locationId, customerId).then(data => {
      if (data && !('error' in data)) {
        // Use AI summary if available
        const summary = (data as Record<string, unknown>).summary ||
          (data as Record<string, unknown>).analysis ||
          (data as Record<string, unknown>).executive_summary;
        if (summary) setAiSummary(String(summary));
      }
    }).catch(() => { /* fallback to mock */ });

    // Check payment status
    checkPayment(locationId, customerId).then(res => {
      setBlueprintPaid(res.paid);
    }).catch(() => {});
  }, [locationId, locationName, body, carbonIntensity, customerId]);

  const handleBuyBlueprint = async () => {
    setCheckingOut(true);
    try {
      const res = await createCheckout(locationId, locationName, undefined, customerId);
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Generating scorecard...</p>
        </div>
      </div>
    );
  }

  if (!scorecard) return null;

  return (
    <div className="h-full flex flex-col p-5 overflow-y-auto animate-slide-up">
      {/* Back button */}
      {body !== 'orbit' && (
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 self-start"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to globe</span>
        </button>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-primary">{bodyIcons[body] ?? <Globe className="w-4 h-4" />}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {bodyLabels[body] ?? body}
            </span>
          </div>
          <h2 className="text-lg font-bold text-foreground leading-tight">{scorecard.locationName}</h2>
        </div>
        <span className={`text-4xl font-black ${gradeColor(scorecard.grade)}`}>{scorecard.grade}</span>
      </div>

      {/* Metrics */}
      <div className="space-y-4 mb-6">
        {scorecard.metrics.map(m => (
          <div key={m.name}>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs font-medium text-foreground">{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
                <span className="text-xs font-bold text-foreground tabular-nums w-8 text-right">{m.score}</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${m.score}%`, backgroundColor: scoreColor(m.score) }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary — AI-powered if available */}
      <div className="border-l-2 border-primary/40 pl-3 mb-6">
        <p className="text-xs text-muted-foreground mb-1">
          {aiSummary ? 'AI Analysis' : 'Analysis'}
        </p>
        <p className="text-sm text-foreground/90 leading-relaxed">{aiSummary || scorecard.summary}</p>
      </div>

      {/* Cost & Timeline */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 bg-muted/60 rounded-lg px-3 py-2.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Est. Cost</p>
          <p className="text-sm font-semibold text-foreground">{scorecard.costRange}</p>
        </div>
        <div className="flex-1 bg-muted/60 rounded-lg px-3 py-2.5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Timeline</p>
          <p className="text-sm font-semibold text-foreground">{scorecard.timeline}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 mt-auto">
        {blueprintPaid ? (
          <Button className="w-full gap-2 h-10 text-sm" variant="default">
            <CheckCircle2 className="w-4 h-4" /> View Full Blueprint
          </Button>
        ) : (
          <Button
            className="w-full gap-2 h-10 text-sm"
            variant="default"
            onClick={handleBuyBlueprint}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Stripe...</>
            ) : (
              <><CreditCard className="w-4 h-4" /> Buy Full Blueprint — $299</>
            )}
          </Button>
        )}
        <Button
          className="w-full gap-2 h-10 text-sm"
          variant="outline"
          onClick={() => onAddToInventory?.(locationId, locationName, body, carbonIntensity)}
        >
          <Plus className="w-4 h-4" /> Add to Inventory
        </Button>
      </div>
    </div>
  );
}
