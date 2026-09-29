import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  particleVertexShader,
  particleFragmentShader,
} from '../../shaders/particleShaders';

/**
 * Equirectangular black/white world map. For production, self-host one
 * (e.g. /public/textures/world-mask.png) and pass it via `maskUrl`.
 * Polarity is auto-detected (land is always the minority colour), so black-on-white
 * or white-on-black masks both work.
 */
const DEFAULT_MASK_URL = '/textures/world-mask.png';

const MASK_W = 1024;
const MASK_H = 512;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TWO_PI = Math.PI * 2;

/* -------------------------------------------------------------------------- */
/* Land mask                                                                  */
/* -------------------------------------------------------------------------- */

/** Rough procedural continents, used only if the mask image can't be loaded. */
function buildProceduralMask() {
  const land = new Uint8Array(MASK_W * MASK_H);
  for (let y = 0; y < MASK_H; y++) {
    const lat = (0.5 - (y + 0.5) / MASK_H) * Math.PI;
    for (let x = 0; x < MASK_W; x++) {
      const lon = ((x + 0.5) / MASK_W - 0.5) * TWO_PI;
      const v =
        Math.sin(lon * 1.7 + 0.6) * Math.cos(lat * 2.1) +
        0.6 * Math.sin(lon * 3.9 - lat * 2.7 + 1.3) +
        0.4 * Math.cos(lon * 6.1 + lat * 4.3);
      land[y * MASK_W + x] = v > 0.55 ? 1 : 0;
    }
  }
  return { width: MASK_W, height: MASK_H, land };
}

function loadLandMask(url) {
  return new Promise((resolve) => {
    const fallback = (reason) => {
      console.warn(`[IonicParticleGlobe] Using procedural land mask (${reason}).`);
      resolve(buildProceduralMask());
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => fallback('mask image failed to load');
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = MASK_W;
        canvas.height = MASK_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, MASK_W, MASK_H);
        const { data } = ctx.getImageData(0, 0, MASK_W, MASK_H);

        const land = new Uint8Array(MASK_W * MASK_H);
        let bright = 0;
        for (let i = 0; i < land.length; i++) {
          const lum =
            0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
          land[i] = lum > 127 ? 1 : 0;
          bright += land[i];
        }
        // Earth is ~29% land: if more than half the pixels are white, white means ocean.
        if (bright / land.length > 0.5) {
          for (let i = 0; i < land.length; i++) land[i] ^= 1;
        }
        resolve({ width: MASK_W, height: MASK_H, land });
      } catch (err) {
        fallback(err.message);
      }
    };
    img.src = url;
  });
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Unit-sphere Fibonacci point i of n (y-up). */
function fibonacciPoint(i, n, out) {
  const y = 1 - (2 * (i + 0.5)) / n;
  const r = Math.sqrt(1 - y * y);
  const theta = i * GOLDEN_ANGLE;
  out.x = Math.cos(theta) * r;
  out.y = y;
  out.z = Math.sin(theta) * r;
}

/**
 * Longitude/latitude -> mask lookup.
 * Uses the same convention as THREE.SphereGeometry, so u = 0.5 (lon 0) sits on +X.
 */
function isLand(mask, x, y, z) {
  const lon = Math.atan2(-z, x);
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  const u = lon / TWO_PI + 0.5;
  const v = 0.5 - lat / Math.PI;
  const px = Math.min(mask.width - 1, Math.floor(u * mask.width));
  const py = Math.min(mask.height - 1, Math.floor(v * mask.height));
  return mask.land[py * mask.width + px] === 1;
}

/**
 * Oversamples a Fibonacci sphere, keeps (nearly) all land candidates and only a
 * fraction of ocean candidates, so continents end up several times denser than oceans
 * while the total stays near `count`.
 */
function buildGlobeGeometry(mask, { radius, count }) {
  const candidates = Math.round(count * 2.6);
  const p = { x: 0, y: 0, z: 0 };

  let landTotal = 0;
  for (let i = 0; i < candidates; i++) {
    fibonacciPoint(i, candidates, p);
    if (isLand(mask, p.x, p.y, p.z)) landTotal++;
  }
  const oceanTotal = candidates - landTotal;

  const landKeep = Math.min(1, (count * 0.9) / Math.max(1, landTotal));
  const oceanKeep = Math.max(
    0.03,
    Math.min(1, (count - landTotal * landKeep) / Math.max(1, oceanTotal)),
  );

  const rand = mulberry32(1337);
  const position = new Float32Array(candidates * 3);
  const aLand = new Float32Array(candidates);
  const aRandom = new Float32Array(candidates);
  const aSize = new Float32Array(candidates);

  let n = 0;
  for (let i = 0; i < candidates; i++) {
    fibonacciPoint(i, candidates, p);
    const land = isLand(mask, p.x, p.y, p.z);
    const keep = rand() < (land ? landKeep : oceanKeep);
    const r = rand();
    if (!keep) continue;

    position[n * 3] = p.x * radius;
    position[n * 3 + 1] = p.y * radius;
    position[n * 3 + 2] = p.z * radius;
    aLand[n] = land ? 1 : 0;
    aRandom[n] = r;
    aSize[n] = land ? 1.0 + 0.5 * r : 0.65 + 0.35 * r;
    n++;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.slice(0, n * 3), 3));
  geometry.setAttribute('aLand', new THREE.BufferAttribute(aLand.slice(0, n), 1));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandom.slice(0, n), 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(aSize.slice(0, n), 1));
  // Particles get displaced on the GPU, so give culling a generous bound.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius + 4);
  return geometry;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function IonicParticleGlobe({
  radius,
  particleCount,
  mouseRadius,
  pushStrength,
  spinSpeed,
  baseSize,
  maskUrl,
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const [mask, setMask] = useState(null);
  useEffect(() => {
    let alive = true;
    loadLandMask(maskUrl).then((m) => alive && setMask(m));
    return () => {
      alive = false;
    };
  }, [maskUrl]);

  const geometry = useMemo(
    () => (mask ? buildGlobeGeometry(mask, { radius, count: particleCount }) : null),
    [mask, radius, particleCount],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uBaseSize: { value: 2.4 },
      uSpin: { value: 0.06 },
      uStartAngle: { value: -(Math.PI / 2 + THREE.MathUtils.degToRad(20)) }, // Africa faces camera
      uTilt: { value: 0.22 },
      uMouse: { value: new THREE.Vector3(0, 0, 100) },
      uRadius: { value: 2.5 },
      uPush: { value: 2.6 },
      uStrength: { value: 0 },
      uColorOcean: { value: new THREE.Color('#00f0ff') },
      uColorLand: { value: new THREE.Color('#9be8ff') },
      uColorCore: { value: new THREE.Color('#e8fbff') },
    }),
    [],
  );

  /* ---- pointer tracking (window-level, so overlay UI never blocks it) ---- */
  const pointer = useRef({ ndc: new THREE.Vector2(), active: false });
  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointer.current.ndc.set(x, y);
      pointer.current.active = Math.abs(x) <= 1 && Math.abs(y) <= 1;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    const onUp = (e) => {
      if (e.pointerType === 'touch') onLeave();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('blur', onLeave);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onLeave);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [gl]);

  /* ---- per-frame: no allocations ---- */
  const scratch = useMemo(
    () => ({
      raycaster: new THREE.Raycaster(),
      closest: new THREE.Vector3(),
      target: new THREE.Vector3(),
      toCenter: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const u = uniforms;

    u.uTime.value += dt;
    u.uPixelRatio.value = state.gl.getPixelRatio();
    u.uBaseSize.value = baseSize;
    u.uSpin.value = spinSpeed;
    u.uRadius.value = mouseRadius;
    u.uPush.value = pushStrength;

    // Cursor -> point on the globe (analytic ray/sphere, no mesh needed).
    const { raycaster, closest, target, toCenter } = scratch;
    raycaster.setFromCamera(pointer.current.ndc, camera);
    const { origin, direction } = raycaster.ray;

    toCenter.copy(origin).multiplyScalar(-1);
    const t = toCenter.dot(direction);
    closest.copy(direction).multiplyScalar(t).add(origin);
    const dist = closest.length();

    if (dist <= radius) {
      const tHit = t - Math.sqrt(radius * radius - dist * dist);
      target.copy(direction).multiplyScalar(tHit).add(origin);
    } else {
      target.copy(closest).setLength(radius); // cursor just outside the limb: clamp to the silhouette
    }

    const near = pointer.current.active && dist < radius + mouseRadius * 0.6;

    // Ease strength and position; particles glide home because the field simply fades out.
    if (u.uStrength.value < 0.01) u.uMouse.value.copy(target);
    else u.uMouse.value.lerp(target, 1 - Math.exp(-dt * 9));
    u.uStrength.value += ((near ? 1 : 0) - u.uStrength.value) * (1 - Math.exp(-dt * 3.5));
  });

  if (!geometry) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={particleVertexShader}
        fragmentShader={particleFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

IonicParticleGlobe.propTypes = {
  /** Globe radius in world units. */
  radius: PropTypes.number,
  /** Target particle count (8,000 - 12,000 recommended). */
  particleCount: PropTypes.number,
  /** Cursor dispersion radius in world units. */
  mouseRadius: PropTypes.number,
  /** Max outward displacement of dispersed particles. */
  pushStrength: PropTypes.number,
  /** Y-axis spin in radians per second. */
  spinSpeed: PropTypes.number,
  /** Base point size multiplier. */
  baseSize: PropTypes.number,
  /** Equirectangular black/white world map (CORS-enabled URL or same-origin path). */
  maskUrl: PropTypes.string,
};

IonicParticleGlobe.defaultProps = {
  radius: 4,
  particleCount: 11000,
  mouseRadius: 2.5,
  pushStrength: 2.6,
  spinSpeed: 0.06,
  baseSize: 2.4,
  maskUrl: DEFAULT_MASK_URL,
};
