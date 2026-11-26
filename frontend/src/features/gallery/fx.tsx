"use client";

/**
 * Efectos de movimiento estilo "página de producto" (Apple): entradas al hacer scroll,
 * titulares que se iluminan palabra por palabra, inclinación 3D con brillo y parallax.
 * Todo usa transform/opacity (compuesto en GPU) y se desactiva con "reducir movimiento".
 */
import { useRef, type ReactNode } from "react";
import { useLocale } from "@/i18n/locale";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

export const appleEase = [0.22, 1, 0.36, 1] as const;

/** Entrada al aparecer en pantalla: sube, se aclara y se asienta (escalonado por índice). */
export function Reveal({ children, index = 0, className, as = "div" }: { children: ReactNode; index?: number; className?: string; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y: 48, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.9, ease: appleEase, delay: reduce ? 0 : (index % 4) * 0.08 }}
    >
      {children}
    </Comp>
  );
}

/** Titular que se "enciende" palabra por palabra mientras se hace scroll. */
export function ScrollHeadline({ text: es, en, className }: { text: string; en?: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const text = useLocale() === "en" && en ? en : es;
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "start 0.45"] });
  const words = text.split(" ");
  return (
    <h2 ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <Word key={`${text}-${i}`} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} still={!!reduce}>
          {w}
        </Word>
      ))}
    </h2>
  );
}
function Word({ children, progress, range, still }: { children: string; progress: MotionValue<number>; range: [number, number]; still: boolean }) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  const y = useTransform(progress, range, [10, 0]);
  return (
    <motion.span aria-hidden className="inline-block" style={still ? undefined : { opacity, y }}>
      {children}&nbsp;
    </motion.span>
  );
}

/**
 * Tarjeta con inclinación 3D que sigue al puntero, brillo especular y leve elevación.
 * Solo con puntero fino (mouse/trackpad); en táctil queda estática.
 */
export function TiltCard({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), spring);
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, rgba(255,255,255,0.28), transparent 45%)`;

  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={`group/tilt relative [transform-style:preserve-3d] ${className ?? ""}`}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      whileHover={{ scale: 1.025, z: 20 }}
      transition={{ type: "spring", ...spring }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => (px.set(0.5), py.set(0.5))}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 mix-blend-soft-light transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ background: glare }}
      />
    </motion.div>
  );
}

/** Parallax interno: la imagen se desliza dentro de su marco mientras la tarjeta cruza la pantalla. */
export function Parallax({ children, amount = 10 }: { children: ReactNode; amount?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${amount}%`, `${amount}%`]);
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <motion.div className="absolute -inset-y-[14%] inset-x-0" style={reduce ? undefined : { y }}>
        {children}
      </motion.div>
    </div>
  );
}
