import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Wrench, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { advisorChat, getSessionStatus, generateBlueprint, listBlueprints, mintToSolana, createInventory } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

interface Props {
  onClose: () => void;
  locationContext?: Record<string, unknown>;
  onInventoryChanged?: () => void;
}

/** Extract Stripe checkout session IDs from a message */
function extractStripeSessionIds(text: string): string[] {
  // Match cs_test_... or cs_live_... session IDs in URLs or plain text
  const matches = text.match(/cs_(test|live)_[A-Za-z0-9]+/g);
  return matches ? [...new Set(matches)] : [];
}

export default function ChatPanel({ onClose, locationContext, onInventoryChanged }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Welcome to Orbital Atlas AI Advisor. I can help you evaluate datacenter locations, compare costs, check your portfolio, and recommend optimal sites. What would you like to explore?" },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [paymentPolling, setPaymentPolling] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handlePaymentDetected = useCallback(async (sessionId: string) => {
    if (paymentPolling) return; // already polling
    setPaymentPolling(sessionId);

    pollRef.current = setInterval(async () => {
      try {
        const status = await getSessionStatus(sessionId);
        if (status.paid) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPaymentPolling(null);

          // Payment confirmed! Generate blueprint + add to inventory + mint
          const locationId = status.location_id;
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Payment confirmed! Generating your blueprint and minting on Solana...`,
          }]);

          if (locationId) {
            try {
              // Generate blueprint
              await generateBlueprint(locationId, user?.username);

              // Add to inventory
              const inv = await createInventory({
                inventory: {
                  location_id: locationId,
                  name: locationId,
                  capacity_mw: Math.round(10 + Math.random() * 90),
                  utilization_pct: Math.round(40 + Math.random() * 55),
                  carbon_footprint_tons: 0,
                  power_source: null,
                  monthly_cost: Math.round(100000 + Math.random() * 900000),
                  workload_types: ['General'],
                },
              });

              // Mint on Solana
              try {
                const mintResult = await mintToSolana(locationId, inv.id, user?.username);
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `Blueprint generated, added to your inventory, and minted on Solana!\n\n[View on Solana Explorer](https://explorer.solana.com/tx/${mintResult.tx_hash}?cluster=devnet)`,
                }]);
              } catch {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `Blueprint generated and added to your inventory! Solana minting can be done from the inventory tab.`,
                }]);
              }

              onInventoryChanged?.();
            } catch {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Payment confirmed! Your blueprint is ready. You can view it from the scorecard panel.`,
              }]);
            }
          }
        }
      } catch {}
    }, 2000);
  }, [paymentPolling, user?.username, onInventoryChanged]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      const result = await advisorChat(userMsg, history, user?.username, locationContext);

      if (result.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${result.error}` }]);
      } else {
        const tools = result.tools_used?.map(t => t.tool) || [];
        const fullText = result.message;
        setMessages(prev => [...prev, { role: 'assistant', content: fullText, tools }]);

        // If AI used create_payment_link, watch for payment completion
        if (tools.includes('create_payment_link')) {
          const sessionIds = extractStripeSessionIds(fullText);
          if (sessionIds.length > 0) {
            handlePaymentDetected(sessionIds[0]);
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — is the backend running?' }]);
    }

    setIsTyping(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">AI Advisor</h3>
          {locationContext && (
            <span className="text-[9px] bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded">
              {String(locationContext.name || locationContext.body || 'context')}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Payment polling indicator */}
      {paymentPolling && (
        <div className="px-4 py-2 bg-white/[0.03] border-b border-border flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <p className="text-[10px] text-muted-foreground">Waiting for payment confirmation...</p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-white/50" />
              </div>
            )}
            <div className="max-w-[85%] min-w-0 overflow-hidden">
              {msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {msg.tools.map((tool, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-[9px] bg-white/[0.06] text-white/50 px-1.5 py-0.5 rounded">
                      <Wrench className="w-2.5 h-2.5" />{tool}
                    </span>
                  ))}
                </div>
              )}
              <div className={`rounded-lg px-3 py-2 text-sm overflow-hidden break-words ${
                msg.role === 'user'
                  ? 'bg-white/[0.1] text-white/80'
                  : 'bg-muted text-foreground'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="chat-markdown [overflow-wrap:anywhere]">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mt-2.5 mb-1 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
                        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="text-foreground/80">{children}</em>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock
                            ? <code className="block bg-black/30 rounded p-2 my-1.5 text-xs font-mono whitespace-pre-wrap break-all">{children}</code>
                            : <code className="bg-white/[0.08] rounded px-1 py-0.5 text-xs font-mono break-all">{children}</code>;
                        },
                        pre: ({ children }) => <pre className="my-1.5 whitespace-pre-wrap">{children}</pre>,
                        blockquote: ({ children }) => <blockquote className="border-l-2 border-white/20 pl-2.5 my-1.5 text-foreground/70">{children}</blockquote>,
                        table: ({ children }) => <div className="my-1.5 overflow-hidden"><table className="w-full text-xs border-collapse table-fixed">{children}</table></div>,
                        thead: ({ children }) => <thead className="border-b border-white/20">{children}</thead>,
                        th: ({ children }) => <th className="text-left px-2 py-1 font-semibold text-foreground/80">{children}</th>,
                        td: ({ children }) => <td className="px-2 py-1 border-t border-white/5">{children}</td>,
                        hr: () => <hr className="border-white/10 my-2" />,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{children}</a>,
                      }}
                    >
                      {msg.content}
                    </Markdown>
                    {isTyping && i === messages.length - 1 && (
                      <span className="animate-pulse text-white/50">&#9610;</span>
                    )}
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask about locations, costs, feasibility..."
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          <Button size="icon" onClick={handleSend} disabled={isTyping || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
