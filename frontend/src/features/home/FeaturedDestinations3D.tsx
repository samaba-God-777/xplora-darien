"use client";

/**
 * "Destinos destacados" con profundidad 3D:
 * - La cuadrícula entra inclinada (como una mesa vista en perspectiva) y se endereza con el scroll.
 * - Cada tarjeta se voltea hacia arriba al aparecer (escalonado).
 * - Al pasar el mouse la tarjeta se inclina; la foto se desplaza en sentido contrario y el texto
 *   flota por delante (capas con translateZ), con brillo que sigue al cursor.
 * Solo transform/opacity. Con "reducir movimiento" todo queda estático.
 */
import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { destinations, type Destination } from "@/data/destinations";
import { activityLabels, categoryLabels } from "@/i18n/dictionary";
import { coverOf, sized } from "@/lib/media";
import { activityIcons } from "@/features/map/icons";
import { useLocale } from "@/i18n/locale";

const ease = [0.22, 1, 0.36, 1] as const;

export function FeaturedDestinations3D({ slugs }: { slugs: string[] }) {
  const featured = slugs.map((s) => destinations.find((d) => d.slug === s)).filter((d): d is Destination => !!d);
  const ref = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.35"] });
  const tableTilt = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const tableY = useTransform(scrollYProgress, [0, 1], [60, 0]);

  return (
    <div className="[perspective:1600px]">
      <motion.ul
        ref={ref}
        style={reduce ? undefined : { rotateX: tableTilt, y: tableY, transformOrigin: "50% 0%" }}
        className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {featured.map((d, i) => (
          <motion.li
            key={d.slug}
            className="[perspective:1100px]"
            initial={reduce ? false : { opacity: 0, rotateX: -28, y: 90, scale: 0.92 }}
            whileInView={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 1.1, ease, delay: reduce ? 0 : (i % 3) * 0.12 + Math.floor(i / 3) * 0.08 }}
            style={{ transformOrigin: "50% 100%" }}
          >
            <Card d={d} still={!!reduce} />
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

function Card({ d, still }: { d: Destination; still: boolean }) {
  const l = useLocale();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 180, damping: 20, mass: 0.7 };
  const rx = useSpring(useTransform(py, [0, 1], [11, -11]), spring);
  const ry = useSpring(useTransform(px, [0, 1], [-13, 13]), spring);
  // La foto se mueve en sentido contrario al puntero: sensación de ventana con fondo lejano.
  const imgX = useSpring(useTransform(px, [0, 1], [18, -18]), spring);
  const imgY = useSpring(useTransform(py, [0, 1], [14, -14]), spring);
  const lift = useSpring(0, spring);
  const shadowY = useTransform(lift, [0, 1], [18, 46]);
  const shadowBlur = useTransform(lift, [0, 1], [40, 90]);
  const shadow = useMotionTemplate`0 ${shadowY}px ${shadowBlur}px rgba(12, 35, 24, 0.35)`;
  const gx = useTransform(px, (v) => `${v * 100}%`);
  const gy = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(520px circle at ${gx} ${gy}, rgba(255,255,255,0.32), transparent 42%)`;
  const z = useTransform(lift, [0, 1], [0, 40]);

  return (
    <Link
      href={`/mapa?lugar=${d.slug}`}
      className="group block rounded-3xl focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-gold-400"
      aria-label={`${d.name}: ${l === "en" ? "view on the map" : "ver en el mapa"}`}
      onPointerMove={(e) => {
        if (still || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerEnter={(e) => !still && e.pointerType === "mouse" && lift.set(1)}
      onPointerLeave={() => (px.set(0.5), py.set(0.5), lift.set(0))}
    >
      <motion.div
        className="relative aspect-[4/5] rounded-3xl [transform-style:preserve-3d]"
        style={still ? undefined : { rotateX: rx, rotateY: ry, z, boxShadow: shadow }}
      >
        {/* Capa fondo: foto */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl bg-forest-900">
          <motion.div className="absolute -inset-8" style={still ? undefined : { x: imgX, y: imgY }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sized(coverOf(d.photos), 1080, 80)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition duration-[1.2s] ease-out group-hover:scale-[1.06]"
            />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 mix-blend-soft-light transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: glare }}
          />
        </div>

        {/* Capa media: etiqueta y flecha flotando */}
        <div className="absolute inset-x-5 top-5 flex items-start justify-between [transform:translateZ(40px)]">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-300 backdrop-blur">
            <MapPin className="size-3" /> {categoryLabels[d.category][l]}
          </span>
          <span className="grid size-10 place-items-center rounded-full bg-white/15 text-white opacity-0 backdrop-blur transition duration-500 group-hover:rotate-45 group-hover:bg-gold-400 group-hover:text-forest-950 group-hover:opacity-100 group-focus-visible:opacity-100">
            <ArrowUpRight className="size-5" />
          </span>
        </div>

        {/* Capa frontal: texto, lo más cerca del visitante */}
        <div className="absolute inset-x-0 bottom-0 p-5 text-white [transform:translateZ(70px)]">
          <h3 className="font-display text-3xl leading-tight drop-shadow-[0_6px_18px_rgba(0,0,0,0.5)]">{d.name}</h3>
          <p className="mt-1 text-sm text-white/85">{d.summary[l]}</p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {d.activities.slice(0, 3).map((a, k) => {
              const Icon = activityIcons[a];
              return (
                <li
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold backdrop-blur transition duration-500 group-hover:-translate-y-1 group-hover:bg-white/20"
                  style={{ transitionDelay: `${k * 60}ms` }}
                >
                  <Icon className="size-3 text-gold-300" /> {activityLabels[a][l]}
                </li>
              );
            })}
          </ul>
        </div>
      </motion.div>
    </Link>
  );
}

