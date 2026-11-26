"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Destination } from "@/data/destinations";
import { coverOf, sized } from "@/lib/media";
import { categoryColor } from "./icons";

export type MapStyleKey = "map" | "satellite";

// El worker se sirve como archivo estático (copiado en `postinstall`) para que
// funcione con Turbopack sin configuración adicional del bundler.
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

// Relieve real: Terrain Tiles de AWS (Mapzen, codificación terrarium). Gratis, sin clave y con CORS abierto.
const DEM_TILES = ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"];
const DEM_ATTRIBUTION = "Terreno: Mapzen / AWS Terrain Tiles";
const EXAGGERATION = 1.5; // el relieve de Darién (≈1.800 m en el Pirre) se lee mejor un poco exagerado
const PITCH_3D = 55;

/** Añade al estilo actual las fuentes de elevación, el sombreado del relieve y el cielo. */
function addRelief(m: MLMap, on3d: boolean) {
  if (!m.getSource("dem-terrain")) {
    // Fuentes separadas para terreno y sombreado: MapLibre lo recomienda para no mezclar cachés.
    m.addSource("dem-terrain", { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: DEM_ATTRIBUTION });
    m.addSource("dem-hill", { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 15 });
  }
  if (!m.getLayer("relief-hillshade")) {
    const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
    m.addLayer(
      {
        id: "relief-hillshade",
        type: "hillshade",
        source: "dem-hill",
        paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#1f3a2b", "hillshade-highlight-color": "#fff8e6" },
      },
      firstSymbol,
    );
  }
  m.setSky({
    "sky-color": "#8cc4e8",
    "horizon-color": "#e9f1ea",
    "fog-color": "#dfe9e1",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": 0.6,
  });
  m.setTerrain(on3d ? { source: "dem-terrain", exaggeration: EXAGGERATION } : null);
}

/** Encuadre de la provincia de Darién y alrededores (Tortí–Bahía Piña). */
const DARIEN_BOUNDS: [[number, number], [number, number]] = [
  [-78.75, 7.35],
  [-77.15, 9.05],
];

interface Props {
  destinations: Destination[];
  selected: string | null;
  onSelect: (slug: string) => void;
  styleKey: MapStyleKey;
  /** Relieve 3D con la cámara inclinada; en false el mapa es plano (2D). */
  terrain3d: boolean;
}

export function DarienMap({ destinations, selected, onSelect, styleKey, terrain3d }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const terrainRef = useRef(terrain3d);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: VECTOR_STYLE,
      bounds: DARIEN_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      pitch: terrain3d ? PITCH_3D : 0,
      maxPitch: 75,
      maxBounds: [
        [-80.5, 6.5],
        [-76.0, 10.2],
      ],
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    // Se dispara con el estilo inicial y tras cada setStyle (mapa ↔ satélite), que borra capas propias.
    m.on("style.load", () => addRelief(m, terrainRef.current));
    map.current = m;
    const current = markers.current;
    return () => {
      current.forEach((mk) => mk.remove());
      current.clear();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una sola vez; el 3D se aplica abajo
  }, []);

  // Activa o desactiva el relieve 3D e inclina o endereza la cámara.
  useEffect(() => {
    terrainRef.current = terrain3d;
    const m = map.current;
    if (!m) return;
    if (m.isStyleLoaded()) m.setTerrain(terrain3d ? { source: "dem-terrain", exaggeration: EXAGGERATION } : null);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.easeTo({ pitch: terrain3d ? PITCH_3D : 0, bearing: terrain3d ? m.getBearing() : 0, duration: reduce ? 0 : 1000 });
  }, [terrain3d]);

  // Cambia el estilo base (los marcadores DOM sobreviven al cambio).
  const firstStyle = useRef(true);
  useEffect(() => {
    if (!map.current) return;
    if (firstStyle.current) {
      firstStyle.current = false;
      if (styleKey === "map") return;
    }
    map.current.setStyle(styleKey === "map" ? VECTOR_STYLE : SATELLITE_STYLE);
  }, [styleKey]);

  // Sincroniza marcadores con la lista filtrada.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const wanted = new Set(destinations.map((d) => d.slug));
    markers.current.forEach((mk, slug) => {
      if (!wanted.has(slug)) {
        mk.remove();
        markers.current.delete(slug);
      }
    });
    for (const d of destinations) {
      if (markers.current.has(d.slug)) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "xd-marker";
      el.dataset.slug = d.slug;
      el.setAttribute("aria-label", d.name);
      el.style.setProperty("--ring", categoryColor[d.category]);
      const img = document.createElement("img");
      img.src = sized(coverOf(d.photos), 160);
      img.alt = "";
      img.loading = "lazy";
      const label = document.createElement("span");
      label.className = "xd-marker-label";
      label.textContent = d.name;
      el.append(img, label);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(d.slug);
      });
      const mk = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([d.coords[1], d.coords[0]]).addTo(m);
      markers.current.set(d.slug, mk);
    }
  }, [destinations]);

  // Resalta y centra el destino seleccionado.
  useEffect(() => {
    markers.current.forEach((mk, slug) => {
      const el = mk.getElement();
      el.classList.toggle("is-selected", slug === selected);
      el.style.zIndex = slug === selected ? "10" : "";
    });
    const m = map.current;
    const d = destinations.find((x) => x.slug === selected);
    if (!m || !d) return;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    m.flyTo({
      center: [d.coords[1], d.coords[0]],
      zoom: Math.max(m.getZoom(), terrain3d ? 11.5 : 10.5),
      // En 3D la cámara baja inclinada hacia el lugar, como un vuelo de dron.
      pitch: terrain3d ? 62 : 0,
      offset: desktop ? [-200, 0] : [0, -140],
      duration: reduce ? 0 : 1400,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cambiar 2D/3D no debe volver a volar al lugar
  }, [selected, destinations]);

  return (
    <div className="absolute inset-0" role="region" aria-label="Mapa interactivo de Darién">
      {/* MapLibre fuerza position:relative en su contenedor: se usa un hijo h-full. */}
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
