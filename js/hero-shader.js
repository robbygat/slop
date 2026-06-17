// Reusable interactive shader surface (vanilla Three.js).
//
// A port of the React Three Fiber "shader card" spec, recolored to SLOP.game's
// palette: a 7-stop vertical gradient with domain-warped waves, a simplex-noise
// layer, an overlay-blended grain, and click ripples. Used full-bleed behind the
// homepage games section and, via mountShader(), behind "cool" surfaces in Slop Studio —
// where setThinking(true) intensifies and speeds up the motion while the agent
// works. Degrades gracefully: a CSS gradient fallback shows if WebGL/Three.js
// is unavailable.

import * as THREE from 'three';

// 8 stops, top → bottom — cream through mint green into ink.
const PALETTE = [
  [0xFF, 0xFB, 0xF0], // cream       #FFFBF0
  [0xFF, 0xE1, 0x35], // yellow      #FFE135
  [0x3D, 0xFF, 0xB0], // mint green  #3DFFB0
  [0xFF, 0x7A, 0x35], // orange      #FF7A35
  [0xFF, 0x4E, 0xB8], // hot pink    #FF4EB8
  [0x4E, 0xCA, 0xFF], // sky         #4ECAFF
  [0x2B, 0x6B, 0xFF], // electric    #2B6BFF
  [0x11, 0x12, 0x1A], // ink         #11121A
].map(([r, g, b]) => new THREE.Color(r / 255, g / 255, b / 255));

const MAX_RIPPLES = 10;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0); // fullscreen clip-space quad
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAspect;
  uniform float uBoost;          // 0 idle → 1 "thinking": faster, louder, brighter
  uniform vec3  uColors[8];
  uniform float uGrainIntensity, uGrainSpeed, uGrainMean, uGrainVariance;
  uniform float uWaveIntensity, uNoiseIntensity, uNoiseScale, uNoiseSpeed;
  uniform vec2  uRipplePos[10];
  uniform float uRippleTime[10];
  uniform int   uRippleCount;

  varying vec2 vUv;

  // ---- Ashima / Gustavson 3D simplex noise -----------------------------------
  vec4 permute(vec4 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0);
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
               i.z + vec4(0.0, i1.z, i2.z, 1.0))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0))
             + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // 8-stop vertical gradient (smooth segment blends).
  vec3 gradient(float t){
    t = clamp(t, 0.0, 1.0);
    vec3 c = uColors[0];
    c = mix(c, uColors[1], smoothstep(0.0,     1.0/7.0, t));
    c = mix(c, uColors[2], smoothstep(1.0/7.0, 2.0/7.0, t));
    c = mix(c, uColors[3], smoothstep(2.0/7.0, 3.0/7.0, t));
    c = mix(c, uColors[4], smoothstep(3.0/7.0, 4.0/7.0, t));
    c = mix(c, uColors[5], smoothstep(4.0/7.0, 5.0/7.0, t));
    c = mix(c, uColors[6], smoothstep(5.0/7.0, 6.0/7.0, t));
    c = mix(c, uColors[7], smoothstep(6.0/7.0, 1.0,     t));
    return c;
  }

  // Multi-layer wave field — faster, deeper, with a slow counter-rotating layer.
  float waveField(vec2 uv, float t){
    float w  = snoise(vec3(uv * 0.55,         t * 0.34));
          w += snoise(vec3(uv * 0.95 + 11.0,  t * 0.28)) * 0.75;
          w += snoise(vec3(uv * 1.45 + 23.0,  t * 0.42)) * 0.55;
          w += snoise(vec3(uv * 2.1  + 37.0,  t * 0.22)) * 0.35;
    return w / 2.65;
  }

  // Drifting aurora blob — pushes bright mint through the field.
  float auroraField(vec2 uv, float t){
    vec2 drift = vec2(sin(t * 0.27), cos(t * 0.31)) * 0.18;
    float a = snoise(vec3(uv * 1.6 + drift, t * 0.38));
    a += snoise(vec3(uv * 2.8 - drift.yx, t * 0.44)) * 0.55;
    return smoothstep(-0.05, 0.72, a);
  }

  float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
  float grain(vec2 uv, float t){
    float seed = rand(uv + floor(t * uGrainSpeed * 30.0) * 0.013);
    return uGrainMean + (seed - 0.5) * uGrainVariance;
  }
  vec3 overlayBlend(vec3 base, float g){
    vec3 b  = vec3(0.5 + g);
    vec3 lo = 2.0 * base * b;
    vec3 hi = 1.0 - 2.0 * (1.0 - base) * (1.0 - b);
    return mix(lo, hi, step(0.5, base));
  }

  // A clean expanding ring per click, with a soft halo, fading over 2s.
  vec3 applyRipples(vec3 col, vec2 p){
    for (int i = 0; i < 10; i++){
      if (i >= uRippleCount) break;
      float age = uTime - uRippleTime[i];
      if (age < 0.0 || age > 2.0) continue;
      vec2 rp = uRipplePos[i];
      rp.x *= uAspect;
      float d      = distance(p, rp);
      float radius = age * 1.0;                              // expansion speed 1.0/s
      float ring   = smoothstep(0.07, 0.0, abs(d - radius)); // crisp ring
      float halo   = smoothstep(0.35, 0.0, abs(d - radius)); // soft glow around it
      float wob    = 0.5 + 0.5 * sin(d * 15.0 - uTime * 8.0);
      float fade   = 1.0 - age * 0.5;                        // fade over 2s
      col = mix(col, vec3(1.0), (ring * wob * 0.6 + halo * 0.14) * fade);
    }
    return col;
  }

  void main(){
    vec2 uv = vUv;
    float boost = uBoost;
    float t = uTime;

    // Domain warp — liquid, flowing coordinate space.
    vec2 warp1 = vec2(
      snoise(vec3(uv * 1.7 + 0.0, t * 0.26)),
      snoise(vec3(uv * 1.7 + 5.2, t * 0.23))
    );
    vec2 warp2 = vec2(
      snoise(vec3(uv * 3.2 + 9.0, t * 0.19)),
      snoise(vec3(uv * 3.2 + 14.0, t * 0.21))
    ) * 0.45;
    vec2 wuv = uv + (warp1 + warp2) * 0.11 * (1.0 + boost * 0.8);

    // Slow swirl around center — aurora vortex feel.
    vec2 centered = wuv - 0.5;
    float dist = length(centered);
    float angle = atan(centered.y, centered.x) + t * 0.14 + dist * 2.4;
    vec2 swirl = vec2(cos(angle), sin(angle)) * dist * 0.06 * sin(t * 0.55 + dist * 4.0);
    wuv += swirl;

    float arch    = -pow(wuv.x - 0.5, 2.0) * 0.55;
    float breathe = sin(t * 0.62) * 0.05 + sin(t * 1.1 + wuv.x * 3.0) * 0.018;
    float waveAmt = uWaveIntensity  * (1.0 + boost * 1.4);
    float noizAmt = uNoiseIntensity * (1.0 + boost * 1.0);

    // Counter-rotating wave sampling for extra motion.
    float rotA = t * 0.11;
    float rotB = -t * 0.08;
    mat2 rotMatA = mat2(cos(rotA), -sin(rotA), sin(rotA), cos(rotA));
    mat2 rotMatB = mat2(cos(rotB), -sin(rotB), sin(rotB), cos(rotB));
    vec2 ruvA = (wuv - 0.5) * rotMatA + 0.5;
    vec2 ruvB = (wuv - 0.5) * rotMatB + 0.5;

    float waves   = waveField(ruvA * uNoiseScale, t) * 0.11 * waveAmt;
          waves  += waveField(ruvB * uNoiseScale * 1.3 + 3.0, t * 1.15) * 0.05 * waveAmt;
    float n       = snoise(vec3(wuv * uNoiseScale * 1.2, t * uNoiseSpeed * (1.0 + boost * 2.0))) * 0.06 * noizAmt;
    float ribbon  = sin(wuv.x * 9.0 + t * 0.9 + waveField(wuv, t) * 2.5) * 0.022 * waveAmt;

    float gy = (1.0 - wuv.y) + arch + breathe + waves + n + ribbon;
    vec3 col = gradient(gy);

    // Bright mint aurora blooms — the green punch.
    float aurora = auroraField(wuv, t);
    vec3 mint = uColors[2];
    col = mix(col, mint, aurora * 0.42);
    col += mint * aurora * 0.18 * (0.65 + 0.35 * sin(t * 1.4 + dist * 6.0));

    // Grain (overlay blend).
    col = mix(col, overlayBlend(col, grain(uv, t)), uGrainIntensity);

    // Subtle shimmer pulse.
    col += 0.04 * (0.5 + 0.5 * sin(t * 1.8 + wuv.x * 5.0 + wuv.y * 4.0)) * (1.0 + boost * 0.6);

    // Brightness pulse while "thinking".
    col += boost * 0.07 * (0.5 + 0.5 * sin(t * 3.0));

    // Ripples in aspect-corrected -1..1 space.
    vec2 p = uv * 2.0 - 1.0;
    p.x *= uAspect;
    col = applyRipples(col, p);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Mount the shader onto `el` (its canvas fills the element via CSS).
 * @param {HTMLElement} el
 * @param {{ interactionEl?: HTMLElement, ripples?: boolean }} [opts]
 * @returns {{ setThinking:(b:boolean)=>void, resize:()=>void, destroy:()=>void } | null}
 */
export function mountShader(el, opts = {}) {
  if (!el) return null;
  const { interactionEl = el, ripples = true } = opts;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const dprCap = reduce ? 1 : coarse ? 1.25 : 1.5;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    return null; // CSS gradient fallback stays in place
  }
  renderer.setClearColor(0xf9f9f9, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  el.appendChild(renderer.domElement);
  el.classList.add('shader-live');

  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 4 / 3 },
    uBoost: { value: 0 },
    uColors: { value: PALETTE },
    uGrainIntensity: { value: 0.075 },
    uGrainSpeed: { value: 2.6 },
    uGrainMean: { value: 0.0 },
    uGrainVariance: { value: 0.5 },
    uWaveIntensity: { value: 1.75 },
    uNoiseIntensity: { value: 1.9 },
    uNoiseScale: { value: 2.1 },
    uNoiseSpeed: { value: 0.24 },
    uRipplePos: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector2()) },
    uRippleTime: { value: new Array(MAX_RIPPLES).fill(-100) },
    uRippleCount: { value: 0 },
  };

  const scene = new THREE.Scene();
  const camera = new THREE.Camera(); // vertex shader writes clip-space directly
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  scene.add(new THREE.Mesh(geometry, material));

  function resize() {
    const r = el.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false); // keep CSS sizing; only update the drawing buffer
    uniforms.uAspect.value = w / h;
  }
  resize();

  // ---- click ripples (normalized to shader space, synced to shader time) -----
  const list = []; // { x, y, t }
  function addRipple(clientX, clientY) {
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1;
    const y = -(((clientY - r.top) / r.height) * 2 - 1);
    list.push({ x, y, t: time });
    if (list.length > MAX_RIPPLES) list.shift();
  }
  function syncRipples() {
    for (let k = list.length - 1; k >= 0; k--) {
      if (time - list[k].t > 2.0) list.splice(k, 1); // clean up after 2s
    }
    const n = Math.min(list.length, MAX_RIPPLES);
    for (let k = 0; k < n; k++) {
      uniforms.uRipplePos.value[k].set(list[k].x, list[k].y);
      uniforms.uRippleTime.value[k] = list[k].t;
    }
    uniforms.uRippleCount.value = n;
  }

  const clock = new THREE.Clock();
  let time = 0;          // shader "flow" time — speeds up while thinking
  let boost = 0, boostTarget = 0;
  let running = false, rafId = 0, onScreen = true;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    boost += (boostTarget - boost) * Math.min(1, dt * 4);
    time += dt * (1 + boost * 2.2);
    uniforms.uTime.value = time;
    uniforms.uBoost.value = boost;
    syncRipples();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  function start() {
    if (running || !onScreen || document.hidden) return;
    running = true;
    clock.start();
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  const ro = new ResizeObserver(resize);
  const io = new IntersectionObserver((entries) => {
    onScreen = entries[0].isIntersecting;
    onScreen ? start() : stop();
  }, { threshold: 0.04 });
  const onVis = () => (document.hidden ? stop() : start());
  const onDown = (e) => addRipple(e.clientX, e.clientY);

  if (reduce) {
    uniforms.uTime.value = 2.0;
    renderer.render(scene, camera); // one static frame
  } else {
    if (ripples) interactionEl.addEventListener('pointerdown', onDown);
    ro.observe(el);
    document.addEventListener('visibilitychange', onVis);
    io.observe(el);
  }

  return {
    setThinking: (b) => { boostTarget = b ? 1 : 0; if (b) start(); },
    resize,
    destroy: () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (ripples) interactionEl.removeEventListener('pointerdown', onDown);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Homepage games section: full-bleed background, ripples anywhere on the section. */
export function initGamesShader() {
  const el = document.getElementById('games-shader');
  if (!el) return;
  mountShader(el, { interactionEl: el.closest('.games-sec') || el });
}
