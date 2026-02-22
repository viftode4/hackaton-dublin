import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';
import earthPng from '@/assets/space/earth.png';
import satellitePng from '@/assets/space/satellite.png';
import marsPng from '@/assets/space/mars.png';
import moonPng from '@/assets/space/moon.png';

/* ------------------------------------------------------------------ */
/*  Variant 8 — "Orbital Orrery"                                       */
/*  Single 100vh viewport. True CSS perspective parallax with mouse    */
/*  driven rotateX/Y on a 3D scene. Planets at different translateZ.   */
/*  Faint SVG orbital rings. Staggered entrance animations. No libs.   */
/* ------------------------------------------------------------------ */

/* ── Lerp helper ── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/* ── Star field generator (deterministic) ── */
function generateStars(count: number): { x: number; y: number; size: number; delay: number }[] {
  const stars: { x: number; y: number; size: number; delay: number }[] = [];
  // Simple seeded pseudo-random
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 100,
      y: rand() * 100,
      size: rand() * 1.8 + 0.4,
      delay: rand() * 6,
    });
  }
  return stars;
}

const STARS = generateStars(90);

/* ── CSS as template literal ── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');

  .orrery-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: hsl(224 56% 7%);
    font-family: 'Inter', sans-serif;
    color: #e0e6f0;
    cursor: default;
    user-select: none;
  }

  /* ── Star background ── */
  .orrery-star {
    position: absolute;
    border-radius: 50%;
    background: #ffffff;
    animation: orrery-twinkle 4s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes orrery-twinkle {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.85; }
  }

  /* ── Perspective container ── */
  .orrery-perspective {
    position: absolute;
    inset: 0;
    perspective: 1200px;
    perspective-origin: 50% 50%;
  }

  /* ── 3D scene that rotates ── */
  .orrery-scene {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    will-change: transform;
    transition: none;
  }

  /* ── Orbital rings ── */
  .orrery-rings-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-style: preserve-3d;
    pointer-events: none;
  }
  .orrery-ring-svg {
    position: absolute;
    transform-style: preserve-3d;
  }
  .orrery-ring-path {
    fill: none;
    stroke: #00e5ff;
    stroke-linecap: round;
    stroke-dasharray: 2400;
    stroke-dashoffset: 2400;
  }
  .orrery-ring-path.ring-animate {
    animation: orrery-draw-ring 2.2s ease-out forwards;
  }
  .orrery-ring-1 { animation-delay: 0.3s !important; opacity: 0.2; stroke-width: 1; }
  .orrery-ring-2 { animation-delay: 0.6s !important; opacity: 0.15; stroke-width: 0.8; }
  .orrery-ring-3 { animation-delay: 0.9s !important; opacity: 0.12; stroke-width: 0.6; }
  @keyframes orrery-draw-ring {
    to { stroke-dashoffset: 0; }
  }

  /* ── Planet / body positioning ── */
  .orrery-body {
    position: absolute;
    transform-style: preserve-3d;
    opacity: 0;
    animation: orrery-body-in 1.2s ease-out forwards;
    pointer-events: none;
  }
  .orrery-body img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 30px rgba(0, 229, 255, 0.12));
  }
  @keyframes orrery-body-in {
    from { opacity: 0; transform: scale(0.8) translateZ(var(--tz)); }
    to   { opacity: 1; transform: scale(1)   translateZ(var(--tz)); }
  }

  /* planet-specific */
  .orrery-earth {
    width: 20vw; height: 20vw;
    left: 8%;
    top: 50%;
    margin-top: -10vw;
    --tz: -200px;
    transform: translateZ(-200px);
    animation-delay: 0.2s;
  }
  .orrery-satellite {
    width: 14vw; height: 14vw;
    right: 8%;
    top: 12%;
    --tz: 100px;
    transform: translateZ(100px);
    animation-delay: 0.4s;
  }
  .orrery-moon {
    width: 10vw; height: 10vw;
    right: 15%;
    bottom: 14%;
    --tz: -100px;
    transform: translateZ(-100px);
    animation-delay: 0.6s;
  }
  .orrery-mars {
    width: 15vw; height: 15vw;
    left: 12%;
    bottom: 10%;
    --tz: 50px;
    transform: translateZ(50px);
    animation-delay: 0.8s;
  }

  /* ── Body labels ── */
  .orrery-label {
    position: absolute;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(0, 229, 255, 0.35);
    white-space: nowrap;
    pointer-events: none;
  }
  .orrery-earth .orrery-label  { bottom: -1.6rem; left: 50%; transform: translateX(-50%); }
  .orrery-satellite .orrery-label { bottom: -1.6rem; left: 50%; transform: translateX(-50%); }
  .orrery-moon .orrery-label   { bottom: -1.4rem; left: 50%; transform: translateX(-50%); }
  .orrery-mars .orrery-label   { bottom: -1.6rem; left: 50%; transform: translateX(-50%); }

  /* ── Navbar ── */
  .orrery-nav {
    position: absolute;
    top: 0; left: 0; right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 2.5rem;
    z-index: 20;
    opacity: 0;
    animation: orrery-fade-in 1s ease-out 0.1s forwards;
  }
  .orrery-nav-brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .orrery-nav-brand img {
    height: 28px;
    width: auto;
  }
  .orrery-nav-brand span {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    font-size: 1.1rem;
    letter-spacing: 0.15em;
    color: #ffffff;
  }
  .orrery-signin-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1.25rem;
    border: 1px solid rgba(0, 229, 255, 0.35);
    border-radius: 6px;
    background: rgba(0, 229, 255, 0.06);
    color: #00e5ff;
    font-family: 'Inter', sans-serif;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.25s, border-color 0.25s;
    pointer-events: auto;
  }
  .orrery-signin-btn:hover {
    background: rgba(0, 229, 255, 0.14);
    border-color: rgba(0, 229, 255, 0.6);
  }

  /* ── Hero ── */
  .orrery-hero {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    z-index: 10;
    transform-style: preserve-3d;
    pointer-events: none;
  }
  .orrery-hero-inner {
    transform: translateZ(60px);
    max-width: 680px;
    padding: 0 1.5rem;
    opacity: 0;
    animation: orrery-hero-in 1.4s ease-out 0.5s forwards;
  }
  @keyframes orrery-hero-in {
    from { opacity: 0; transform: translateZ(60px) translateY(30px); }
    to   { opacity: 1; transform: translateZ(60px) translateY(0); }
  }
  .orrery-hero h1 {
    font-size: clamp(1.8rem, 4vw, 3.2rem);
    font-weight: 700;
    line-height: 1.18;
    margin: 0 0 0.5rem;
    color: #ffffff;
  }
  .orrery-hero h1 .accent {
    color: #00e5ff;
  }
  .orrery-hero p {
    font-size: clamp(0.95rem, 1.5vw, 1.15rem);
    color: rgba(224, 230, 240, 0.6);
    margin: 0 0 2rem;
    font-weight: 300;
    line-height: 1.55;
  }

  /* ── CTA button ── */
  .orrery-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 2.2rem;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #00e5ff 0%, #0090b0 100%);
    color: hsl(224 56% 7%);
    font-family: 'Inter', sans-serif;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.2s, box-shadow 0.3s;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.2);
  }
  .orrery-cta:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 0 40px rgba(0, 229, 255, 0.35);
  }
  .orrery-cta svg {
    transition: transform 0.2s;
  }
  .orrery-cta:hover svg {
    transform: translateX(3px);
  }

  /* ── Stats bar ── */
  .orrery-stats {
    position: absolute;
    bottom: 3.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 2rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: rgba(224, 230, 240, 0.4);
    z-index: 10;
    opacity: 0;
    animation: orrery-fade-in 1s ease-out 1.2s forwards;
    white-space: nowrap;
  }
  .orrery-stats-dot {
    width: 3px; height: 3px;
    border-radius: 50%;
    background: rgba(0, 229, 255, 0.4);
    flex-shrink: 0;
  }

  /* ── Footer ── */
  .orrery-footer {
    position: absolute;
    bottom: 0.8rem;
    left: 0; right: 0;
    text-align: center;
    font-size: 0.65rem;
    color: rgba(224, 230, 240, 0.2);
    z-index: 10;
    opacity: 0;
    animation: orrery-fade-in 1s ease-out 1.4s forwards;
  }

  /* ── Shared fade-in ── */
  @keyframes orrery-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Ambient drift for idle state ── */
  @keyframes orrery-ambient-drift {
    0%   { transform: rotateX(0.5deg) rotateY(0.8deg); }
    25%  { transform: rotateX(-0.3deg) rotateY(-0.5deg); }
    50%  { transform: rotateX(0.4deg) rotateY(-0.7deg); }
    75%  { transform: rotateX(-0.5deg) rotateY(0.6deg); }
    100% { transform: rotateX(0.5deg) rotateY(0.8deg); }
  }
`;

export default function Landing8() {
  const navigate = useNavigate();
  const sceneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const mouseTarget = useRef({ rx: 0, ry: 0 });
  const mouseCurrent = useRef({ rx: 0, ry: 0 });
  const hasMouseMoved = useRef(false);

  useEffect(() => {
    const MAX_DEG = 8;
    const LERP_SPEED = 0.06;

    const handleMouseMove = (e: MouseEvent) => {
      hasMouseMoved.current = true;
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;   // -1..1
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;  // -1..1
      mouseTarget.current = {
        rx: -ny * MAX_DEG,  // tilt up when mouse is down
        ry: nx * MAX_DEG,   // rotate right when mouse is right
      };
    };

    let ambientTime = 0;

    const tick = () => {
      if (!sceneRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (hasMouseMoved.current) {
        mouseCurrent.current.rx = lerp(mouseCurrent.current.rx, mouseTarget.current.rx, LERP_SPEED);
        mouseCurrent.current.ry = lerp(mouseCurrent.current.ry, mouseTarget.current.ry, LERP_SPEED);
      } else {
        // Ambient drift when no mouse interaction
        ambientTime += 0.008;
        mouseCurrent.current.rx = Math.sin(ambientTime * 0.7) * 1.2;
        mouseCurrent.current.ry = Math.cos(ambientTime * 0.5) * 1.5;
      }

      sceneRef.current.style.transform =
        `rotateX(${mouseCurrent.current.rx}deg) rotateY(${mouseCurrent.current.ry}deg)`;

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Trigger ring animations after mount
  const ringsRef = useRef<SVGPathElement[]>([]);

  useEffect(() => {
    // Small delay so elements are mounted
    const timer = setTimeout(() => {
      ringsRef.current.forEach((p) => p?.classList.add('ring-animate'));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const addRingRef = (i: number) => (el: SVGPathElement | null) => {
    if (el) ringsRef.current[i] = el;
  };

  return (
    <div className="orrery-root">
      <style>{STYLES}</style>

      {/* Star field */}
      {STARS.map((s, i) => (
        <div
          key={i}
          className="orrery-star"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}

      {/* Navigation */}
      <nav className="orrery-nav">
        <div className="orrery-nav-brand">
          <img src={skylyLogo} alt="Skyly" />
          <span>SKYLY</span>
        </div>
        <button className="orrery-signin-btn" onClick={() => navigate('/login')}>
          Sign In
        </button>
      </nav>

      {/* Perspective container */}
      <div className="orrery-perspective">
        <div className="orrery-scene" ref={sceneRef}>

          {/* Orbital ring SVGs */}
          <div className="orrery-rings-container">
            <svg
              className="orrery-ring-svg"
              width="900" height="500"
              viewBox="0 0 900 500"
              style={{ transform: 'translateZ(-50px) rotateX(60deg)', width: '60vw', height: 'auto' }}
            >
              <ellipse
                cx="450" cy="250" rx="420" ry="180"
                className="orrery-ring-path ring-1"
                ref={addRingRef(0)}
              />
            </svg>
            <svg
              className="orrery-ring-svg"
              width="900" height="500"
              viewBox="0 0 900 500"
              style={{ transform: 'translateZ(-30px) rotateX(55deg) rotateZ(15deg)', width: '72vw', height: 'auto' }}
            >
              <ellipse
                cx="450" cy="250" rx="430" ry="160"
                className="orrery-ring-path ring-2"
                ref={addRingRef(1)}
              />
            </svg>
            <svg
              className="orrery-ring-svg"
              width="900" height="500"
              viewBox="0 0 900 500"
              style={{ transform: 'translateZ(-70px) rotateX(65deg) rotateZ(-10deg)', width: '50vw', height: 'auto' }}
            >
              <ellipse
                cx="450" cy="250" rx="400" ry="200"
                className="orrery-ring-path ring-3"
                ref={addRingRef(2)}
              />
            </svg>
          </div>

          {/* Earth */}
          <div className="orrery-body orrery-earth">
            <img src={earthPng} alt="Earth" />
            <span className="orrery-label">EARTH</span>
          </div>

          {/* Satellite */}
          <div className="orrery-body orrery-satellite">
            <img src={satellitePng} alt="Satellite" />
            <span className="orrery-label">SATELLITE</span>
          </div>

          {/* Moon */}
          <div className="orrery-body orrery-moon">
            <img src={moonPng} alt="Moon" />
            <span className="orrery-label">MOON</span>
          </div>

          {/* Mars */}
          <div className="orrery-body orrery-mars">
            <img src={marsPng} alt="Mars" />
            <span className="orrery-label">MARS</span>
          </div>

          {/* Hero text — in the scene so it rotates too */}
          <div className="orrery-hero">
            <div className="orrery-hero-inner">
              <h1>
                Plan Your Next Data Center<br />
                <span className="accent">Anywhere in the Solar System.</span>
              </h1>
              <p>
                AI-scored site selection across planets, moons, and orbital stations.
                Real terrain data meets predictive analytics.
              </p>
              <button className="orrery-cta" onClick={() => navigate('/login')}>
                <Rocket size={18} />
                Get Started
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Stats bar */}
      <div className="orrery-stats">
        <span>7 Regions</span>
        <span className="orrery-stats-dot" />
        <span>10+ Satellites</span>
        <span className="orrery-stats-dot" />
        <span>4 Bodies</span>
        <span className="orrery-stats-dot" />
        <span>AI Scoring</span>
      </div>

      {/* Footer */}
      <div className="orrery-footer">
        &copy; 2026 Skyly &middot; Orbital Atlas
      </div>
    </div>
  );
}
