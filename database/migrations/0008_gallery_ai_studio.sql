-- XPLORA DARIÉN · 0008 · Cinematic Gallery, Media Management Studio y XPLORA AI Video Studio
-- Los archivos originales de pageWeb/ nunca se modifican: las miniaturas y optimizaciones
-- se generan como derivados en el almacenamiento (STORAGE_DIR).

-- ---------------------------------------------------------------- Recursos multimedia
CREATE TYPE media_content AS ENUM ('photo', 'video', 'graphic');
-- Procedencia de la asociación entre un recurso y un lugar.
CREATE TYPE attribution_source AS ENUM (
  'verified',         -- verificada por el equipo
  'owner_caption',    -- el pie de foto/texto del autor nombra el lugar
  'owner_filename',   -- el nombre de archivo dado por el autor nombra el lugar
  'visible_signage',  -- un letrero o texto visible en la imagen identifica el lugar
  'editorial_guess'   -- estimación editorial: NO se muestra al público hasta verificarse
);

ALTER TABLE media_assets
  ADD COLUMN title          text,
  ADD COLUMN description    text,
  ADD COLUMN content_type   media_content,
  ADD COLUMN status         publish_status NOT NULL DEFAULT 'draft',
  ADD COLUMN is_featured    boolean NOT NULL DEFAULT false,
  ADD COLUMN orientation    text GENERATED ALWAYS AS (
      CASE WHEN width IS NULL OR height IS NULL THEN NULL
           WHEN width::numeric / height > 1.15 THEN 'horizontal'
           WHEN width::numeric / height < 0.87 THEN 'vertical'
           ELSE 'square' END) STORED,
  ADD COLUMN mime_type      text,
  ADD COLUMN thumb_path     text,      -- derivado WebP pequeño (STORAGE_DIR)
  ADD COLUMN display_path   text,      -- derivado WebP optimizado para pantalla
  ADD COLUMN poster_path    text,      -- fotograma de portada generado (STORAGE_DIR)
  ADD COLUMN poster_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL, -- portada original del video
  ADD COLUMN source_url     text,      -- publicación original (Instagram, etc.)
  ADD COLUMN duplicate_of   uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  ADD COLUMN uploaded_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN published_at   timestamptz,
  ADD COLUMN updated_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deleted_at     timestamptz;
UPDATE media_assets SET content_type = CASE kind WHEN 'video' THEN 'video'::media_content ELSE 'photo'::media_content END;
ALTER TABLE media_assets ALTER COLUMN content_type SET NOT NULL;
CREATE TRIGGER media_assets_updated BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX media_assets_gallery_idx ON media_assets(status, content_type, is_featured, created_at DESC) WHERE deleted_at IS NULL AND NOT is_internal;

-- Las tablas de enlace pasan a la nomenclatura media_* y guardan la procedencia.
ALTER TABLE destination_media RENAME TO media_destinations;
ALTER TABLE media_destinations
  ADD COLUMN attribution attribution_source NOT NULL DEFAULT 'editorial_guess',
  ADD COLUMN attribution_note text;
ALTER TABLE package_media RENAME TO media_packages;
ALTER INDEX destination_media_one_cover RENAME TO media_destinations_one_cover;
CREATE INDEX media_destinations_media_idx ON media_destinations(media_id);
CREATE INDEX media_packages_media_idx ON media_packages(media_id);

CREATE TABLE media_experiences (
  media_id      uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, experience_id)
);

-- ---------------------------------------------------------------- Categorías editoriales
CREATE TABLE media_categories (
  id          smallserial PRIMARY KEY,
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  tagline     text NOT NULL,
  description text NOT NULL,
  cover_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  sort_order  smallint NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE media_asset_categories (
  media_id    uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  category_id smallint NOT NULL REFERENCES media_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, category_id)
);
CREATE INDEX media_asset_categories_cat_idx ON media_asset_categories(category_id);

INSERT INTO media_categories (key, name, tagline, description, sort_order) VALUES
  ('selva-naturaleza', 'Selva y naturaleza', 'El pulmón verde de Panamá',
   'Bosque primario, niebla sobre el dosel y la inmensidad verde del Tapón del Darién.', 1),
  ('rios-cascadas', 'Ríos y cascadas', 'Agua que esculpe la roca',
   'Cascadas escalonadas, pozas cristalinas y ríos que son caminos de vida.', 2),
  ('montanas-paisajes', 'Montañas y paisajes', 'Por encima de las nubes',
   'Cerros, serranías y amaneceres desde lo alto de Darién y sus límites.', 3),
  ('playas-costas', 'Playas y costas', 'Donde la selva toca el Pacífico',
   'Bahías sin acceso terrestre, arena oscura y los atardeceres de la costa darienita.', 4),
  ('cultura-tradiciones', 'Cultura y tradiciones', 'Historia viva',
   'Patrimonio, historia colonial y tradiciones de los pueblos de Darién.', 5),
  ('comunidades', 'Comunidades', 'Hospitalidad darienita',
   'Pueblos ribereños y comunidades que reciben al visitante con autorización y respeto.', 6),
  ('fauna-biodiversidad', 'Fauna y biodiversidad', 'Uno de los lugares más biodiversos del continente',
   'Aves, tortugas marinas, helechos gigantes y especies que solo existen aquí.', 7),
  ('aventuras-exploracion', 'Aventuras y exploración', 'Un lugar por descubrir',
   'Caminatas, campamentos y expediciones con guías locales.', 8),
  ('destinos-turisticos', 'Destinos turísticos', 'Lugares con nombre propio',
   'Fotografías y videos asociados a los destinos del catálogo.', 9),
  ('paquetes-turisticos', 'Paquetes turísticos', 'Viajes listos para reservar',
   'Contenido de los paquetes publicados por XPLORA DARIÉN.', 10),
  ('experiencias', 'Experiencias', 'Viajar dejando huella',
   'Reforestación, convivencia y experiencias guiadas.', 11),
  ('videos-promocionales', 'Videos promocionales', 'Darién en movimiento',
   'Reels, piezas cinematográficas y videos generados en el estudio.', 12);

ALTER TABLE translations DROP CONSTRAINT translations_entity_type_check;
ALTER TABLE translations ADD CONSTRAINT translations_entity_type_check CHECK (entity_type IN
  ('destination','experience','package','blog_post','activity_type','destination_category','media_category','media_asset'));

INSERT INTO translations (entity_type, entity_id, locale, field, value)
SELECT 'media_category', c.id::text, 'en', f.field, f.value
FROM media_categories c
JOIN (VALUES
  ('selva-naturaleza','name','Rainforest & nature'), ('selva-naturaleza','tagline','Panama''s green lung'),
  ('rios-cascadas','name','Rivers & waterfalls'), ('rios-cascadas','tagline','Water carving stone'),
  ('montanas-paisajes','name','Mountains & landscapes'), ('montanas-paisajes','tagline','Above the clouds'),
  ('playas-costas','name','Beaches & coasts'), ('playas-costas','tagline','Where the jungle meets the Pacific'),
  ('cultura-tradiciones','name','Culture & traditions'), ('cultura-tradiciones','tagline','Living history'),
  ('comunidades','name','Communities'), ('comunidades','tagline','Darién hospitality'),
  ('fauna-biodiversidad','name','Wildlife & biodiversity'), ('fauna-biodiversidad','tagline','One of the most biodiverse places on the continent'),
  ('aventuras-exploracion','name','Adventure & exploration'), ('aventuras-exploracion','tagline','A place still to discover'),
  ('destinos-turisticos','name','Destinations'), ('destinos-turisticos','tagline','Places with a name'),
  ('paquetes-turisticos','name','Tour packages'), ('paquetes-turisticos','tagline','Trips ready to book'),
  ('experiencias','name','Experiences'), ('experiencias','tagline','Travel that leaves a mark'),
  ('videos-promocionales','name','Promotional videos'), ('videos-promocionales','tagline','Darién in motion')
) AS f(key, field, value) ON f.key = c.key;

-- ---------------------------------------------------------------- Etiquetas y colecciones
CREATE TABLE media_tags (
  id   serial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL
);

CREATE TABLE media_asset_tags (
  media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  tag_id   int  NOT NULL REFERENCES media_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, tag_id)
);
CREATE INDEX media_asset_tags_tag_idx ON media_asset_tags(tag_id);

CREATE TABLE media_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title       text NOT NULL,
  description text,
  status      publish_status NOT NULL DEFAULT 'draft',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER media_collections_updated BEFORE UPDATE ON media_collections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE media_collection_items (
  collection_id uuid NOT NULL REFERENCES media_collections(id) ON DELETE CASCADE,
  media_id      uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order    int NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, media_id)
);

-- ---------------------------------------------------------------- Analítica y procesamiento
CREATE TABLE media_analytics (
  id         bigserial PRIMARY KEY,
  media_id   uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  event      text NOT NULL CHECK (event IN ('view','lightbox_open','play','complete','cta_click','share')),
  cta        text,                       -- destination | package | experience | booking
  session_hash text,                     -- hash anónimo; no se guardan IPs
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_analytics_media_idx ON media_analytics(media_id, event, created_at DESC);

CREATE TYPE job_status AS ENUM ('pending', 'running', 'done', 'failed');
CREATE TABLE media_processing_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id    uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('probe','thumbnail','poster')),
  status      job_status NOT NULL DEFAULT 'pending',
  attempts    smallint NOT NULL DEFAULT 0,
  error       text,
  run_after   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (media_id, kind)
);
CREATE INDEX media_processing_jobs_pending_idx ON media_processing_jobs(run_after) WHERE status = 'pending';

-- ---------------------------------------------------------------- XPLORA AI Video Studio
-- Catálogo de modelos de Higgsfield con su esquema de parámetros tal como lo documenta
-- cada página de modelo (https://docs.higgsfield.ai/docs/models/...). Se sincroniza con
-- scripts/sync_higgsfield_models.py; nunca se asume que todos admiten lo mismo.
CREATE TABLE video_models (
  endpoint_id   text PRIMARY KEY,           -- p.ej. kling-video/v3.0/pro/text-to-video
  family        text NOT NULL,
  title         text NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('text-to-video','image-to-video','multi')),
  params_schema jsonb NOT NULL,            -- { campo: {type, enum, minimum, maximum, default, …} }
  required      text[] NOT NULL DEFAULT '{}',
  image_param   text,                       -- nombre del campo de imagen de referencia (si admite)
  doc_url       text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  verified_at   date NOT NULL
);

ALTER TYPE generation_status ADD VALUE IF NOT EXISTS 'nsfw';

ALTER TABLE video_templates
  ALTER COLUMN default_model DROP NOT NULL,
  ADD COLUMN media_category_id smallint REFERENCES media_categories(id) ON DELETE SET NULL,
  ADD COLUMN description text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE video_templates SET default_model = NULL WHERE default_model = 'to-be-configured';
DELETE FROM video_templates;   -- se reemplaza por la biblioteca profesional

INSERT INTO video_templates (key, name, description, prompt, negative_prompt, aspect_ratio, duration_s, media_category_id)
SELECT v.key, v.name, v.description, v.prompt, v.negative, v.ar::aspect_ratio, v.dur, (SELECT id FROM media_categories WHERE key = v.cat)
FROM (VALUES
  ('selva', 'Selva de Darién', 'Plano aéreo cinematográfico del bosque tropical.',
   'Create a breathtaking cinematic aerial drone sequence over the tropical rainforest of Darién, Panama. Dense emerald-green jungle stretching toward distant mountains, atmospheric morning mist floating above the canopy, dramatic natural sunlight breaking through the clouds, realistic tropical vegetation, authentic geography, premium documentary cinematography, slow smooth drone movement, ultra-realistic natural colors, 4K cinematic visual quality.',
   'text, watermark, logo, distorted trees, unrealistic colors', '16:9', 5, 'selva-naturaleza'),
  ('rios', 'Ríos y naturaleza', 'Río tropical entre la selva.',
   'Create a cinematic travel film of a pristine tropical river surrounded by the lush rainforest of Darién, Panama. Crystal-clear water reflecting the green canopy, gentle movement of the river, beautiful natural sunlight, realistic vegetation, cinematic drone shots, peaceful atmosphere, professional travel documentary, photorealistic.',
   'text, watermark, logo, boats with brand names', '16:9', 5, 'rios-cascadas'),
  ('aventura', 'Aventura', 'Expedición con guía local autorizado.',
   'Create an immersive cinematic adventure film showing an expedition through the tropical rainforest of Darién, Panama. A small group of explorers walking along a natural jungle trail with an authorized local guide, dramatic wide-angle shots, lush tropical vegetation, natural light, realistic human movement, premium adventure documentary.',
   'weapons, danger, text, watermark', '9:16', 5, 'aventuras-exploracion'),
  ('cultura', 'Cultura', 'Presentación documental respetuosa.',
   'Create a respectful cinematic documentary-style visual presentation of an authentic cultural experience in Darién, Panama. Show traditional community life, local craftsmanship, natural surroundings and cultural heritage, with dignity, authenticity and natural lighting. Do not invent ceremonies, clothing, symbols or cultural practices.',
   'invented costumes, invented ceremonies, stereotypes, text, watermark', '16:9', 5, 'cultura-tradiciones'),
  ('publicidad', 'Publicidad turística', 'Anuncio premium de XPLORA DARIÉN.',
   'Create a premium cinematic tourism advertisement for XPLORA DARIÉN, Panama. Showcase breathtaking tropical landscapes, lush rainforest, beautiful rivers, adventure experiences and authentic nature. Dynamic drone movements, cinematic transitions, professional color grading, immersive atmosphere, premium travel commercial production.',
   'text, watermark, fake logos', '16:9', 5, 'videos-promocionales')
) AS v(key, name, description, prompt, negative, ar, dur, cat);

ALTER TABLE video_generations
  ADD COLUMN model_endpoint   text REFERENCES video_models(endpoint_id),
  ADD COLUMN params           jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN idempotency_key  uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN status_url       text,
  ADD COLUMN cancel_url       text,
  ADD COLUMN correlation_id   text,
  ADD COLUMN reference_url    text,          -- URL pública subida a Higgsfield
  ADD COLUMN result_url       text,          -- URL temporal de Higgsfield (expira)
  ADD COLUMN expires_at       timestamptz,
  ADD COLUMN media_category_id smallint REFERENCES media_categories(id) ON DELETE SET NULL,
  ADD COLUMN review_status    text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','discarded')),
  ADD COLUMN reviewed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at      timestamptz,
  ADD COLUMN next_poll_at     timestamptz,
  ADD COLUMN submitted_at     timestamptz;
CREATE INDEX video_generations_poll_idx ON video_generations(next_poll_at) WHERE status IN ('submitted','processing');
CREATE INDEX video_generations_queue_idx ON video_generations(created_at) WHERE status = 'queued';

UPDATE system_settings SET description = 'Tope mensual (USD) de gasto estimado en Higgsfield. 0 = generación deshabilitada.'
 WHERE key = 'higgsfield.monthly_budget_usd';
INSERT INTO system_settings (key, value, description) VALUES
  ('higgsfield.max_concurrent', '2', 'Generaciones enviadas a Higgsfield al mismo tiempo como máximo')
ON CONFLICT (key) DO NOTHING;

-- Gasto estimado del mes en curso (solo cuenta lo que no terminó en fallo/moderación/cancelación).
CREATE OR REPLACE FUNCTION ai_spend_this_month() RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost)), 0) FROM video_generations
  WHERE created_at >= date_trunc('month', now())
    AND status::text NOT IN ('failed', 'nsfw', 'cancelled')
$$;
