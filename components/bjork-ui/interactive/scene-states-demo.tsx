"use client";

// Scene States demo: six DOM sections drive one lit object. Each section declares a camera
// pose and a few lighting params with `data-scene-state`; scroll blends between them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useBjorkTone } from "../_core/tone";
import { useVisibleLoop } from "../_core/loop";
import {
  createSceneRig,
  poseToPosition,
  useSceneStates,
  type SceneStates,
  type StateDef,
  type Vec3,
} from "../_core/scene-states";

type Params = {
  /** Key light azimuth, radians. */
  keyAngle: number;
  /** Key light elevation, radians. */
  keyHeight: number;
  /** 0 cool daylight, 1 sodium dusk. */
  warmth: number;
  exposure: number;
  /** Ring tilt around X, radians. */
  tilt: number;
  /** Rim light; blends with easeOutQuad (a fade key). */
  glow: number;
};

export const SCENE_STATE_DEFS: Record<string, StateDef<Params>> = {
  overview: {
    pose: { target: [0, 0.75, 0], radius: 10.5, phi: 1.12, theta: 0.65 },
    params: { keyAngle: 0.9, keyHeight: 0.9, warmth: 0.15, exposure: 1, tilt: 0.42, glow: 0.2 },
    mobile: { pose: { radius: 14 } },
  },
  profile: {
    pose: { target: [0, 0.8, 0], radius: 6.4, phi: 1.5, theta: 1.57 },
    params: { keyAngle: 2.6, keyHeight: 0.45, warmth: 0.1, exposure: 1.05, tilt: 0.1, glow: 0.9 },
    mobile: { pose: { radius: 9 } },
  },
  detail: {
    pose: { target: [0.35, 1.05, 0], radius: 3.4, phi: 1.22, theta: 2.5 },
    params: { keyAngle: 3.4, keyHeight: 0.7, warmth: 0.3, exposure: 1.1, tilt: 0.8, glow: 0.4 },
    mobile: { pose: { radius: 5 } },
  },
  above: {
    pose: { target: [0, 0.4, 0], radius: 9, phi: 0.18, theta: null },
    params: { keyAngle: 4.4, keyHeight: 1.2, warmth: 0.05, exposure: 0.95, tilt: 1.3, glow: 0.1 },
    mobile: { pose: { radius: 12.5 } },
  },
  dusk: {
    pose: { target: [0, 0.7, 0], radius: 7.5, phi: 1.38, theta: -0.75 },
    params: { keyAngle: 5.6, keyHeight: 0.14, warmth: 1, exposure: 0.72, tilt: 0.3, glow: 1 },
    mobile: { pose: { radius: 10.5 } },
  },
  rest: {
    pose: { target: [0, 0.75, 0], radius: 12, phi: 1.05, theta: 0.65 },
    params: { keyAngle: 0.9, keyHeight: 0.9, warmth: 0.15, exposure: 1, tilt: 0.42, glow: 0.2 },
    damp: 0.06,
    mobile: { pose: { radius: 15.5 } },
  },
};

const SECTIONS: { key: keyof typeof SCENE_STATE_DEFS; title: string; body: string; attrs: string }[] = [
  {
    key: "overview",
    title: "Overview",
    body: "A section declares a pose. Nothing else: no timeline, no scroll trigger, no pinning.",
    attrs: 'data-scene-state="overview"',
  },
  {
    key: "profile",
    title: "Profile",
    body: "Pose and params blend with smoothstep as the probe crosses from one anchor to the next.",
    attrs: 'data-scene-state="profile"',
  },
  {
    key: "detail",
    title: "Detail",
    body: "Theta takes the shortest arc, so the camera never swings the long way round.",
    attrs: 'data-scene-state="detail"',
  },
  {
    key: "above",
    title: "Above",
    body: "A null theta keeps whatever the previous state had: rise straight up from where you were.",
    attrs: 'data-scene-state="above"',
  },
  {
    key: "dusk",
    title: "Dusk",
    body: "Fade keys ease out, so the rim light arrives before the camera does.",
    attrs: 'data-scene-state="dusk"',
  },
  {
    key: "rest",
    title: "Rest",
    body: "A lead starts the blend early. Damping is per state and frame-rate independent.",
    attrs: 'data-scene-state="rest" data-scene-lead="0.4"',
  },
];

const PALETTES = {
  dark: { bg: "#0d0d0d", ground: "#1a1917", body: "#d9d4cc", ring: "#ec5c13", ink: "#f2eee7", soft: "rgba(242,238,231,0.56)", line: "rgba(242,238,231,0.14)" },
  light: { bg: "#f2ede3", ground: "#e6dfd2", body: "#f8f5ef", ring: "#d9531a", ink: "#1a1815", soft: "rgba(26,24,21,0.58)", line: "rgba(26,24,21,0.14)" },
} as const;

class LitObject {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private scene = new THREE.Scene();
  private key = new THREE.DirectionalLight(0xffffff, 2.4);
  private rim = new THREE.DirectionalLight(0xffffff, 0);
  private hemi: THREE.HemisphereLight;
  private ringGroup = new THREE.Group();
  private pos: Vec3 = [0, 0, 0];
  private cool = new THREE.Color("#dfe8ff");
  private warm = new THREE.Color("#ffb070");

  constructor(canvas: HTMLCanvasElement, tone: "light" | "dark") {
    const pal = PALETTES[tone];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(pal.bg);
    this.scene.fog = new THREE.Fog(pal.bg, 14, 30);

    this.hemi = new THREE.HemisphereLight(tone === "dark" ? 0x6b7280 : 0xffffff, pal.ground, tone === "dark" ? 0.35 : 0.9);
    this.scene.add(this.hemi);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -4;
    this.key.shadow.camera.right = 4;
    this.key.shadow.camera.top = 4;
    this.key.shadow.camera.bottom = -4;
    this.key.shadow.radius = 6;
    this.key.shadow.bias = -0.0008;
    this.scene.add(this.key, this.key.target, this.rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.36, 0.16, 96),
      new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.6 }),
    );
    plinth.position.y = 0.08;
    plinth.castShadow = plinth.receiveShadow = true;
    this.scene.add(plinth);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 96, 64),
      new THREE.MeshStandardMaterial({ color: pal.body, roughness: 0.32, metalness: 0.05 }),
    );
    sphere.position.y = 0.16 + 0.72;
    sphere.castShadow = sphere.receiveShadow = true;
    this.scene.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.022, 16, 160),
      new THREE.MeshStandardMaterial({ color: pal.ring, roughness: 0.3, metalness: 0.4, emissive: pal.ring, emissiveIntensity: 0.25 }),
    );
    ring.castShadow = true;
    ring.rotation.x = Math.PI / 2;
    this.ringGroup.position.copy(sphere.position);
    this.ringGroup.add(ring);
    this.scene.add(this.ringGroup);
  }

  resize(w: number, h: number) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(pose: Parameters<typeof poseToPosition>[0] & { theta: number }, p: Params, t: number) {
    poseToPosition(pose, this.pos, pose.theta);
    this.camera.position.set(...this.pos);
    this.camera.lookAt(...pose.target);
    const r = 6;
    this.key.position.set(
      Math.cos(p.keyAngle) * Math.cos(p.keyHeight) * r,
      Math.sin(p.keyHeight) * r + 0.5,
      Math.sin(p.keyAngle) * Math.cos(p.keyHeight) * r,
    );
    this.key.color.copy(this.cool).lerp(this.warm, p.warmth);
    this.key.intensity = 2.6 * p.exposure;
    // Rim sits opposite the key.
    this.rim.position.set(-this.key.position.x, 2.2, -this.key.position.z);
    this.rim.color.copy(this.warm);
    this.rim.intensity = 2.2 * p.glow;
    this.renderer.toneMappingExposure = p.exposure;
    this.ringGroup.rotation.set(p.tilt, t * 0.15, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
  }
}

export interface SceneStatesDemoProps {
  tone?: "light" | "dark";
  /** Renders one still frame of the first state, without sections. */
  preview?: boolean;
  className?: string;
}

export function SceneStatesDemo({ tone: toneProp, preview = false, className }: SceneStatesDemoProps) {
  const tone = useBjorkTone(toneProp);
  const pal = PALETTES[tone];
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectRef = useRef<LitObject | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [debug, setDebug] = useState(false);
  const [active, setActive] = useState("overview");
  const activeRef = useRef("overview");
  const rig = useMemo(() => createSceneRig(SCENE_STATE_DEFS.overview), []);
  const timeRef = useRef(0);

  const statesRef = useSceneStates(SCENE_STATE_DEFS, {
    root,
    mobileQuery: "(max-width: 767px)",
    fadeKeys: ["glow"],
    initialKey: "overview",
    debug,
  });

  const frame = useCallback(
    (dt: number) => {
      const obj = objectRef.current;
      const states: SceneStates<Params> | null = statesRef.current;
      if (!obj) return false;
      timeRef.current += dt;
      if (preview || !states) {
        const d = SCENE_STATE_DEFS.overview;
        obj.render({ ...d.pose, theta: d.pose.theta ?? 0 }, d.params, 0);
        return false;
      }
      const s = states.sample();
      const { pose, params } = rig.update(s, dt);
      obj.render(pose, params as Params, timeRef.current);
      if (s.activeKey && s.activeKey !== activeRef.current) {
        activeRef.current = s.activeKey;
        setActive(s.activeKey);
      }
      return true; // the ring keeps turning while the demo is on screen
    },
    [preview, rig, statesRef],
  );

  const { wake } = useVisibleLoop(rootRef, frame, { enabled: !preview });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let obj: LitObject;
    try {
      obj = new LitObject(canvas, tone);
    } catch {
      return;
    }
    objectRef.current = obj;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      obj.resize(rect.width, rect.height);
      if (preview) frame(0);
      else wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    return () => {
      ro.disconnect();
      obj.dispose();
      objectRef.current = null;
    };
  }, [tone, preview, frame, wake]);

  useEffect(() => {
    if (preview) return;
    const onScroll = () => wake();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [preview, wake]);

  const setRootEl = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
    setRoot(el);
  }, []);

  if (preview) {
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)} style={{ background: pal.bg }}>
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        <div ref={setRootEl} className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-8">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: pal.soft }}>
              01 / 06
            </div>
            <div className="mt-2 text-[40px] font-medium leading-none tracking-[-0.03em]" style={{ color: pal.ink }}>
              Overview
            </div>
          </div>
          <code className="rounded-md border px-2 py-1 font-mono text-[11px]" style={{ color: pal.soft, borderColor: pal.line }}>
            data-scene-state=&quot;overview&quot;
          </code>
        </div>
      </div>
    );
  }

  return (
    <div ref={setRootEl} className={cn("relative", className)} style={{ background: pal.bg, color: pal.ink }}>
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-5 pt-5 font-mono text-[11px] uppercase tracking-[0.16em] sm:px-8 sm:pt-7" style={{ color: pal.soft }}>
          <span>Scene states</span>
          <span className="tabular-nums">
            {String(SECTIONS.findIndex((s) => s.key === active) + 1).padStart(2, "0")} / {String(SECTIONS.length).padStart(2, "0")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDebug((d) => !d)}
          aria-pressed={debug}
          className="absolute bottom-5 right-5 cursor-pointer rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors sm:bottom-7 sm:right-8"
          style={{ color: debug ? pal.ink : pal.soft, borderColor: pal.line, background: debug ? pal.line : "transparent" }}
        >
          {debug ? "Hide anchors" : "Show anchors"}
        </button>
      </div>
      <div className="relative -mt-[100svh]">
        {SECTIONS.map((s, i) => (
          <section
            key={s.key}
            data-scene-state={s.key}
            data-scene-lead={s.key === "rest" ? "0.4" : undefined}
            aria-labelledby={`scene-state-${s.key}`}
            className={cn("flex min-h-[100svh] items-end px-5 pb-24 sm:items-center sm:px-8 sm:pb-0", i % 2 ? "sm:justify-end" : "sm:justify-start")}
          >
            <div className="max-w-[340px]">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] tabular-nums" style={{ color: pal.soft }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <h2 id={`scene-state-${s.key}`} className="mt-3 text-[40px] font-medium leading-none tracking-[-0.03em]">
                {s.title}
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: pal.soft }}>
                {s.body}
              </p>
              <code className="mt-5 inline-block rounded-md border px-2 py-1 font-mono text-[11px]" style={{ color: pal.soft, borderColor: pal.line }}>
                {s.attrs}
              </code>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
