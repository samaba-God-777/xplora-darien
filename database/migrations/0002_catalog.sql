-- XPLORA DARIÉN · 0002 · Medios, destinos, experiencias, actividades, traducciones
CREATE TYPE publish_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE difficulty_level AS ENUM ('facil', 'moderada', 'exigente');
CREATE TYPE media_kind AS ENUM ('image', 'video');

CREATE TABLE media_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         media_kind NOT NULL,
  path         text NOT NULL UNIQUE,          -- relativo a /media (p.ej. imagen/arenal.jpg)
  source       text NOT NULL DEFAULT 'pageWeb', -- pageWeb | upload | higgsfield
  width        int CHECK (width > 0),
  height       int CHECK (height > 0),
  duration_s   numeric(7,2),
  bytes        bigint,
  sha256       text,
  alt_text     text,
  credit       text,
  is_internal  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_sha_idx ON media_assets(sha256);

CREATE TABLE destination_categories (
  id         smallserial PRIMARY KEY,
  key        text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE activity_types (
  id   smallserial PRIMARY KEY,
  key  text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text                                   -- nombre de icono Lucide
);

CREATE TABLE destinations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text NOT NULL,
  category_id      smallint NOT NULL REFERENCES destination_categories(id),
  region           text NOT NULL,
  summary          text NOT NULL,
  description      text NOT NULL,
  history          text,
  latitude         double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude        double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  coords_verified  boolean NOT NULL DEFAULT false,
  coords_verified_at timestamptz,
  difficulty       difficulty_level NOT NULL DEFAULT 'moderada',
  visit_duration   text,
  season           text,
  access_info      text,
  safety_info      text,
  services         text[] NOT NULL DEFAULT '{}',
  recommendations  text,
  status           publish_status NOT NULL DEFAULT 'draft',
  is_featured      boolean NOT NULL DEFAULT false,
  seo_title        text,
  seo_description  text,
  sources          text[] NOT NULL DEFAULT '{}',
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE TRIGGER destinations_updated BEFORE UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX destinations_public_idx ON destinations(status, is_featured) WHERE deleted_at IS NULL;
CREATE INDEX destinations_category_idx ON destinations(category_id);

-- Categorías secundarias (un destino puede estar en varias)
CREATE TABLE destination_category_links (
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  category_id    smallint NOT NULL REFERENCES destination_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (destination_id, category_id)
);

CREATE TABLE destination_activities (
  destination_id   uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  activity_type_id smallint NOT NULL REFERENCES activity_types(id) ON DELETE RESTRICT,
  sort_order       smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (destination_id, activity_type_id)
);

CREATE TABLE destination_media (
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  media_id       uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order     smallint NOT NULL DEFAULT 0,
  is_cover       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (destination_id, media_id)
);
CREATE UNIQUE INDEX destination_media_one_cover ON destination_media(destination_id) WHERE is_cover;

CREATE TABLE experience_categories (
  id   smallserial PRIMARY KEY,
  key  text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE experiences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text NOT NULL,
  category_id      smallint NOT NULL REFERENCES experience_categories(id),
  summary          text NOT NULL,
  description      text NOT NULL,
  difficulty       difficulty_level NOT NULL DEFAULT 'moderada',
  duration_text    text,
  min_age          smallint CHECK (min_age >= 0),
  requires_permit  boolean NOT NULL DEFAULT false,
  status           publish_status NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER experiences_updated BEFORE UPDATE ON experiences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE experience_destinations (
  experience_id  uuid NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  PRIMARY KEY (experience_id, destination_id)
);

-- Traducciones genéricas: el contenido base está en español en cada tabla.
CREATE TABLE translations (
  entity_type text NOT NULL CHECK (entity_type IN ('destination','experience','package','blog_post','activity_type','destination_category')),
  entity_id   text NOT NULL,                  -- uuid o id numérico como texto
  locale      text NOT NULL CHECK (locale ~ '^[a-z]{2}$'),
  field       text NOT NULL,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, locale, field)
);

-- Datos de referencia
INSERT INTO destination_categories (key, name, sort_order) VALUES
  ('selva','Selva',1),('rios','Ríos',2),('cascadas','Cascadas',3),('playas','Playas',4),
  ('montanas','Montañas',5),('cultura','Cultura',6),('comunidades','Comunidades',7),
  ('aves','Observación de aves',8),('fotografia','Fotografía',9),('ecoturismo','Ecoturismo',10),
  ('aventura','Aventura',11);

INSERT INTO translations (entity_type, entity_id, locale, field, value)
SELECT 'destination_category', id::text, 'en', 'name', v.en
FROM destination_categories c JOIN (VALUES
  ('selva','Rainforest'),('rios','Rivers'),('cascadas','Waterfalls'),('playas','Beaches'),
  ('montanas','Mountains'),('cultura','Culture'),('comunidades','Communities'),
  ('aves','Birdwatching'),('fotografia','Photography'),('ecoturismo','Ecotourism'),('aventura','Adventure')
) AS v(key, en) ON v.key = c.key;

INSERT INTO activity_types (key, name, icon) VALUES
  ('hiking','Senderismo','footprints'),('waterfall','Cascadas','droplets'),
  ('swimming','Baño en pozas','waves'),('birdwatching','Observación de aves','bird'),
  ('photography','Fotografía','camera'),('river','Recorrido fluvial','ship'),
  ('culture','Experiencia cultural','users'),('history','Historia','landmark'),
  ('camping','Camping','tent'),('reforestation','Reforestación','sprout'),
  ('fishing','Pesca (donde se permita)','fish'),('beach','Playa','tree-palm'),
  ('sunset','Atardeceres','sunset'),('viewpoint','Mirador','mountain'),
  ('wildlife','Fauna silvestre','paw-print');

INSERT INTO translations (entity_type, entity_id, locale, field, value)
SELECT 'activity_type', id::text, 'en', 'name', v.en
FROM activity_types a JOIN (VALUES
  ('hiking','Hiking'),('waterfall','Waterfalls'),('swimming','Swimming'),('birdwatching','Birdwatching'),
  ('photography','Photography'),('river','River trip'),('culture','Cultural experience'),('history','History'),
  ('camping','Camping'),('reforestation','Reforestation'),('fishing','Fishing (where allowed)'),
  ('beach','Beach'),('sunset','Sunsets'),('viewpoint','Viewpoint'),('wildlife','Wildlife')
) AS v(key, en) ON v.key = a.key;

INSERT INTO experience_categories (key, name) VALUES
  ('senderismo','Senderismo'),('selva','Exploración de selva'),('aves','Observación de aves'),
  ('fotografia','Fotografía de naturaleza'),('fluvial','Recorridos fluviales'),('pesca','Pesca turística'),
  ('cultural','Experiencias culturales'),('ecoturismo','Ecoturismo'),('excursion','Excursiones guiadas'),
  ('multidia','Aventuras de varios días');
