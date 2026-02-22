import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';

/* ------------------------------------------------------------------ */
/*  Mission Control HUD — single-screen landing page                  */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: '\u25C7', label: 'AI SCORING' },
  { icon: '\u25C7', label: 'ORBITAL DATA' },
  { icon: '\u25C7', label: 'MULTI-PLANET' },
  { icon: '\u25C7', label: '7 REGIONS' },
] as const;

const TELEMETRY_ITEMS = [
  'SYS:NOMINAL',
  'LAT:48.8562\u00B0N',
  'LON:2.3522\u00B0E',
  'ALT:408km',
  'VEL:7.66km/s',
  'TEMP:-157\u00B0C',
  'PWR:98.2%',
  'LINK:STABLE',
  'ORB:LEO',
  'FUEL:87.4%',
  'COMMS:ACTIVE',
  'SHIELD:OK',
  'O2:99.1%',
  'GYRO:LOCKED',
  'NAV:ONLINE',
];

export default function Landing() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  /* ---------- parallax state ---------- */
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    setOffset({
      x: (e.clientX - cx) / cx,   // -1 ... 1
      y: (e.clientY - cy) / cy,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  /* ---------- telemetry time ---------- */
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------- helpers ---------- */
  const px = (rate: number) =>
    `translate3d(${offset.x * rate * 40}px, ${offset.y * rate * 40}px, 0)`;

  const telemetryStr = TELEMETRY_ITEMS.join('  \u2022  ');

  return (
    <div
      ref={containerRef}
      className="hud-cursor hud-grain hud-vignette relative w-screen h-screen overflow-hidden select-none"
      style={{ background: 'hsl(224 56% 7%)' }}
    >
      {/* ============================================================ */}
      {/*  BACKGROUND — hero image + dark overlay                      */}
      {/* ============================================================ */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: px(0.02),
          /* slight zoom so parallax never shows edges */
          width: '105%',
          height: '105%',
          top: '-2.5%',
          left: '-2.5%',
        }}
      >
        <img
          src={heroImage}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      {/* ============================================================ */}
      {/*  SCAN LINE                                                   */}
      {/* ============================================================ */}
      <div className="hud-scanline" />

      {/* ============================================================ */}
      {/*  HUD FRAME — corner brackets (parallax medium)               */}
      {/* ============================================================ */}
      <div
        className="absolute inset-0 pointer-events-none z-10 will-change-transform"
        style={{ transform: px(0.05) }}
      >
        {/* Top-left bracket */}
        <div className="hud-anim-tl absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-[#00e5ff] rounded-tl-sm opacity-70" />
        {/* Top-right bracket */}
        <div className="hud-anim-tr absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-[#00e5ff] rounded-tr-sm opacity-70" />
        {/* Bottom-left bracket */}
        <div className="hud-anim-bl absolute bottom-14 left-6 w-16 h-16 border-b-2 border-l-2 border-[#00e5ff] rounded-bl-sm opacity-70" />
        {/* Bottom-right bracket */}
        <div className="hud-anim-br absolute bottom-14 right-6 w-16 h-16 border-b-2 border-r-2 border-[#00e5ff] rounded-br-sm opacity-70" />

        {/* Inner corner accents (smaller, dimmer) */}
        <div className="hud-anim-tl absolute top-6 left-6 w-6 h-6 border-t border-l border-[#00e5ff] opacity-40" style={{ animationDelay: '0.3s' }} />
        <div className="hud-anim-tr absolute top-6 right-6 w-6 h-6 border-t border-r border-[#00e5ff] opacity-40" style={{ animationDelay: '0.5s' }} />
        <div className="hud-anim-bl absolute bottom-14 left-6 w-6 h-6 border-b border-l border-[#00e5ff] opacity-40" style={{ animationDelay: '0.7s' }} />
        <div className="hud-anim-br absolute bottom-14 right-6 w-6 h-6 border-b border-r border-[#00e5ff] opacity-40" style={{ animationDelay: '0.7s' }} />

        {/* Coordinate labels */}
        <span
          className="absolute top-[5.5rem] left-7 opacity-30"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#00e5ff' }}
        >
          48.8562&deg;N
        </span>
        <span
          className="absolute top-[5.5rem] right-7 text-right opacity-30"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#00e5ff' }}
        >
          2.3522&deg;E
        </span>
        <span
          className="absolute bottom-[6.5rem] left-7 opacity-30"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#00e5ff' }}
        >
          ALT 408.2 km
        </span>
        <span
          className="absolute bottom-[6.5rem] right-7 text-right opacity-30"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#00e5ff' }}
        >
          INC 51.64&deg;
        </span>
      </div>

      {/* ============================================================ */}
      {/*  TOP BAR — logo + live indicator (parallax medium)           */}
      {/* ============================================================ */}
      <div
        className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between px-8 pt-8 pointer-events-none will-change-transform"
        style={{ transform: px(0.05) }}
      >
        {/* Logo group */}
        <div className="hud-anim-tl flex items-center gap-3 pointer-events-auto">
          <img src={skylyLogo} alt="Skyly" className="w-12 h-12 rounded-lg drop-shadow-2xl" />
          <span
            className="text-white font-semibold tracking-[0.25em] text-lg"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            SKYLY
          </span>
        </div>

        {/* Live orbital data */}
        <div className="hud-anim-tr flex items-center gap-2 pointer-events-auto">
          <span
            className="inline-block w-2 h-2 rounded-full bg-green-400"
            style={{ animation: 'hud-pulse-green 2s ease-in-out infinite' }}
          />
          <span
            className="text-green-400 text-xs tracking-widest font-medium"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            LIVE ORBITAL DATA
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  CENTER CONTENT — tagline + features + CTA (nearly fixed)    */}
      {/* ============================================================ */}
      <div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center will-change-transform"
        style={{ transform: px(0.008) }}
      >
        {/* Tagline */}
        <h1
          className="hud-anim-center text-white font-bold text-center leading-tight max-w-[900px] px-6"
          style={{
            fontSize: 'clamp(1.8rem, 4.5vw, 4rem)',
            fontWeight: 700,
            textShadow: '0 0 40px rgba(0,229,255,0.15), 0 2px 20px rgba(0,0,0,0.5)',
          }}
        >
          PLAN YOUR NEXT DATA CENTER&nbsp;&mdash;
          <br />
          <span className="text-[#00e5ff]">ANYWHERE IN THE SOLAR SYSTEM.</span>
        </h1>

        {/* Subtitle */}
        <p
          className="hud-anim-center mt-4 text-white/50 text-sm text-center tracking-wide max-w-lg px-4"
          style={{ animationDelay: '0.8s', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
        >
          AI-powered site selection across 7 planetary regions. Real-time orbital telemetry. One platform.
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          {FEATURES.map((f, i) => (
            <span
              key={f.label}
              className={`${i < 2 ? 'hud-anim-left' : 'hud-anim-right'} inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-[#00e5ff]/40 text-[#00e5ff] bg-[#00e5ff]/5 backdrop-blur-sm`}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                letterSpacing: '0.08em',
                animationDelay: `${0.7 + i * 0.1}s`,
              }}
            >
              <span className="opacity-60">{f.icon}</span>
              {f.label}
            </span>
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={() => navigate('/login')}
          className="hud-anim-scale group mt-10 relative inline-flex items-center gap-2.5 px-10 py-4 rounded-lg text-white font-semibold tracking-wider text-sm transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]"
          style={{
            background: 'linear-gradient(135deg, #00e5ff20 0%, #00e5ff10 100%)',
            border: '1.5px solid #00e5ff80',
            animation: 'hud-enter-scale 0.7s cubic-bezier(0.34,1.56,0.64,1) 1.0s both, hud-cta-glow 3s ease-in-out infinite 2s',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <Rocket className="w-4 h-4 text-[#00e5ff] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-[-8deg]" />
          <span>LAUNCH SKYLY</span>
          {/* Glow halo behind button */}
          <span
            className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10"
            style={{ boxShadow: '0 0 40px #00e5ff50, 0 0 80px #00e5ff20' }}
          />
        </button>
      </div>

      {/* ============================================================ */}
      {/*  SIDE INDICATORS (parallax medium)                           */}
      {/* ============================================================ */}
      <div
        className="absolute inset-0 pointer-events-none z-10 will-change-transform"
        style={{ transform: px(0.04) }}
      >
        {/* Left side vertical label */}
        <div
          className="hud-anim-left absolute left-3 top-1/2 -translate-y-1/2 opacity-20"
          style={{
            writingMode: 'vertical-lr',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: '#00e5ff',
          }}
        >
          SKYLY // MISSION CONTROL v2.1
        </div>

        {/* Right side vertical label */}
        <div
          className="hud-anim-right absolute right-3 top-1/2 -translate-y-1/2 opacity-20"
          style={{
            writingMode: 'vertical-lr',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.3em',
            color: '#00e5ff',
            transform: 'rotate(180deg)',
          }}
        >
          ORBITAL ATLAS // SECTOR 7G
        </div>
      </div>

      {/* ============================================================ */}
      {/*  BOTTOM TELEMETRY BAR                                        */}
      {/* ============================================================ */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 h-10 flex items-center overflow-hidden"
        style={{
          background: 'linear-gradient(0deg, hsl(224 56% 5% / 0.95) 0%, transparent 100%)',
          borderTop: '1px solid #00e5ff20',
        }}
      >
        {/* Scrolling telemetry text */}
        <div
          className="whitespace-nowrap flex-shrink-0"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: '#00e5ff',
            opacity: 0.5,
            animation: 'hud-telemetry-scroll 30s linear infinite',
          }}
        >
          {/* Duplicate text for seamless loop */}
          <span>{telemetryStr}  &bull;  </span>
          <span>{telemetryStr}  &bull;  </span>
        </div>

        {/* Clock on the right */}
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
          }}
        >
          <span className="text-[#00e5ff]/40 tracking-wider">{clock}</span>
          <span className="text-[#00e5ff]/30">|</span>
          <span className="text-[#00e5ff]/40 tracking-wider">STATUS: NOMINAL</span>
        </div>
      </div>
    </div>
  );
}
