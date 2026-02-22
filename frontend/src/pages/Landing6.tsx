import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Cpu, Satellite, Globe, Zap, ArrowRight } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';
import earthPng from '@/assets/space/earth.png';
import satellitePng from '@/assets/space/satellite.png';
import marsPng from '@/assets/space/mars.png';
import moonPng from '@/assets/space/moon.png';

/* ------------------------------------------------------------------ */
/*  Variant 6 — "Orbital Gallery"                                     */
/*  Clean, image-rich landing with interleaved space PNGs              */
/*  and mouse-based parallax throughout.                               */
/* ------------------------------------------------------------------ */

/* Parallax hook: tracks mouse position as -1..1 normalized values */
function useMouseParallax() {
  const offset = useRef({ x: 0, y: 0 });
  const raf = useRef<number>(0);
  const listeners = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      offset.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
      if (!raf.current) {
        raf.current = requestAnimationFrame(() => {
          listeners.current.forEach((fn) => fn());
          raf.current = 0;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return { offset, subscribe };
}

/* Parallax layer component */
function ParallaxImg({
  src,
  alt,
  rate,
  className,
  style,
  subscribe,
  offset,
}: {
  src: string;
  alt: string;
  rate: number;
  className?: string;
  style?: React.CSSProperties;
  subscribe: (fn: () => void) => () => void;
  offset: React.RefObject<{ x: number; y: number }>;
}) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    return subscribe(() => {
      if (!ref.current || !offset.current) return;
      const { x, y } = offset.current;
      ref.current.style.transform = `translate3d(${x * rate * 30}px, ${y * rate * 30}px, 0)`;
    });
  }, [subscribe, offset, rate]);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      draggable={false}
      className={className}
      style={{ willChange: 'transform', ...style }}
    />
  );
}

/* Section data */
const FEATURES = [
  {
    icon: Cpu,
    title: 'AI-Powered Scoring',
    desc: 'Our AI analyzes carbon footprint, cost, latency, and risk to recommend optimal locations.',
  },
  {
    icon: Satellite,
    title: 'Live Orbital Data',
    desc: 'Real-time satellite telemetry from 10+ orbital assets feeding into location decisions.',
  },
  {
    icon: Globe,
    title: 'Multi-Planet Planning',
    desc: 'Plan infrastructure across Earth, orbital stations, the Moon, and Mars.',
  },
  {
    icon: Zap,
    title: 'Carbon Optimization',
    desc: 'Minimize environmental impact with energy source analysis and cooling cost modeling.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { offset, subscribe } = useMouseParallax();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="relative bg-[hsl(224,56%,7%)] text-white overflow-x-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ============================================================ */}
      {/*  SECTION 1: HERO — Full-bleed hero image + floating planets  */}
      {/* ============================================================ */}
      <section className="relative h-screen overflow-hidden">
        {/* Hero background */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[hsl(224,56%,7%)]" />
        </div>

        {/* Floating Earth — parallax slow */}
        <ParallaxImg
          src={earthPng}
          alt=""
          rate={0.6}
          subscribe={subscribe}
          offset={offset}
          className="absolute pointer-events-none select-none opacity-20"
          style={{
            width: '500px',
            right: '-100px',
            top: '15%',
            filter: 'blur(1px)',
          }}
        />

        {/* Floating satellite — parallax fast */}
        <ParallaxImg
          src={satellitePng}
          alt=""
          rate={1.2}
          subscribe={subscribe}
          offset={offset}
          className="absolute pointer-events-none select-none opacity-30"
          style={{
            width: '280px',
            left: '5%',
            bottom: '20%',
            filter: 'drop-shadow(0 0 20px rgba(0,229,255,0.15))',
          }}
        />

        {/* Content */}
        <div
          className="relative z-10 h-full flex flex-col justify-between px-8 md:px-16 py-8"
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 1.2s ease',
          }}
        >
          {/* Top bar */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={skylyLogo} alt="Skyly" className="w-12 h-12 rounded-xl" />
              <span
                className="text-lg font-semibold tracking-[0.2em] text-white/90"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                SKYLY
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <span className="text-sm text-white/50 tracking-wide cursor-default">Features</span>
              <span className="text-sm text-white/50 tracking-wide cursor-default">Planets</span>
              <button
                onClick={() => navigate('/login')}
                className="text-sm text-[#00e5ff] tracking-wide hover:text-white transition-colors"
              >
                Sign In
              </button>
            </nav>
          </header>

          {/* Hero text */}
          <div className="flex-1 flex flex-col justify-center max-w-3xl">
            <h1
              className="font-bold leading-[1.05] mb-6"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}
            >
              Plan Your Next
              <br />
              Data Center —
              <br />
              <span className="text-[#00e5ff]">Anywhere.</span>
            </h1>
            <p className="text-lg text-white/60 max-w-xl leading-relaxed mb-10">
              AI-powered site selection across Earth, orbital stations, the Moon, and Mars.
              Real-time satellite data. One platform.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/login')}
                className="
                  flex items-center gap-2.5 px-8 py-4 rounded-lg
                  bg-[#00e5ff] text-[hsl(224,56%,7%)] font-semibold
                  text-sm tracking-wide
                  hover:bg-[#00e5ff]/90 transition-all duration-300
                  hover:shadow-[0_0_30px_rgba(0,229,255,0.4)]
                  active:scale-95
                "
              >
                <Rocket className="w-4 h-4" />
                Launch Skyly
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-white/30 tracking-wide">Free for hackathon</span>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="flex justify-center pb-4">
            <div className="w-5 h-8 rounded-full border border-white/20 flex justify-center pt-1.5">
              <div
                className="w-1 h-2 rounded-full bg-white/40"
                style={{ animation: 'slide-up 1.5s ease-in-out infinite' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 2: FEATURES — Alternating text + planet images      */}
      {/* ============================================================ */}
      <section className="relative py-32 px-8 md:px-16">
        {/* Background glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)',
          }}
        />

        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-24">
            <p
              className="text-xs tracking-[0.3em] text-[#00e5ff]/60 uppercase mb-4"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              What We Do
            </p>
            <h2
              className="font-bold"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3rem)' }}
            >
              Infrastructure Planning,
              <br />
              <span className="text-white/40">Reimagined for Space.</span>
            </h2>
          </div>

          {/* Feature rows */}
          <div className="flex flex-col gap-40">
            {/* Row 1: Earth + AI Scoring */}
            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
              <div className="flex-1 order-2 md:order-1">
                <div className="flex items-center gap-3 mb-4">
                  <Cpu className="w-5 h-5 text-[#00e5ff]" />
                  <span
                    className="text-xs tracking-[0.2em] text-[#00e5ff]/70 uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {FEATURES[0].title}
                  </span>
                </div>
                <h3 className="text-3xl font-semibold mb-4 leading-tight">
                  Find the optimal location
                  <br />
                  <span className="text-white/50">with AI analysis.</span>
                </h3>
                <p className="text-white/40 leading-relaxed max-w-md">
                  {FEATURES[0].desc}
                </p>
              </div>
              <div className="flex-1 flex justify-center order-1 md:order-2">
                <ParallaxImg
                  src={earthPng}
                  alt="Earth"
                  rate={0.4}
                  subscribe={subscribe}
                  offset={offset}
                  className="select-none"
                  style={{
                    width: 'min(400px, 80vw)',
                    filter: 'drop-shadow(0 0 40px rgba(0,100,255,0.15))',
                  }}
                />
              </div>
            </div>

            {/* Row 2: Satellite + Orbital Data */}
            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
              <div className="flex-1 flex justify-center">
                <ParallaxImg
                  src={satellitePng}
                  alt="Satellite"
                  rate={0.8}
                  subscribe={subscribe}
                  offset={offset}
                  className="select-none"
                  style={{
                    width: 'min(450px, 80vw)',
                    filter: 'drop-shadow(0 0 30px rgba(0,229,255,0.1))',
                  }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <Satellite className="w-5 h-5 text-[#00e5ff]" />
                  <span
                    className="text-xs tracking-[0.2em] text-[#00e5ff]/70 uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {FEATURES[1].title}
                  </span>
                </div>
                <h3 className="text-3xl font-semibold mb-4 leading-tight">
                  Real-time telemetry
                  <br />
                  <span className="text-white/50">from orbit.</span>
                </h3>
                <p className="text-white/40 leading-relaxed max-w-md">
                  {FEATURES[1].desc}
                </p>
              </div>
            </div>

            {/* Row 3: Moon + Multi-Planet */}
            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
              <div className="flex-1 order-2 md:order-1">
                <div className="flex items-center gap-3 mb-4">
                  <Globe className="w-5 h-5 text-[#00e5ff]" />
                  <span
                    className="text-xs tracking-[0.2em] text-[#00e5ff]/70 uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {FEATURES[2].title}
                  </span>
                </div>
                <h3 className="text-3xl font-semibold mb-4 leading-tight">
                  Beyond Earth.
                  <br />
                  <span className="text-white/50">Moon. Mars. Orbit.</span>
                </h3>
                <p className="text-white/40 leading-relaxed max-w-md">
                  {FEATURES[2].desc}
                </p>
              </div>
              <div className="flex-1 flex justify-center order-1 md:order-2 relative">
                <ParallaxImg
                  src={moonPng}
                  alt="Moon"
                  rate={0.3}
                  subscribe={subscribe}
                  offset={offset}
                  className="select-none"
                  style={{
                    width: 'min(320px, 60vw)',
                    filter: 'drop-shadow(0 0 40px rgba(200,200,220,0.1))',
                  }}
                />
                {/* Mars floating behind/beside moon */}
                <ParallaxImg
                  src={marsPng}
                  alt="Mars"
                  rate={0.6}
                  subscribe={subscribe}
                  offset={offset}
                  className="absolute select-none"
                  style={{
                    width: 'min(180px, 35vw)',
                    right: '-10%',
                    top: '-20%',
                    opacity: 0.6,
                    filter: 'drop-shadow(0 0 30px rgba(200,100,50,0.1))',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 3: STATS BAND — cinematic full-width                */}
      {/* ============================================================ */}
      <section className="relative py-24 overflow-hidden">
        {/* Mars as background decoration */}
        <ParallaxImg
          src={marsPng}
          alt=""
          rate={0.2}
          subscribe={subscribe}
          offset={offset}
          className="absolute pointer-events-none select-none opacity-10"
          style={{
            width: '700px',
            right: '-200px',
            top: '-100px',
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-8 md:px-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '7', label: 'Planetary Regions' },
              { value: '10+', label: 'Orbital Satellites' },
              { value: '4', label: 'Celestial Bodies' },
              { value: 'AI', label: 'Powered Scoring' },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  className="text-4xl md:text-5xl font-bold text-[#00e5ff] mb-2"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {stat.value}
                </div>
                <div className="text-xs tracking-[0.15em] text-white/40 uppercase">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider line */}
        <div className="mt-24 max-w-xl mx-auto px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-[#00e5ff]/20 to-transparent" />
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 4: CTA — Final call to action                       */}
      {/* ============================================================ */}
      <section className="relative py-32 px-8 md:px-16 overflow-hidden">
        {/* Earth glow behind */}
        <ParallaxImg
          src={earthPng}
          alt=""
          rate={0.15}
          subscribe={subscribe}
          offset={offset}
          className="absolute pointer-events-none select-none opacity-[0.07]"
          style={{
            width: '800px',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <p
            className="text-xs tracking-[0.3em] text-[#00e5ff]/50 uppercase mb-6"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Ready to Launch?
          </p>
          <h2
            className="font-bold mb-6"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            The Solar System
            <br />
            <span className="text-[#00e5ff]">Is Your Data Center.</span>
          </h2>
          <p className="text-white/40 mb-10 leading-relaxed">
            Join the next generation of infrastructure planning.
            Explore locations across four celestial bodies with AI-powered analysis.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="
              inline-flex items-center gap-2.5 px-10 py-4 rounded-lg
              bg-[#00e5ff] text-[hsl(224,56%,7%)] font-semibold
              text-base tracking-wide
              hover:bg-[#00e5ff]/90 transition-all duration-300
              hover:shadow-[0_0_40px_rgba(0,229,255,0.4)]
              active:scale-95
            "
          >
            <Rocket className="w-5 h-5" />
            Launch Skyly
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="py-8 px-8 md:px-16 border-t border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={skylyLogo} alt="Skyly" className="w-6 h-6 rounded" />
            <span className="text-xs text-white/30 tracking-wide">Skyly Orbital Operations</span>
          </div>
          <span
            className="text-[10px] text-white/20 tracking-[0.15em]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            EST. 2026 &bull; IMAGES: NASA PUBLIC DOMAIN
          </span>
        </div>
      </footer>
    </div>
  );
}
