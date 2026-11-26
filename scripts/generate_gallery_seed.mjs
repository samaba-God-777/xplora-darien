#!/usr/bin/env node
// Genera database/seeds/002_gallery.sql: metadatos editoriales de los recursos de pageWeb
// (título, tipo, categorías, procedencia, póster de video, destacados, estado).
// Requiere haber cargado 001_destinations.sql. Idempotente.
// Uso: node scripts/generate_gallery_seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { destinations } = await import(join(root, "frontend/src/data/destinations.ts"));
const manifest = JSON.parse(readFileSync(join(root, "frontend/src/data/media-manifest.json"), "utf8"));
const inventory = JSON.parse(readFileSync(join(root, "review/instagram/inventory.json"), "utf8"));

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
const web = (p) => p.replace(/^review\//, "");
const bySlug = Object.fromEntries(destinations.map((d) => [d.slug, d]));
const postCode = (file) => {
  const name = file.split("/").pop();
  return inventory.posts.find((p) => name.slice(11).startsWith(p.code))?.code ?? null;
};
const posts = Object.fromEntries(inventory.posts.map((p) => [p.code, p]));

// Categoría de destino → categorías editoriales de la galería.
const CAT = {
  selva: ["selva-naturaleza"], ecoturismo: ["selva-naturaleza"], rios: ["rios-cascadas"], cascadas: ["rios-cascadas"],
  montanas: ["montanas-paisajes"], playas: ["playas-costas"], cultura: ["cultura-tradiciones"],
  comunidades: ["comunidades"], aves: ["fauna-biodiversidad"], aventura: ["aventuras-exploracion"],
};

// Publicaciones sin lugar identificado en su texto: solo categorías, sin destino.
const UNLINKED = {
  // "¿Qué lugar de Panamá crees que sea?": costa del Pacífico no identificada.
  DeyBzMDAP_7: { title: "Costa del Pacífico panameño", cats: ["playas-costas", "aventuras-exploracion"],
    perSlide: { 9: ["cultura-tradiciones"], 11: ["rios-cascadas"], 12: ["rios-cascadas"], 15: ["fauna-biodiversidad"], 16: ["fauna-biodiversidad"] } },
  // "Vamos a ver quién conoce este lugar, está en Darién".
  DdNjqxBAGVT: { title: "Pozas y ríos de Darién", cats: ["rios-cascadas", "montanas-paisajes", "aventuras-exploracion"] },
  CnStkvpKBmS: { title: "Atardecer en la costa darienita", cats: ["playas-costas"] },
  CpdvzXZsz2B: { title: "Atardecer", cats: ["playas-costas"] },
  CWt51QZNgau: { title: "Bienvenidos a Darién", cats: ["rios-cascadas", "selva-naturaleza"] },
  CfWv0KUuh_m: { title: "Explora y Reforesta 2022", cats: ["experiencias", "comunidades"] },
};
const GRAPHICS = new Set(["imagen/img4.jpeg", "review/instagram/posters/2022-05-31_CeO4spZO-ad_foto_cover.jpg",
  "review/instagram/posters/2023-06-11_CtXWUvzvLMO_foto_cover.jpg", "review/instagram/posters/2023-04-19_CrO2CohvgYG_foto_cover.jpg"]);
// Video cuyo rótulo visible dice "Cascada del Jobo, Darién".
const SIGNAGE_LINKS = { "instagram/videos/2024-10-09_DA6b0XSvu0P_reel.mp4": "cascada-el-jobo" };
// Publicaciones cuyo texto trata de flora/fauna (helecho gigante, aves, biodiversidad).
const FAUNA_POSTS = new Set(["CrO2CohvgYG", "DNAItQeMV9f", "CbBBvsmuFF_"]);
const REFOREST = new Set(["DfgX-g1Dq5f", "CfWv0KUuh_m", "CeO4spZO-ad", "CtXWUvzvLMO", "DBIQrXZtZXZ"]);
const FEATURED = new Set([
  "imagen/img3.webp", "imagen/yaviza.jpg", "imagen/arenal.jpg", "imagen/playa mueto2.jpeg", "imagen/playmuerto.jpeg",
  "instagram/slides/2026-09-12_DdNjqxBAGVT_slide-01.jpg", "instagram/slides/2026-10-21_DeyBzMDAP_7_slide-03.jpg",
  "instagram/slides/2023-03-15_Cp0UqliOI4Q_slide-02.jpg", "instagram/slides/2025-08-12_DNRXk6ov-H4_slide-03.jpg",
  "instagram/videos/2026-11-09_DfiYvP4hpeX_reel.mp4", "instagram/videos/2025-08-13_DNTsjVjPh3N_reel.mp4",
  "instagram/videos/2025-10-10_DPovSRODfHd_reel.mp4", "instagram/videos/2024-10-14_DBIQrXZtZXZ_reel.mp4",
  "instagram/videos/2025-07-11_DL-5eo6PMvD_reel.mp4",
]);

// Título del destino de un recurso según destinations.ts (fotos/videos explícitos).
const explicit = {};
for (const d of destinations) for (const p of [...d.photos, ...d.videos]) explicit[p] ??= d.slug;

const out = ["-- Generado por scripts/generate_gallery_seed.mjs. Idempotente.", "BEGIN;", ""];
for (const m of manifest) {
  const path = web(m.path);
  const code = path.startsWith("instagram/") ? postCode(path) : null;
  const post = code ? posts[code] : null;
  const isVideo = m.type === "video";
  const isPoster = path.startsWith("instagram/posters/");
  const internal = m.internal || !!m.duplicateOf || (isPoster && /_reel_cover\.jpg$/.test(path));
  const graphic = GRAPHICS.has(m.path) || GRAPHICS.has(path);
  const destSlug = explicit[path] ?? (m.destination && bySlug[m.destination] ? m.destination : null) ?? SIGNAGE_LINKS[path] ?? null;
  const dest = destSlug ? bySlug[destSlug] : null;
  const unlinked = code ? UNLINKED[code] : null;

  const cats = new Set();
  // Solo la categoría principal del destino: las secundarias diluyen las colecciones.
  if (dest) { (CAT[dest.category] ?? []).forEach((x) => cats.add(x)); cats.add("destinos-turisticos"); }
  if (code && FAUNA_POSTS.has(code)) cats.add("fauna-biodiversidad");
  if (unlinked) {
    unlinked.cats.forEach((c) => cats.add(c));
    const slide = Number(path.match(/slide-(\d+)/)?.[1]);
    (unlinked.perSlide?.[slide] ?? []).forEach((c) => cats.add(c));
  }
  if (isVideo) cats.add("videos-promocionales");
  if (code && REFOREST.has(code)) cats.add("experiencias");

  const title = dest ? dest.name : unlinked?.title ?? (post ? post.caption.split("\\n")[0].replace(/[📍#].*$/u, "").trim().slice(0, 80) : null) ?? "Darién";
  const description = dest ? dest.summary.es : null;
  const status = internal || graphic ? "draft" : "published";
  const contentType = isVideo ? "video" : graphic ? "graphic" : "photo";
  const source = post ? `https://www.instagram.com/p/${post.code}/` : null;

  out.push(
    `UPDATE media_assets SET title = ${q(title)}, description = ${q(description)}, content_type = '${contentType}', ` +
      `status = '${status}', published_at = ${status === "published" ? "now()" : "NULL"}, is_internal = ${internal}, ` +
      `is_featured = ${FEATURED.has(path)}, source_url = ${q(source)}, ` +
      `mime_type = ${q(isVideo ? "video/mp4" : { jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif", png: "image/png" }[path.split(".").pop().toLowerCase()])}` +
      (m.duplicateOf ? `, duplicate_of = (SELECT id FROM media_assets WHERE path = ${q(web(m.duplicateOf))})` : "") +
      ` WHERE path = ${q(path)};`,
  );
  for (const c of cats)
    out.push(`INSERT INTO media_asset_categories SELECT m.id, c.id FROM media_assets m, media_categories c WHERE m.path = ${q(path)} AND c.key = ${q(c)} ON CONFLICT DO NOTHING;`);
  // Asociación por pie de foto / rótulo cuando no estaba en destinations.ts.
  if (dest && !explicit[path]) {
    const attr = SIGNAGE_LINKS[path] ? "visible_signage" : "owner_caption";
    out.push(
      `INSERT INTO media_destinations (destination_id, media_id, sort_order, is_cover, attribution, attribution_note) ` +
        `SELECT d.id, m.id, 100, false, '${attr}', ${q(attr === "owner_caption" ? "Nombrado en la publicación original de @xplore_darien" : "Rótulo visible en el video")} ` +
        `FROM destinations d, media_assets m WHERE d.slug = ${q(destSlug)} AND m.path = ${q(path)} ON CONFLICT DO NOTHING;`,
    );
  }
}

// Póster de cada video: la portada publicada junto al video en Instagram.
out.push("", "-- Pósters de video");
for (const m of manifest.filter((x) => x.type === "video")) {
  const v = web(m.path);
  const poster = v.replace("/videos/", "/posters/").replace(/_reel\.mp4$/, "_reel_cover.jpg").replace(/_video\.mp4$/, "_cover.jpg");
  out.push(`UPDATE media_assets SET poster_media_id = (SELECT id FROM media_assets WHERE path = ${q(poster)}) WHERE path = ${q(v)};`);
}

// Portada editorial de cada categoría (elegida a mano; si falta, el destacado más grande).
const COVERS = {
  "selva-naturaleza": "imagen/img3.webp", "rios-cascadas": "imagen/arenal.jpg",
  "montanas-paisajes": "instagram/slides/2023-03-15_Cp0UqliOI4Q_slide-02.jpg", "playas-costas": "imagen/playa mueto2.jpeg",
  "cultura-tradiciones": "imagen/img10.jpeg", comunidades: "imagen/lara.avif",
  "fauna-biodiversidad": "instagram/slides/2026-10-21_DeyBzMDAP_7_slide-16.jpg",
  "aventuras-exploracion": "instagram/slides/2026-09-12_DdNjqxBAGVT_slide-01.jpg", "destinos-turisticos": "imagen/yaviza.jpg",
  experiencias: "instagram/slides/2022-06-28_CfWv0KUuh_m_slide-02.jpg",
  "videos-promocionales": "instagram/posters/2025-08-13_DNTsjVjPh3N_reel_cover.jpg",
};
out.push("", "-- Portadas de categorías");
for (const [k, p] of Object.entries(COVERS))
  out.push(`UPDATE media_categories SET cover_media_id = (SELECT id FROM media_assets WHERE path = ${q(p)}) WHERE key = ${q(k)};`);
out.push(`UPDATE media_categories c SET cover_media_id = (
  SELECT m.id FROM media_asset_categories mc JOIN media_assets m ON m.id = mc.media_id
  WHERE mc.category_id = c.id AND m.status = 'published' AND m.content_type = 'photo'
  ORDER BY m.is_featured DESC, (m.width * m.height) DESC NULLS LAST LIMIT 1) WHERE c.cover_media_id IS NULL;`);
out.push(`UPDATE media_categories c SET cover_media_id = (
  SELECT m.poster_media_id FROM media_asset_categories mc JOIN media_assets m ON m.id = mc.media_id
  WHERE mc.category_id = c.id AND m.content_type = 'video' AND m.poster_media_id IS NOT NULL
  ORDER BY m.is_featured DESC LIMIT 1) WHERE c.cover_media_id IS NULL;`);

out.push("", "COMMIT;", "");
writeFileSync(join(root, "database/seeds/002_gallery.sql"), out.join("\n"));
console.log(`${manifest.length} recursos → database/seeds/002_gallery.sql`);
