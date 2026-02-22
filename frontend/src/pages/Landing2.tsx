import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Cpu, Satellite, Globe } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';

/* ------------------------------------------------------------------ */
/*  Variant 2 — "CURSOR SPOTLIGHT"                                    */
/*  The page is nearly black. Cursor = glowing flashlight revealing    */
/*  content in the dark. Move around to discover features.             */
/* ------------------------------------------------------------------ */

const HOTSPOTS = [
  { x: 82, y: 14, icon: Cpu, label: 'AI-POWERED SCORING' },
  { x: 86, y: 48, icon: Satellite, label: 'LIVE ORBITAL DATA' },
  { x: 78, y: 78, icon: Globe, label: 'MULTI-PLANET PLANNING' },
] as const;

const STYLE_ID = 'spotlight-keyframes';

export default function Landing() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const heroMaskRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0.5, y: 0.5 }); // normalized 0-1

  const [phase, setPhase] = useState<'dark' | 'hint' | 'active' | 'ready'>('dark');
  const [hasMoved, setHasMoved] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Inject keyframe styles
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes spot-pulse-dot {
        0%, 100% { opacity: 0.15; transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(1.3); }
      }
      @keyframes spot-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes spot-fade-out {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
      @keyframes spot-hint-pulse {
        0%, 100% { opacity: 0.25; }
        50%      { opacity: 0.45; }
      }
      @keyframes spot-grain {
        0%   { transform: translate(0, 0); }
        10%  { transform: translate(-2%, -3%); }
        20%  { transform: translate(3%, 1%); }
        30%  { transform: translate(-1%, 3%); }
        40%  { transform: translate(2%, -2%); }
        50%  { transform: translate(-3%, 1%); }
        60%  { transform: translate(1%, -1%); }
        70%  { transform: translate(-2%, 3%); }
        80%  { transform: translate(3%, -3%); }
        90%  { transform: translate(-1%, 2%); }
        100% { transform: translate(2%, -1%); }
      }
      @media (prefers-reduced-motion: reduce) {
        .spot-no-motion { display: none !important; }
        .spot-show-static { opacity: 0.30 !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(STYLE_ID)?.remove(); };
  }, []);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Entrance sequence
  useEffect(() => {
    if (reducedMotion) {
      setPhase('ready');
      return;
    }
    const t1 = setTimeout(() => setPhase('hint'), 500);
    const t2 = setTimeout(() => setPhase('active'), 1500);
    const t3 = setTimeout(() => setPhase('ready'), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [reducedMotion]);

  // Mouse / touch tracking — direct DOM updates for performance
  const updateMask = useCallback(() => {
    const { x, y } = mousePos.current;
    const px = `${x * 100}%`;
    const py = `${y * 100}%`;

    if (heroMaskRef.current) {
      const mask = `radial-gradient(circle 200px at ${px} ${py}, black 40%, transparent 100%)`;
      heroMaskRef.current.style.maskImage = mask;
      heroMaskRef.current.style.webkitMaskImage = mask;
    }
    if (glowRef.current) {
      glowRef.current.style.background =
        `radial-gradient(circle 350px at ${px} ${py}, rgba(0,229,255,0.05) 0%, transparent 100%)`;
    }
    if (cursorRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        cursorRef.current.style.left = `${x * rect.width}px`;
        cursorRef.current.style.top = `${y * rect.height}px`;
      }
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mousePos.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    updateMask();
    if (!hasMoved) setHasMoved(true);
  }, [hasMoved, updateMask]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mousePos.current = {
      x: (touch.clientX - rect.left) / rect.width,
      y: (touch.clientY - rect.top) / rect.height,
    };
    updateMask();
    if (!hasMoved) setHasMoved(true);
  }, [hasMoved, updateMask]);

  // Initialize mask at center
  useEffect(() => {
    if (phase === 'active' || phase === 'ready') {
      updateMask();
    }
  }, [phase, updateMask]);

  const spotlightActive = phase === 'active' || phase === 'ready';

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{
        background: '#000',
        cursor: reducedMotion ? 'default' : 'none',
      }}
    >
      {/* ============================================================ */}
      {/*  LAYER 0: Hero image (always present, hidden by dark)        */}
      {/* ============================================================ */}
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: reducedMotion ? 0.3 : 0 }}
        draggable={false}
      />

      {/* ============================================================ */}
      {/*  LAYER 1: Spotlight-masked hero                              */}
      {/* ============================================================ */}
      {!reducedMotion && (
        <div
          ref={heroMaskRef}
          className="absolute inset-0 spot-no-motion"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: spotlightActive ? 1 : 0,
            transition: 'opacity 0.5s ease',
            maskImage: 'radial-gradient(circle 200px at 50% 50%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(circle 200px at 50% 50%, black 40%, transparent 100%)',
          }}
        />
      )}

      {/* ============================================================ */}
      {/*  LAYER 1b: Cyan glow at spotlight edge                       */}
      {/* ============================================================ */}
      {!reducedMotion && (
        <div
          ref={glowRef}
          className="absolute inset-0 pointer-events-none spot-no-motion"
          style={{
            opacity: spotlightActive ? 1 : 0,
            transition: 'opacity 0.5s ease',
          }}
        />
      )}

      {/* ============================================================ */}
      {/*  LAYER 2: Film grain                                         */}
      {/* ============================================================ */}
      {!reducedMotion && (
        <div
          className="absolute inset-0 pointer-events-none spot-no-motion"
          style={{ zIndex: 5 }}
        >
          <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.03 }}>
            <filter id="spot-grain-filter">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            </filter>
            <rect
              width="100%"
              height="100%"
              filter="url(#spot-grain-filter)"
              style={{ animation: 'spot-grain 0.5s steps(5) infinite' }}
            />
          </svg>
        </div>
      )}

      {/* ============================================================ */}
      {/*  LAYER 3: Content — revealed by spotlight                    */}
      {/* ============================================================ */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>

        {/* Logo — always faintly visible */}
        <div
          className="absolute top-8 left-8"
          style={{ opacity: reducedMotion ? 0.8 : 0.25 }}
        >
          <img
            src={skylyLogo}
            alt="Skyly"
            className="w-14 h-14 rounded-xl"
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.15))' }}
          />
        </div>

        {/* Center tagline */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <h1
            className="text-white text-center font-semibold leading-tight max-w-[800px] spot-show-static"
            style={{
              fontSize: 'clamp(1.5rem, 4vw, 3.5rem)',
              textShadow: '0 0 30px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)',
              opacity: reducedMotion ? 0.3 : 1,
            }}
          >
            PLAN YOUR NEXT DATA CENTER
            <br />
            <span className="text-[#00e5ff]">&mdash; ANYWHERE.</span>
          </h1>

          {/* Stats line */}
          <p
            className="mt-4 spot-show-static"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.5)',
              opacity: reducedMotion ? 0.3 : 1,
            }}
          >
            7 REGIONS &middot; 10+ SATELLITES &middot; AI-POWERED
          </p>
        </div>

        {/* Hotspot zones */}
        {HOTSPOTS.map((spot) => {
          const Icon = spot.icon;
          return (
            <div
              key={spot.label}
              className="absolute flex items-center gap-2 spot-show-static"
              style={{
                left: `${spot.x}%`,
                top: `${spot.y}%`,
                transform: 'translate(-50%, -50%)',
                opacity: reducedMotion ? 0.3 : 1,
              }}
            >
              {/* Pulsing lure dot — visible even in the dark */}
              {!reducedMotion && (
                <div
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00e5ff] spot-no-motion"
                  style={{ animation: 'spot-pulse-dot 3s ease-in-out infinite' }}
                />
              )}
              <Icon className="w-3.5 h-3.5 text-[#00e5ff] opacity-70" />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.85)',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 15px rgba(0,0,0,0.9)',
                }}
              >
                {spot.label}
              </span>
            </div>
          );
        })}

        {/* CTA — always partially visible */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-auto"
          style={{ bottom: '8%' }}
        >
          <button
            onClick={() => navigate('/login')}
            className="
              flex items-center gap-2.5 px-8 py-3.5
              border border-[#00e5ff]/60 text-[#00e5ff] rounded-lg
              transition-all duration-300
              hover:bg-[#00e5ff]/10 hover:border-[#00e5ff]
              hover:shadow-[0_0_30px_rgba(0,229,255,0.3)]
              focus-visible:outline-2 focus-visible:outline-[#00e5ff]
              active:scale-95
            "
            style={{
              background: 'rgba(0,0,0,0.5)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              letterSpacing: '0.15em',
              opacity: reducedMotion ? 0.8 : 0.4,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { if (!reducedMotion) e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { if (!reducedMotion) e.currentTarget.style.opacity = '0.4'; }}
          >
            <Rocket className="w-4 h-4" />
            LAUNCH SKYLY
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  LAYER 4: "EXPLORE" entrance hint                            */}
      {/* ============================================================ */}
      {!reducedMotion && (phase === 'hint') && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none spot-no-motion"
          style={{ zIndex: 20 }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.3em',
              color: '#00e5ff',
              textTransform: 'uppercase',
              animation: 'spot-hint-pulse 1.5s ease-in-out infinite',
            }}
          >
            EXPLORE
          </span>
        </div>
      )}

      {/* ============================================================ */}
      {/*  LAYER 5: "MOVE TO DISCOVER" hint                            */}
      {/* ============================================================ */}
      {!reducedMotion && spotlightActive && !hasMoved && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none spot-no-motion"
          style={{
            bottom: '3%',
            zIndex: 20,
            animation: 'spot-fade-in 0.5s ease forwards',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.25em',
              color: 'rgba(0,229,255,0.2)',
              textTransform: 'uppercase',
            }}
          >
            move to discover
          </span>
        </div>
      )}

      {/* ============================================================ */}
      {/*  LAYER 6: Custom cursor                                      */}
      {/* ============================================================ */}
      {!reducedMotion && spotlightActive && (
        <div
          ref={cursorRef}
          className="absolute pointer-events-none spot-no-motion"
          style={{
            zIndex: 50,
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '1px solid rgba(0,229,255,0.45)',
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 8px rgba(0,229,255,0.15)',
            transition: 'left 30ms ease-out, top 30ms ease-out',
          }}
        />
      )}
    </div>
  );
}
