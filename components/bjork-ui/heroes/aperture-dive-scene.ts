// Aperture Dive scene: a ring of screens standing in sand, seen first from straight above
// (the eclipse), then from inside. Vanilla three, no post-processing dependency.
//
// Everything is shaded in display (sRGB) space on purpose: the landed panel has to match
// the DOM element it morphs into pixel for pixel, so textures are sampled raw and written
// raw. A half-float target plus an output dither keeps the dark gradients clean.

import * as THREE from "three";
import { poseToPosition, type Pose, type Vec3 } from "../_core/scene-states";

export const PANEL_W = 1.61;
export const PANEL_H = 0.98;
export const PANEL_D = 0.05;
export const PANEL_ASPECT = PANEL_W / PANEL_H;
const MAX_PANELS = 12;

export type DiveTone = "light" | "dark";
export type DiveQuality = "high" | "low";

export interface DiveSceneMedia {
  type: "image" | "video";
  src: string;
  poster?: string;
  fit: "cover" | "contain";
  /** CSS color drawn around contained media. */
  backdrop: string;
  /** Contained media inset, as a fraction of the panel height. */
  inset: number;
  /** Corner radius of contained media, as a fraction of the panel height. */
  radius: number;
}

export interface DiveFrame {
  pose: Pose & { theta: number };
  fov: number;
  /** Panel width multiplier: narrow slabs overhead, a closed wall when landed. */
  scaleX: number;
  saturation: number;
  haze: number;
  /** Screen light falling inside the ring. */
  interior: number;
  /** Rim light outside the ring: the eclipse. */
  corona: number;
  /** 1 adds screen sheen and vignette; 0 is the untouched media the DOM will show. */
  look: number;
  ringSpin: number;
  /** 1 switches the focus screen off: its picture is out in the DOM. */
  focusOut: number;
  /** 0..1, how much of the focus screen's light on the sand has gone with it. */
  focusDim: number;
  /** 0..1 fade of the whole canvas to the page background. */
  fade: number;
}

export interface DiveSceneOptions {
  canvas: HTMLCanvasElement;
  panels: DiveSceneMedia[];
  focusIndex: number;
  tone: DiveTone;
  quality: DiveQuality;
  haze: boolean;
  ground: boolean;
  /** Page background the canvas fades into. */
  background: string;
}

interface Palette {
  world: THREE.Color;
  sand: THREE.Color;
  reliefLow: THREE.Color;
  reliefHigh: THREE.Color;
  body: THREE.Color;
  bodyTop: THREE.Color;
  corona: THREE.Color;
  off: THREE.Color;
}

// Colours are kept in display space: no sRGB → linear conversion anywhere.
function col(value: string) {
  return new THREE.Color().setStyle(value, THREE.LinearSRGBColorSpace);
}

function palette(tone: DiveTone): Palette {
  return tone === "light"
    ? {
        world: col("#f2ede3"),
        sand: col("#e9e1d2"),
        reliefLow: col("#cdbfa6"),
        reliefHigh: col("#f6f0e4"),
        body: col("#d9d1c3"),
        bodyTop: col("#fbf8f2"),
        corona: col("#4a3f31"),
        off: col("#e2dacb"),
      }
    : {
        world: col("#070707"),
        sand: col("#8a8072"),
        reliefLow: col("#3a352f"),
        reliefHigh: col("#fff3e0"),
        body: col("#0c0c0c"),
        bodyTop: col("#262422"),
        corona: col("#ffe9cc"),
        off: col("#050505"),
      };
}

export function ringRadius(count: number) {
  return (count * 1.7) / (Math.PI * 2);
}

/** Where panel `i` stands: the focus panel sits at -Z, facing the ring centre. */
export function panelPlacement(i: number, count: number, focusIndex: number) {
  const ring = ringRadius(count);
  const angle = (i - focusIndex) * ((Math.PI * 2) / count);
  return {
    angle,
    x: ring * Math.sin(angle),
    y: PANEL_H / 2,
    z: -ring * Math.cos(angle),
    rotationY: -angle,
  };
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const COMMON = /* glsl */ `
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

const panelVertex = /* glsl */ `
  attribute float aFront;
  uniform float uScaleX;
  varying vec2 vUv;
  varying float vFront;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vFront = aFront;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec3 p = vec3(position.x * uScaleX, position.y, position.z);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const panelFragment = /* glsl */ `
  ${COMMON}
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uMediaAspect;
  uniform float uPanelAspect;
  uniform float uFit;
  uniform float uInset;
  uniform float uRadius;
  uniform vec3 uBackdrop;
  uniform float uScaleX;
  uniform float uSaturation;
  uniform float uLook;
  uniform float uOff;
  uniform float uLight;
  uniform vec3 uOffColor;
  uniform vec3 uBody;
  uniform vec3 uBodyTop;
  varying vec2 vUv;
  varying float vFront;
  varying vec3 vNormal;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  vec3 media(vec2 uv) {
    // The visible window narrows with uScaleX: the picture crops, it never squashes.
    vec2 st = vec2(0.5 + (uv.x - 0.5) * uScaleX, uv.y);
    if (uFit < 0.5) {
      vec2 m = st;
      if (uMediaAspect > uPanelAspect) m.x = 0.5 + (st.x - 0.5) * uPanelAspect / uMediaAspect;
      else m.y = 0.5 + (st.y - 0.5) * uMediaAspect / uPanelAspect;
      return texture2D(uMap, m).rgb;
    }
    // Contain: a box of height (1 - 2 inset), centred, on the backdrop. Units: panel heights.
    vec2 p = vec2((st.x - 0.5) * uPanelAspect, st.y - 0.5);
    float bh = 1.0 - 2.0 * uInset;
    float bw = bh * uMediaAspect;
    if (bw > uPanelAspect - 2.0 * uInset) { bw = uPanelAspect - 2.0 * uInset; bh = bw / uMediaAspect; }
    vec2 hb = vec2(bw, bh) * 0.5;
    float d = roundedBox(p, hb, uRadius);
    vec2 m = p / (2.0 * hb) + 0.5;
    vec3 c = texture2D(uMap, clamp(m, 0.0, 1.0)).rgb;
    float aa = fwidth(d) * 0.75;
    return mix(c, uBackdrop, smoothstep(-aa, aa, d));
  }

  void main() {
    if (vFront < 0.5) {
      // Slab body: lit from above, so overhead the ring reads as a thin bright outline.
      float up = clamp(vNormal.y, 0.0, 1.0);
      vec3 c = mix(uBody, uBodyTop, up);
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    vec3 c = uHasMap > 0.5 ? media(vUv) : uBackdrop;
    c = mix(vec3(dot(c, LUMA)), c, uSaturation);
    // Screen look (sheen + edge falloff) fades to nothing as the panel lands.
    if (uLook > 0.001) {
      float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
      c *= mix(1.0, 0.55 + 0.45 * edge, uLook);
      c += uLook * 0.05 * smoothstep(0.35, 1.0, vUv.y) * (1.0 - vUv.x);
    }
    c *= uLight;
    c = mix(c, uOffColor, uOff);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const haloVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uScaleX;
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    vec2 b = vec2(${PANEL_W.toFixed(3)} * 0.5 * uScaleX, ${PANEL_H.toFixed(3)} * 0.5);
    vec2 q = abs(p) - b;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float g = exp(-max(d, 0.0) * 7.0) * step(0.0, d);
    gl_FragColor = vec4(uColor * g * uStrength, 1.0);
  }
`;

const groundVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const groundFragment = /* glsl */ `
  ${COMMON}
  #define MAX_PANELS ${MAX_PANELS}
  uniform int uCount;
  uniform vec2 uPanelPos[MAX_PANELS];
  uniform vec2 uPanelNrm[MAX_PANELS];
  uniform vec3 uPanelCol[MAX_PANELS];
  uniform float uPanelOn[MAX_PANELS];
  uniform float uHalfLen;
  uniform float uInterior;
  uniform float uCorona;
  uniform float uSaturation;
  uniform float uLightMode;
  uniform float uSparkle;
  uniform float uTime;
  uniform float uRing;
  uniform vec3 uSand;
  uniform vec3 uReliefLow;
  uniform vec3 uReliefHigh;
  uniform vec3 uCoronaColor;
  uniform vec3 uWorld;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec2 g = vWorld.xz;
    // Fine sand normal from hashed value noise; cheap and texture-free.
    vec2 cell = floor(g * 90.0);
    float n1 = hash12(cell);
    float n2 = hash12(cell + 7.13);
    vec3 nrm = normalize(vNormal + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.16);
    vec3 key = normalize(vec3(-0.6, 0.55, -0.35));
    float ndl = clamp(dot(nrm, key), 0.0, 1.0);
    vec3 relief = mix(uReliefLow, uReliefHigh, ndl);
    float ni = clamp(dot(nrm, vec3(0.0, 1.0, 0.0)) * 1.03, 0.0, 1.0);
    float facing = ni * ni * ni;

    vec3 screen = vec3(0.0);
    float rim = 0.0;
    vec3 rimTint = vec3(0.0);
    for (int i = 0; i < MAX_PANELS; i++) {
      if (i >= uCount) break;
      vec2 d = g - uPanelPos[i];
      vec2 nv = uPanelNrm[i];
      float v = dot(d, nv);
      float u = abs(dot(d, vec2(nv.y, -nv.x)));
      float lx = max(u - uHalfLen, 0.0);
      float r = sqrt(lx * lx + v * v) + 1e-4;
      float cosv = v / r; // 1 straight in front, -1 straight behind
      if (v > 0.0) {
        float L = pow(1.0 + r / 0.55, -2.6) * pow(1.0 - min(lx / r, 1.0), 0.6);
        screen += uPanelCol[i] * L * uPanelOn[i];
      }
      // Behind the slab: a tight rim plus a wide halo. Overhead this is the corona.
      // Weighted by angle so nothing cuts off along the slab's plane.
      float back = smoothstep(-0.6, 0.6, -cosv);
      float tight = exp(-r / 0.16) * pow(1.0 - min(lx / r, 1.0), 0.45) * (0.35 + 0.65 * back);
      float wide = (exp(-r / 1.1) * 0.42 + exp(-r / 3.0) * 0.08) * back;
      rim += tight + wide;
      rimTint += uPanelCol[i] * (tight + wide);
    }
    screen = mix(vec3(dot(screen, LUMA)), screen, uSaturation);
    float rimSafe = max(rim, 1e-4);
    vec3 coronaColor = mix(uCoronaColor, rimTint / rimSafe * 1.6, 0.18 * uSaturation);

    float dist = length(g);
    float far = smoothstep(uRing * 1.6, uRing * 5.5, dist);
    vec3 c;
    if (uLightMode < 0.5) {
      vec3 sand = uSand * relief;
      vec3 lit = sand * screen * 9.0 * facing * uInterior;
      vec3 halo = coronaColor * rim * uCorona * (0.35 + 0.65 * ndl) * 0.9;
      vec3 ambient = sand * (0.02 + 0.05 * uInterior * ndl) * (1.0 - far);
      c = ambient + lit + halo;
      // Grain, gated by how lit the sand is.
      float grain = hash12(floor(g * 260.0));
      c *= 1.0 + (grain - 0.5) * 0.3 * clamp(dot(c, LUMA) * 30.0, 0.0, 1.0);
      if (uSparkle > 0.5) {
        vec2 sc = g * 140.0;
        vec2 sCell = floor(sc);
        float h = hash12(sCell);
        float pick = step(0.986, h);
        vec2 j = vec2(hash12(sCell + 17.31), hash12(sCell + 53.17)) - 0.5;
        float pt = smoothstep(0.3, 0.0, length(fract(sc) - 0.5 - j * 0.5));
        float tw = sin(uTime * 2.5 + h * 100.0) * 0.5 + 0.5;
        tw *= tw; tw *= tw; tw *= tw;
        c += vec3(1.0, 0.97, 0.9) * pick * pt * tw * clamp(dot(c, LUMA) * 4.0, 0.0, 1.2) * 2.5;
      }
    } else {
      // Daylight eclipse: screens throw coloured shadow, the corona is a soft ink ring.
      vec3 sand = uSand * mix(vec3(1.0), relief, 0.55);
      float shade = clamp(rim * uCorona * 1.05, 0.0, 0.82);
      c = sand * (1.0 - shade * (1.0 - uCoronaColor / max(uSand, vec3(0.01))));
      // The disc inside the ring reads as paper-bright against the ink corona.
      float inside = 1.0 - smoothstep(uRing * 0.82, uRing * 1.02, dist);
      c = mix(c, vec3(0.985, 0.975, 0.955), inside * 0.55 * uCorona);
      float L = clamp(dot(screen, vec3(0.333)) * 2.4 * uInterior, 0.0, 1.0);
      vec3 tint = mix(vec3(1.0), clamp(screen / max(dot(screen, vec3(0.333)), 1e-3) * 0.55, 0.0, 1.0), 0.75);
      c *= mix(vec3(1.0), tint, L * facing);
      float grain = hash12(floor(g * 260.0));
      c *= 1.0 + (grain - 0.5) * 0.08;
    }
    c = mix(c, uWorld, far);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const postVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const postFragment = /* glsl */ `
  ${COMMON}
  uniform sampler2D tScene;
  uniform float uHaze;
  uniform float uTime;
  uniform float uVignette;
  uniform float uLightMode;
  uniform float uFade;
  uniform vec3 uFadeColor;
  uniform vec2 uResolution;
  varying vec2 vUv;

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = vUv;
    if (uHaze > 0.001) {
      // Heat shimmer: strongest low in the frame where the sand is.
      float low = smoothstep(0.75, 0.0, uv.y);
      float n = vnoise(vec2(uv.x * 7.0, uv.y * 22.0 - uTime * 1.3)) - 0.5;
      float heat = sin(uv.y * 64.0 + uTime * 2.2) * cos(uv.x * 11.0 - uTime * 1.1);
      float w = (n + heat * 0.35) * low * 0.0028 * uHaze;
      uv += vec2(w, w * 2.2);
    }
    vec3 c = texture2D(tScene, uv).rgb;
    vec2 q = vUv - 0.5;
    q.x *= uResolution.x / uResolution.y;
    float vig = smoothstep(0.35, 1.05, length(q));
    if (uLightMode < 0.5) c *= 1.0 - vig * 0.55 * uVignette;
    else c = mix(c, c * vec3(0.93, 0.9, 0.85), vig * 0.6 * uVignette);
    c = mix(c, uFadeColor, uFade);
    // ±1/2 LSB dither: the half-float scene lands in an 8-bit canvas.
    c += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
    gl_FragColor = vec4(c, 1.0);
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function buildGround(ring: number, segments: number) {
  const geo = new THREE.PlaneGeometry(44, 44, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    // Dunes rise away from the ring; inside it the floor stays near flat.
    const mask = THREE.MathUtils.smoothstep(r, ring + 0.4, ring + 5);
    const dune =
      (valueNoise(x * 0.16 + 3.1, z * 0.22) - 0.5) * 1.0 + (valueNoise(x * 0.42, z * 0.38 + 7.7) - 0.5) * 0.35;
    const ripple = Math.sin(x * 3.1 + z * 1.4 + valueNoise(x * 0.6, z * 0.6) * 4) * 0.012;
    pos.setY(i, dune * 0.35 * 2 * mask + ripple + mask * 0.06);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildPanelGeometry() {
  const geo = new THREE.BoxGeometry(PANEL_W, PANEL_H, PANEL_D);
  const count = geo.attributes.position.count;
  const front = new Float32Array(count);
  // BoxGeometry face order: px, nx, py, ny, pz, nz. pz (index 4) is the screen.
  for (let v = 16; v < 20; v++) front[v] = 1;
  geo.setAttribute("aFront", new THREE.BufferAttribute(front, 1));
  return geo;
}

function cssColor(value: string) {
  try {
    return col(value);
  } catch {
    return col("#000000");
  }
}

interface PanelRuntime {
  media: DiveSceneMedia;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  halo: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null;
  texture: THREE.Texture | null;
  video: HTMLVideoElement | null;
  source: CanvasImageSource | null;
  avg: THREE.Color;
  avgTarget: THREE.Color;
  lastSample: number;
  angle: number;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export class ApertureDiveScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly ring: number;
  private scene = new THREE.Scene();
  private ringGroup = new THREE.Group();
  private panels: PanelRuntime[] = [];
  private shared: Record<string, THREE.IUniform>;
  private ground: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private target: THREE.WebGLRenderTarget;
  private post: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sampleCanvas: HTMLCanvasElement;
  private sampleCtx: CanvasRenderingContext2D | null;
  private opts: DiveSceneOptions;
  private pal: Palette;
  private width = 1;
  private height = 1;
  private disposed = false;
  private pos: Vec3 = [0, 0, 0];
  private time = 0;
  private onFrame?: () => void;

  constructor(opts: DiveSceneOptions, onFrame?: () => void) {
    this.opts = opts;
    this.onFrame = onFrame;
    this.pal = palette(opts.tone);
    const count = Math.min(opts.panels.length, MAX_PANELS);
    this.ring = ringRadius(count);

    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.camera = new THREE.PerspectiveCamera(15, 1, 0.05, 220);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      samples: opts.quality === "high" ? 4 : 0,
    });

    this.shared = {
      uScaleX: { value: 0.5 },
      uSaturation: { value: 0 },
      uLook: { value: 1 },
      uPanelAspect: { value: PANEL_ASPECT },
      uOffColor: { value: this.pal.off.clone() },
      uBody: { value: this.pal.body.clone() },
      uBodyTop: { value: this.pal.bodyTop.clone() },
    };

    this.sampleCanvas = document.createElement("canvas");
    this.sampleCanvas.width = 6;
    this.sampleCanvas.height = 4;
    this.sampleCtx = this.sampleCanvas.getContext("2d", { willReadFrequently: true });

    this.scene.background = this.pal.world.clone();
    this.scene.add(this.ringGroup);
    this.buildPanels(count);
    if (opts.ground) this.buildGround(count);

    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.post = new THREE.Mesh(
      tri,
      new THREE.ShaderMaterial({
        vertexShader: postVertex,
        fragmentShader: postFragment,
        uniforms: {
          tScene: { value: this.target.texture },
          uHaze: { value: 0 },
          uTime: { value: 0 },
          uVignette: { value: 1 },
          uLightMode: { value: opts.tone === "light" ? 1 : 0 },
          uFade: { value: 0 },
          uFadeColor: { value: cssColor(opts.background) },
          uResolution: { value: new THREE.Vector2(1, 1) },
        },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.post.frustumCulled = false;
    this.postScene.add(this.post);
    // Compile every program now so the first scroll does not stall on it.
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.postScene, this.postCamera);
  }

  private buildPanels(count: number) {
    const geo = buildPanelGeometry();
    const haloGeo = new THREE.PlaneGeometry(PANEL_W * 2.1, PANEL_H * 2.6);
    for (let i = 0; i < count; i++) {
      const media = this.opts.panels[i];
      const place = panelPlacement(i, count, this.opts.focusIndex);
      const angle = place.angle;
      const uniforms: Record<string, THREE.IUniform> = {
        ...this.shared,
        uMap: { value: null },
        uHasMap: { value: 0 },
        uMediaAspect: { value: 1 },
        uFit: { value: media.fit === "contain" ? 1 : 0 },
        uInset: { value: media.inset },
        uRadius: { value: media.radius },
        uBackdrop: { value: cssColor(media.backdrop) },
        uOff: { value: 0 },
        uLight: { value: 1 },
      };
      const mat = new THREE.ShaderMaterial({ vertexShader: panelVertex, fragmentShader: panelFragment, uniforms });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(place.x, place.y, place.z);
      mesh.rotation.y = place.rotationY;
      this.ringGroup.add(mesh);

      let halo: PanelRuntime["halo"] = null;
      if (this.opts.tone === "dark") {
        const haloMat = new THREE.ShaderMaterial({
          vertexShader: haloVertex,
          fragmentShader: haloFragment,
          uniforms: {
            uColor: { value: new THREE.Color(0, 0, 0) },
            uStrength: { value: 0 },
            uScaleX: this.shared.uScaleX,
            uSize: { value: new THREE.Vector2(PANEL_W * 2.1, PANEL_H * 2.6) },
          },
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        });
        halo = new THREE.Mesh(haloGeo, haloMat);
        // Just behind the slab so the glow only shows around its edges.
        halo.position.set(0, 0, -PANEL_D * 0.6);
        mesh.add(halo);
      }

      const runtime: PanelRuntime = {
        media,
        mesh,
        halo,
        texture: null,
        video: null,
        source: null,
        avg: new THREE.Color(0.25, 0.25, 0.25),
        avgTarget: new THREE.Color(0.25, 0.25, 0.25),
        lastSample: -1,
        angle,
      };
      this.panels.push(runtime);
      this.loadMedia(runtime, i === this.opts.focusIndex);
    }
  }

  private buildGround(count: number) {
    const geo = buildGround(this.ring, this.opts.quality === "high" ? 180 : 110);
    const mat = new THREE.ShaderMaterial({
      vertexShader: groundVertex,
      fragmentShader: groundFragment,
      uniforms: {
        uCount: { value: count },
        uPanelPos: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector2()) },
        uPanelNrm: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Vector2()) },
        uPanelCol: { value: Array.from({ length: MAX_PANELS }, () => new THREE.Color()) },
        uPanelOn: { value: new Array(MAX_PANELS).fill(1) },
        uHalfLen: { value: PANEL_W * 0.25 },
        uInterior: { value: 0 },
        uCorona: { value: 1 },
        uSaturation: { value: 0 },
        uLightMode: { value: this.opts.tone === "light" ? 1 : 0 },
        uSparkle: { value: this.opts.quality === "high" && this.opts.tone === "dark" ? 1 : 0 },
        uTime: { value: 0 },
        uRing: { value: this.ring },
        uSand: { value: this.pal.sand.clone() },
        uReliefLow: { value: this.pal.reliefLow.clone() },
        uReliefHigh: { value: this.pal.reliefHigh.clone() },
        uCoronaColor: { value: this.pal.corona.clone() },
        uWorld: { value: this.pal.world.clone() },
      },
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.scene.add(this.ground);
  }

  private setImage(p: PanelRuntime, img: TexImageSource & { width: number; height: number }, w: number, h: number) {
    if (this.disposed) return;
    const tex = new THREE.Texture(img as unknown as HTMLImageElement);
    this.configureTexture(tex);
    tex.needsUpdate = true;
    this.applyTexture(p, tex, w / h);
    p.source = img as CanvasImageSource;
    this.sampleColor(p, true);
  }

  private configureTexture(tex: THREE.Texture) {
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
  }

  private applyTexture(p: PanelRuntime, tex: THREE.Texture, aspect: number) {
    const u = p.mesh.material.uniforms;
    if (p.texture && p.texture !== tex) p.texture.dispose();
    p.texture = tex;
    u.uMap.value = tex;
    u.uHasMap.value = 1;
    u.uMediaAspect.value = aspect;
  }

  private loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private loadMedia(p: PanelRuntime, isFocus: boolean) {
    const { media } = p;
    const playVideo = media.type === "video" && (isFocus || this.opts.quality === "high");
    const still = media.type === "image" ? media.src : media.poster;
    if (still) {
      this.loadImage(still)
        .then((img) => {
          // A video that already delivered frames wins over its poster.
          if (p.video && p.video.readyState >= 2) return;
          this.setImage(p, img, img.naturalWidth, img.naturalHeight);
        })
        .catch(() => {});
    }
    if (!playVideo) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.src = media.src;
    p.video = video;
    const onData = () => {
      if (this.disposed) return;
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.NoColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      this.applyTexture(p, tex, video.videoWidth / Math.max(1, video.videoHeight));
      p.source = video;
      this.sampleColor(p, true);
    };
    video.addEventListener("loadeddata", onData, { once: true });
    video.play().catch(() => {});
  }

  /** Average colour of a panel's media, mixed with its backdrop by area. */
  private sampleColor(p: PanelRuntime, immediate = false) {
    if (!this.sampleCtx || !p.source) return;
    try {
      this.sampleCtx.drawImage(p.source, 0, 0, 6, 4);
      const data = this.sampleCtx.getImageData(0, 0, 6, 4).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const n = (data.length / 4) * 255;
      const c = new THREE.Color(r / n, g / n, b / n);
      if (p.media.fit === "contain") {
        const aspect = p.mesh.material.uniforms.uMediaAspect.value as number;
        const bh = 1 - 2 * p.media.inset;
        const area = Math.min(1, (bh * bh * aspect) / PANEL_ASPECT);
        c.lerp(cssColor(p.media.backdrop), 1 - area);
      }
      // Lift dim content so every screen still throws light; push chroma a little.
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      const gain = 0.55 / Math.max(0.08, Math.sqrt(lum));
      const sat = 1.5;
      c.setRGB(
        Math.min(1.4, (lum + (c.r - lum) * sat) * gain),
        Math.min(1.4, (lum + (c.g - lum) * sat) * gain),
        Math.min(1.4, (lum + (c.b - lum) * sat) * gain),
      );
      p.avgTarget.copy(c);
      if (immediate) p.avg.copy(c);
    } catch {
      // Tainted source: keep the neutral grey.
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(Math.round(this.width * dpr), Math.round(this.height * dpr));
    (this.post.material.uniforms.uResolution.value as THREE.Vector2).set(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  get focusVideo() {
    return this.panels[this.opts.focusIndex]?.video ?? null;
  }

  /** Pauses every video except the focus one (or all, with `all`). */
  setVideosPlaying(playing: boolean, all = false) {
    this.panels.forEach((p, i) => {
      if (!p.video) return;
      const keep = !all && i === this.opts.focusIndex;
      if (playing || keep) {
        if (p.video.paused) p.video.play().catch(() => {});
      } else if (!p.video.paused) p.video.pause();
    });
  }

  /** Screen-space corners (CSS px, canvas-relative) of the focus screen: TL, TR, BR, BL. */
  projectFocus(): [number, number][] {
    const p = this.panels[this.opts.focusIndex];
    if (!p) return [];
    p.mesh.updateWorldMatrix(true, false);
    return projectPanelCorners(p.mesh.matrixWorld, this.camera, this.shared.uScaleX.value as number, this.width, this.height);
  }

  render(frame: DiveFrame, dt: number) {
    if (this.disposed) return;
    this.time += dt;
    const s = this.shared;
    s.uScaleX.value = frame.scaleX;
    s.uSaturation.value = frame.saturation;
    s.uLook.value = frame.look;

    this.ringGroup.rotation.y = frame.ringSpin;
    this.ringGroup.updateMatrixWorld(true);

    applyDiveCamera(this.camera, frame, this.pos);

    const now = performance.now();
    const k = 1 - Math.exp(-dt * 6);
    const gu = this.ground?.material.uniforms;
    const spin = frame.ringSpin;
    // One video colour readback per frame at most, each video about twice a second.
    let sampled = false;
    this.panels.forEach((p, i) => {
      if (!sampled && p.video && !p.video.paused && now - p.lastSample > 450) {
        p.lastSample = now;
        sampled = true;
        this.sampleColor(p);
      }
      p.avg.lerp(p.avgTarget, k);
      const isFocus = i === this.opts.focusIndex;
      const off = isFocus ? frame.focusOut : 0;
      const u = p.mesh.material.uniforms;
      u.uOff.value = off;
      if (p.halo) {
        p.halo.material.uniforms.uColor.value.copy(p.avg);
        p.halo.material.uniforms.uStrength.value = (0.06 + 0.22 * frame.interior) * (1 - off) * frame.saturation;
      }
      if (gu) {
        // Group yaw `spin` moves a panel at angle a to a - spin.
        const a = p.angle - spin;
        (gu.uPanelPos.value[i] as THREE.Vector2).set(this.ring * Math.sin(a), -this.ring * Math.cos(a));
        (gu.uPanelNrm.value[i] as THREE.Vector2).set(-Math.sin(a), Math.cos(a));
        (gu.uPanelCol.value[i] as THREE.Color).copy(p.avg);
        gu.uPanelOn.value[i] = isFocus ? 1 - frame.focusDim : 1;
      }
    });
    if (gu) {
      gu.uHalfLen.value = PANEL_W * 0.5 * frame.scaleX;
      gu.uInterior.value = frame.interior;
      gu.uCorona.value = frame.corona;
      gu.uSaturation.value = frame.saturation;
      gu.uTime.value = this.time;
    }

    const pu = this.post.material.uniforms;
    pu.uHaze.value = this.opts.haze ? frame.haze * (this.opts.tone === "light" ? 0.5 : 1) : 0;
    pu.uTime.value = this.time;
    pu.uFade.value = frame.fade;
    pu.uVignette.value = 0.35 + 0.65 * frame.look;

    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
    this.onFrame?.();
  }

  dispose() {
    this.disposed = true;
    this.panels.forEach((p) => {
      p.texture?.dispose();
      p.mesh.material.dispose();
      p.halo?.material.dispose();
      if (p.video) {
        p.video.pause();
        p.video.removeAttribute("src");
        p.video.load();
      }
    });
    this.panels[0]?.mesh.geometry.dispose();
    this.panels[0]?.halo?.geometry.dispose();
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.post.geometry.dispose();
    this.post.material.dispose();
    this.target.dispose();
    this.renderer.dispose();
  }
}

const cornerTmp = new THREE.Vector3();

/** Projects a panel's screen face (TL, TR, BR, BL) to CSS px in a w×h viewport. */
export function projectPanelCorners(
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
  scaleX: number,
  width: number,
  height: number,
): [number, number][] {
  const sx = scaleX * PANEL_W * 0.5;
  const hy = PANEL_H * 0.5;
  const z = PANEL_D * 0.5;
  const out: [number, number][] = [];
  for (const [x, y] of [
    [-sx, hy],
    [sx, hy],
    [sx, -hy],
    [-sx, -hy],
  ]) {
    cornerTmp.set(x, y, z).applyMatrix4(matrixWorld).project(camera);
    out.push([(cornerTmp.x * 0.5 + 0.5) * width, (-cornerTmp.y * 0.5 + 0.5) * height]);
  }
  return out;
}

/** Places a camera on a dive frame. Shared by the WebGL scene and the CSS fallback. */
export function applyDiveCamera(camera: THREE.PerspectiveCamera, frame: DiveFrame, out: Vec3 = [0, 0, 0]) {
  poseToPosition(frame.pose, out, frame.pose.theta);
  camera.position.set(out[0], out[1], out[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(frame.pose.target[0], frame.pose.target[1], frame.pose.target[2]);
  if (Math.abs(camera.fov - frame.fov) > 1e-4) {
    camera.fov = frame.fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

/**
 * Monotone cubic (Fritsch–Carlson) through authored keyframes: velocity is continuous
 * across keys, nothing overshoots, and flat holds stay flat.
 */
export function monotoneTrack(times: number[], values: number[]) {
  const n = times.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((values[i + 1] - values[i]) / (times[i + 1] - times[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  // Ease out of the first key and into the last: the dive starts and lands at rest.
  m[0] = 0;
  m[n - 1] = 0;
  return (x: number) => {
    if (x <= times[0]) return values[0];
    if (x >= times[n - 1]) return values[n - 1];
    let i = 0;
    while (i < n - 2 && x > times[i + 1]) i++;
    const h = times[i + 1] - times[i];
    const t = (x - times[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * values[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * values[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

export interface DiveProfile {
  overheadRadius: number;
  /** Fraction of the viewport the landed screen may fill: [width, height]. */
  landedFill: [number, number];
  /** How far past the ring centre the camera lands, in ring radii. */
  landedDistance: number;
  haze: boolean;
}

export const DIVE_PROFILES: Record<DiveQuality, DiveProfile> = {
  high: { overheadRadius: 34, landedFill: [0.5, 0.56], landedDistance: 1.36, haze: true },
  low: { overheadRadius: 56, landedFill: [0.86, 0.36], landedDistance: 1.34, haze: false },
};

/** The landed camera: distance from the ring's far side and the fov that frames the screen. */
export function landedFraming(ring: number, aspect: number, profile: DiveProfile) {
  const dist = ring * profile.landedDistance;
  const [fw, fh] = profile.landedFill;
  const half = Math.max(PANEL_W / (fw * aspect), PANEL_H / fh) / (2 * dist);
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(half));
  return { dist, fov: Math.min(68, Math.max(18, fov)) };
}

export const DIVE_KEYS = {
  //            overhead  begin   descend  rim     landed  hold
  p: /*     */ [0, 0.15, 0.38, 0.58, 0.8, 0.92],
  phi: /*   */ [0.0001, 0.09, 0.52, 1.06, 1.475, 1.475],
  theta: /* */ [-0.42, -0.34, -0.17, -0.05, 0, 0],
  scaleX: /**/ [0.5, 0.54, 0.7, 0.9, 1, 1],
  sat: /*   */ [0, 0.08, 0.42, 0.82, 1, 1],
  haze: /*  */ [0.6, 0.9, 1.5, 1.2, 0.35, 0],
  interior: [0, 0.04, 0.32, 0.78, 1, 1],
  corona: /**/ [1, 0.95, 0.62, 0.34, 0.2, 0.2],
  look: /*  */ [1, 1, 0.85, 0.45, 0, 0],
};

export function createDiveSampler(ring: number) {
  const k = DIVE_KEYS;
  const tracks = {
    phi: monotoneTrack(k.p, k.phi),
    theta: monotoneTrack(k.p, k.theta),
    scaleX: monotoneTrack(k.p, k.scaleX),
    sat: monotoneTrack(k.p, k.sat),
    haze: monotoneTrack(k.p, k.haze),
    interior: monotoneTrack(k.p, k.interior),
    corona: monotoneTrack(k.p, k.corona),
    look: monotoneTrack(k.p, k.look),
    // 0 → 1 travel from the ring centre to the focus screen, front-loaded so the camera
    // drifts toward the far wall while it is still high.
    pan: monotoneTrack(k.p, [0, 0.08, 0.38, 0.72, 1, 1]),
    // 0 → 1 between overhead radius and the landed distance, in log space (a dolly).
    zoom: monotoneTrack(k.p, [0, 0.12, 0.45, 0.8, 1, 1]),
    // 0 → 1 between the overhead fov and the landed fov.
    lens: monotoneTrack(k.p, [0, 0.02, 0.18, 0.62, 1, 1]),
  };

  return (p: number, aspect: number, profile: DiveProfile, out: DiveFrame): DiveFrame => {
    const framing = landedFraming(ring, aspect, profile);
    const pan = tracks.pan(p);
    const zoom = tracks.zoom(p);
    out.pose.target[0] = 0;
    out.pose.target[1] = THREE.MathUtils.lerp(0, PANEL_H / 2, pan);
    out.pose.target[2] = THREE.MathUtils.lerp(0, -ring, pan);
    out.pose.radius = Math.exp(THREE.MathUtils.lerp(Math.log(profile.overheadRadius), Math.log(framing.dist), zoom));
    out.pose.phi = tracks.phi(p);
    out.pose.theta = tracks.theta(p);
    out.fov = THREE.MathUtils.lerp(15, framing.fov, tracks.lens(p));
    out.scaleX = tracks.scaleX(p);
    out.saturation = tracks.sat(p);
    out.haze = profile.haze ? tracks.haze(p) : 0;
    out.interior = tracks.interior(p);
    out.corona = tracks.corona(p);
    out.look = tracks.look(p);
    return out;
  };
}

export function createDiveFrame(): DiveFrame {
  return {
    pose: { target: [0, 0, 0], radius: 34, phi: 0.0001, theta: 0 },
    fov: 15,
    scaleX: 0.5,
    saturation: 0,
    haze: 0.6,
    interior: 0,
    corona: 1,
    look: 1,
    ringSpin: 0,
    focusOut: 0,
    focusDim: 0,
    fade: 0,
  };
}

/** CSS matrix3d that maps a w×h box onto four screen points (TL, TR, BR, BL). */
export function quadToMatrix3d(w: number, h: number, q: [number, number][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  // Square → quad homography (Heckbert), then pre-scale the box to the unit square.
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  const f = y0;
  const A = a / w;
  const B = b / h;
  const D = d / w;
  const E = e / h;
  const G = g / w;
  const H = hh / h;
  // Column-major for CSS matrix3d.
  return `matrix3d(${A},${D},0,${G},${B},${E},0,${H},0,0,1,0,${c},${f},0,1)`;
}
