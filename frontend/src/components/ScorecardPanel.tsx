import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, Moon, Orbit, Plus, Loader2, ArrowLeft, CreditCard, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateScorecard as mockScorecard, type Scorecard } from '@/lib/scorecard';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  generateScorecard as apiScorecard,
  generateBlueprint,
  createCheckout,
  checkPayment,
  getSessionStatus,
  listBlueprints,
  getBlueprint,
  getInventories,
  mintToSolana,
  createInventory,
  type BlueprintDetail,
} from '@/lib/api';

interface Props {
  locationId: string;
  locationName: string;
  body: string;
  carbonIntensity: number;
  customerId?: string;
  locationData?: Record<string, unknown>;
  initialViewMode?: ViewMode;
  onClose: () => void;
  onInventoryChanged?: () => void;
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
  if (score >= 70) return 'rgba(255,255,255,0.8)';
  if (score >= 45) return 'rgba(255,255,255,0.5)';
  return 'rgba(255,255,255,0.25)';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-white/90';
  if (grade.startsWith('B')) return 'text-white/60';
  if (grade.startsWith('C')) return 'text-white/40';
  return 'text-white/20';
}

type ViewMode = 'scorecard' | 'blueprint';

export default function ScorecardPanel({ locationId, locationName, body, carbonIntensity, customerId, locationData, initialViewMode, onClose, onInventoryChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [blueprintPaid, setBlueprintPaid] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [pollingSession, setPollingSession] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>('');
  const [generatingBlueprint, setGeneratingBlueprint] = useState(false);
  const [blueprintData, setBlueprintData] = useState<BlueprintDetail | null>(null);
  const [solanaTxHash, setSolanaTxHash] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? 'scorecard');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setLoading(true);
    setAiSummary(null);
    setBlueprintData(null);
    setViewMode(initialViewMode ?? 'scorecard');

    const mock = mockScorecard(locationId, locationName, body, carbonIntensity);
    setScorecard(mock);
    setLoading(false);

    apiScorecard(locationId, customerId, locationData).then(data => {
      if (data && !('error' in data)) {
        const summary = (data as Record<string, unknown>).summary ||
          (data as Record<string, unknown>).analysis ||
          (data as Record<string, unknown>).executive_summary;
        if (summary) setAiSummary(String(summary));
      }
    }).catch(() => {});

    // Check payment status & load existing blueprint
    checkPayment(locationId, customerId).then(async (res) => {
      setBlueprintPaid(res.paid);
      if (res.paid) {
        // Try to load existing blueprint
        try {
          const blueprints = await listBlueprints(customerId);
          const match = blueprints.find(b => b.location_id === locationId && b.has_content);
          if (match) {
            const detail = await getBlueprint(match.id, customerId);
            setBlueprintData(detail);
          }
        } catch {}

        // Auto-sync: if paid but not in inventory, create + mint now
        try {
          const inv = await getInventories();
          const existing = inv.find(i => i.location_id === locationId);
          if (!existing) {
            console.log('[Blueprint] Paid but not in inventory — auto-creating...');
            const created = await createInventory({
              inventory: {
                location_id: locationId,
                name: locationName,
                capacity_mw: Math.round(10 + Math.random() * 90),
                utilization_pct: Math.round(40 + Math.random() * 55),
                carbon_footprint_tons: carbonIntensity,
                power_source: null,
                monthly_cost: Math.round(100000 + Math.random() * 900000),
                workload_types: ['General'],
              },
            });
            // Auto-mint
            try {
              const mintResult = await mintToSolana(locationId, created.id, customerId);
              setSolanaTxHash(mintResult.tx_hash);
            } catch {}
            onInventoryChanged?.();
          } else if (!existing.solana_tx_hash) {
            // In inventory but not minted — auto-mint
            console.log('[Blueprint] In inventory but not minted — auto-minting...');
            try {
              const mintResult = await mintToSolana(locationId, existing.id, customerId);
              setSolanaTxHash(mintResult.tx_hash);
              onInventoryChanged?.();
            } catch {}
          }
        } catch {}
      }
    }).catch(() => {});
  }, [locationId, locationName, body, carbonIntensity, customerId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handlePaymentSuccess = useCallback(async () => {
    console.log('[Blueprint] Payment success! Starting blueprint generation...');
    setBlueprintPaid(true);
    setCheckingOut(false);
    setPollingSession(null);
    setPaymentStatus('Payment confirmed! Generating blueprint...');
    setGeneratingBlueprint(true);

    try {
      // Generate blueprint via API (backend stores it)
      const result = await generateBlueprint(locationId, customerId, locationData);
      console.log('[Blueprint] Generate result:', result);

      if (result && !('error' in result)) {
        // Load the stored blueprint
        const blueprints = await listBlueprints(customerId);
        const match = blueprints.find(b => b.location_id === locationId && b.has_content);
        if (match) {
          const detail = await getBlueprint(match.id, customerId);
          setBlueprintData(detail);
        }

        // Auto-add to inventory (direct API call — no stale closure)
        setPaymentStatus('Adding to inventory...');
        try {
          const created = await createInventory({
            inventory: {
              location_id: locationId,
              name: locationName,
              capacity_mw: Math.round(10 + Math.random() * 90),
              utilization_pct: Math.round(40 + Math.random() * 55),
              carbon_footprint_tons: carbonIntensity,
              power_source: null,
              monthly_cost: Math.round(100000 + Math.random() * 900000),
              workload_types: ['General'],
            },
          });
          console.log('[Blueprint] Inventory created:', created.id);

          // Auto-mint on Solana
          setPaymentStatus('Minting CO₂ record on Solana...');
          try {
            const mintResult = await mintToSolana(locationId, created.id, customerId);
            setSolanaTxHash(mintResult.tx_hash);
            setPaymentStatus('Blueprint ready! Minted on Solana.');
          } catch {
            setPaymentStatus('Blueprint ready! (Solana mint failed — you can retry from inventory)');
          }

          // Notify parent to refresh inventory state (after mint so tx_hash is saved)
          onInventoryChanged?.();

        } catch (invErr) {
          console.error('[Blueprint] Inventory creation failed:', invErr);
          setPaymentStatus('Blueprint ready! (Inventory creation failed)');
        }

        setViewMode('blueprint');
      } else {
        setPaymentStatus('Blueprint generated (check inventory)');
      }
    } catch (err) {
      console.error('[Blueprint] Payment success handler error:', err);
      setPaymentStatus('Payment confirmed, but blueprint generation failed. Try "View Full Blueprint" later.');
    } finally {
      setGeneratingBlueprint(false);
    }
  }, [locationId, locationName, carbonIntensity, customerId, locationData, onInventoryChanged]);

  const handleBuyBlueprint = async () => {
    setCheckingOut(true);
    setPaymentStatus('Creating checkout session...');

    try {
      const res = await createCheckout(locationId, locationName, undefined, customerId);
      if (res.error) {
        setCheckingOut(false);
        setPaymentStatus(`Checkout error: ${res.error}`);
        return;
      }
      if (res.checkout_url) {
        // Open Stripe checkout — try new tab, fallback to redirect
        const stripeWindow = window.open(res.checkout_url, '_blank');
        if (!stripeWindow) {
          // Popup blocked — redirect in same tab
          window.location.href = res.checkout_url;
          return;
        }
        setPaymentStatus('Complete payment in the new tab...');
        setPollingSession(res.session_id);

        // Poll for payment completion
        const sessionId = res.session_id;
        const poll = async () => {
          try {
            const status = await getSessionStatus(sessionId);
            console.log('[Blueprint] Poll result:', status);
            if (status.paid) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              handlePaymentSuccess();
            }
          } catch (err) {
            console.error('[Blueprint] Poll error:', err);
          }
        };
        // Check immediately, then every 2s
        poll();
        pollRef.current = setInterval(poll, 2000);
      } else {
        setCheckingOut(false);
        setPaymentStatus('Failed to create checkout session — no URL returned');
      }
    } catch (err) {
      setCheckingOut(false);
      setPaymentStatus(`Checkout failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const handleViewBlueprint = async () => {
    if (blueprintData) {
      setViewMode('blueprint');
      return;
    }

    // Try to load or generate
    setGeneratingBlueprint(true);
    setPaymentStatus('Loading blueprint...');
    try {
      // Check for existing stored blueprint
      const blueprints = await listBlueprints(customerId);
      const match = blueprints.find(b => b.location_id === locationId && b.has_content);
      if (match) {
        const detail = await getBlueprint(match.id, customerId);
        setBlueprintData(detail);
        setViewMode('blueprint');
        setPaymentStatus('');
      } else {
        // Generate a new one
        setPaymentStatus('Generating blueprint...');
        await generateBlueprint(locationId, customerId, locationData);
        const updatedBlueprints = await listBlueprints(customerId);
        const newMatch = updatedBlueprints.find(b => b.location_id === locationId && b.has_content);
        if (newMatch) {
          const detail = await getBlueprint(newMatch.id, customerId);
          setBlueprintData(detail);
          setViewMode('blueprint');
        }
        setPaymentStatus('');
      }
    } catch {
      setPaymentStatus('Failed to load blueprint');
    } finally {
      setGeneratingBlueprint(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          <p className="text-sm text-muted-foreground animate-pulse">Generating scorecard...</p>
        </div>
      </div>
    );
  }

  if (!scorecard) return null;

  // Blueprint view — loading state while data is fetched
  if (viewMode === 'blueprint' && !blueprintData?.content) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-6 h-6 animate-spin text-white/50" />
        <p className="text-sm text-muted-foreground">Loading blueprint…</p>
        <button onClick={() => setViewMode('scorecard')} className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to scorecard
        </button>
      </div>
    );
  }

  // Blueprint view
  if (viewMode === 'blueprint' && blueprintData?.content) {
    const bp = blueprintData.content as Record<string, unknown>;
    const txHash = solanaTxHash || blueprintData.solana_tx_hash;
    const plan = bp.construction_plan as Record<string, unknown> | undefined;
    const phases = (plan?.phases as Record<string, unknown>[]) || [];
    const power = bp.power_strategy as Record<string, unknown> | undefined;
    const cooling = bp.cooling_design as Record<string, unknown> | undefined;
    const network = bp.network_topology as Record<string, unknown> | undefined;
    const staffing = bp.staffing as Record<string, unknown> | undefined;
    const risksRaw = bp.risks_and_mitigation as unknown;
    const impact = bp.portfolio_impact as Record<string, unknown> | undefined;
    const recommendationRaw = bp.go_no_go_recommendation;
    const recommendation = typeof recommendationRaw === 'string' ? recommendationRaw : recommendationRaw ? JSON.stringify(recommendationRaw) : undefined;

    // If it's not structured JSON (e.g. a plain text/summary fallback), render as markdown
    const isStructured = plan || power || cooling;

    if (!isStructured) {
      const fallbackText =
        (bp.blueprint as string) || (bp.report as string) || (bp.analysis as string) ||
        (bp.message as string) || (bp.summary as string) || JSON.stringify(bp, null, 2);
      return (
        <div className="h-full flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border shrink-0">
            <button onClick={() => setViewMode('scorecard')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
              <ArrowLeft className="w-3.5 h-3.5" /><span>Back to scorecard</span>
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Full Blueprint</h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="chat-markdown text-sm text-foreground/90 leading-relaxed [overflow-wrap:anywhere]">
              <Markdown remarkPlugins={[remarkGfm]}>{fallbackText}</Markdown>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border shrink-0">
          <button onClick={() => setViewMode('scorecard')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /><span>Back to scorecard</span>
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Feasibility Blueprint</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{blueprintData.location_name || locationName}</p>
          {txHash && (
            <a href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[9px] text-blue-400 hover:underline mt-1.5">
              <ExternalLink className="w-2.5 h-2.5" /> Minted on Solana
            </a>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Recommendation Banner */}
          {recommendation && (
            <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${
              recommendation.toUpperCase().startsWith('GO') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {recommendation}
            </div>
          )}

          {/* Capacity & Total Cost */}
          <div className="flex gap-3">
            {bp.capacity_mw && (
              <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/5">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Capacity</p>
                <p className="text-sm font-bold text-foreground">{String(bp.capacity_mw)} MW</p>
              </div>
            )}
            {plan?.total_cost && (
              <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/5">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Cost</p>
                <p className="text-sm font-bold text-foreground">{String(plan.total_cost)}</p>
              </div>
            )}
            {plan?.total_duration_months && (
              <div className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2.5 border border-white/5">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Timeline</p>
                <p className="text-sm font-bold text-foreground">{String(plan.total_duration_months)} mo</p>
              </div>
            )}
          </div>

          {/* Construction Phases */}
          {phases.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Construction Plan</h3>
              {plan?.critical_path && (
                <p className="text-[10px] text-muted-foreground mb-2">Critical path: {String(plan.critical_path)}</p>
              )}
              <div className="space-y-2">
                {phases.map((phase, i) => (
                  <div key={i} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-xs font-semibold text-foreground">{String(phase.name)}</p>
                    </div>
                    <div className="flex gap-3 mb-1">
                      <span className="text-[10px] text-muted-foreground">{String(phase.duration_months)} months</span>
                      <span className="text-[10px] font-mono text-white/60">{String(phase.cost)}</span>
                    </div>
                    <p className="text-[11px] text-foreground/60 leading-relaxed">{String(phase.description)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Power Strategy */}
          {power && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Power Strategy</h3>
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Primary</span>
                  <span className="text-[11px] text-foreground">{String(power.primary_source)} ({String(power.primary_renewable_pct)}% renewable)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Backup</span>
                  <span className="text-[11px] text-foreground">{String(power.backup_source)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Redundancy</span>
                  <span className="text-[11px] text-foreground">{String(power.design_redundancy)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Annual Cost</span>
                  <span className="text-[11px] font-mono text-white/60">{String(power.annual_cost)}</span>
                </div>
                {power.notes && <p className="text-[10px] text-foreground/50 pt-1 border-t border-white/5">{String(power.notes)}</p>}
              </div>
            </div>
          )}

          {/* Cooling Design */}
          {cooling && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Cooling Design</h3>
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Method</span>
                  <span className="text-[11px] text-foreground">{String(cooling.method)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">PUE Target</span>
                  <span className="text-[11px] font-mono font-bold text-foreground">{String(cooling.pue_target)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Annual Cost</span>
                  <span className="text-[11px] font-mono text-white/60">{String(cooling.annual_cost)}</span>
                </div>
                {cooling.description && <p className="text-[10px] text-foreground/50 pt-1 border-t border-white/5">{String(cooling.description)}</p>}
              </div>
            </div>
          )}

          {/* Network */}
          {network && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Network Topology</h3>
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                {Array.isArray(network.primary_connectivity) && (
                  <div className="flex justify-between">
                    <span className="text-[11px] text-muted-foreground">Connectivity</span>
                    <span className="text-[11px] text-foreground text-right">{(network.primary_connectivity as string[]).join(', ')}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Redundancy</span>
                  <span className="text-[11px] text-foreground">{String(network.redundancy)}</span>
                </div>
                {network.international_latency && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(network.international_latency as Record<string, unknown>).map(([region, latency]) => (
                      <span key={region} className="text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded font-mono">
                        {region.toUpperCase()}: {typeof latency === 'string' ? latency : JSON.stringify(latency)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Annual Cost</span>
                  <span className="text-[11px] font-mono text-white/60">{String(network.annual_cost)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Staffing */}
          {staffing && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Staffing</h3>
              <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Construction</span>
                  <span className="text-[11px] text-foreground">{String(staffing.construction_phase)} workers</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Operations</span>
                  <span className="text-[11px] text-foreground">{String(staffing.operations_team)} FTE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">Ops Annual Cost</span>
                  <span className="text-[11px] font-mono text-white/60">{String(staffing.operations_cost_annual)}</span>
                </div>
                {staffing.breakdown && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                    {Object.entries(staffing.breakdown as Record<string, number>).map(([role, count]) => (
                      <span key={role} className="text-[10px] bg-white/[0.06] px-1.5 py-0.5 rounded">
                        {role.replace(/_/g, ' ')}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risks */}
          {risksRaw && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Risks & Mitigation</h3>
              <div className="space-y-1.5">
                {(Array.isArray(risksRaw)
                  ? (risksRaw as Array<Record<string, string>>).map((item, i) => ({ key: String(i), risk: item.risk ?? 'Risk', mitigation: item.mitigation ?? '' }))
                  : Object.entries(risksRaw as Record<string, unknown>).map(([key, val]) => ({
                      key,
                      risk: key,
                      mitigation: typeof val === 'string' ? val : (val as Record<string, string>)?.mitigation ?? JSON.stringify(val),
                    }))
                ).map(({ key, risk, mitigation }) => (
                  <div key={key} className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                    <p className="text-[11px] font-semibold text-foreground capitalize mb-0.5">{risk.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-foreground/60">{mitigation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio Impact */}
          {impact && (
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Portfolio Impact</h3>
              <div className="space-y-1.5">
                {Object.entries(impact).map(([key, value]) => (
                  <div key={key} className="bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                    <p className="text-[11px] font-semibold text-foreground capitalize mb-0.5">{key.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-foreground/60">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
            <span className="text-white/50">{bodyIcons[body] ?? <Globe className="w-4 h-4" />}</span>
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
      <div className="border-l-2 border-white/20 pl-3 mb-6">
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

      {/* Status message */}
      {paymentStatus && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
          <div className="flex items-center gap-2">
            {(checkingOut || generatingBlueprint) && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/50" />}
            {blueprintPaid && !generatingBlueprint && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            <p className="text-xs text-foreground/70">{paymentStatus}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 mt-auto">
        {blueprintPaid ? (
          <Button
            className="w-full gap-2 h-10 text-sm"
            variant="default"
            onClick={handleViewBlueprint}
            disabled={generatingBlueprint}
          >
            {generatingBlueprint ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating Blueprint...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> View Full Blueprint</>
            )}
          </Button>
        ) : (
          <Button
            className="w-full gap-2 h-10 text-sm"
            variant="default"
            onClick={handleBuyBlueprint}
            disabled={checkingOut}
          >
            {checkingOut ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for payment...</>
            ) : (
              <><CreditCard className="w-4 h-4" /> Buy Full Blueprint — $299</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
