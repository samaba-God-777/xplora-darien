-- XPLORA DARIÉN · 0006 · IA audiovisual, rutas, contenido, notificaciones, auditoría
CREATE TYPE generation_status AS ENUM ('queued','submitted','processing','succeeded','failed','cancelled');
CREATE TYPE aspect_ratio AS ENUM ('16:9','9:16','1:1','4:5');

CREATE TABLE video_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,          -- selva, rios, cascadas…
  name          text NOT NULL,
  prompt        text NOT NULL,
  negative_prompt text,
  default_model text NOT NULL,
  aspect_ratio  aspect_ratio NOT NULL DEFAULT '16:9',
  duration_s    smallint NOT NULL DEFAULT 5 CHECK (duration_s BETWEEN 1 AND 60),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE video_generations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid REFERENCES video_templates(id) ON DELETE SET NULL,
  provider         text NOT NULL DEFAULT 'higgsfield',
  model            text NOT NULL,
  prompt           text NOT NULL,
  reference_media_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  aspect_ratio     aspect_ratio NOT NULL,
  duration_s       smallint NOT NULL,
  external_job_id  text UNIQUE,
  status           generation_status NOT NULL DEFAULT 'queued',
  attempts         smallint NOT NULL DEFAULT 0,
  error            text,
  estimated_cost   numeric(10,4),
  actual_cost      numeric(10,4),
  result_media_id  uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  destination_id   uuid REFERENCES destinations(id) ON DELETE SET NULL,
  package_id       uuid REFERENCES tour_packages(id) ON DELETE SET NULL,
  requested_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
CREATE TRIGGER video_generations_updated BEFORE UPDATE ON video_generations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX video_generations_status_idx ON video_generations(status, created_at);

-- Rutas: NUNCA se publican sin verificación (restricción a nivel de BD).
CREATE TABLE routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  mode          text NOT NULL CHECK (mode IN ('walk','road','river','sea','air')),
  difficulty    difficulty_level NOT NULL DEFAULT 'moderada',
  distance_km   numeric(7,2) CHECK (distance_km > 0),
  is_verified   boolean NOT NULL DEFAULT false,
  verified_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at   timestamptz,
  status        publish_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (is_verified AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE TABLE route_points (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  seq            int NOT NULL,
  latitude       double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude      double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  label          text,
  destination_id uuid REFERENCES destinations(id) ON DELETE SET NULL,
  UNIQUE (route_id, seq)
);

CREATE TABLE reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customers(id) ON DELETE SET NULL,
  booking_id    uuid REFERENCES bookings(id) ON DELETE SET NULL,
  package_id    uuid REFERENCES tour_packages(id) ON DELETE CASCADE,
  destination_id uuid REFERENCES destinations(id) ON DELETE CASCADE,
  author_name   text NOT NULL,
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text NOT NULL,
  is_testimonial boolean NOT NULL DEFAULT false,
  status        publish_status NOT NULL DEFAULT 'draft',  -- moderación
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (package_id IS NOT NULL OR destination_id IS NOT NULL OR is_testimonial)
);
CREATE INDEX reviews_public_idx ON reviews(status, created_at DESC);

CREATE TABLE blog_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  excerpt       text,
  body_md       text NOT NULL,
  cover_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  author_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  status        publish_status NOT NULL DEFAULT 'draft',
  published_at  timestamptz,
  seo_title     text,
  seo_description text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER blog_posts_updated BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX blog_posts_public_idx ON blog_posts(status, published_at DESC);

CREATE TABLE promotions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE,
  name          text NOT NULL,
  description   text,
  discount_pct  numeric(5,2) CHECK (discount_pct BETWEEN 0 AND 100),
  package_id    uuid REFERENCES tour_packages(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL CHECK (ends_at > starts_at),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotions_active_idx ON promotions(is_active, starts_at, ends_at);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     text NOT NULL CHECK (channel IN ('email','whatsapp','internal')),
  recipient   text NOT NULL,
  template    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  attempts    smallint NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX notifications_pending_idx ON notifications(created_at) WHERE status = 'pending';

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,                  -- create | update | delete | publish | login …
  entity_type text NOT NULL,
  entity_id   text,
  changes     jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_user_idx ON audit_logs(user_id, created_at DESC);

CREATE TABLE system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('booking.default_currency', '"USD"', 'Moneda por defecto de las reservas'),
  ('booking.auto_confirm', 'false', 'Las reservas nunca se confirman automáticamente'),
  ('higgsfield.monthly_budget_usd', '0', 'Tope mensual de gasto en generación de video (0 = deshabilitado)'),
  ('contact.instagram', '"https://www.instagram.com/xplore_darien/"', 'Instagram oficial');

INSERT INTO video_templates (key, name, prompt, default_model, aspect_ratio, duration_s) VALUES
  ('selva', 'Selva de Darién', 'Cinematic slow drone flight over dense primary rainforest in Darién, Panama, morning mist, golden light', 'to-be-configured', '16:9', 5),
  ('rios', 'Ríos', 'Cinematic aerial following a meandering brown jungle river through rainforest, Darién Panama', 'to-be-configured', '16:9', 5),
  ('cascadas', 'Cascadas', 'Slow cinematic push-in to a tiered rock waterfall in tropical forest, natural pools, soft light', 'to-be-configured', '9:16', 5),
  ('montanas', 'Montañas', 'Sunrise above clouds from a forested mountain summit, timelapse feeling, Panama', 'to-be-configured', '16:9', 5),
  ('cultura', 'Cultura', 'Respectful documentary-style shot of palm-thatched stilt houses in an Indigenous village by a river', 'to-be-configured', '16:9', 5),
  ('experiencias', 'Experiencias', 'Hikers crossing a jungle river with backpacks, adventure documentary style', 'to-be-configured', '9:16', 5),
  ('paquetes', 'Paquetes turísticos', 'Fast-paced travel montage feel: waterfall, beach, river boat, sunset, Darién Panama', 'to-be-configured', '9:16', 5),
  ('marca', 'Publicidad XPLORA DARIÉN', 'Epic cinematic reveal of wild Pacific coastline meeting rainforest, golden hour', 'to-be-configured', '16:9', 5);
