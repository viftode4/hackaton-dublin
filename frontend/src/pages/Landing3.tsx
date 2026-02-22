import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import WebGLFluidEnhanced from 'webgl-fluid-enhanced';
import skylyLogo from '@/assets/skyly-logo.png';
import heroImage from '@/assets/landing-hero.png';

export default function Landing() {
  const navigate = useNavigate();
  const fluidContainerRef = useRef<HTMLDivElement>(null);
  const fluidRef = useRef<WebGLFluidEnhanced | null>(null);
  const autoSplatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [heroVisible, setHeroVisible] = useState(false);
  const [fluidActive, setFluidActive] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Check prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Entrance: fade hero in over 1.5s, activate fluid at 800ms
  useEffect(() => {
    const heroTimer = setTimeout(() => setHeroVisible(true), 100);
    const fluidTimer = setTimeout(() => setFluidActive(true), 800);
    return () => {
      clearTimeout(heroTimer);
      clearTimeout(fluidTimer);
    };
  }, []);

  // Initialize WebGL fluid simulation
  useEffect(() => {
    if (reducedMotion || !fluidActive || !fluidContainerRef.current) return;

    const container = fluidContainerRef.current;

    try {
      const fluid = new WebGLFluidEnhanced(container);
      fluid.setConfig({
        simResolution: 128,
        dyeResolution: 1024,
        splatRadius: 0.25,
        curl: 30,
        densityDissipation: 0.97,
        velocityDissipation: 0.98,
        pressure: 0.8,
        pressureIterations: 20,
        splatForce: 6000,
        colorful: false,
        colorPalette: ['#00e5ff', '#2dd4bf', '#00b8d4', '#1de9b6', '#00e5ff'],
        bloom: true,
        bloomIterations: 8,
        bloomResolution: 256,
        bloomIntensity: 0.8,
        bloomThreshold: 0.5,
        bloomSoftKnee: 0.7,
        sunrays: true,
        sunraysResolution: 196,
        sunraysWeight: 0.8,
        shading: true,
        hover: true,
        transparent: true,
        brightness: 0.6,
        backgroundColor: '#000000',
      });
      fluid.start();
      fluidRef.current = fluid;

      // Initial auto-splat at center to show it's alive
      setTimeout(() => {
        if (fluidRef.current) {
          const rect = container.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          fluidRef.current.splatAtLocation(cx, cy, 200, -100, '#00e5ff');
          setTimeout(() => {
            fluidRef.current?.splatAtLocation(cx + 50, cy + 30, -150, 200, '#2dd4bf');
          }, 200);
        }
      }, 300);

      // Auto-splats every 3-4s to keep it alive
      autoSplatIntervalRef.current = setInterval(() => {
        if (fluidRef.current) {
          const rect = container.getBoundingClientRect();
          const x = rect.left + Math.random() * rect.width;
          const y = rect.top + Math.random() * rect.height;
          const dx = (Math.random() - 0.5) * 400;
          const dy = (Math.random() - 0.5) * 400;
          const colors = ['#00e5ff', '#2dd4bf', '#00b8d4', '#1de9b6'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          fluidRef.current.splatAtLocation(x, y, dx, dy, color);
        }
      }, 3000 + Math.random() * 1000);
    } catch (err) {
      console.warn('WebGL fluid simulation failed to initialize:', err);
    }

    return () => {
      if (autoSplatIntervalRef.current) {
        clearInterval(autoSplatIntervalRef.current);
        autoSplatIntervalRef.current = null;
      }
      if (fluidRef.current) {
        fluidRef.current.stop();
        fluidRef.current = null;
      }
    };
  }, [fluidActive, reducedMotion]);

  // Track first interaction to hide "INTERACT" hint
  const handleFirstInteraction = useCallback(() => {
    if (!hasInteracted) setHasInteracted(true);
  }, [hasInteracted]);

  return (
    <div
      className="landing-nebula"
      onMouseMove={handleFirstInteraction}
      onTouchStart={handleFirstInteraction}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'hsl(224 56% 7%)',
        cursor: reducedMotion ? 'default' : 'none',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Hero background image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: heroVisible ? 1 : 0,
          transition: 'opacity 1.5s ease-in-out',
        }}
      >
        <img
          src={heroImage}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>

      {/* Dark vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%),
            linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.3) 100%)
          `,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* WebGL Fluid canvas container */}
      {!reducedMotion && (
        <div
          ref={fluidContainerRef}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            mixBlendMode: 'screen',
            opacity: fluidActive ? 1 : 0,
            transition: 'opacity 1s ease-in',
          }}
        />
      )}

      {/* Content layer - whispered over the fluid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Top-left: Skyly logo */}
        <div
          style={{
            position: 'absolute',
            top: '2rem',
            left: '2rem',
            opacity: reducedMotion ? 0.9 : 0.6,
            transition: 'opacity 0.3s',
          }}
        >
          <img
            src={skylyLogo}
            alt="Skyly"
            style={{
              width: '3.5rem',
              height: '3.5rem',
              borderRadius: '0.75rem',
              filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.2))',
            }}
          />
        </div>

        {/* Center tagline */}
        <div
          style={{
            textAlign: 'center',
            opacity: heroVisible ? 1 : 0,
            transition: 'opacity 2s ease-in-out 0.5s',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2rem, 7vw, 6rem)',
              fontWeight: 200,
              color: `rgba(255, 255, 255, ${reducedMotion ? 0.9 : 0.5})`,
              letterSpacing: '0.3em',
              lineHeight: 1.1,
              margin: 0,
              textTransform: 'uppercase',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Plan Your Next
            <br />
            Data Center
          </h1>
          <p
            style={{
              fontSize: 'clamp(0.75rem, 2vw, 1.5rem)',
              fontWeight: 300,
              color: `rgba(255, 255, 255, ${reducedMotion ? 0.7 : 0.4})`,
              letterSpacing: '0.15em',
              marginTop: '1.5rem',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            &mdash; ANYWHERE IN THE SOLAR SYSTEM.
          </p>
        </div>

        {/* Bottom CTA button */}
        <div
          style={{
            position: 'absolute',
            bottom: '5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: heroVisible ? 1 : 0,
            transition: 'opacity 2s ease-in-out 1s',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => navigate('/login')}
            onMouseEnter={(e) => {
              e.currentTarget.style.cursor = 'pointer';
              e.currentTarget.style.background = 'rgba(0, 229, 255, 0.12)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 229, 255, 0.4), 0 0 60px rgba(0, 229, 255, 0.15), inset 0 0 20px rgba(0, 229, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 229, 255, 0.05)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 229, 255, 0.25), 0 0 40px rgba(0, 229, 255, 0.08)';
            }}
            style={{
              background: 'rgba(0, 229, 255, 0.05)',
              border: '1px solid rgba(0, 229, 255, 0.6)',
              color: '#00e5ff',
              padding: '0.9rem 2.8rem',
              fontSize: '0.85rem',
              fontWeight: 500,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              fontFamily: "'Inter', sans-serif",
              borderRadius: '2px',
              cursor: 'pointer',
              transition: 'all 0.4s ease',
              boxShadow: '0 0 20px rgba(0, 229, 255, 0.25), 0 0 40px rgba(0, 229, 255, 0.08)',
              position: 'relative',
            }}
          >
            LAUNCH SKYLY
          </button>
        </div>

        {/* "INTERACT" hint - fades after first mouse move */}
        {!reducedMotion && (
          <div
            style={{
              position: 'absolute',
              bottom: '1.5rem',
              left: '50%',
              transform: 'translateX(-50%)',
              opacity: hasInteracted ? 0 : 0.35,
              transition: 'opacity 1.2s ease-out',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 300,
                letterSpacing: '0.35em',
                color: 'rgba(255, 255, 255, 0.5)',
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: 'uppercase',
              }}
            >
              interact
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
