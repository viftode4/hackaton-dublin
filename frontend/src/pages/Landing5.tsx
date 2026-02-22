import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import heroImage from '@/assets/landing-hero.png';

/* ------------------------------------------------------------------ */
/*  REDACTABLE SECTION DATA                                           */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  label?: string;
  prefix?: string;
  redacted: string;
  revealed: string;
}

const SECTIONS: Section[] = [
  {
    id: 'mission',
    label: 'MISSION BRIEF',
    prefix: '',
    redacted: 'Plan your next ████████████ — anywhere in the ████████████.',
    revealed: 'Plan your next data center — anywhere in the solar system.',
  },
  {
    id: 'cap1',
    prefix: '[1]',
    redacted: '████████████████████████',
    revealed: 'AI-Powered Location Scoring',
  },
  {
    id: 'cap2',
    prefix: '[2]',
    redacted: '████████████████████████',
    revealed: 'Live Orbital Satellite Data',
  },
  {
    id: 'cap3',
    prefix: '[3]',
    redacted: '████████████████████████',
    revealed: 'Multi-Planet Infrastructure',
  },
  {
    id: 'cap4',
    prefix: '[4]',
    redacted: '████████████████████████',
    revealed: 'Carbon & Cost Optimization',
  },
  {
    id: 'status',
    label: 'OPERATIONAL STATUS',
    prefix: '',
    redacted: '████████',
    revealed: 'ACTIVE \u2014 7 Regions Online',
  },
];

/* ------------------------------------------------------------------ */
/*  REDACTED BLOCK COMPONENT                                          */
/* ------------------------------------------------------------------ */

function RedactedBlock({
  section,
  isRevealed,
  onReveal,
  reducedMotion,
}: {
  section: Section;
  isRevealed: boolean;
  onReveal: () => void;
  reducedMotion: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [justRevealed, setJustRevealed] = useState(false);

  const handleClick = () => {
    if (isRevealed) return;
    setJustRevealed(true);
    onReveal();
    setTimeout(() => setJustRevealed(false), 600);
  };

  if (reducedMotion) {
    return (
      <span className="text-white/70">
        {section.prefix ? `${section.prefix} ` : ''}
        {section.revealed}
      </span>
    );
  }

  return (
    <span
      className="relative inline cursor-pointer select-none"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label={isRevealed ? section.revealed : 'Redacted content \u2014 click to reveal'}
    >
      {section.prefix ? (
        <span className="text-[#00e5ff]/60 mr-2">{section.prefix}</span>
      ) : null}

      {isRevealed ? (
        <span
          className="text-white transition-all duration-500"
          style={{
            filter: justRevealed ? 'blur(2px)' : 'blur(0)',
            transform: justRevealed ? 'scale(1.02)' : 'scale(1)',
            display: 'inline-block',
          }}
        >
          {section.revealed}
          <span
            className="ml-2 text-[9px] tracking-[0.15em] text-[#22c55e]/80 font-medium align-middle
                       border border-[#22c55e]/30 px-1.5 py-0.5 rounded-sm"
          >
            DECLASSIFIED
          </span>
        </span>
      ) : (
        <span
          className="relative inline-block transition-all duration-200"
          style={{
            background: hovering
              ? 'rgba(0,229,255,0.10)'
              : 'rgba(0,229,255,0.18)',
            borderRadius: '2px',
            padding: '1px 4px',
          }}
        >
          <span
            className="transition-all duration-200"
            style={{
              color: hovering ? 'rgba(255,255,255,0.40)' : 'transparent',
              filter: hovering ? 'blur(1.5px)' : 'blur(0)',
            }}
          >
            {hovering ? section.revealed : section.redacted}
          </span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN LANDING COMPONENT                                            */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'dark' | 'document' | 'stamp' | 'ready'>('dark');
  const [stampDone, setStampDone] = useState(false);
  const [allRevealedStamp, setAllRevealedStamp] = useState(false);
  const glitchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [glitchId, setGlitchId] = useState<string | null>(null);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- entrance sequence ---------- */
  useEffect(() => {
    if (reducedMotion) {
      setPhase('ready');
      setStampDone(true);
      return;
    }
    const t1 = setTimeout(() => setPhase('document'), 300);
    const t2 = setTimeout(() => setPhase('stamp'), 900);
    const t3 = setTimeout(() => {
      setStampDone(true);
      setPhase('ready');
    }, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reducedMotion]);

  /* ---------- random glitch effect ---------- */
  useEffect(() => {
    if (reducedMotion) return;
    glitchTimerRef.current = setInterval(() => {
      const unrevealed = SECTIONS.filter((s) => !revealed.has(s.id));
      if (unrevealed.length === 0) return;
      const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      setGlitchId(pick.id);
      setTimeout(() => setGlitchId(null), 150);
    }, 3000);
    return () => {
      if (glitchTimerRef.current) clearInterval(glitchTimerRef.current);
    };
  }, [revealed, reducedMotion]);

  /* ---------- "all revealed" stamp ---------- */
  useEffect(() => {
    if (revealed.size === SECTIONS.length && !allRevealedStamp) {
      setTimeout(() => setAllRevealedStamp(true), 400);
    }
  }, [revealed, allRevealedStamp]);

  const handleReveal = useCallback((id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const revealedCount = revealed.size;
  const totalCount = SECTIONS.length;
  const revealRatio = revealedCount / totalCount;

  /* Classified stamp opacity: fades as user reveals */
  const stampOpacity = revealRatio >= 1 ? 0 : revealRatio >= 0.5 ? 0.15 : 0.30;

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <>
      {/* --- GLOBAL STYLES (scoped via unique class names) --- */}
      <style>{`
        @keyframes cls-stamp-slam {
          0%   { opacity: 0; transform: rotate(-15deg) scale(2); }
          60%  { opacity: 1; transform: rotate(-3deg) scale(0.95); }
          80%  { transform: rotate(-6deg) scale(1.03); }
          100% { transform: rotate(-5deg) scale(1); }
        }
        @keyframes cls-doc-fade {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cls-scanline {
          0%   { top: -4px; }
          100% { top: 100%; }
        }
        @keyframes cls-glitch-flicker {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
        @keyframes cls-decl-stamp-slam {
          0%   { opacity: 0; transform: rotate(-15deg) scale(2.2); }
          50%  { opacity: 1; transform: rotate(-2deg) scale(0.92); }
          75%  { transform: rotate(-6deg) scale(1.05); }
          100% { transform: rotate(-5deg) scale(1); }
        }
        .cls-glitch { animation: cls-glitch-flicker 0.15s ease-in-out; }
      `}</style>

      <div
        className="relative w-screen h-screen overflow-hidden"
        style={{
          background: 'hsl(224 56% 7%)',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {/* --- HERO IMAGE BACKDROP (15% opacity) --- */}
        <img
          src={heroImage}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.15 }}
        />

        {/* --- DOCUMENT CARD --- */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            opacity: phase === 'dark' ? 0 : 1,
            transition: 'opacity 0.6s ease',
          }}
        >
          <div
            className="relative flex flex-col"
            style={{
              width: 'min(80vw, 900px)',
              height: 'min(85vh, 760px)',
              background: '#0d1117',
              border: '1px solid rgba(0,229,255,0.20)',
              borderRadius: '4px',
              animation: phase !== 'dark' && !reducedMotion ? 'cls-doc-fade 0.6s ease-out forwards' : 'none',
              /* subtle grid / paper texture */
              backgroundImage: `
                linear-gradient(rgba(0,229,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0,229,255,0.02) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
              overflow: 'hidden',
            }}
          >
            {/* --- SCAN LINE --- */}
            {!reducedMotion && (
              <div
                className="absolute left-0 w-full pointer-events-none"
                style={{
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.08), transparent)',
                  animation: 'cls-scanline 6s linear infinite',
                  zIndex: 30,
                }}
              />
            )}

            {/* --- CLASSIFIED STAMP (fades as user reveals) --- */}
            {!reducedMotion && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 20 }}
              >
                <span
                  style={{
                    fontSize: 'clamp(48px, 8vw, 96px)',
                    fontWeight: 700,
                    color: '#ef4444',
                    opacity: stampOpacity,
                    transform: 'rotate(-5deg)',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    userSelect: 'none',
                    transition: 'opacity 0.8s ease',
                    animation: phase === 'stamp' ? 'cls-stamp-slam 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  CLASSIFIED
                </span>
              </div>
            )}

            {/* --- "DECLASSIFIED" stamp when all revealed --- */}
            {allRevealedStamp && !reducedMotion && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ zIndex: 21 }}
              >
                <span
                  style={{
                    fontSize: 'clamp(40px, 7vw, 80px)',
                    fontWeight: 700,
                    color: '#22c55e',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    userSelect: 'none',
                    animation: 'cls-decl-stamp-slam 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
                    whiteSpace: 'nowrap',
                  }}
                >
                  DECLASSIFIED
                </span>
              </div>
            )}

            {/* --- DOCUMENT CONTENT (scrollable interior) --- */}
            <div
              className="relative flex-1 overflow-y-auto px-6 sm:px-10 py-6 sm:py-8"
              style={{ zIndex: 10 }}
            >
              {/* ---- HEADER ---- */}
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p
                    className="text-[11px] tracking-[0.25em] uppercase text-[#00e5ff]/50 mb-0.5"
                  >
                    Orbital Operations Division
                  </p>
                  <div className="flex flex-wrap gap-x-6 text-[11px] tracking-[0.12em] uppercase text-white/30">
                    <span>DOCUMENT: OOD-2026-SKYLY</span>
                    <span>
                      CLEARANCE:{' '}
                      <span
                        className="inline-block px-1 rounded-sm"
                        style={{ background: 'rgba(0,229,255,0.18)', color: 'transparent' }}
                      >
                        TOP SECRET
                      </span>
                    </span>
                  </div>
                </div>
                {/* counter */}
                <div className="text-[10px] tracking-[0.15em] uppercase text-white/40 whitespace-nowrap text-right">
                  <span className="text-[#00e5ff]">{revealedCount}</span>/{totalCount} SECTIONS
                  <br />
                  DECLASSIFIED
                </div>
              </div>

              {/* ---- DIVIDER ---- */}
              <div
                className="my-4"
                style={{ borderTop: '1px solid rgba(0,229,255,0.10)' }}
              />

              {/* ---- MISSION BRIEF ---- */}
              <div className="mb-6">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#00e5ff]/40 mb-2">
                  Mission Brief
                </p>
                <p
                  className={`text-[13px] leading-relaxed text-white/80 ${
                    glitchId === 'mission' ? 'cls-glitch' : ''
                  }`}
                >
                  <RedactedBlock
                    section={SECTIONS[0]}
                    isRevealed={revealed.has('mission')}
                    onReveal={() => handleReveal('mission')}
                    reducedMotion={reducedMotion}
                  />
                </p>
              </div>

              {/* ---- CAPABILITIES ---- */}
              <div className="mb-6">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#00e5ff]/40 mb-3">
                  Capabilities
                </p>
                <div className="flex flex-col gap-2.5">
                  {SECTIONS.slice(1, 5).map((sec) => (
                    <p
                      key={sec.id}
                      className={`text-[13px] leading-relaxed text-white/80 ${
                        glitchId === sec.id ? 'cls-glitch' : ''
                      }`}
                    >
                      <RedactedBlock
                        section={sec}
                        isRevealed={revealed.has(sec.id)}
                        onReveal={() => handleReveal(sec.id)}
                        reducedMotion={reducedMotion}
                      />
                    </p>
                  ))}
                </div>
              </div>

              {/* ---- OPERATIONAL STATUS ---- */}
              <div className="mb-8">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#00e5ff]/40 mb-2">
                  Operational Status
                </p>
                <p
                  className={`text-[13px] leading-relaxed text-white/80 ${
                    glitchId === 'status' ? 'cls-glitch' : ''
                  }`}
                >
                  <RedactedBlock
                    section={SECTIONS[5]}
                    isRevealed={revealed.has('status')}
                    onReveal={() => handleReveal('status')}
                    reducedMotion={reducedMotion}
                  />
                </p>
              </div>

              {/* ---- AUTHORIZATION / CTA ---- */}
              <div className="mb-4">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#00e5ff]/40 mb-3">
                  Authorization
                </p>
                <div
                  className="inline-block border border-[#00e5ff]/30 rounded px-1"
                >
                  <button
                    onClick={() => navigate('/login')}
                    className="
                      relative text-[13px] tracking-[0.15em] uppercase font-medium
                      px-8 py-3 text-[#00e5ff] bg-transparent
                      transition-all duration-300
                      hover:bg-[#00e5ff]/10 hover:shadow-[0_0_20px_rgba(0,229,255,0.15)]
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00e5ff]/50
                      active:scale-[0.98]
                    "
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    [ REQUEST ACCESS ]
                  </button>
                </div>
              </div>

              {/* ---- FOOTER MARKS ---- */}
              <div
                className="mt-auto pt-4 flex items-end justify-between text-[10px] tracking-[0.12em] uppercase text-white/20"
                style={{ borderTop: '1px solid rgba(0,229,255,0.06)' }}
              >
                <span>OOD // EYES ONLY</span>
                <span>PAGE 1 OF 1</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- DARK OVERLAY for entrance --- */}
        {!reducedMotion && phase === 'dark' && (
          <div
            className="absolute inset-0 bg-[hsl(224,56%,7%)]"
            style={{ zIndex: 50 }}
          />
        )}
      </div>
    </>
  );
}
