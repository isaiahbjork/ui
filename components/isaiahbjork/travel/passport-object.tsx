"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Float,
  OrbitControls,
  RoundedBox,
  Text,
  Text3D,
  useTexture,
} from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const paperMaterial = new THREE.MeshStandardMaterial({
  color: "#eadfc9",
  roughness: 0.86,
  metalness: 0.02,
});

const paperEdgeMaterial = new THREE.MeshStandardMaterial({
  color: "#b8a788",
  roughness: 0.9,
  metalness: 0.02,
});

const pageFlipMaterial = new THREE.MeshStandardMaterial({
  color: "#eee8db",
  roughness: 0.88,
  metalness: 0.02,
  transparent: true,
  opacity: 0.86,
  side: THREE.DoubleSide,
});

const stampMaterial = new THREE.MeshBasicMaterial({
  color: "#bd4c24",
  transparent: true,
  opacity: 0.78,
  side: THREE.DoubleSide,
});

const embossMaterial = new THREE.MeshStandardMaterial({
  color: "#f0dcc0",
  roughness: 0.34,
  metalness: 0.16,
});

const embossShadowMaterial = new THREE.MeshBasicMaterial({
  color: "#2a1009",
  transparent: true,
  opacity: 0.52,
});

const orangeEmbossMaterial = new THREE.MeshStandardMaterial({
  color: "#d2632d",
  roughness: 0.42,
  metalness: 0.08,
});

const pageWidth = 2.58;
const pageHeight = 3.48;
const pageDepth = 0.008;
const coverWidth = 2.72;
const coverHeight = 3.62;
const hingeX = -coverWidth / 2;
const fontPath = "/fonts/helvetiker_bold.typeface.json";

function lerp(current: number, target: number, speed: number) {
  return current + (target - current) * speed;
}

function LeatherCoverMaterial() {
  const [baseMap, normalMap, roughnessMap] = useTexture([
    "/textures/black-leather/black-leather-base.png",
    "/textures/black-leather/black-leather-normal.png",
    "/textures/black-leather/black-leather-roughness.png",
  ]);

  useEffect(() => {
    [baseMap, normalMap, roughnessMap].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.85, 2.45);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });
    baseMap.colorSpace = THREE.SRGBColorSpace;
  }, [baseMap, normalMap, roughnessMap]);

  return (
    <meshStandardMaterial
      map={baseMap}
      normalMap={normalMap}
      normalScale={new THREE.Vector2(0.22, 0.22)}
      roughnessMap={roughnessMap}
      color="#080706"
      roughness={0.9}
      metalness={0.02}
    />
  );
}

function RaisedBar({
  position,
  args,
  material = embossMaterial,
}: {
  position: [number, number, number];
  args: [number, number, number];
  material?: THREE.Material;
}) {
  return (
    <>
      <mesh position={[position[0] + 0.012, position[1] - 0.012, position[2] - 0.006]}>
        <boxGeometry args={args} />
        <primitive object={embossShadowMaterial} attach="material" />
      </mesh>
      <mesh position={position}>
        <boxGeometry args={args} />
        <primitive object={material} attach="material" />
      </mesh>
    </>
  );
}

const centeredText3DProps = { center: true } as Record<string, boolean>;

function EmbossedText3D({
  children,
  position,
  size,
  scaleX = 1,
  letterSpacing = 0.018,
}: {
  children: string;
  position: [number, number, number];
  size: number;
  scaleX?: number;
  letterSpacing?: number;
}) {
  return (
    <group position={position} scale={[scaleX, 1, 1]}>
      <Text3D
        font={fontPath}
        size={size}
        height={0.006}
        curveSegments={8}
        bevelEnabled
        bevelSize={0.0025}
        bevelThickness={0.003}
        letterSpacing={letterSpacing}
        {...centeredText3DProps}
      >
        {children}
        <primitive object={embossMaterial} attach="material" />
      </Text3D>
      <Text3D
        font={fontPath}
        size={size}
        height={0.003}
        curveSegments={4}
        bevelEnabled
        bevelSize={0.001}
        bevelThickness={0.001}
        letterSpacing={letterSpacing}
        {...centeredText3DProps}
        position={[0.005, -0.005, -0.007]}
      >
        {children}
        <primitive object={embossShadowMaterial} attach="material" />
      </Text3D>
    </group>
  );
}

function PaperStampDecal({
  position,
  scale = 1,
  rotation = 0,
}: {
  position: [number, number, number];
  scale?: number;
  rotation?: number;
}) {
  const stampMap = useTexture("/stamps/us-passport-stamp-style-transparent.svg");

  useEffect(() => {
    stampMap.colorSpace = THREE.SRGBColorSpace;
    stampMap.anisotropy = 8;
    stampMap.needsUpdate = true;
  }, [stampMap]);

  return (
    <group position={position} rotation={[0, 0, rotation]} scale={scale}>
      <mesh position={[0.01, -0.01, -0.003]}>
        <planeGeometry args={[0.86, 0.86]} />
        <meshBasicMaterial
          map={stampMap}
          transparent
          opacity={0.18}
          alphaTest={0.03}
          color="#5d1e14"
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[0.82, 0.82]} />
        <meshBasicMaterial
          map={stampMap}
          transparent
          opacity={0.86}
          alphaTest={0.04}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Stamp({ code, position, rotation }: {
  code: string;
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, 0, rotation]}>
      <mesh>
        <torusGeometry args={[0.28, 0.018, 14, 72]} />
        <primitive object={stampMaterial} attach="material" />
      </mesh>
      <Text
        position={[0, 0, 0.006]}
        fontSize={0.16}
        letterSpacing={0.04}
        anchorX="center"
        anchorY="middle"
        color="#8b2c1f"
      >
        {code}
      </Text>
    </group>
  );
}

function PageLines({ side = "right" }: { side?: "left" | "right" }) {
  const xOffset = side === "left" ? -0.74 : 0.74;

  return (
    <group>
      {Array.from({ length: 7 }).map((_, index) => (
        <mesh
          key={index}
          position={[xOffset, 0.58 - index * 0.17, 0.077]}
        >
          <boxGeometry args={[0.86 - (index % 3) * 0.12, 0.012, 0.004]} />
          <meshBasicMaterial color="#8a795f" transparent opacity={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function PassportPages({ openAmount }: { openAmount: number }) {
  return (
    <group>
      {Array.from({ length: 13 }).map((_, index) => (
        <mesh
          key={index}
          position={[0.006 * index, -0.006 * index, 0.01 + index * 0.004]}
          rotation={[0, 0, (index - 6) * 0.0015]}
        >
          <boxGeometry args={[pageWidth, pageHeight, pageDepth]} />
          <primitive
            object={index === 12 ? paperMaterial : paperEdgeMaterial}
            attach="material"
          />
        </mesh>
      ))}

      <group visible={openAmount > 0.35}>
        <mesh position={[0, 0, 0.083]}>
          <boxGeometry args={[pageWidth - 0.05, pageHeight - 0.08, 0.008]} />
          <primitive object={paperMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.09]}>
          <boxGeometry args={[0.02, 3.0, 0.004]} />
          <meshBasicMaterial color="#b39c78" transparent opacity={0.5} />
        </mesh>
        <PageLines side="left" />
        <PageLines side="right" />
        <PaperStampDecal
          position={[0.74, 0.46, 0.105]}
          scale={0.72}
          rotation={-0.12}
        />
        <Stamp code="IMG" position={[0.74, 0.65, 0.102]} rotation={-0.18} />
        <Stamp code="R3F" position={[0.58, -0.38, 0.103]} rotation={0.16} />
      </group>
    </group>
  );
}

function PassportModel({ isOpen, stampIndex }: { isOpen: boolean; stampIndex: number }) {
  const rootRef = useRef<THREE.Group>(null);
  const coverRef = useRef<THREE.Group>(null);
  const pageFlipRef = useRef<THREE.Group>(null);
  const openAmountRef = useRef(0);
  const stampScaleRef = useRef<THREE.Group>(null);
  const targetOpen = isOpen ? 1 : 0;

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    openAmountRef.current = lerp(openAmountRef.current, targetOpen, 0.075);
    const openAmount = openAmountRef.current;

    if (rootRef.current) {
      const targetScale = isOpen ? 0.72 : 0.9;
      rootRef.current.scale.setScalar(lerp(rootRef.current.scale.x, targetScale, 0.075));
      rootRef.current.position.x = lerp(rootRef.current.position.x, isOpen ? 0.34 : 0, 0.075);
      rootRef.current.rotation.x = lerp(rootRef.current.rotation.x, -0.5, 0.05);
      rootRef.current.rotation.y = lerp(rootRef.current.rotation.y, isOpen ? 0.04 : -0.08, 0.05);
      rootRef.current.rotation.z = lerp(
        rootRef.current.rotation.z,
        isOpen ? -0.03 : -0.06,
        0.05,
      );
      rootRef.current.position.y = -0.1 + Math.sin(time * 0.5) * 0.018;
    }

    if (coverRef.current) {
      coverRef.current.rotation.y = lerp(
        coverRef.current.rotation.y,
        -openAmount * 2.48,
        0.12,
      );
      coverRef.current.rotation.z = lerp(
        coverRef.current.rotation.z,
        -openAmount * 0.05,
        0.08,
      );
    }

    if (pageFlipRef.current) {
      pageFlipRef.current.rotation.y = lerp(
        pageFlipRef.current.rotation.y,
        -openAmount * 0.42,
        0.11,
      );
      pageFlipRef.current.position.z = 0.096 + Math.sin(openAmount * Math.PI) * 0.035;
    }

    if (stampScaleRef.current) {
      const pulse = 1 + Math.sin(time * 5.2) * 0.025;
      stampScaleRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <Float floatIntensity={0.08} rotationIntensity={0.025} speed={1.1}>
      <group ref={rootRef} scale={0.9} position={[0, -0.1, 0]}>
        <RoundedBox
          args={[coverWidth, coverHeight, 0.13]}
          radius={0.12}
          smoothness={10}
          position={[0, 0, -0.06]}
        >
          <LeatherCoverMaterial />
        </RoundedBox>

        <PassportPages openAmount={targetOpen} />

        <RoundedBox
          args={[0.18, coverHeight, 0.18]}
          radius={0.085}
          smoothness={12}
          position={[hingeX + 0.02, 0, 0.055]}
        >
          <LeatherCoverMaterial />
        </RoundedBox>
        <mesh position={[hingeX + 0.1, 0, 0.16]}>
          <boxGeometry args={[0.024, coverHeight - 0.18, 0.018]} />
          <primitive object={orangeEmbossMaterial} attach="material" />
        </mesh>

        <group ref={pageFlipRef} position={[hingeX + 0.14, 0, 0.096]}>
          <mesh position={[0.62, 0.02, 0]}>
            <boxGeometry args={[1.08, pageHeight - 0.4, 0.006]} />
            <primitive object={pageFlipMaterial} attach="material" />
          </mesh>
          <mesh position={[0.47, -0.12, 0.008]}>
            <boxGeometry args={[0.58, 0.012, 0.005]} />
            <meshBasicMaterial color="#8a795f" transparent opacity={0.2} />
          </mesh>
        </group>

        <group ref={coverRef} position={[hingeX, 0, 0.115]}>
          <RoundedBox
            args={[coverWidth, coverHeight, 0.105]}
            radius={0.12}
            smoothness={12}
            position={[-hingeX, 0, 0]}
          >
            <LeatherCoverMaterial />
          </RoundedBox>

          <RaisedBar
            position={[0.2, 0, 0.062]}
            args={[0.018, coverHeight - 0.34, 0.006]}
            material={orangeEmbossMaterial}
          />
          <RaisedBar
            position={[0.34, 0, 0.062]}
            args={[0.01, coverHeight - 0.5, 0.005]}
          />

          <EmbossedText3D
            position={[1.31, 1.12, 0.061]}
            size={0.088}
            scaleX={0.68}
            letterSpacing={0.014}
          >
            CREATIVE PASSPORT
          </EmbossedText3D>
          <EmbossedText3D
            position={[1.31, -1.18, 0.061]}
            size={0.12}
            scaleX={0.74}
            letterSpacing={0.012}
          >
            ISAIAH BJORK
          </EmbossedText3D>
        </group>

        <group ref={stampScaleRef} position={[0.48, -0.72, 0.22]} visible={isOpen}>
          <Stamp
            code={["IMG", "VID", "R3F", "UI"][stampIndex % 4]}
            position={[0, 0, 0]}
            rotation={-0.2 + stampIndex * 0.08}
          />
        </group>
      </group>
    </Float>
  );
}

export function PassportObject() {
  const [isOpen, setIsOpen] = useState(false);
  const [stampIndex, setStampIndex] = useState(0);

  const camera = useMemo(
    () => ({
      position: [0, 0.16, 6.9] as [number, number, number],
      fov: 34,
    }),
    [],
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#070604]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={camera}
        gl={{ antialias: true, alpha: false }}
        className="h-full w-full"
        onPointerMissed={() => setIsOpen((open) => !open)}
      >
        <color attach="background" args={["#070604"]} />
        <fog attach="fog" args={["#070604", 6, 11]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[-3.2, 4.5, 4.8]}
          intensity={2.6}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[2.2, -1.3, 2.2]} color="#b8733f" intensity={2.1} />
        <spotLight
          position={[0, 3, 5]}
          angle={0.35}
          penumbra={0.8}
          intensity={1.2}
          color="#f1d09a"
        />
        <Environment preset="city" />

        <group onClick={() => setIsOpen((open) => !open)}>
          <PassportModel isOpen={isOpen} stampIndex={stampIndex} />
        </group>

        <ContactShadows
          position={[0, -2.28, -0.2]}
          opacity={0.42}
          scale={5.4}
          blur={2.6}
          far={3.8}
        />
        <OrbitControls
          enablePan
          enableZoom
          target={[0, 0, 0]}
          minDistance={1.55}
          maxDistance={8.8}
          autoRotate={false}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_0%,transparent_38%,rgba(0,0,0,0.58)_100%)]" />
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/35 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="rounded-full px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
        >
          {isOpen ? "close" : "open"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setStampIndex((index) => index + 1);
          }}
          className="rounded-full px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
        >
          stamp
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setStampIndex(0);
          }}
          className="rounded-full px-4 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white active:scale-[0.98]"
        >
          reset
        </button>
      </div>
    </div>
  );
}
