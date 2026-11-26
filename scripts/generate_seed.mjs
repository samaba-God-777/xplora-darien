#!/usr/bin/env node
// Genera database/seeds/001_destinations.sql a partir de
// frontend/src/data/destinations.ts y frontend/src/data/media-manifest.json.
// Uso: node scripts/generate_seed.mjs   (Node >= 22.18, type stripping nativo)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { destinations } = await import(join(root, "frontend/src/data/destinations.ts"));
const manifest = JSON.parse(readFileSync(join(root, "frontend/src/data/media-manifest.json"), "utf8"));

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);
const arr = (a) => `ARRAY[${a.map(q).join(",")}]::text[]`;
// Las rutas de la web usan "instagram/…" y el manifiesto "review/instagram/…"; en BD se guarda la ruta web.
const webPath = (p) => p.replace(/^review\//, "");

// Procedencia de cada asociación foto→lugar (ver attribution_source en la migración 0008).
// Solo 'editorial_guess' se oculta al público hasta que el equipo la verifique.
const EDITORIAL_GUESS = new Set(["imagen/image1.jpeg", "imagen/img6.jpg", "imagen/img5.jpeg"]);
const SIGNAGE = new Set(["imagen/img10.jpeg", "imagen/img7.jpeg", "imagen/img2.jpeg"]);
const attribution = (p) =>
  EDITORIAL_GUESS.has(p) ? "editorial_guess"
  : SIGNAGE.has(p) ? "visible_signage"
  : p.startsWith("imagen/") ? "owner_filename"
  : "owner_caption";

const out = [
  "-- Generado por scripts/generate_seed.mjs. Idempotente.",
  "-- Contenido derivado de pageWeb/ (fotos y publicaciones de @xplore_darien).",
  "-- Los destinos se publican; coords_verified refleja si la ubicación fue validada.",
  "BEGIN;",
  "",
  "-- Recursos multimedia (todos los archivos de pageWeb)",
];
for (const m of manifest) {
  out.push(
    `INSERT INTO media_assets (kind, content_type, path, width, height, duration_s, bytes, alt_text, is_internal) VALUES (` +
      `'${m.type === "video" ? "video" : "image"}', '${m.type === "video" ? "video" : "photo"}', ${q(webPath(m.path))}, ${m.width ?? "NULL"}, ${m.height ?? "NULL"}, ` +
      `${m.duration ?? "NULL"}, ${m.bytes}, ${q(m.description || null)}, ${m.internal || m.duplicateOf ? "true" : "false"}) ` +
      `ON CONFLICT (path) DO NOTHING;`,
  );
}

for (const d of destinations) {
  out.push("", `-- ${d.name}`);
  out.push(
    `INSERT INTO destinations (slug, name, category_id, region, summary, description, history, latitude, longitude, ` +
      `coords_verified, difficulty, visit_duration, season, access_info, safety_info, status, is_featured, sources) VALUES (` +
      [
        q(d.slug), q(d.name), `(SELECT id FROM destination_categories WHERE key=${q(d.category)})`,
        q(d.region.es), q(d.summary.es), q(d.description.es), q(d.history?.es ?? null),
        d.coords[0], d.coords[1], d.coordsVerified, `'${d.difficulty}'`, q(d.visitDuration.es), q(d.season.es),
        q(d.access.es), q(d.safety.es), "'published'",
        ["cascada-arenal", "playa-muerto", "parque-nacional-darien", "el-embudo", "yaviza", "puerto-lara"].includes(d.slug),
        arr(d.sources),
      ].join(", ") +
      `) ON CONFLICT (slug) DO NOTHING;`,
  );
  const id = `(SELECT id FROM destinations WHERE slug=${q(d.slug)})`;
  d.categories.forEach((c) =>
    out.push(
      `INSERT INTO destination_category_links SELECT ${id}, id FROM destination_categories WHERE key=${q(c)} ON CONFLICT DO NOTHING;`,
    ),
  );
  d.activities.forEach((a, i) =>
    out.push(
      `INSERT INTO destination_activities SELECT ${id}, id, ${i} FROM activity_types WHERE key=${q(a)} ON CONFLICT DO NOTHING;`,
    ),
  );
  [...d.photos, ...d.videos].forEach((p, i) =>
    out.push(
      `INSERT INTO media_destinations (destination_id, media_id, sort_order, is_cover, attribution) SELECT ${id}, id, ${i}, ${i === 0}, '${attribution(p)}' FROM media_assets WHERE path=${q(p)} ON CONFLICT DO NOTHING;`,
    ),
  );
  const en = {
    name: d.name, region: d.region.en, summary: d.summary.en, description: d.description.en,
    history: d.history?.en, visit_duration: d.visitDuration.en, season: d.season.en,
    access_info: d.access.en, safety_info: d.safety.en,
  };
  for (const [field, value] of Object.entries(en)) {
    if (!value) continue;
    out.push(
      `INSERT INTO translations (entity_type, entity_id, locale, field, value) SELECT 'destination', id::text, 'en', ${q(field)}, ${q(value)} ` +
        `FROM destinations WHERE slug=${q(d.slug)} ON CONFLICT (entity_type, entity_id, locale, field) DO UPDATE SET value = EXCLUDED.value;`,
    );
  }
}
out.push("", "COMMIT;", "");

const file = join(root, "database/seeds/001_destinations.sql");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, out.join("\n"));
console.log(`${destinations.length} destinos, ${manifest.length} medios → database/seeds/001_destinations.sql`);
