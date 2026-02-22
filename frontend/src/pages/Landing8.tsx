import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping } from '@react-three/postprocessing';
import { KernelSize, ToneMappingMode } from 'postprocessing';
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

/* ── Sun surface shader — animated FBM noise, white-yellow gradient ── */
const sunVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const sunFrag = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vPos;

  float hash(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.zxy, p.yxz + 19.19);
    return fract(p.x * p.y * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for(int i=0; i<5; i++) { v += a*noise(p); p *= 2.1; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 p = vPos * 1.4 + uTime * vec3(0.08, 0.05, 0.03);
    float n = fbm(p);
    float n2 = fbm(p * 0.6 + vec3(5.2, 1.3, 0.0) + uTime * 0.04);
    float pattern = n * 0.65 + n2 * 0.35;
    // Sharpen contrast so transitions are crisp, not muddy
    pattern = smoothstep(0.2, 0.8, pattern);

    vec3 colA = vec3(1.8, 1.0, 0.1); // deep yellow-orange
    vec3 colB = vec3(2.2, 2.0, 1.8); // bright white

    vec3 col = mix(colA, colB, pattern);

    gl_FragColor = vec4(col, 1.0);
  }
`;

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

/* ── Sun — animated gradient surface, bloom glow ── */
function Sun({
  position,
  radius,
}: {
  position: [number, number, number];
  radius: number;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((_, delta) => {
    if (matRef.current) matRef.current.uniforms.uTime.value += delta;
  });

  return (
    <group position={position}>
      <pointLight intensity={350} color="#fff8ee" distance={200} decay={0.8} />
      <pointLight intensity={60} color="#fff0dd" distance={200} decay={0.6} />

      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={sunVert}
          fragmentShader={sunFrag}
          toneMapped={false}
        />
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
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    // Dim all materials so they stay below the bloom luminance threshold
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          const mat = m as THREE.MeshStandardMaterial;
          mat.toneMapped = true;
          mat.emissiveIntensity = 0;
          mat.color.multiplyScalar(0.25);
          mat.roughness = 0.9;
          mat.metalness = 0.1;
        });
      }
    });
    return clone;
  }, [scene]);

  useFrame((state, delta) => {
    if (pivotRef.current) pivotRef.current.rotation.y += orbitSpeed * delta;
    if (satRef.current) satRef.current.rotation.y += 0.3 * delta;
    // Neon green blink: 0.3s on, 1.7s off cycle
    if (lightRef.current) {
      const phase = (state.clock.elapsedTime + blinkOffset) % 2.0;
      lightRef.current.intensity = phase < 0.3 ? 0.8 : 0;
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
          {/* Low orbit — very close to surface */}
          <BlinkingSatellite orbitRadius={4.65} orbitSpeed={0.22}  orbitTilt={0.2}   scale={0.015} startAngle={0}              blinkOffset={0}   />
          <BlinkingSatellite orbitRadius={4.72} orbitSpeed={-0.18} orbitTilt={-0.6}  scale={0.013} startAngle={Math.PI * 1.1}  blinkOffset={1.1} />
          <BlinkingSatellite orbitRadius={4.8}  orbitSpeed={0.2}   orbitTilt={1.0}   scale={0.014} startAngle={Math.PI * 0.4}  blinkOffset={0.6} />
          {/* Mid orbit */}
          <BlinkingSatellite orbitRadius={5.2}  orbitSpeed={0.14}  orbitTilt={0.35}  scale={0.025} startAngle={0}              blinkOffset={0.3} />
          <BlinkingSatellite orbitRadius={5.8}  orbitSpeed={-0.10} orbitTilt={-0.5}  scale={0.02}  startAngle={Math.PI * 0.7}  blinkOffset={0.8} />
          <BlinkingSatellite orbitRadius={5.5}  orbitSpeed={-0.12} orbitTilt={-0.2}  scale={0.018} startAngle={Math.PI * 0.3}  blinkOffset={0.4} />
          {/* High orbit */}
          <BlinkingSatellite orbitRadius={6.4}  orbitSpeed={0.08}  orbitTilt={0.8}   scale={0.022} startAngle={Math.PI * 1.3}  blinkOffset={1.5} />
          <BlinkingSatellite orbitRadius={7.0}  orbitSpeed={0.06}  orbitTilt={1.1}   scale={0.02}  startAngle={Math.PI * 1.8}  blinkOffset={1.2} />
          <BlinkingSatellite orbitRadius={6.0}  orbitSpeed={-0.09} orbitTilt={-0.7}  scale={0.023} startAngle={Math.PI * 0.5}  blinkOffset={1.9} />
          <OrbitalRing radius={4.68} tiltX={-0.2 + Math.PI / 2}  color="#00ff66" opacity={0.025} />
          <OrbitalRing radius={4.8}  tiltX={-1.0 + Math.PI / 2}  color="#00ff66" opacity={0.02} />
          <OrbitalRing radius={5.2}  tiltX={-0.35 + Math.PI / 2} color="#00ff66" opacity={0.02} />
          <OrbitalRing radius={5.8}  tiltX={0.5  + Math.PI / 2}  color="#00ff66" opacity={0.015} />
          <OrbitalRing radius={6.4}  tiltX={-0.8 + Math.PI / 2}  color="#00ff66" opacity={0.015} />
          <OrbitalRing radius={7.0}  tiltX={-1.1 + Math.PI / 2}  color="#00ff66" opacity={0.01} />
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
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* ── HTML Overlay ── */}

      {/* Nav */}
      <header
        className="relative z-20 flex items-center justify-between px-10 md:px-16 py-5"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 600ms ease 100ms' }}
      >
        <div className="flex items-center gap-3">
          <img src={skylyLogo} alt="Skyly" className="w-7 h-7 rounded-md opacity-90" />
          <span
            className="text-[11px] font-medium tracking-[0.3em] text-white/60 uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Skyly
          </span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="text-[10px] text-white/25 hover:text-white/60 transition-colors tracking-[0.25em] uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Sign In
        </button>
      </header>

      {/* Hero — shifted right to clear Earth */}
      <div
        className="absolute z-20 right-[5vw] top-1/2 -translate-y-1/2 text-right pointer-events-none"
        style={{ ...reveal(200), maxWidth: '52vw' }}
      >
        <p
          className="text-[9px] tracking-[0.5em] text-white/30 uppercase mb-5"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          Orbital Infrastructure Platform
        </p>
        <h1
          className="font-black text-white uppercase leading-[0.95] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(2.8rem, 5.5vw, 5rem)' }}
        >
          Plan Your<br />Data Center<br />
          <span className="text-white/50">Anywhere.</span>
        </h1>
      </div>

      {/* CTA — bottom center */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 900ms ease 800ms' }}
      >
        <button
          onClick={() => navigate('/login')}
          className="group flex items-center gap-3 text-white/50 hover:text-white transition-colors duration-300"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <span className="text-[10px] tracking-[0.4em] uppercase">Launch Skyly</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform duration-300" />
        </button>
        <div className="mt-1.5 h-px bg-white/10 w-full" />
      </div>

      {/* Stats — bottom right, monochrome */}
      <div
        className="absolute bottom-8 right-10 md:right-16 z-20 flex gap-8 md:gap-12"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 900ms ease 1200ms' }}
      >
        {[
          { v: '7', l: 'Regions' },
          { v: '9+', l: 'Satellites' },
          { v: '4', l: 'Bodies' },
          { v: 'AI', l: 'Scoring' },
        ].map((s) => (
          <div key={s.l} className="text-right">
            <div
              className="text-base font-bold text-white/70"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {s.v}
            </div>
            <div className="text-[7px] tracking-[0.22em] uppercase text-white/20"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {s.l}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 py-2 px-10 md:px-16 flex items-center justify-between"
        style={{ opacity: show ? 1 : 0, transition: 'opacity 700ms ease 1400ms' }}
      >
        <div className="flex items-center gap-1.5">
          <img src={skylyLogo} alt="" className="w-3 h-3 rounded opacity-30" />
          <span className="text-[7px] text-white/15" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Skyly Orbital Operations
          </span>
        </div>
        <span className="text-[7px] tracking-[0.12em] text-white/10" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          NASA / POLY PIZZA CC-BY
        </span>
      </div>
    </div>
  );
}
