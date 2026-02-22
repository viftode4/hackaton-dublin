import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import earthPng from '@/assets/space/earth.png';
import satellitePng from '@/assets/space/satellite.png';
import marsPng from '@/assets/space/mars.png';
import moonPng from '@/assets/space/moon.png';

/* ------------------------------------------------------------------ */
/*  Variant 10 — "Mission Briefing Card"                               */
/*  Single viewport. 3D-tilting card centerpiece with mouse tracking.  */
/*  Parallax space objects behind on dark background. Pure RAF.        */
/* ------------------------------------------------------------------ */

/* ── Lerp helper ── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ── Noise SVG as data URI for card texture ── */
const NOISE_SVG = `data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E`;

/* ── Dot grid SVG for card background pattern ── */
const DOT_GRID_SVG = `data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.5' fill='white' fill-opacity='0.035'/%3E%3C/svg%3E`;

/* ── Stats data ── */
const STATS = [
  { value: '7', label: 'Regions' },
  { value: '10+', label: 'Satellites' },
  { value: '4', label: 'Bodies' },
  { value: 'AI', label: 'Scoring' },
];

export default function Landing10() {
  const navigate = useNavigate();

  /* Refs for RAF-driven transforms (zero re-renders) */
  const mouseTarget = useRef({ x: 0, y: 0 });
  const mouseCurrent = useRef({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLImageElement>(null);
  const marsRef = useRef<HTMLImageElement>(null);
  const moonRef = useRef<HTMLImageElement>(null);
  const satRef = useRef<HTMLImageElement>(null);
  const borderGlowRef = useRef<HTMLDivElement>(null);
  const rafId = useRef(0);

  /* Track mouse position normalised to -1..1 from center */
  const onMouseMove = useCallback((e: MouseEvent) => {
    mouseTarget.current = {
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);

    const tick = () => {
      const t = 0.08; // lerp factor — smoothness
      mouseCurrent.current.x = lerp(mouseCurrent.current.x, mouseTarget.current.x, t);
      mouseCurrent.current.y = lerp(mouseCurrent.current.y, mouseTarget.current.y, t);

      const mx = mouseCurrent.current.x;
      const my = mouseCurrent.current.y;

      /* ── Card 3D tilt ── */
      if (cardRef.current) {
        const rotY = mx * 12;   // ±12 deg
        const rotX = -my * 12;  // ±12 deg (inverted for natural feel)
        cardRef.current.style.transform =
          `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
      }

      /* ── Dynamic shadow ── */
      if (shadowRef.current) {
        const shX = -mx * 30;
        const shY = -my * 30;
        shadowRef.current.style.boxShadow =
          `${shX}px ${shY}px 80px 0px rgba(0,0,0,0.45), ${shX * 0.3}px ${shY * 0.3}px 30px 0px rgba(0,0,0,0.25)`;
      }

      /* ── Border glow effect ── */
      if (borderGlowRef.current) {
        // Light catches edge based on mouse
        const glowX = (mx + 1) * 50; // 0-100%
        const glowY = (my + 1) * 50;
        borderGlowRef.current.style.background =
          `radial-gradient(ellipse at ${glowX}% ${glowY}%, rgba(100,210,255,0.15) 0%, transparent 60%)`;
      }

      /* ── Parallax objects ── */
      const applyParallax = (el: HTMLElement | null, rate: number) => {
        if (!el) return;
        const px = mx * rate * 40;
        const py = my * rate * 40;
        el.style.transform = `translate(${px}px, ${py}px)`;
      };
      applyParallax(earthRef.current, 0.15);
      applyParallax(marsRef.current, 0.25);
      applyParallax(moonRef.current, 0.35);
      applyParallax(satRef.current, 0.4);

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId.current);
    };
  }, [onMouseMove]);

  return (
    <div style={styles.viewport}>
      {/* ── Global style injection (fonts + keyframes) ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(40px) rotateX(0) rotateY(0); }
          to   { opacity: 1; transform: translateY(0) rotateX(0) rotateY(0); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes trackingExpand {
          from { letter-spacing: 0.15em; opacity: 0; }
          to   { letter-spacing: 0.28em; opacity: 1; }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.06; }
          50%      { opacity: 0.1; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav style={styles.nav}>
        <div style={styles.navLeft}>
          <img src={skylyLogo} alt="Skyly" style={styles.logo} />
          <span style={styles.logoText}>SKYLY</span>
        </div>
        <button
          onClick={() => navigate('/login')}
          style={styles.signInBtn}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          Sign In
        </button>
      </nav>

      {/* ── Parallax space objects ── */}
      <img
        ref={earthRef}
        src={earthPng}
        alt=""
        style={{
          ...styles.spaceObj,
          width: 'clamp(280px, 30vw, 440px)',
          left: '-5%',
          top: '15%',
          opacity: 0.1,
          animation: 'floatIn 900ms ease-out 700ms both',
        }}
      />
      <img
        ref={marsRef}
        src={marsPng}
        alt=""
        style={{
          ...styles.spaceObj,
          width: 'clamp(140px, 14vw, 220px)',
          right: '4%',
          bottom: '12%',
          opacity: 0.09,
          animation: 'floatIn 900ms ease-out 900ms both',
        }}
      />
      <img
        ref={moonRef}
        src={moonPng}
        alt=""
        style={{
          ...styles.spaceObj,
          width: 'clamp(60px, 6vw, 100px)',
          right: '18%',
          top: '10%',
          opacity: 0.12,
          animation: 'floatIn 900ms ease-out 1100ms both',
        }}
      />
      <img
        ref={satRef}
        src={satellitePng}
        alt=""
        style={{
          ...styles.spaceObj,
          width: 'clamp(50px, 5vw, 80px)',
          left: '15%',
          top: '8%',
          opacity: 0.13,
          animation: 'floatIn 900ms ease-out 1300ms both',
        }}
      />

      {/* ── 3D Card Perspective Container ── */}
      <div style={styles.perspectiveContainer}>
        {/* Shadow layer (separate so it doesn't rotate with card) */}
        <div ref={shadowRef} style={styles.cardShadow} />

        {/* The tilting card */}
        <div
          ref={cardRef}
          style={styles.card}
        >
          {/* Border glow overlay */}
          <div ref={borderGlowRef} style={styles.borderGlow} />

          {/* Noise texture overlay */}
          <div style={styles.noiseOverlay} />

          {/* Dot grid pattern */}
          <div style={styles.dotGrid} />

          {/* Corner accents */}
          <div style={{ ...styles.cornerAccent, top: 12, left: 12 }} />
          <div style={{ ...styles.cornerAccent, top: 12, right: 12, transform: 'rotate(90deg)' }} />
          <div style={{ ...styles.cornerAccent, bottom: 12, left: 12, transform: 'rotate(-90deg)' }} />
          <div style={{ ...styles.cornerAccent, bottom: 12, right: 12, transform: 'rotate(180deg)' }} />

          {/* Watermark stamp */}
          <div style={styles.watermark}>SKYLY</div>

          {/* Top glow gradient */}
          <div style={styles.topGlow} />

          {/* ── Card content ── */}
          <div style={styles.cardContent}>
            {/* Mission briefing label */}
            <div style={styles.missionLabel}>MISSION BRIEFING</div>

            <div style={styles.thinRule} />

            <div style={styles.classificationLabel}>CLASSIFICATION: OPEN</div>

            {/* Main headline */}
            <h1 style={styles.headline}>
              Plan Your Next<br />Data Center
            </h1>

            <p style={styles.subheadline}>
              Anywhere in the Solar System.
            </p>

            <p style={styles.description}>
              AI-powered site scoring across orbital regions. Evaluate risk,
              latency, and resource availability in seconds.
            </p>

            <div style={styles.thinRule} />

            {/* Stats 2x2 grid */}
            <div style={styles.statsGrid}>
              {STATS.map((s) => (
                <div key={s.label} style={styles.statItem}>
                  <span style={styles.statValue}>{s.value}</span>
                  <span style={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <button
              onClick={() => navigate('/login')}
              style={styles.ctaBtn}
              onMouseEnter={e => {
                const btn = e.currentTarget;
                btn.style.background = 'hsl(190, 90%, 50%)';
                btn.style.transform = 'translateY(-1px)';
                btn.style.boxShadow = '0 6px 24px rgba(0,210,255,0.3)';
              }}
              onMouseLeave={e => {
                const btn = e.currentTarget;
                btn.style.background = 'hsl(190, 85%, 45%)';
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = '0 2px 12px rgba(0,210,255,0.15)';
              }}
            >
              <Rocket size={15} style={{ marginRight: 8 }} />
              Launch Mission
              <ArrowRight size={15} style={{ marginLeft: 8 }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <span style={styles.footerText}>
          &copy; 2026 Skyly &middot; Orbital Infrastructure
        </span>
      </footer>
    </div>
  );
}

/* ================================================================== */
/*  Styles                                                            */
/* ================================================================== */

const cyan = 'hsl(190, 85%, 55%)';
const darkBg = 'hsl(224, 56%, 7%)';
const cardBg = 'hsl(224, 56%, 10%)';

const styles: Record<string, React.CSSProperties> = {
  /* ── Viewport ── */
  viewport: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    overflow: 'hidden',
    background: darkBg,
    fontFamily: "'Inter', sans-serif",
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Nav ── */
  nav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 36px',
    zIndex: 20,
    animation: 'fadeInDown 500ms ease-out both',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logo: {
    width: 30,
    height: 30,
    objectFit: 'contain',
  },
  logoText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.8)',
  },
  signInBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 8,
    padding: '8px 20px',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  /* ── Space objects ── */
  spaceObj: {
    position: 'absolute',
    pointerEvents: 'none' as const,
    zIndex: 1,
    willChange: 'transform',
    userSelect: 'none' as const,
  },

  /* ── Perspective container ── */
  perspectiveContainer: {
    perspective: '1200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    position: 'relative',
  },

  /* ── Card shadow (doesn't tilt) ── */
  cardShadow: {
    position: 'absolute',
    width: 'clamp(340px, 32vw, 480px)',
    height: 'clamp(440px, 42vw, 580px)',
    borderRadius: 16,
    boxShadow: '0px 20px 80px 0px rgba(0,0,0,0.45)',
    zIndex: 0,
    pointerEvents: 'none' as const,
  },

  /* ── The card ── */
  card: {
    position: 'relative',
    width: 'clamp(340px, 32vw, 480px)',
    height: 'clamp(440px, 42vw, 580px)',
    background: cardBg,
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    transformStyle: 'preserve-3d',
    willChange: 'transform',
    transition: 'transform 0.05s linear',
    overflow: 'hidden',
    zIndex: 2,
    animation: 'cardEntrance 600ms ease-out 200ms both',
  },

  /* ── Border glow ── */
  borderGlow: {
    position: 'absolute',
    inset: -1,
    borderRadius: 17,
    pointerEvents: 'none' as const,
    zIndex: 0,
  },

  /* ── Noise texture ── */
  noiseOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url("${NOISE_SVG}")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '128px 128px',
    opacity: 0.6,
    borderRadius: 16,
    pointerEvents: 'none' as const,
    zIndex: 1,
  },

  /* ── Dot grid ── */
  dotGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url("${DOT_GRID_SVG}")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '20px 20px',
    borderRadius: 16,
    pointerEvents: 'none' as const,
    zIndex: 1,
  },

  /* ── Top inner glow ── */
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    background: 'linear-gradient(180deg, rgba(100,210,255,0.04) 0%, transparent 100%)',
    borderRadius: '16px 16px 0 0',
    pointerEvents: 'none' as const,
    zIndex: 1,
  },

  /* ── Corner accents ── */
  cornerAccent: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderTop: '1.5px solid rgba(255,255,255,0.12)',
    borderLeft: '1.5px solid rgba(255,255,255,0.12)',
    pointerEvents: 'none' as const,
    zIndex: 3,
  },

  /* ── Watermark ── */
  watermark: {
    position: 'absolute',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 'clamp(48px, 5vw, 72px)',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.02)',
    transform: 'rotate(-12deg)',
    top: '50%',
    left: '50%',
    marginTop: -36,
    marginLeft: -80,
    letterSpacing: '0.15em',
    pointerEvents: 'none' as const,
    zIndex: 1,
    userSelect: 'none' as const,
  },

  /* ── Card content ── */
  cardContent: {
    position: 'relative',
    zIndex: 4,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: 'clamp(24px, 3vw, 36px)',
    boxSizing: 'border-box',
  },

  /* ── Mission label ── */
  missionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 500,
    color: cyan,
    letterSpacing: '0.28em',
    animation: 'trackingExpand 800ms ease-out 400ms both',
  },

  /* ── Thin rule ── */
  thinRule: {
    width: '100%',
    height: 1,
    background: 'rgba(255,255,255,0.08)',
    margin: '14px 0',
  },

  /* ── Classification ── */
  classificationLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '0.18em',
    marginBottom: 4,
  },

  /* ── Headline ── */
  headline: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 'clamp(22px, 2.2vw, 30px)',
    fontWeight: 700,
    lineHeight: 1.2,
    color: '#fff',
    margin: '12px 0 4px',
  },

  /* ── Subheadline ── */
  subheadline: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 'clamp(15px, 1.5vw, 19px)',
    fontWeight: 500,
    color: cyan,
    margin: '0 0 10px',
  },

  /* ── Description ── */
  description: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 'clamp(12px, 1vw, 14px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.6,
    margin: '0 0 0',
    flex: 1,
    display: 'flex',
    alignItems: 'flex-start',
  },

  /* ── Stats grid ── */
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 20px',
    marginBottom: 20,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 'clamp(18px, 1.8vw, 24px)',
    fontWeight: 600,
    color: '#fff',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
  },

  /* ── CTA button ── */
  ctaBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px 0',
    background: 'hsl(190, 85%, 45%)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 12px rgba(0,210,255,0.15)',
    letterSpacing: '0.02em',
  },

  /* ── Footer ── */
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px 36px',
    zIndex: 20,
    textAlign: 'center' as const,
    animation: 'fadeInDown 500ms ease-out 1000ms both',
  },
  footerText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: '0.08em',
  },
};
