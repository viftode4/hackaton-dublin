import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, Globe, Satellite } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';

/* =============================================
   VARIANT 4 — "LAUNCH SEQUENCE"
   Theatrical staggered curtain reveal landing
   ============================================= */

// Timeline phases for the entrance sequence
type Phase =
  | 'panels-idle'       // 0ms       — panels visible, static
  | 'panels-rumble'     // 200ms     — panels vibrate
  | 'panels-retract'    // 500ms     — panels begin retracting
  | 'countdown'         // 500ms     — countdown overlays
  | 'launch-flash'      // 1900ms    — "LAUNCH" flash
  | 'content-enter'     // 2200ms    — content springs in
  | 'complete';         // 2800ms    — entrance done

const EASING_RETRACT = 'cubic-bezier(0.76, 0, 0.24, 1)';

// Detect prefers-reduced-motion
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export default function Landing() {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();

  // Phase state machine
  const [phase, setPhase] = useState<Phase>(reducedMotion ? 'complete' : 'panels-idle');
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [typedWords, setTypedWords] = useState<number>(0);

  // Tagline words
  const taglineWords = useMemo(
    () => ['PLAN', 'YOUR', 'NEXT', 'DATA', 'CENTER', '\u2014', 'ANYWHERE', 'IN', 'THE', 'SOLAR', 'SYSTEM.'],
    []
  );

  // If reducedMotion changes, jump to complete
  useEffect(() => {
    if (reducedMotion) {
      setPhase('complete');
      setTypedWords(taglineWords.length);
    }
  }, [reducedMotion, taglineWords.length]);

  // Entrance timeline orchestrator
  const runEntrance = useCallback(() => {
    if (reducedMotion) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (fn: () => void, ms: number) => {
      timers.push(setTimeout(fn, ms));
    };

    // 0ms: panels idle (already set)
    // 200ms: rumble
    t(() => setPhase('panels-rumble'), 200);

    // 500ms: begin retract + start countdown overlay
    t(() => {
      setPhase('panels-retract');
    }, 500);

    // Countdown: T-5 through T-1, each 180ms visible, staggered from 500ms
    const countdownNums = ['T-5', 'T-4', 'T-3', 'T-2', 'T-1'];
    countdownNums.forEach((val, i) => {
      const showAt = 500 + i * 250;
      t(() => setCountdownValue(val), showAt);
      t(() => setCountdownValue(null), showAt + 180);
    });

    // 1900ms: "LAUNCH" flash
    t(() => {
      setPhase('launch-flash');
      setCountdownValue('LAUNCH');
    }, 1900);
    t(() => setCountdownValue(null), 2200);

    // 2200ms: content enters
    t(() => setPhase('content-enter'), 2200);

    // Typewriter effect for tagline: 60ms per word starting at 2300ms
    taglineWords.forEach((_, i) => {
      t(() => setTypedWords(i + 1), 2300 + i * 60);
    });

    // 2800ms: complete
    t(() => setPhase('complete'), 2800);

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion, taglineWords]);

  useEffect(() => {
    const cleanup = runEntrance();
    return cleanup;
  }, [runEntrance]);

  // Derived booleans for rendering
  const showPanels = phase === 'panels-idle' || phase === 'panels-rumble' || phase === 'panels-retract' || phase === 'countdown';
  const panelsRetracting = phase === 'panels-retract' || phase === 'countdown' || phase === 'launch-flash' || phase === 'content-enter' || phase === 'complete';
  const panelsRumbling = phase === 'panels-rumble';
  const showCountdown = countdownValue !== null;
  const isLaunchFlash = phase === 'launch-flash' && countdownValue === 'LAUNCH';
  const contentVisible = phase === 'content-enter' || phase === 'complete';
  const entranceDone = phase === 'complete';
  const isEntrance = !entranceDone;

  // Panel retract delays: outermost (0,4) first, then (1,3), then (2)
  const panelRetractDelays = [0, 200, 400, 200, 0]; // ms offset per panel
  const panelDirections: ('left' | 'right')[] = ['left', 'left', 'left', 'right', 'right'];

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden ${isEntrance ? 'launch-cursor-crosshair' : ''} ${reducedMotion ? 'launch-skip-entrance' : ''}`}
      style={{ background: 'hsl(224 56% 7%)' }}
    >
      {/* ---- BACKGROUND: Hero image with dark overlay ---- */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: contentVisible || reducedMotion ? 1 : 0, transition: 'opacity 0.6s ease' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/60" />
      </div>

      {/* ---- FILM GRAIN ---- */}
      <div className="launch-grain absolute inset-0 pointer-events-none" style={{ zIndex: 51 }} />

      {/* ---- CORNER BRACKETS / RETICLE MARKS ---- */}
      <div
        className="absolute inset-0 z-40 pointer-events-none"
        style={{
          opacity: contentVisible ? 0.3 : 0,
          animation: contentVisible ? 'bracket-fade-in 0.6s ease forwards' : 'none',
        }}
      >
        {/* Top-left */}
        <div className="absolute top-6 left-6">
          <div className="w-8 h-[2px] bg-[#00e5ff]" />
          <div className="w-[2px] h-8 bg-[#00e5ff]" />
        </div>
        {/* Top-right */}
        <div className="absolute top-6 right-6">
          <div className="w-8 h-[2px] bg-[#00e5ff] ml-auto" />
          <div className="w-[2px] h-8 bg-[#00e5ff] ml-auto" />
        </div>
        {/* Bottom-left */}
        <div className="absolute bottom-6 left-6">
          <div className="w-[2px] h-8 bg-[#00e5ff]" />
          <div className="w-8 h-[2px] bg-[#00e5ff]" />
        </div>
        {/* Bottom-right */}
        <div className="absolute bottom-6 right-6">
          <div className="w-[2px] h-8 bg-[#00e5ff] ml-auto" />
          <div className="w-8 h-[2px] bg-[#00e5ff] ml-auto" />
        </div>
      </div>

      {/* ---- CURTAIN PANELS ---- */}
      {(showPanels || panelsRetracting) && !entranceDone && (
        <div className="absolute inset-0 z-30 flex" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => {
            const retractDir = panelDirections[i];
            const retractDelay = panelRetractDelays[i];
            const isRetracting = panelsRetracting;

            return (
              <div
                key={i}
                className="flex-1 h-full launch-panel-scanline"
                style={{
                  backgroundColor: 'hsl(224 56% 7%)',
                  // Rumble animation
                  ...(panelsRumbling && !isRetracting
                    ? { animation: 'launch-rumble 60ms linear infinite' }
                    : {}),
                  // Retract animation
                  ...(isRetracting
                    ? {
                        animation: `panel-retract-${retractDir} 800ms ${EASING_RETRACT} ${retractDelay}ms forwards`,
                      }
                    : {}),
                }}
              />
            );
          })}
        </div>
      )}

      {/* ---- COUNTDOWN OVERLAY ---- */}
      {showCountdown && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 35 }}>
          <span
            key={countdownValue}
            className="select-none"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: isLaunchFlash ? '14vw' : '10vw',
              fontWeight: 500,
              color: '#00e5ff',
              opacity: 0,
              animation: isLaunchFlash
                ? 'launch-flash 300ms ease-out forwards'
                : 'countdown-flash 180ms ease-out forwards',
              textShadow: '0 0 40px hsl(187 100% 50% / 0.6), 0 0 80px hsl(187 100% 50% / 0.3)',
            }}
          >
            {countdownValue}
          </span>
        </div>
      )}

      {/* ---- MAIN CONTENT ---- */}
      <div
        className="relative z-20 h-full flex flex-col"
        style={{
          opacity: contentVisible || reducedMotion ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {/* TOP BAR */}
        <header className="flex items-center justify-between px-8 pt-6 md:px-12 md:pt-8">
          {/* Logo */}
          <div
            style={{
              opacity: 0,
              ...(contentVisible
                ? { animation: 'logo-enter 0.5s ease-out forwards' }
                : {}),
              ...(reducedMotion ? { opacity: 1, animation: 'none' } : {}),
            }}
          >
            <img
              src={skylyLogo}
              alt="Skyly"
              className="w-14 h-14 md:w-16 md:h-16 rounded-xl drop-shadow-2xl"
            />
          </div>

          {/* Mission Status */}
          <div
            className="flex items-center gap-2"
            style={{
              opacity: 0,
              ...(contentVisible
                ? { animation: 'logo-enter 0.5s ease-out 0.1s forwards' }
                : {}),
              ...(reducedMotion ? { opacity: 1, animation: 'none' } : {}),
            }}
          >
            <div
              className="w-2 h-2 rounded-full bg-[#00e5ff]"
              style={{
                animation: entranceDone ? 'status-pulse 2s ease-in-out infinite' : 'none',
              }}
            />
            <span
              className="text-[11px] tracking-[0.2em] text-white/60 uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Mission Status: Active
            </span>
          </div>
        </header>

        {/* CENTER BLOCK */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          {/* Tagline — typewriter */}
          <h1
            className="max-w-[900px] leading-[1.1] font-bold text-white mb-6"
            style={{ fontSize: 'clamp(1.8rem, 4.5vw, 4.5rem)' }}
          >
            {taglineWords.map((word, i) => (
              <span
                key={i}
                className="inline-block mr-[0.3em]"
                style={{
                  opacity: i < typedWords ? 1 : 0,
                  transition: reducedMotion ? 'none' : 'opacity 0.08s ease',
                }}
              >
                {word}
              </span>
            ))}
          </h1>

          {/* Cyan horizontal rule */}
          <div
            className="h-[2px] bg-[#00e5ff] mb-8"
            style={{
              width: reducedMotion ? '200px' : '0px',
              ...(contentVisible && !reducedMotion
                ? { animation: 'rule-expand 0.6s ease-out 0.3s both' }
                : {}),
            }}
          />

          {/* Feature chips */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {[
              { icon: Cpu, label: 'AI SCORING' },
              { icon: Satellite, label: 'ORBITAL DATA' },
              { icon: Globe, label: 'MULTI-PLANET' },
            ].map((chip, i) => {
              const Icon = chip.icon;
              return (
                <div
                  key={chip.label}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#00e5ff]/40 bg-[#00e5ff]/5 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:brightness-125 hover:border-[#00e5ff]/70 cursor-default"
                  style={{
                    opacity: 0,
                    ...(contentVisible && !reducedMotion
                      ? {
                          animation: `chip-enter 0.4s ease-out ${0.35 + i * 0.1}s forwards`,
                        }
                      : {}),
                    ...(reducedMotion ? { opacity: 1, animation: 'none' } : {}),
                  }}
                >
                  <Icon className="w-4 h-4 text-[#00e5ff]" />
                  <span
                    className="text-xs tracking-[0.15em] text-white/80 font-medium"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* CTA BUTTON */}
          <button
            onClick={() => navigate('/login')}
            className="relative px-10 py-4 text-base font-bold tracking-[0.15em] uppercase border-2 border-[#00e5ff] text-[#00e5ff] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]"
            style={{
              background: 'hsl(224 56% 7% / 0.8)',
              fontFamily: "'Inter', sans-serif",
              opacity: 0,
              ...(contentVisible && !reducedMotion && !entranceDone
                ? { animation: 'cta-bounce-in 0.5s ease-out 0.55s forwards' }
                : {}),
              ...(entranceDone && !reducedMotion
                ? {
                    opacity: 1,
                    animation: 'cta-breathe 3s ease-in-out infinite',
                  }
                : {}),
              ...(reducedMotion
                ? {
                    opacity: 1,
                    animation: 'cta-breathe 3s ease-in-out infinite',
                  }
                : {}),
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.boxShadow = '0 0 30px hsl(187 100% 50% / 0.5), 0 0 60px hsl(187 100% 50% / 0.3)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.boxShadow = '';
            }}
          >
            LAUNCH SKYLY &#9656;
          </button>
        </main>

        {/* BOTTOM BAR */}
        <footer className="flex justify-center pb-6">
          <span
            className="text-[10px] tracking-[0.2em] uppercase"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: 'hsl(210 20% 90% / 0.25)',
              opacity: 0,
              ...(contentVisible && !reducedMotion
                ? { animation: 'chip-enter 0.4s ease-out 0.65s forwards' }
                : {}),
              ...(reducedMotion ? { opacity: 1, animation: 'none' } : {}),
            }}
          >
            Skyly Orbital Operations &bull; Established 2026
          </span>
        </footer>
      </div>
    </div>
  );
}
