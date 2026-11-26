"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Escena WebGL (three.js) para una foto a pantalla completa:
 * - revelado orgánico con ruido y aberración cromática al entrar,
 * - movimiento lento tipo Ken Burns + paralaje con el puntero,
 * - transición con ruido entre fotos,
 * - partículas doradas tipo luciérnagas.
 * Si no hay WebGL o el usuario prefiere menos movimiento, muestra la foto estática.
 */
export function PhotoStage({ photos, index, onReady }: { photos: string[]; index: number; onReady?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ show: (i: number) => void } | null>(null);
  const [fallback, setFallback] = useState(false);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      if (reduce) throw new Error("reduced motion");
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin WebGL: se muestra la foto estática
      setFallback(true);
      onReadyRef.current?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    camera.position.z = 1;

    const blank = new THREE.DataTexture(new Uint8Array([12, 34, 19, 255]), 1, 1);
    blank.needsUpdate = true;
    const uniforms = {
      uTexA: { value: blank as THREE.Texture },
      uTexB: { value: blank as THREE.Texture },
      uImgA: { value: new THREE.Vector2(1, 1) },
      uImgB: { value: new THREE.Vector2(1, 1) },
      uMix: { value: 0 },
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uRes: { value: new THREE.Vector2(1, 1) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTexA; uniform sampler2D uTexB;
        uniform vec2 uImgA; uniform vec2 uImgB; uniform vec2 uRes; uniform vec2 uMouse;
        uniform float uMix; uniform float uReveal; uniform float uTime;

        // Ruido simplex 2D (Ashima Arts, MIT)
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v){
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m; m = m*m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
          vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }
        // UV tipo "object-fit: cover" + Ken Burns + paralaje
        vec2 coverUv(vec2 uv, vec2 img) {
          float rs = uRes.x / uRes.y; float ri = img.x / img.y;
          vec2 scale = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
          float zoom = 1.06 + 0.04 * sin(uTime * 0.05);
          vec2 drift = vec2(sin(uTime * 0.04), cos(uTime * 0.03)) * 0.012 + uMouse * 0.018;
          return (uv - 0.5) * scale / zoom + 0.5 + drift;
        }
        vec3 sampleRGB(sampler2D t, vec2 uv, float shift) {
          return vec3(texture2D(t, uv + vec2(shift, 0.0)).r, texture2D(t, uv).g, texture2D(t, uv - vec2(shift, 0.0)).b);
        }
        void main() {
          float n = snoise(vUv * 2.6 + uTime * 0.03) * 0.5 + 0.5;
          float shift = (1.0 - uReveal) * 0.03 + 0.0015;
          vec3 a = sampleRGB(uTexA, coverUv(vUv, uImgA), shift);
          vec3 b = sampleRGB(uTexB, coverUv(vUv, uImgB), shift);
          // Transición entre fotos con borde de ruido: uMix = 0 → foto anterior (B), uMix = 1 → foto nueva (A)
          float edge = n * 0.76 + vUv.x * 0.12;
          float t = smoothstep(edge - 0.12, edge + 0.12, uMix * 1.24 - 0.12);
          vec3 col = mix(b, a, t);
          // Revelado radial orgánico desde el centro
          float r = length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0)) + n * 0.25;
          float reveal = smoothstep(uReveal * 1.6 - 0.25, uReveal * 1.6, r);
          col = mix(col, vec3(0.047, 0.133, 0.075), reveal);
          // Gradación cálida, viñeta y grano
          col = pow(col, vec3(0.96)) * vec3(1.03, 1.0, 0.95);
          float vig = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.3);
          col *= mix(0.72, 1.0, vig);
          col += (fract(sin(dot(vUv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.035;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    // Luciérnagas
    const COUNT = 140;
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = Math.random() * 2 - 1;
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      pos[i * 3 + 2] = 0;
      seed[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uReveal: uniforms.uReveal, uMouse: uniforms.uMouse, uScale: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec2 uMouse; uniform float uScale; varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + 1.0 + uTime * (0.015 + aSeed * 0.03), 2.0) - 1.0;
          p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.02 + uMouse.x * 0.03 * (0.5 + aSeed);
          vAlpha = (0.35 + 0.65 * abs(sin(uTime * (0.8 + aSeed) + aSeed * 30.0)));
          gl_Position = vec4(p.xy, 0.0, 1.0);
          gl_PointSize = (2.0 + aSeed * 5.0) * uScale;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uReveal; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha * uReveal * 0.7;
          gl_FragColor = vec4(1.0, 0.82, 0.38, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);

    // Texturas
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const cache = new Map<string, THREE.Texture>();
    const load = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        const hit = cache.get(url);
        if (hit) return resolve(hit);
        loader.load(url, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.minFilter = THREE.LinearFilter;
          t.generateMipmaps = false;
          cache.set(url, t);
          resolve(t);
        }, undefined, reject);
      });
    const size = (t: THREE.Texture) => {
      const img = t.image as { width: number; height: number };
      return new THREE.Vector2(img.width || 1, img.height || 1);
    };

    let current = -1;
    let mixTarget = 1;
    let revealTarget = 0;
    const show = async (i: number) => {
      const url = photos[i];
      if (!url || i === current) return;
      try {
        const tex = await load(url);
        if (current === -1) {
          uniforms.uTexA.value = tex;
          uniforms.uImgA.value = size(tex);
          uniforms.uMix.value = 1;
          revealTarget = 1;
          onReadyRef.current?.();
        } else {
          // La foto actual pasa a B y la nueva entra en A con la transición de ruido
          uniforms.uTexB.value = uniforms.uTexA.value;
          uniforms.uImgB.value = uniforms.uImgA.value.clone();
          uniforms.uTexA.value = tex;
          uniforms.uImgA.value = size(tex);
          uniforms.uMix.value = 0;
          mixTarget = 1;
        }
        current = i;
      } catch {
        if (current === -1) {
          setFallback(true);
          onReadyRef.current?.();
        }
      }
    };
    api.current = { show: (i) => void show(i) };

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const target = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    };
    window.addEventListener("pointermove", onMove);

    const timer = new THREE.Timer();
    let raf = 0;
    const tick = (now?: number) => {
      raf = requestAnimationFrame(tick);
      timer.update(now);
      if (document.hidden) return;
      const dt = Math.min(timer.getDelta(), 0.05);
      uniforms.uTime.value += dt;
      uniforms.uReveal.value += (revealTarget - uniforms.uReveal.value) * Math.min(1, dt * 1.6);
      uniforms.uMix.value += (mixTarget - uniforms.uMix.value) * Math.min(1, dt * 1.2);
      uniforms.uMouse.value.lerp(target, Math.min(1, dt * 2.5));
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      timer.dispose();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      api.current = null;
      cache.forEach((t) => t.dispose());
      blank.dispose();
      quad.geometry.dispose();
      material.dispose();
      pGeo.dispose();
      pMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // La escena se crea una vez por lista de fotos.
  }, [photos]);

  useEffect(() => {
    api.current?.show(index);
  }, [index, photos]);

  return (
    <div ref={host} className="absolute inset-0 bg-forest-950" aria-hidden>
      {fallback && photos[index] && (
        // eslint-disable-next-line @next/next/no-img-element -- respaldo sin WebGL
        <img src={photos[index]} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  );
}
