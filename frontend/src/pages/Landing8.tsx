import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import * as THREE from 'three';
import skylyLogo from '@/assets/skyly-logo.png';

/* ------------------------------------------------------------------ */
/*  Variant 8 — "Orbital Orrery" (3D)                                  */
/*  Cinematic scene: huge Earth left, animated Sun center, Mars right.  */
/*  Satellites orbit Earth with neon-green blink. Realistic sun light.  */
/* ------------------------------------------------------------------ */

const mouse = { x: 0, y: 0 };

const TEXTURES = {
  earth: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  earthBump: '//unpkg.com/three-globe/example/img/earth-topology.png',
  earthNight: '//unpkg.com/three-globe/example/img/earth-night.jpg',
  sun: '/textures/sun.jpg',
  mars: '/textures/mars.jpg',
  moon: '/textures/moon.jpg',
};

/* ── Preload all assets in module scope so Suspense never remounts ── */
useLoader.preload(THREE.TextureLoader, TEXTURES.earth);
useLoader.preload(THREE.TextureLoader, TEXTURES.earthBump);
useLoader.preload(THREE.TextureLoader, TEXTURES.earthNight);
useLoader.preload(THREE.TextureLoader, TEXTURES.sun);
useLoader.preload(THREE.TextureLoader, TEXTURES.mars);
useLoader.preload(THREE.TextureLoader, TEXTURES.moon);
useGLTF.preload('/models/satellite.glb');

/* ── Rim-light shader for planet edges where light hits ── */
const rimVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const rimFragmentShader = /* glsl */ `
  uniform vec3 uLightPos;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(uLightPos - vWorldPos);
    float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
    rim = pow(rim, uRimPower);
    // Only glow on the lit side
    float lit = max(dot(vNormal, lightDir), 0.0);
    float glow = rim * pow(lit, 0.3);
    gl_FragColor = vec4(uRimColor, glow * 0.6);
  }
`;

/* ── Textured rotating planet with rim light + bump map + optional city lights ── */
function Planet({
  textureUrl,
  bumpUrl,
  bumpScale = 0.04,
  emissiveMapUrl,
  emissiveIntensity = 0,
  radius,
  position,
  rotationSpeed = 0.002,
  tilt = 0,
  atmosphereColor,
  rimColor = '#ffffff',
}: {
  textureUrl: string;
  bumpUrl?: string;
  bumpScale?: number;
  emissiveMapUrl?: string;
  emissiveIntensity?: number;
  radius: number;
  position: [number, number, number];
  rotationSpeed?: number;
  tilt?: number;
  atmosphereColor?: string;
  rimColor?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const texture = useLoader(THREE.TextureLoader, textureUrl);
  const bumpTex = useLoader(THREE.TextureLoader, bumpUrl || textureUrl);
  const emissiveTex = useLoader(THREE.TextureLoader, emissiveMapUrl || textureUrl);

  const rimUniforms = useMemo(() => ({
    uLightPos: { value: new THREE.Vector3(1, 0.3, -6) },
    uRimColor: { value: new THREE.Color(rimColor) },
    uRimPower: { value: 2.5 },
  }), [rimColor]);

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += rotationSpeed;
  });

  return (
    <group position={position} rotation={[tilt, 0, 0]}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshStandardMaterial
          map={texture}
          bumpMap={bumpTex}
          bumpScale={bumpScale}
          roughness={0.75}
          metalness={0.02}
          {...(emissiveMapUrl ? {
            emissiveMap: emissiveTex,
            emissive: new THREE.Color('#ffddaa'),
            emissiveIntensity,
          } : {})}
        />
      </mesh>
      {/* Rim light glow where light meets edge */}
      <mesh>
        <sphereGeometry args={[radius * 1.008, 64, 64]} />
        <shaderMaterial
          uniforms={rimUniforms}
          vertexShader={rimVertexShader}
          fragmentShader={rimFragmentShader}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
        />
      </mesh>
      {atmosphereColor && (
        <mesh>
          <sphereGeometry args={[radius * 1.015, 32, 32]} />
          <meshBasicMaterial color={atmosphereColor} transparent opacity={0.1} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

/* ── Sun — bright core, bloom handles glow ── */
function Sun({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  return (
    <group position={position}>
      <pointLight intensity={350} color="#fff8ee" distance={200} decay={0.8} />
      <pointLight intensity={60} color="#fff0dd" distance={200} decay={0.6} />

      {/* Core — HDR bright sphere, values > 1.0 so only it exceeds bloom threshold */}
      <mesh>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshBasicMaterial color={[3, 2.8, 2.4]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── GLTF Satellite with neon-green blink ── */
function BlinkingSatellite({
  orbitRadius,
  orbitSpeed,
  orbitTilt,
  scale = 0.06,
  startAngle = 0,
  blinkOffset = 0,
}: {
  orbitRadius: number;
  orbitSpeed: number;
  orbitTilt: number;
  scale?: number;
  startAngle?: number;
  blinkOffset?: number;
}) {
  const { scene } = useGLTF('/models/satellite.glb');
  const pivotRef = useRef<THREE.Group>(null!);
  const satRef = useRef<THREE.Group>(null!);
  const lightRef = useRef<THREE.PointLight>(null!);
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  useFrame((state, delta) => {
    if (pivotRef.current) pivotRef.current.rotation.y += orbitSpeed * delta;
    if (satRef.current) satRef.current.rotation.y += 0.3 * delta;
    // Neon green blink: 0.3s on, 1.7s off cycle
    if (lightRef.current) {
      const phase = (state.clock.elapsedTime + blinkOffset) % 2.0;
      lightRef.current.intensity = phase < 0.3 ? 4 : 0;
    }
  });

  return (
    <group rotation={[orbitTilt, 0, 0]}>
      <group ref={pivotRef} rotation={[0, startAngle, 0]}>
        <group ref={satRef} position={[orbitRadius, 0, 0]} scale={scale}>
          <primitive object={clonedScene} />
          {/* Neon green blinking beacon */}
          <pointLight ref={lightRef} color="#00ff66" intensity={4} distance={4} decay={2} />
        </group>
      </group>
    </group>
  );
}

/* ── Orbital ring (thin torus) ── */
function OrbitalRing({
  radius,
  tiltX = 0,
  tiltZ = 0,
  color = '#ffffff',
  opacity = 0.08,
}: {
  radius: number;
  tiltX?: number;
  tiltZ?: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <mesh rotation={[Math.PI / 2 + tiltX, 0, tiltZ]}>
      <torusGeometry args={[radius, 0.006, 16, 128]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

/* ── Parallax layer — each object gets its own parallax factor ── */
function ParallaxLayer({
  factor,
  children,
}: {
  factor: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null!);
  const current = useRef({ x: 0, y: 0 });

  useFrame(() => {
    if (!ref.current) return;
    const tx = -mouse.y * 0.012 * factor;
    const ty = mouse.x * 0.015 * factor;
    current.current.x += (tx - current.current.x) * 0.03;
    current.current.y += (ty - current.current.y) * 0.03;
    ref.current.rotation.x = current.current.x;
    ref.current.rotation.y = current.current.y;
  });

  return <group ref={ref}>{children}</group>;
}

/* ── Scene — depth-based parallax per object ── */
function OrreryScene() {
  return (
    <>
      {/* ── SUN — fixed / barely moves ── */}
      <ParallaxLayer factor={0.15}>
        <Sun position={[1, 0.3, -6]} radius={1.5} />
      </ParallaxLayer>

      {/* ── MARS — far, less parallax ── */}
      <ParallaxLayer factor={0.4}>
        <Planet
          textureUrl={TEXTURES.mars}
          bumpScale={0.05}
          radius={1.8}
          position={[8, -0.3, -3]}
          rotationSpeed={0.0004}
          tilt={0.44}
          atmosphereColor="#e08040"
          rimColor="#ff9060"
        />
      </ParallaxLayer>

      {/* ── MOON — mid distance ── */}
      <ParallaxLayer factor={0.6}>
        <Planet
          textureUrl={TEXTURES.moon}
          bumpScale={0.05}
          radius={0.7}
          position={[-1.5, 3.2, 2]}
          rotationSpeed={0.0002}
          tilt={0.1}
          rimColor="#dddddd"
        />
      </ParallaxLayer>

      {/* ── EARTH + SATELLITES — closest, most parallax ── */}
      <ParallaxLayer factor={1.0}>
        <group position={[-6, -1, 4]}>
          <Planet
            textureUrl={TEXTURES.earth}
            bumpUrl={TEXTURES.earthBump}
            bumpScale={0.06}
            emissiveMapUrl={TEXTURES.earthNight}
            emissiveIntensity={1.5}
            radius={4.5}
            position={[0, 0, 0]}
            rotationSpeed={0.0003}
            tilt={0.41}
            atmosphereColor="#00aaff"
            rimColor="#88ccff"
          />
          <BlinkingSatellite
            orbitRadius={5.4}
            orbitSpeed={0.3}
            orbitTilt={0.35}
            scale={0.05}
            startAngle={0}
            blinkOffset={0}
          />
          <BlinkingSatellite
            orbitRadius={6.2}
            orbitSpeed={-0.2}
            orbitTilt={-0.5}
            scale={0.04}
            startAngle={Math.PI * 0.7}
            blinkOffset={1.0}
          />
          <OrbitalRing radius={5.4} tiltX={-0.35 + Math.PI / 2} color="#00ff66" opacity={0.04} />
          <OrbitalRing radius={6.2} tiltX={0.5 + Math.PI / 2} color="#00ff66" opacity={0.03} />
        </group>
      </ParallaxLayer>
    </>
  );
}

/* ── Camera ── */
function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

/* ── Main component ── */
export default function Landing8() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 100);
    const onMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  const reveal = (delayMs: number) => ({
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0)' : 'translateY(20px)',
    transition: `opacity 900ms ease ${delayMs}ms, transform 900ms cubic-bezier(.16,1,.3,1) ${delayMs}ms`,
  });

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", background: '#000000' }}
    >
      {/* ── 3D Canvas (background) ── */}
      <div className="absolute inset-0">
        <Canvas
          gl={{ antialias: true, alpha: false, toneMapping: THREE.NoToneMapping }}
          dpr={[1, 2]}
          style={{ background: '#000000' }}
        >
          <CameraSetup />
          <ambientLight intensity={0.12} color="#fff0e0" />
          <hemisphereLight args={['#fff5e0', '#1a1820', 0.15]} />
          <Stars radius={100} depth={80} count={3000} factor={2} saturation={0} fade speed={0.3} />

          {/* Scene content in Suspense — EffectComposer stays outside so it never remounts */}
          <Suspense fallback={null}>
            <OrreryScene />
          </Suspense>

          {/* Postprocessing — outside Suspense, NoToneMapping on renderer, ToneMapping as last effect */}
          <EffectComposer
            multisampling={0}
            frameBufferType={THREE.HalfFloatType}
            enableNormalPass={false}
          >
            <Bloom
              luminanceThreshold={0.95}
              luminanceSmoothing={0.2}
              intensity={1.4}
              mipmapBlur={false}
              kernelSize={KernelSize.MEDIUM}
            />
            <ToneMapping />
          </EffectComposer>
        </Canvas>
      </div>

      {/* ── HTML Overlay ── */}

      {/* Nav */}
      <header
        className="relative z-20 flex items-center justify-between px-8 md:px-14 py-4"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 600ms ease 100ms' }}
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

      {/* Hero text — difference blend makes text react to bright/dark areas */}
      <div
        className="relative z-20 max-w-3xl mx-auto px-8 pt-[8vh] md:pt-[12vh] text-center pointer-events-none"
        style={{ ...reveal(200), mixBlendMode: 'difference' }}
      >
        <p
          className="text-[10px] tracking-[0.45em] text-white/40 uppercase mb-4"
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
          <span className="text-white">Anywhere in the Solar System.</span>
        </h1>
        <p className="text-[13px] text-white/30 max-w-md mx-auto leading-relaxed mt-3 mb-6">
          AI-powered site selection across Earth, orbital stations, the Moon, and Mars.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="
            pointer-events-auto
            inline-flex items-center gap-2 px-7 py-3 rounded-lg
            bg-[#00e5ff] text-black font-semibold text-[13px]
            tracking-wide hover:brightness-110 transition-all duration-300
            hover:shadow-[0_0_40px_rgba(0,229,255,0.28)] active:scale-[0.97]
          "
          style={{ mixBlendMode: 'normal' }}
        >
          <Rocket className="w-3.5 h-3.5" />
          Launch Skyly
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats bar */}
      <div
        className="absolute bottom-9 left-0 right-0 z-20"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 900ms ease 1200ms' }}
      >
        <div className="flex justify-center gap-10 md:gap-16">
          {[
            { v: '7', l: 'Regions', c: '#3b82f6' },
            { v: '10+', l: 'Satellites', c: '#00ff66' },
            { v: '4', l: 'Bodies', c: '#f59e0b' },
            { v: 'AI', l: 'Scoring', c: '#ef4444' },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div
                className="text-sm md:text-base font-bold"
                style={{ color: s.c, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {s.v}
              </div>
              <div className="text-[7px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 py-2 px-8 md:px-14 flex items-center justify-between"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 700ms ease 1400ms' }}
      >
        <div className="flex items-center gap-1.5">
          <img src={skylyLogo} alt="" className="w-3.5 h-3.5 rounded" />
          <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
            Skyly Orbital Operations
          </span>
        </div>
        <span
          className="text-[7px] tracking-[0.12em]"
          style={{ color: 'rgba(255,255,255,0.1)', fontFamily: "'JetBrains Mono', monospace" }}
        >
          NASA / POLY PIZZA CC-BY
        </span>
      </div>
    </div>
  );
}
