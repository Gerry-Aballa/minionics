/**
 * GLSL for <IonicParticleGlobe />.
 *
 * All motion happens on the GPU:
 *  - The globe spin + tilt is applied in the vertex shader (the Points object itself never rotates),
 *    so the mouse position stays in stable *world* space and can be compared directly per-vertex.
 *  - Particles inside `uRadius` of `uMouse` are pushed outward along their surface normal.
 *  - The push is a pure function of (distance to the smoothed mouse, uStrength). The JS side eases both
 *    uMouse and uStrength, so particles glide back to their grid positions with no per-particle CPU work.
 *
 * Custom attributes (see buildGlobeGeometry): aLand, aRandom, aSize.
 */

export const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;
  uniform float uSpin;        // radians / second
  uniform float uStartAngle;  // initial Y rotation (puts Africa facing the camera)
  uniform float uTilt;        // constant axial tilt (radians)
  uniform vec3  uMouse;       // smoothed cursor point on the globe, world space
  uniform float uRadius;      // dispersion radius (world units)
  uniform float uPush;        // max outward displacement (world units)
  uniform float uStrength;    // 0..1 eased "cursor is active" factor

  attribute float aLand;      // 1 = continent, 0 = ocean
  attribute float aRandom;    // stable per-particle random 0..1
  attribute float aSize;      // per-particle size multiplier

  varying float vLand;
  varying float vAlpha;
  varying float vRim;

  mat3 rotY(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(c, 0.0, -s,  0.0, 1.0, 0.0,  s, 0.0, c);
  }

  mat3 rotX(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
  }

  void main() {
    // --- globe rotation (Y spin, then fixed tilt) --------------------------
    float angle = uStartAngle + uTime * uSpin;
    vec3 world = rotX(uTilt) * rotY(angle) * position;
    vec3 n = normalize(world);

    // --- cursor force-field ------------------------------------------------
    float reach = uRadius * (0.85 + 0.3 * aRandom);           // ragged edge, not a hard circle
    float d = distance(world, uMouse);
    float field = 1.0 - smoothstep(reach * 0.12, reach, d);   // 1 under the cursor -> 0 at the rim
    field *= uStrength;

    float push = uPush * (0.55 + 0.9 * aRandom);
    world += n * field * push;

    // a little sideways drift so the scatter reads as dispersal, not a bump
    vec3 tangent = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + 1e-4);
    world += tangent * field * (aRandom - 0.5) * 0.9;

    // idle shimmer
    world += n * 0.03 * (1.0 + aLand) * sin(uTime * 1.6 + aRandom * 40.0);

    // --- view-dependent shading -------------------------------------------
    vec3 viewDir = normalize(cameraPosition - world);
    float facing = dot(n, viewDir);
    vAlpha = mix(0.22, 1.0, smoothstep(-0.15, 0.35, facing)) * (1.0 - 0.45 * field);
    vRim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.0);
    vLand = aLand;

    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = aSize * uBaseSize * uPixelRatio * (10.0 / -mv.z);
    gl_PointSize = size * (1.0 + field * 0.8);
  }
`;

export const particleFragmentShader = /* glsl */ `
  uniform vec3 uColorOcean;
  uniform vec3 uColorLand;
  uniform vec3 uColorCore;

  varying float vLand;
  varying float vAlpha;
  varying float vRim;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;

    float soft = smoothstep(0.5, 0.0, d);
    float glow = pow(soft, 2.2);

    vec3 base = mix(uColorOcean, uColorLand, vLand);
    vec3 color = mix(base, uColorCore, pow(soft, 4.0) * (0.35 + 0.65 * vLand));
    color += uColorOcean * vRim * 0.6;
    color *= 0.7 + 0.9 * vLand;                 // continents sit above the bloom threshold, oceans hover near it

    float alpha = glow * vAlpha * mix(0.55, 1.0, vLand);
    gl_FragColor = vec4(color, alpha);
  }
`;
