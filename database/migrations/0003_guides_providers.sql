-- XPLORA DARIÉN · 0003 · Guías y proveedores
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected', 'expired');
CREATE TYPE provider_category AS ENUM ('guides','transport','lodging','food','tour_operator','activities','complementary');

CREATE TABLE guides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  full_name        text NOT NULL,
  photo_id         uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  bio              text,
  specialties      text[] NOT NULL DEFAULT '{}',
  languages        text[] NOT NULL DEFAULT '{es}',
  years_experience smallint CHECK (years_experience >= 0),
  email            citext,
  phone            text,
  is_available     boolean NOT NULL DEFAULT true,
  verification     verification_status NOT NULL DEFAULT 'pending',
  status           publish_status NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER guides_updated BEFORE UPDATE ON guides FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Certificaciones: solo se muestran públicamente las verificadas.
CREATE TABLE guide_certifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  name         text NOT NULL,
  issuer       text NOT NULL,
  valid_until  date,
  verification verification_status NOT NULL DEFAULT 'pending',
  verified_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at  timestamptz
);
CREATE INDEX guide_certifications_guide_idx ON guide_certifications(guide_id);

CREATE TABLE guide_destinations (
  guide_id       uuid NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  PRIMARY KEY (guide_id, destination_id)
);
CREATE INDEX guide_destinations_dest_idx ON guide_destinations(destination_id);

CREATE TABLE guide_experiences (
  guide_id      uuid NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  PRIMARY KEY (guide_id, experience_id)
);

CREATE TABLE providers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  trade_name    text NOT NULL,
  category      provider_category NOT NULL,
  description   text,
  location_text text,
  latitude      double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude     double precision CHECK (longitude BETWEEN -180 AND 180),
  email         citext,
  phone         text,
  website       text,
  verification  verification_status NOT NULL DEFAULT 'pending',
  status        publish_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER providers_updated BEFORE UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX providers_category_idx ON providers(category, status);

CREATE TABLE provider_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  unit        text,                            -- persona, noche, trayecto…
  is_active   boolean NOT NULL DEFAULT true
);
CREATE INDEX provider_services_provider_idx ON provider_services(provider_id);

CREATE TABLE provider_media (
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  media_id    uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order  smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, media_id)
);
