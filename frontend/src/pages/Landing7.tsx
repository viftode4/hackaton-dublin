import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import earthPng from '@/assets/space/earth.png';
import satellitePng from '@/assets/space/satellite.png';
import marsPng from '@/assets/space/mars.png';
import moonPng from '@/assets/space/moon.png';

/* ------------------------------------------------------------------ */
/*  Variant 7 — "Orbital Landscape"                                    */
/*  Single viewport. Dark sky → white ground with colored arc hills.   */
/*  Floating space PNGs with mouse-driven depth parallax.              */
/* ------------------------------------------------------------------ */

/* ── Parallax engine — RAF, zero re-renders ── */
function useParallax() {
  const mouse = useRef({ x: 0, y: 0 });
  const targets = useRef<Map<HTMLElement, number>>(new Map());

  const register = useCallback((el: HTMLElement | null, rate: number) => {
    if (el) targets.current.set(el, rate);
  }, []);

  useEffect(() => {
    let raf = 0;
    const move = (e: MouseEvent) => {
      mouse.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          targets.current.forEach((rate, el) => {
            el.style.transform =
              `translate3d(${mouse.current.x * rate * 28}px, ${mouse.current.y * rate * 20}px, 0)`;
          });
          raf = 0;
        });
      }
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => {
      window.removeEventListener('mousemove', move);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return register;
}

/* ── Small twinkling star field for the dark area ── */
function Stars() {
  const stars = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      x: Math.random() * 100,
      y: Math.random() * 42,
      size: 1 + Math.random() * 1.5,
      delay: Math.random() * 4,
      dur: 2 + Math.random() * 3,
      opacity: 0.15 + Math.random() * 0.35,
    }))
  ).current;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            width: s.size,
            height: s.size,
            left: `${s.x}%`,
            top: `${s.y}%`,
            opacity: s.opacity,
            animation: `landing7-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function Landing7() {
  const navigate = useNavigate();
  const p = useParallax();
  const [on, setOn] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setOn(true), 80);
    return () => clearTimeout(t);
  }, []);

  /* Staggered fade-up helper */
  const reveal = (delayMs: number) => ({
    opacity: on ? 1 : 0,
    transform: on ? 'translateY(0)' : 'translateY(18px)',
    transition: `opacity 900ms ease ${delayMs}ms, transform 900ms cubic-bezier(.16,1,.3,1) ${delayMs}ms`,
  });

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── SKY → GROUND GRADIENT ── */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg,
            hsl(224 56% 7%) 0%,
            hsl(224 56% 7%) 24%,
            hsl(224 42% 16%) 34%,
            #f0f0f0 50%,
            #ffffff 58%,
            #ffffff 100%)`,
        }}
      />

      {/* ── STAR FIELD ── */}
      <Stars />

      {/* ── ARC HILLS (landscape in lower half) ── */}
      {[
        { color: '#1e3a8a', top: 44, h: 60, flip: false, rate: 0.05, sw: 3 },
        { color: '#ca8a04', top: 52, h: 54, flip: true,  rate: 0.08, sw: 2.5 },
        { color: '#0891b2', top: 59, h: 48, flip: false, rate: 0.11, sw: 2 },
        { color: '#b45309', top: 66, h: 42, flip: true,  rate: 0.14, sw: 1.8 },
      ].map((a, i) => (
        <div
          key={a.color}
          ref={(el) => { p(el, a.rate); }}
          className="absolute pointer-events-none"
          style={{
            left: '-5%',
            top: `${a.top}%`,
            width: '110%',
            height: `${a.h}vh`,
            opacity: on ? 1 : 0,
            transition: `opacity 1.1s ease ${400 + i * 180}ms`,
            willChange: 'transform',
          }}
        >
          <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="w-full h-full">
            <path
              d={a.flip ? 'M-80,160 Q720,-8 1520,160' : 'M-80,160 Q720,2 1520,160'}
              fill="none"
              stroke={a.color}
              strokeWidth={a.sw}
              opacity="0.38"
            />
            <path
              d={a.flip ? 'M-80,160 Q720,-8 1520,160 V160 H-80Z' : 'M-80,160 Q720,2 1520,160 V160 H-80Z'}
              fill={a.color}
              opacity="0.03"
            />
          </svg>
        </div>
      ))}

      {/* ── EARTH (hero background, large & ghostly) ── */}
      <img
        ref={(el) => { p(el, 0.12); }}
        src={earthPng}
        alt=""
        draggable={false}
        className="absolute pointer-events-none"
        style={{
          width: 'min(400px, 34vw)',
          right: '-2%',
          top: '2%',
          opacity: on ? 0.07 : 0,
          transition: 'opacity 1.4s ease 200ms',
          willChange: 'transform',
        }}
      />

      {/* ── SATELLITE (left, close → high parallax) ── */}
      <div className="absolute" style={{ left: '4%', top: '48%', ...reveal(700) }}>
        <img
          ref={(el) => { p(el, 0.6); }}
          src={satellitePng}
          alt=""
          draggable={false}
          className="pointer-events-none"
          style={{
            width: 'min(180px, 20vw)',
            willChange: 'transform',
            filter: 'drop-shadow(0 8px 28px rgba(0,0,0,0.08))',
          }}
        />
        <span
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] tracking-[0.2em] uppercase"
          style={{ color: '#ca8a0470', fontFamily: "'JetBrains Mono', monospace" }}
        >
          Orbital Data
        </span>
      </div>

      {/* ── MOON (right, distant → low parallax) ── */}
      <div className="absolute" style={{ right: '10%', top: '46%', ...reveal(900) }}>
        <img
          ref={(el) => { p(el, 0.25); }}
          src={moonPng}
          alt=""
          draggable={false}
          className="pointer-events-none"
          style={{
            width: 'min(120px, 13vw)',
            willChange: 'transform',
            filter: 'drop-shadow(0 5px 18px rgba(0,0,0,0.06))',
          }}
        />
        <span
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] tracking-[0.2em] uppercase"
          style={{ color: '#0891b260', fontFamily: "'JetBrains Mono', monospace" }}
        >
          Multi-Planet
        </span>
      </div>

      {/* ── MARS (center-low, medium depth) ── */}
      <div className="absolute" style={{ left: '40%', top: '62%', ...reveal(1100) }}>
        <img
          ref={(el) => { p(el, 0.42); }}
          src={marsPng}
          alt=""
          draggable={false}
          className="pointer-events-none"
          style={{
            width: 'min(140px, 15vw)',
            willChange: 'transform',
            filter: 'drop-shadow(0 6px 22px rgba(0,0,0,0.07))',
          }}
        />
        <span
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] tracking-[0.2em] uppercase"
          style={{ color: '#b4530970', fontFamily: "'JetBrains Mono', monospace" }}
        >
          Carbon Optimized
        </span>
      </div>

      {/* ── SMALL EARTH (bottom-right accent, mid depth) ── */}
      <div className="absolute" style={{ right: '28%', top: '58%', ...reveal(1000) }}>
        <img
          ref={(el) => { p(el, 0.35); }}
          src={earthPng}
          alt=""
          draggable={false}
          className="pointer-events-none"
          style={{
            width: 'min(100px, 11vw)',
            willChange: 'transform',
            filter: 'drop-shadow(0 5px 18px rgba(0,0,0,0.06))',
            opacity: 0.7,
          }}
        />
        <span
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] tracking-[0.2em] uppercase"
          style={{ color: '#1e3a8a60', fontFamily: "'JetBrains Mono', monospace" }}
        >
          AI Scoring
        </span>
      </div>

      {/* ── NAV ── */}
      <header
        className="relative z-30 flex items-center justify-between px-8 md:px-14 py-4"
        style={{ opacity: on ? 1 : 0, transition: 'opacity 600ms ease 60ms' }}
      >
        <div className="flex items-center gap-3">
          <img src={skylyLogo} alt="Skyly" className="w-8 h-8 rounded-lg" />
          <span
            className="text-[13px] font-semibold tracking-[0.22em] text-white/75"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            SKYLY
          </span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-[11px] text-white/30 hover:text-white/70 transition-colors tracking-[0.18em] uppercase"
        >
          Sign In
        </button>
      </header>

      {/* ── HERO TEXT ── */}
      <div
        className="relative z-20 max-w-3xl mx-auto px-8 pt-[4vh] md:pt-[6vh] text-center"
        style={reveal(160)}
      >
        <p
          className="text-[10px] tracking-[0.45em] text-[#00e5ff]/40 uppercase mb-4"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Orbital Infrastructure Platform
        </p>
        <h1
          className="font-bold text-white leading-[1.06]"
          style={{ fontSize: 'clamp(1.8rem, 4.5vw, 3.5rem)' }}
        >
          Plan Your Next Data Center
          <br />
          <span style={{ color: '#00e5ff' }}>Anywhere in the Solar System.</span>
        </h1>
        <p className="text-[13px] text-white/28 max-w-md mx-auto leading-relaxed mt-3 mb-6">
          AI-powered site selection across Earth, orbital stations, the Moon, and Mars.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="
            inline-flex items-center gap-2 px-7 py-3 rounded-lg
            bg-[#00e5ff] text-[hsl(224,56%,7%)] font-semibold text-[13px]
            tracking-wide hover:brightness-110 transition-all duration-300
            hover:shadow-[0_0_40px_rgba(0,229,255,0.28)] active:scale-[0.97]
          "
        >
          <Rocket className="w-3.5 h-3.5" />
          Launch Skyly
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── STATS BAR ── */}
      <div
        className="absolute bottom-9 left-0 right-0 z-30"
        style={{ opacity: on ? 1 : 0, transition: 'opacity 900ms ease 1400ms' }}
      >
        <div className="flex justify-center gap-10 md:gap-16">
          {[
            { v: '7', l: 'Regions', c: '#1e3a8a' },
            { v: '10+', l: 'Satellites', c: '#ca8a04' },
            { v: '4', l: 'Bodies', c: '#0891b2' },
            { v: 'AI', l: 'Scoring', c: '#b45309' },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div
                className="text-sm md:text-base font-bold"
                style={{ color: s.c, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {s.v}
              </div>
              <div className="text-[7px] tracking-[0.2em] uppercase" style={{ color: '#1a1a2e25' }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 py-2 px-8 md:px-14 flex items-center justify-between"
        style={{ opacity: on ? 1 : 0, transition: 'opacity 700ms ease 1600ms' }}
      >
        <div className="flex items-center gap-1.5">
          <img src={skylyLogo} alt="" className="w-3.5 h-3.5 rounded" />
          <span className="text-[8px]" style={{ color: '#1a1a2e18' }}>Skyly Orbital Operations</span>
        </div>
        <span
          className="text-[7px] tracking-[0.12em]"
          style={{ color: '#1a1a2e12', fontFamily: "'JetBrains Mono', monospace" }}
        >
          NASA PUBLIC DOMAIN
        </span>
      </div>
    </div>
  );
}
