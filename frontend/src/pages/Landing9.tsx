import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import earthPng from '@/assets/space/earth.png';
import satellitePng from '@/assets/space/satellite.png';
import marsPng from '@/assets/space/mars.png';
import moonPng from '@/assets/space/moon.png';

/* ------------------------------------------------------------------ */
/*  Variant 9 — "Layered Horizon"                                      */
/*  Single viewport (100vh). Cinematic space vista with multiple        */
/*  horizontal depth layers. Stars → nebula → planets → text → haze → */
/*  terrain. Mouse parallax with RAF, zero re-renders.                 */
/* ------------------------------------------------------------------ */

/* ── Parallax engine ── */
function useParallax() {
  const mouse = useRef({ x: 0, y: 0 });
  const targets = useRef<Map<HTMLElement, { rx: number; ry: number }>>(new Map());

  const register = useCallback(
    (el: HTMLElement | null, rate: number, rateY?: number) => {
      if (el) targets.current.set(el, { rx: rate, ry: rateY ?? rate });
    },
    [],
  );

  useEffect(() => {
    let raf = 0;
    const move = (e: MouseEvent) => {
      mouse.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          targets.current.forEach(({ rx, ry }, el) => {
            el.style.transform = `translate3d(${mouse.current.x * rx * 30}px, ${mouse.current.y * ry * 20}px, 0)`;
          });
          raf = 0;
        });
      }
    };
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mousemove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return register;
}

/* ── Star generator ── */
function generateStars(count: number) {
  const stars: { x: number; y: number; size: number; delay: number; duration: number }[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * 100,
      y: Math.random() * 85,
      size: Math.random() * 2.2 + 0.5,
      delay: Math.random() * 6,
      duration: 2 + Math.random() * 4,
    });
  }
  return stars;
}

const STARS = generateStars(50);

/* ── Terrain SVG path (wavy top edge) ── */
const TERRAIN_PATH =
  'M0,40 C80,5 160,55 240,25 C320,0 400,45 480,20 C560,-5 640,40 720,18 C800,-2 880,35 960,15 C1040,-5 1120,42 1200,22 C1280,2 1360,38 1440,20 L1440,200 L0,200 Z';

const Landing9 = () => {
  const navigate = useNavigate();
  const register = useParallax();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <>
      <style>{`
        @keyframes l9-twinkle {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
        @keyframes l9-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes l9-slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes l9-slideFromLeft {
          from { opacity: 0; transform: translateX(-120px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes l9-slideFromRight {
          from { opacity: 0; transform: translateX(120px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes l9-terrainUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes l9-hazeShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes l9-glowPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes l9-scanlines {
          0% { background-position: 0 0; }
          100% { background-position: 0 4px; }
        }
        @keyframes l9-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #03050a 0%, #0a0e1a 30%, #10142a 55%, #14112a 75%, #0d0a14 100%)',
          fontFamily: "'Inter', sans-serif",
          color: '#ffffff',
        }}
      >
        {/* ── Scanlines overlay ── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)',
            opacity: entered ? 1 : 0,
            transition: 'opacity 2s ease 2s',
          }}
        />

        {/* ══════════════════════════════════════════════════
            LAYER 0 — Star field (rate 0.03)
        ══════════════════════════════════════════════════ */}
        <div
          ref={(el) => register(el, 0.03)}
          style={{
            position: 'absolute',
            inset: '-40px',
            zIndex: 1,
            opacity: entered ? 1 : 0,
            transition: 'opacity 0.8s ease',
          }}
        >
          {STARS.map((s, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                borderRadius: '50%',
                background: s.size > 1.8 ? '#aad4ff' : s.size > 1.2 ? '#ffffff' : '#ccddff',
                animation: `l9-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
                boxShadow: s.size > 1.5 ? `0 0 ${s.size * 2}px rgba(170,212,255,0.4)` : 'none',
              }}
            />
          ))}
        </div>

        {/* ══════════════════════════════════════════════════
            LAYER 1 — Nebula / color wash (rate 0.06)
        ══════════════════════════════════════════════════ */}
        <div
          ref={(el) => register(el, 0.06)}
          style={{
            position: 'absolute',
            inset: '-60px',
            zIndex: 2,
            opacity: entered ? 1 : 0,
            transition: 'opacity 1.2s ease 0.3s',
          }}
        >
          {/* Top-left nebula */}
          <div
            style={{
              position: 'absolute',
              top: '5%',
              left: '-5%',
              width: '55vw',
              height: '45vh',
              background: 'radial-gradient(ellipse at center, rgba(60,20,120,0.18) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          {/* Center-right warm glow */}
          <div
            style={{
              position: 'absolute',
              top: '30%',
              right: '-5%',
              width: '45vw',
              height: '40vh',
              background: 'radial-gradient(ellipse at center, rgba(100,40,20,0.12) 0%, transparent 65%)',
              filter: 'blur(50px)',
            }}
          />
          {/* Bottom cyan hint */}
          <div
            style={{
              position: 'absolute',
              bottom: '15%',
              left: '30%',
              width: '40vw',
              height: '30vh',
              background: 'radial-gradient(ellipse at center, rgba(0,229,255,0.06) 0%, transparent 70%)',
              filter: 'blur(70px)',
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════
            LAYER 2 — Planets (rates 0.15 – 0.25)
        ══════════════════════════════════════════════════ */}

        {/* Earth — large, half cut off on LEFT edge */}
        <div
          ref={(el) => register(el, 0.15, 0.1)}
          style={{
            position: 'absolute',
            zIndex: 3,
            left: '-17vw',
            top: '28%',
            width: '35vw',
            height: '35vw',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-slideFromLeft 1.4s cubic-bezier(0.22,1,0.36,1) 0.5s both' : 'none',
          }}
        >
          <img
            src={earthPng}
            alt="Earth"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.85) saturate(1.1)',
              pointerEvents: 'none',
            }}
          />
          {/* Atmospheric glow around Earth */}
          <div
            style={{
              position: 'absolute',
              inset: '-8%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(60,140,255,0.12) 40%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Moon — peeking from RIGHT edge */}
        <div
          ref={(el) => register(el, 0.2, 0.12)}
          style={{
            position: 'absolute',
            zIndex: 3,
            right: '-8vw',
            top: '12%',
            width: '18vw',
            height: '18vw',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-slideFromRight 1.3s cubic-bezier(0.22,1,0.36,1) 0.7s both' : 'none',
          }}
        >
          <img
            src={moonPng}
            alt="Moon"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.9)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Mars — floating mid-right */}
        <div
          ref={(el) => register(el, 0.25, 0.18)}
          style={{
            position: 'absolute',
            zIndex: 3,
            right: '18%',
            top: '38%',
            width: '12vw',
            height: '12vw',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-fadeIn 1.2s ease 0.9s both' : 'none',
          }}
        >
          <img
            src={marsPng}
            alt="Mars"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.9) saturate(1.15)',
              pointerEvents: 'none',
            }}
          />
          {/* Mars atmosphere */}
          <div
            style={{
              position: 'absolute',
              inset: '-12%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(200,80,40,0.08) 40%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Satellite — upper area, high parallax */}
        <div
          ref={(el) => register(el, 0.35, 0.3)}
          style={{
            position: 'absolute',
            zIndex: 4,
            left: '58%',
            top: '8%',
            width: '10vw',
            height: '10vw',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-fadeIn 1s ease 1.1s both' : 'none',
          }}
        >
          <img
            src={satellitePng}
            alt="Satellite"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'brightness(0.95)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════
            LAYER 3 — Hero text (rate 0.08)
        ══════════════════════════════════════════════════ */}
        <div
          ref={(el) => register(el, 0.08, 0.05)}
          style={{
            position: 'absolute',
            zIndex: 10,
            top: '14%',
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 'clamp(0.6rem, 0.9vw, 0.85rem)',
              letterSpacing: '0.35em',
              textTransform: 'uppercase',
              color: '#00e5ff',
              marginBottom: '1rem',
              opacity: entered ? 1 : 0,
              animation: entered ? 'l9-slideUp 0.9s ease 0.6s both' : 'none',
            }}
          >
            Next-Gen Cloud Infrastructure
          </p>

          <h1
            style={{
              margin: 0,
              lineHeight: 1.05,
              opacity: entered ? 1 : 0,
              animation: entered ? 'l9-slideUp 1s ease 0.8s both' : 'none',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 'clamp(1.4rem, 3vw, 2.8rem)',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.8)',
                letterSpacing: '0.05em',
              }}
            >
              Plan Your Next
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 'clamp(2.8rem, 8vw, 9rem)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ffffff 0%, #00e5ff 50%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 1,
                paddingBottom: '0.1em',
              }}
            >
              DATA CENTER
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(0.9rem, 1.6vw, 1.3rem)',
              fontWeight: 300,
              color: 'rgba(255,255,255,0.55)',
              marginTop: '0.8rem',
              letterSpacing: '0.08em',
              opacity: entered ? 1 : 0,
              animation: entered ? 'l9-slideUp 1s ease 1s both' : 'none',
            }}
          >
            Anywhere in the Solar System
          </p>
        </div>

        {/* ── Monospace labels ── */}
        <div
          style={{
            position: 'absolute',
            zIndex: 11,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.18em',
            color: 'rgba(0,229,255,0.35)',
            pointerEvents: 'none',
            opacity: entered ? 1 : 0,
            transition: 'opacity 1.5s ease 1.8s',
          }}
        >
          <span style={{ position: 'fixed', top: '18%', right: '3%' }}>ALTITUDE: 400KM</span>
          <span style={{ position: 'fixed', bottom: '22%', left: '3%' }}>LAT 51.47°N</span>
          <span style={{ position: 'fixed', top: '52%', right: '5%' }}>ORBIT: LEO</span>
        </div>

        {/* ══════════════════════════════════════════════════
            LAYER 4 — Atmospheric haze band (rate 0.3)
        ══════════════════════════════════════════════════ */}
        <div
          ref={(el) => register(el, 0.3, 0.15)}
          style={{
            position: 'absolute',
            zIndex: 6,
            left: '-60px',
            right: '-60px',
            bottom: '10%',
            height: '30vh',
            opacity: entered ? 1 : 0,
            transition: 'opacity 1.6s ease 1.4s',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              background:
                'linear-gradient(90deg, transparent 0%, rgba(180,100,30,0.07) 20%, rgba(220,140,50,0.1) 40%, rgba(255,160,60,0.08) 55%, rgba(200,100,40,0.06) 75%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'l9-hazeShift 12s ease-in-out infinite',
              filter: 'blur(30px)',
            }}
          />
          {/* Secondary cool haze */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.03) 30%, rgba(100,60,200,0.04) 60%, transparent 100%)',
              filter: 'blur(40px)',
            }}
          />
        </div>

        {/* ══════════════════════════════════════════════════
            LAYER 5 — Terrain silhouette + CTA (rate 0.45)
        ══════════════════════════════════════════════════ */}
        <div
          ref={(el) => register(el, 0.45, 0.2)}
          style={{
            position: 'absolute',
            zIndex: 15,
            left: '-60px',
            right: '-60px',
            bottom: '-20px',
            height: '20vh',
            animation: entered ? 'l9-terrainUp 1.2s cubic-bezier(0.22,1,0.36,1) 0.8s both' : 'none',
          }}
        >
          {/* Horizon glow line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background:
                'linear-gradient(90deg, transparent 5%, rgba(255,160,60,0.3) 25%, rgba(0,229,255,0.4) 50%, rgba(255,160,60,0.3) 75%, transparent 95%)',
              filter: 'blur(1px)',
              animation: 'l9-glowPulse 4s ease-in-out infinite',
            }}
          />
          {/* Glow bloom behind line */}
          <div
            style={{
              position: 'absolute',
              top: '-8px',
              left: 0,
              right: 0,
              height: '16px',
              background:
                'linear-gradient(90deg, transparent 5%, rgba(255,160,60,0.08) 25%, rgba(0,229,255,0.1) 50%, rgba(255,160,60,0.08) 75%, transparent 95%)',
              filter: 'blur(8px)',
            }}
          />

          {/* Terrain shape */}
          <svg
            viewBox="0 0 1440 200"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          >
            <defs>
              <linearGradient id="l9-terrain-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0c0a14" />
                <stop offset="40%" stopColor="#08060e" />
                <stop offset="100%" stopColor="#040308" />
              </linearGradient>
            </defs>
            <path d={TERRAIN_PATH} fill="url(#l9-terrain-grad)" />
          </svg>

          {/* ── Stats row inside terrain ── */}
          <div
            style={{
              position: 'absolute',
              bottom: '18%',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              gap: 'clamp(2rem, 5vw, 5rem)',
              pointerEvents: 'none',
              opacity: entered ? 1 : 0,
              animation: entered ? 'l9-fadeIn 1s ease 1.8s both' : 'none',
            }}
          >
            {[
              { value: '99.99%', label: 'Uptime' },
              { value: '12', label: 'Orbital Nodes' },
              { value: '<4ms', label: 'Latency' },
              { value: '∞', label: 'Scale' },
            ].map(({ value, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 'clamp(1rem, 1.8vw, 1.5rem)',
                    fontWeight: 700,
                    color: '#00e5ff',
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6rem',
                    letterSpacing: '0.15em',
                    color: 'rgba(255,255,255,0.35)',
                    textTransform: 'uppercase',
                    marginTop: '0.25rem',
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA button (above terrain, fixed z) ── */}
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            bottom: '22vh',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-slideUp 1s ease 1.4s both' : 'none',
          }}
        >
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.9rem 2.4rem',
              fontSize: 'clamp(0.85rem, 1.1vw, 1rem)',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              color: '#03050a',
              background: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              boxShadow: '0 0 30px rgba(0,229,255,0.25), 0 4px 20px rgba(0,0,0,0.4)',
              transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.06)';
              e.currentTarget.style.boxShadow =
                '0 0 45px rgba(0,229,255,0.4), 0 6px 30px rgba(0,0,0,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow =
                '0 0 30px rgba(0,229,255,0.25), 0 4px 20px rgba(0,0,0,0.4)';
            }}
          >
            <Rocket size={18} />
            Launch Dashboard
            <ArrowRight size={16} />
          </button>
        </div>

        {/* ══════════════════════════════════════════════════
            NAV BAR (z above everything)
        ══════════════════════════════════════════════════ */}
        <nav
          style={{
            position: 'absolute',
            zIndex: 30,
            top: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.2rem clamp(1.5rem, 4vw, 3rem)',
            opacity: entered ? 1 : 0,
            animation: entered ? 'l9-fadeIn 0.8s ease 0.3s both' : 'none',
          }}
        >
          {/* Logo + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src={skylyLogo}
              alt="Skyly"
              style={{
                height: 'clamp(28px, 3vw, 38px)',
                width: 'auto',
                filter: 'drop-shadow(0 0 8px rgba(0,229,255,0.3))',
              }}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 'clamp(0.85rem, 1.1vw, 1rem)',
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: '#ffffff',
              }}
            >
              SKYLY
            </span>
          </div>

          {/* Sign In */}
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '0.5rem 1.5rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              fontFamily: "'Inter', sans-serif",
              color: 'rgba(255,255,255,0.8)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '999px',
              cursor: 'pointer',
              backdropFilter: 'blur(12px)',
              transition: 'all 0.25s ease',
              letterSpacing: '0.03em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,229,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(0,229,255,0.3)';
              e.currentTarget.style.color = '#00e5ff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
            }}
          >
            Sign In
          </button>
        </nav>
      </div>
    </>
  );
};

export default Landing9;
