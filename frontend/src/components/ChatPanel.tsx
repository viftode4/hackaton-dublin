import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { advisorChat } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

export default function ChatPanel() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Welcome to Orbital Atlas AI Advisor. I can help you evaluate datacenter locations, compare costs, check your portfolio, and even create payment links for blueprints. What would you like to explore?" },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    // Build history for context (last 10 messages)
    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    try {
      const result = await advisorChat(userMsg, history, user?.username);

      if (result.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${result.error}` }]);
      } else {
        const tools = result.tools_used?.map(t => t.tool) || [];

        // Typewriter effect
        const fullText = result.message;
        setMessages(prev => [...prev, { role: 'assistant', content: '', tools }]);
        let typed = '';
        for (let i = 0; i < fullText.length; i++) {
          typed += fullText[i];
          const current = typed;
          const currentTools = tools;
          await new Promise(r => setTimeout(r, 8));
          setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: current, tools: currentTools }]);
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — is the backend running on port 3002?' }]);
    }

    setIsTyping(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className="max-w-[80%]">
              {msg.tools && msg.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {msg.tools.map((tool, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      <Wrench className="w-2.5 h-2.5" />{tool}
                    </span>
                  ))}
                </div>
              )}
              <div className={`rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}>
                {msg.content}
                {msg.role === 'assistant' && isTyping && i === messages.length - 1 && (
                  <span className="animate-pulse text-primary">▊</span>
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
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask about datacenter locations..."
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button size="icon" onClick={handleSend} disabled={isTyping || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
