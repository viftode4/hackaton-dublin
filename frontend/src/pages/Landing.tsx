import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Rocket, Cpu, Satellite, Globe } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Hotspot {
  x: string;
  y: string;
  label: string;
  icon: React.ReactNode;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const HOTSPOTS: Hotspot[] = [
  { x: '85%', y: '15%', label: 'AI-POWERED SCORING', icon: <Cpu className="w-3 h-3" /> },
  { x: '88%', y: '50%', label: 'LIVE ORBITAL DATA', icon: <Satellite className="w-3 h-3" /> },
  { x: '80%', y: '80%', label: 'MULTI-PLANET PLANNING', icon: <Globe className="w-3 h-3" /> },
  { x: '15%', y: '82%', label: '7 REGIONS \u00B7 10+ SATELLITES', icon: null },
];

const SPOTLIGHT_KEYFRAMES = `
@keyframes spotlight-pulse-dot {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.6; }
}
@keyframes spotlight-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes spotlight-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes spotlight-grain {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-5%, -10%); }
  20% { transform: translate(-15%, 5%); }
  30% { transform: translate(7%, -25%); }
  40% { transform: translate(-5%, 25%); }
  50% { transform: translate(-15%, 10%); }
  60% { transform: translate(15%, 0%); }
  70% { transform: translate(0%, 15%); }
  80% { transform: translate(3%, 35%); }
  90% { transform: translate(-10%, 10%); }
}

@media (prefers-reduced-motion: reduce) {
  .spotlight-container .spotlight-hero-layer {
    mask-image: none !important;
    -webkit-mask-image: none !important;
    opacity: 0.3 !important;
  }
  .spotlight-container .spotlight-content-layer {
    opacity: 0.3 !important;
  }
  .spotlight-container .spotlight-cursor-ring {
    display: none !important;
  }
}
`;

// ── Component ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate();

  // Entrance sequence state
  const [phase, setPhase] = useState<'black' | 'explore' | 'fadeout' | 'active'>('black');
  const [hasMoved, setHasMoved] = useState(false);

  // Refs for performant cursor tracking (no re-renders)
  const containerRef = useRef<HTMLDivElement>(null);
  const heroLayerRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);
  const cyanGlowRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Track whether spotlight is activated
  const spotlightActiveRef = useRef(false);

  // ── Inject keyframe styles ────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = SPOTLIGHT_KEYFRAMES;
    document.head.appendChild(style);
    styleRef.current = style;
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
      }
    };
  }, []);

  // ── Entrance sequence ─────────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('explore'), 500);
    const t2 = setTimeout(() => setPhase('fadeout'), 1200);
    const t3 = setTimeout(() => {
      setPhase('active');
      spotlightActiveRef.current = true;

      // Initialize spotlight at center
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        updateSpotlight(cx, cy);
      }
    }, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update spotlight position (no React state, pure DOM) ──────────────────
  const updateSpotlight = useCallback((x: number, y: number) => {
    const heroLayer = heroLayerRef.current;
    const cursorRing = cursorRingRef.current;
    const cyanGlow = cyanGlowRef.current;

    if (heroLayer) {
      heroLayer.style.maskImage =
        `radial-gradient(circle 200px at ${x}px ${y}px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)`;
      heroLayer.style.webkitMaskImage =
        `radial-gradient(circle 200px at ${x}px ${y}px, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)`;
    }

    if (cyanGlow) {
      cyanGlow.style.background =
        `radial-gradient(circle 350px at ${x}px ${y}px, transparent 55%, rgba(0,229,255,0.06) 70%, transparent 100%)`;
    }

    if (cursorRing) {
      cursorRing.style.left = `${x}px`;
      cursorRing.style.top = `${y}px`;
    }

    // Update CTA opacity based on proximity
    const cta = ctaRef.current;
    if (cta) {
      const ctaRect = cta.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const ctaCx = ctaRect.left - containerRect.left + ctaRect.width / 2;
        const ctaCy = ctaRect.top - containerRect.top + ctaRect.height / 2;
        const dist = Math.sqrt((x - ctaCx) ** 2 + (y - ctaCy) ** 2);
        const opacity = dist < 300 ? 0.35 + (1 - dist / 300) * 0.65 : 0.35;
        cta.style.opacity = String(opacity);
      }
    }
  }, []);

  // ── Mouse/Touch handlers ──────────────────────────────────────────────────
  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!spotlightActiveRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    updateSpotlight(x, y);

    if (!hasMoved) {
      setHasMoved(true);
    }
  }, [hasMoved, updateSpotlight]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    handlePointerMove(e.clientX, e.clientY);
  }, [handlePointerMove]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) {
      handlePointerMove(touch.clientX, touch.clientY);
    }
  }, [handlePointerMove]);

  // ── Render ────────────────────────────────────────────────────────────────
  const spotlightReady = phase === 'active';

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
      className="spotlight-container relative w-screen h-screen overflow-hidden select-none"
      style={{
        background: 'hsl(224, 56%, 7%)',
        cursor: 'none',
      }}
    >
      {/* ── Layer 0: Dark background ──────────────────────────────────── */}
      <div className="absolute inset-0 bg-black" />

      {/* ── Layer 1: Hero image, masked by spotlight ──────────────────── */}
      <div
        ref={heroLayerRef}
        className="spotlight-hero-layer absolute inset-0"
        style={{
          backgroundImage: `url(${heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          maskImage: spotlightReady
            ? 'radial-gradient(circle 200px at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)'
            : 'radial-gradient(circle 0px at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: spotlightReady
            ? 'radial-gradient(circle 200px at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 100%)'
            : 'radial-gradient(circle 0px at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
          transition: 'mask-image 0.04s linear, -webkit-mask-image 0.04s linear',
          opacity: spotlightReady ? 1 : 0,
        }}
      />

      {/* ── Layer 1b: Cyan glow at spotlight edge ─────────────────────── */}
      <div
        ref={cyanGlowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: spotlightReady
            ? 'radial-gradient(circle 350px at 50% 50%, transparent 55%, rgba(0,229,255,0.06) 70%, transparent 100%)'
            : 'none',
          transition: 'background 0.04s linear',
        }}
      />

      {/* ── Layer 2: Film grain overlay ───────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
          animation: 'spotlight-grain 0.8s steps(6) infinite',
        }}
      />

      {/* ── Layer 3: Content (revealed by spotlight) ──────────────────── */}
      <div className="spotlight-content-layer absolute inset-0 pointer-events-none">
        {/* Logo — top-left, always slightly visible */}
        <img
          src={skylyLogo}
          alt="Skyly"
          className="absolute top-8 left-8 rounded-xl drop-shadow-2xl"
          style={{
            width: 56,
            height: 56,
            opacity: 0.25,
            filter: 'brightness(1.2)',
          }}
        />

        {/* Main tagline — center */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            transform: 'translate(-50%, -50%)',
          }}
        >
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 'clamp(1.5rem, 4vw, 3.5rem)',
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.15,
              textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            PLAN YOUR NEXT DATA CENTER
            <br />
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>— ANYWHERE.</span>
          </h1>
        </div>

        {/* Hotspot zones */}
        {HOTSPOTS.map((spot) => (
          <div
            key={spot.label}
            className="absolute flex items-center gap-2"
            style={{
              left: spot.x,
              top: spot.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Pulsing dot — always visible to lure user */}
            <span
              className="block rounded-full flex-shrink-0"
              style={{
                width: 6,
                height: 6,
                backgroundColor: '#00e5ff',
                animation: 'spotlight-pulse-dot 2s ease-in-out infinite',
              }}
            />
            <span
              className="flex items-center gap-1.5"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.9)',
                whiteSpace: 'nowrap',
              }}
            >
              {spot.icon}
              {spot.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Layer 4: CTA button (always partially visible) ────────────── */}
      <div
        className="absolute left-1/2 pointer-events-auto"
        style={{
          bottom: '10%',
          transform: 'translateX(-50%)',
          zIndex: 20,
        }}
      >
        <button
          ref={ctaRef}
          onClick={() => navigate('/login')}
          className="group inline-flex items-center gap-2 rounded-md px-8 py-3 font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#00e5ff',
            border: '1px solid rgba(0,229,255,0.5)',
            backgroundColor: 'transparent',
            opacity: 0.35,
            cursor: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#00e5ff';
            e.currentTarget.style.color = 'hsl(224, 56%, 7%)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#00e5ff';
          }}
        >
          <Rocket className="w-4 h-4" />
          LAUNCH SKYLY
        </button>
      </div>

      {/* ── Layer 5: Entrance sequence overlays ───────────────────────── */}
      {/* Black overlay that covers everything initially */}
      {(phase === 'black' || phase === 'explore' || phase === 'fadeout') && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'black',
            zIndex: 30,
            opacity: phase === 'active' ? 0 : 1,
            transition: 'opacity 0.3s ease-out',
          }}
        >
          {/* "EXPLORE" text */}
          {(phase === 'explore' || phase === 'fadeout') && (
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                transform: 'translate(-50%, -50%)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'rgba(0, 229, 255, 0.3)',
                animation: phase === 'explore'
                  ? 'spotlight-fade-in 0.4s ease-out forwards'
                  : 'spotlight-fade-out 0.3s ease-out forwards',
              }}
            >
              EXPLORE
            </div>
          )}
        </div>
      )}

      {/* ── Layer 6: Hint text — "MOVE TO DISCOVER" ───────────────────── */}
      {spotlightReady && (
        <div
          className="absolute left-1/2 pointer-events-none"
          style={{
            bottom: '4%',
            transform: 'translateX(-50%)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(0, 229, 255, 0.2)',
            opacity: hasMoved ? 0 : 1,
            transition: 'opacity 0.8s ease-out',
            zIndex: 10,
          }}
        >
          MOVE TO DISCOVER
        </div>
      )}

      {/* ── Layer 7: Custom cursor ring ───────────────────────────────── */}
      <div
        ref={cursorRingRef}
        className="spotlight-cursor-ring absolute pointer-events-none"
        style={{
          width: 20,
          height: 20,
          border: '1px solid rgba(0, 229, 255, 0.5)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          opacity: spotlightReady ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
          left: '50%',
          top: '50%',
        }}
      />
    </div>
  );
}
