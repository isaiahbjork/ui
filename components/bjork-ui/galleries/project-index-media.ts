// Media stage for Project Index: one WebGL canvas that dissolves between images and videos.
// No dependencies. Falls back (create() returns null) when WebGL is unavailable.

export interface StageMedia {
  type: "image" | "video";
  src: string;
  poster?: string;
  focal?: [number, number];
}

interface Tex {
  tex: WebGLTexture;
  w: number;
  h: number;
  focal: [number, number];
  /** Canvas-space buffer: no cover fitting. */
  screen?: boolean;
}

interface VideoEntry {
  el: HTMLVideoElement;
  tex: WebGLTexture;
  ready: boolean;
  fresh: boolean;
  used: number;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Grain dissolve. The front sweeps in the direction of travel, broken up by a low-frequency
// fbm and a fine sand grain; pixels near the front are pushed along the sweep and lifted a touch.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec4 uFitA; // xy scale, zw offset
uniform vec4 uFitB;
uniform float uP;
uniform float uDir;
uniform float uSeed;
uniform float uTime;
uniform float uZoom;
uniform vec2 uRes;
uniform float uGrain;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
vec3 sampleFit(sampler2D t, vec4 fit, vec2 uv) {
  vec2 c = (uv - 0.5) / uZoom + 0.5;
  vec2 st = c * fit.xy + fit.zw;
  return texture2D(t, clamp(st, 0.0, 1.0)).rgb;
}
void main() {
  vec2 uv = vUv;
  float p = uP;
  // Low-frequency shape of the front plus fine grain in device pixels (about 2 px sand).
  float n = fbm(uv * vec2(3.0, 5.0) + uSeed);
  float g = hash(floor(uv * uRes / 2.0) + uSeed * 31.0);
  float along = uDir > 0.0 ? uv.y : 1.0 - uv.y;    // 0 where the new media enters
  float edge = along * 0.72 + n * 0.2 + g * 0.08;
  float m = p * 1.24 - 0.12;
  float t = smoothstep(edge - 0.06, edge + 0.06, m);
  // Grains just ahead of the front fall in early, like sand ahead of a wave.
  // ahead: 0 far in front of the front, 1 at the front itself.
  float ahead = smoothstep(edge - 0.1, edge, m);
  float scatter = step(g, ahead * ahead * 0.5);
  t = max(t, scatter);
  float front = smoothstep(0.22, 0.0, abs(m - edge));
  vec2 push = vec2(0.0, -uDir) * 0.035 * front * (n - 0.35);
  vec3 a = sampleFit(uA, uFitA, uv + push * t);
  vec3 b = sampleFit(uB, uFitB, uv - push * (1.0 - t));
  vec3 col = mix(a, b, t);
  // A faint lift along the front, and film grain that only lives during the move.
  col += front * 0.06 * (1.0 - abs(p * 2.0 - 1.0));
  float live = sin(p * 3.14159);
  col += (hash(uv * uRes + floor(uTime * 24.0)) - 0.5) * 0.07 * live * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log ?? "shader");
  }
  return sh;
}

function program(gl: WebGLRenderingContext, frag: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "aPos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class MediaStage {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private images = new Map<string, Promise<Tex>>();
  private videos = new Map<string, VideoEntry>();
  private fbos: { fb: WebGLFramebuffer; tex: WebGLTexture }[] = [];
  private fboIndex = 0;
  private a: Tex | null = null;
  private b: Tex | null = null;
  private bVideo: VideoEntry | null = null;
  private aVideo: VideoEntry | null = null;
  private progress = 1;
  private dir = 1;
  private seed = 0;
  private start = 0;
  private token = 0;
  private dirty = true;
  zoom = 1;
  duration = 420;
  maxVideos = 3;

  static create(canvas: HTMLCanvasElement): MediaStage | null {
    try {
      const gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) return null;
      return new MediaStage(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
  ) {
    this.gl = gl;
    this.prog = program(gl, FRAG);
    for (const name of [
      "uA",
      "uB",
      "uFitA",
      "uFitB",
      "uP",
      "uDir",
      "uSeed",
      "uTime",
      "uZoom",
      "uRes",
      "uGrain",
    ]) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  resize(w: number, h: number) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    // Old buffers are the wrong size now.
    const gl = this.gl;
    for (const f of this.fbos) {
      gl.deleteFramebuffer(f.fb);
      gl.deleteTexture(f.tex);
    }
    this.fbos = [];
    if (this.a?.screen) this.a = this.b;
    this.dirty = true;
  }

  private newTexture() {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    return tex;
  }

  loadImage(src: string, focal: [number, number] = [0.5, 0.5]): Promise<Tex> {
    const key = src;
    const hit = this.images.get(key);
    if (hit) return hit.then((t) => ({ ...t, focal }));
    const p = new Promise<Tex>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        const gl = this.gl;
        const tex = this.newTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          img,
        );
        resolve({ tex, w: img.naturalWidth, h: img.naturalHeight, focal });
      };
      img.onerror = () => reject(new Error(`image ${src}`));
      img.src = src;
    });
    p.catch(() => this.images.delete(key));
    this.images.set(key, p);
    return p;
  }

  /** Warms the cache without showing anything. */
  preload(media: StageMedia) {
    const still = media.type === "image" ? media.src : media.poster;
    if (still) this.loadImage(still).catch(() => {});
  }

  private videoFor(media: StageMedia): VideoEntry {
    const v = this.videos.get(media.src);
    if (v) {
      v.used = performance.now();
      return v;
    }
    const el = document.createElement("video");
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.src = media.src;
    const entry: VideoEntry = {
      el,
      tex: this.newTexture(),
      ready: false,
      fresh: false,
      used: performance.now(),
    };
    const onFrame = () => {
      entry.ready = true;
      entry.fresh = true;
      this.dirty = true;
      const rvfc = (
        el as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback;
      if (rvfc) rvfc.call(el, onFrame);
    };
    const rvfc = (
      el as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }
    ).requestVideoFrameCallback;
    if (rvfc) rvfc.call(el, onFrame);
    else el.addEventListener("timeupdate", onFrame);
    this.videos.set(media.src, entry);
    // Keep at most maxVideos alive, dropping the least recently used that is not on screen.
    if (this.videos.size > this.maxVideos) {
      const victims = [...this.videos.entries()]
        .filter(
          ([, e]) => e !== this.bVideo && e !== this.aVideo && e !== entry,
        )
        .sort((x, y) => x[1].used - y[1].used);
      const [key, victim] = victims[0] ?? [];
      if (key && victim) {
        victim.el.pause();
        victim.el.removeAttribute("src");
        victim.el.load();
        this.gl.deleteTexture(victim.tex);
        this.videos.delete(key);
      }
    }
    return entry;
  }

  private fit(t: Tex): [number, number, number, number] {
    if (t.screen) return [1, 1, 0, 0];
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const ca = cw / Math.max(1, ch);
    const ta = t.w / Math.max(1, t.h);
    let sx = 1;
    let sy = 1;
    if (ta > ca) sx = ca / ta;
    else sy = ta / ca;
    const [fx, fy] = t.focal;
    // Offset toward the focal point (focal y is top-down; texture space is bottom-up).
    const ox = (1 - sx) * fx;
    const oy = (1 - sy) * (1 - fy);
    return [sx, sy, ox, oy];
  }

  /** Captures what is on screen into a buffer so a new transition can start from it. */
  private snapshot(time: number): Tex | null {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!this.fbos.length) {
      for (let i = 0; i < 2; i++) {
        const tex = this.newTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          w,
          h,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          tex,
          0,
        );
        this.fbos.push({ fb, tex });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // Never render into the buffer we are reading from.
    let slot = this.fbos[this.fboIndex];
    if (this.a?.tex === slot.tex) {
      this.fboIndex = 1 - this.fboIndex;
      slot = this.fbos[this.fboIndex];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, slot.fb);
    this.draw(time, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fboIndex = 1 - this.fboIndex;
    return { tex: slot.tex, w, h, focal: [0.5, 0.5], screen: true };
  }

  /**
   * Shows media. `dir` is +1 when moving down the list and -1 when moving up.
   * `instant` swaps without a transition (first open, reduced motion).
   */
  async show(media: StageMedia, dir: number, instant: boolean) {
    const token = ++this.token;
    const focal = media.focal ?? [0.5, 0.5];
    let next: Tex | null = null;
    let video: VideoEntry | null = null;
    if (media.type === "video") {
      video = this.videoFor(media);
      video.el.play().catch(() => {});
      if (video.ready)
        next = {
          tex: video.tex,
          w: video.el.videoWidth,
          h: video.el.videoHeight,
          focal,
        };
      else if (media.poster)
        next = await this.loadImage(media.poster, focal).catch(() => null);
      if (!next) {
        // No poster and no frame yet: wait for the first frame.
        await new Promise<void>((res) => {
          const done = () => res();
          video!.el.addEventListener("loadeddata", done, { once: true });
          setTimeout(done, 1500);
        });
        next = {
          tex: video.tex,
          w: video.el.videoWidth || 16,
          h: video.el.videoHeight || 10,
          focal,
        };
      }
    } else {
      next = await this.loadImage(media.src, focal).catch(() => null);
    }
    if (token !== this.token || !next) return;

    // Pause the video we are leaving once it is no longer needed.
    const leaving = this.bVideo;
    const now = performance.now();
    if (instant || !this.b) {
      this.a = null;
      this.b = next;
      this.aVideo = null;
      this.bVideo = video;
      this.progress = 1;
    } else {
      const inFlight = this.progress < 1;
      this.a = inFlight ? this.snapshot(now) : this.b;
      this.aVideo = inFlight ? null : leaving;
      this.b = next;
      this.bVideo = video;
      this.dir = dir >= 0 ? 1 : -1;
      this.seed = Math.random() * 10;
      this.progress = 0;
      this.start = now;
    }
    if (leaving && leaving !== video && leaving !== this.aVideo)
      leaving.el.pause();
    this.dirty = true;
  }

  pauseVideos() {
    for (const v of this.videos.values()) v.el.pause();
  }

  resumeVideo() {
    this.bVideo?.el.play().catch(() => {});
  }

  get transitioning() {
    return this.progress < 1;
  }

  /** True while there is a reason to keep drawing. */
  get busy() {
    return (
      this.progress < 1 ||
      this.dirty ||
      (!!this.bVideo && !this.bVideo.el.paused)
    );
  }

  private upload(v: VideoEntry | null) {
    if (!v || !v.fresh || v.el.readyState < 2) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, v.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v.el);
    v.fresh = false;
  }

  /** Draws a frame. Returns true while it needs more frames. */
  frame(time: number): boolean {
    if (!this.b) return false;
    if (this.progress < 1) {
      this.progress = Math.min(1, (time - this.start) / this.duration);
      if (this.progress >= 1) {
        if (this.aVideo && this.aVideo !== this.bVideo) this.aVideo.el.pause();
        this.a = null;
        this.aVideo = null;
      }
      // Every step of a transition draws, including the one that lands on 1.
      this.dirty = true;
    }
    // Swap the poster for live video once the first frame exists.
    if (this.bVideo?.ready && this.b.tex !== this.bVideo.tex) {
      this.b = {
        tex: this.bVideo.tex,
        w: this.bVideo.el.videoWidth,
        h: this.bVideo.el.videoHeight,
        focal: this.b.focal,
      };
    }
    const videoFresh = !!(this.bVideo?.fresh || this.aVideo?.fresh);
    if (!this.dirty && this.progress >= 1 && !videoFresh) return this.busy;
    this.upload(this.bVideo);
    this.upload(this.aVideo);
    this.draw(time, false);
    this.dirty = false;
    return this.busy;
  }

  markDirty() {
    this.dirty = true;
  }

  private draw(time: number, toBuffer: boolean) {
    const gl = this.gl;
    const b = this.b!;
    const a = this.a ?? b;
    const p = this.a ? easeInOut(this.progress) : 1;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.uniform1i(this.u.uA, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b.tex);
    gl.uniform1i(this.u.uB, 1);
    gl.uniform4fv(this.u.uFitA, this.fit(a));
    gl.uniform4fv(this.u.uFitB, this.fit(b));
    gl.uniform1f(this.u.uP, p);
    gl.uniform1f(this.u.uDir, this.dir);
    gl.uniform1f(this.u.uSeed, this.seed);
    gl.uniform1f(this.u.uTime, time / 1000);
    gl.uniform1f(this.u.uZoom, this.zoom);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uGrain, toBuffer ? 0 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.token++;
    const gl = this.gl;
    for (const v of this.videos.values()) {
      v.el.pause();
      v.el.removeAttribute("src");
      v.el.load();
      gl.deleteTexture(v.tex);
    }
    this.videos.clear();
    for (const p of this.images.values())
      p.then((t) => gl.deleteTexture(t.tex)).catch(() => {});
    this.images.clear();
    for (const f of this.fbos) {
      gl.deleteFramebuffer(f.fb);
      gl.deleteTexture(f.tex);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
