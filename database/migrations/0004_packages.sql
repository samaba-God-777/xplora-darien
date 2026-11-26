-- XPLORA DARIÉN · 0004 · Paquetes turísticos
-- Precios, disponibilidad y alojamientos los define y verifica el administrador.
CREATE TYPE package_type AS ENUM (
  'day_trip','weekend','two_days_one_night','three_days_two_nights','adventure','ecological',
  'cultural','family','private','custom','group','photography'
);
CREATE TYPE price_type AS ENUM ('per_person','adult','child','group','special');
CREATE TYPE departure_status AS ENUM ('scheduled','full','cancelled','completed');

CREATE TABLE tour_packages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{3,20}$'),
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text NOT NULL,
  package_type       package_type NOT NULL,
  short_description  text NOT NULL,
  description        text NOT NULL,
  days               smallint NOT NULL CHECK (days BETWEEN 1 AND 30),
  nights             smallint NOT NULL CHECK (nights >= 0 AND nights < days),
  difficulty         difficulty_level NOT NULL DEFAULT 'moderada',
  min_age            smallint CHECK (min_age >= 0),
  min_participants   smallint NOT NULL DEFAULT 1 CHECK (min_participants >= 1),
  max_capacity       smallint CHECK (max_capacity >= min_participants),
  currency           char(3) NOT NULL DEFAULT 'USD',
  tax_rate           numeric(5,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 1),
  fees_note          text,
  payment_terms      text,
  cancellation_policy text,
  packing_list       text,
  weather_notes      text,
  special_requirements text,
  promo_video_id     uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  status             publish_status NOT NULL DEFAULT 'draft',
  is_featured        boolean NOT NULL DEFAULT false,
  is_promotion       boolean NOT NULL DEFAULT false,
  seo_title          text,
  seo_description    text,
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE TRIGGER tour_packages_updated BEFORE UPDATE ON tour_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX tour_packages_public_idx ON tour_packages(status, is_featured) WHERE deleted_at IS NULL;
CREATE INDEX tour_packages_type_idx ON tour_packages(package_type);

CREATE TABLE package_destinations (
  package_id     uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE RESTRICT,
  sort_order     smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (package_id, destination_id)
);
CREATE INDEX package_destinations_dest_idx ON package_destinations(destination_id);

CREATE TABLE package_experiences (
  package_id    uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences(id) ON DELETE RESTRICT,
  PRIMARY KEY (package_id, experience_id)
);

CREATE TABLE package_guides (
  package_id uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  guide_id   uuid NOT NULL REFERENCES guides(id) ON DELETE RESTRICT,
  PRIMARY KEY (package_id, guide_id)
);

CREATE TABLE package_providers (
  package_id          uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  provider_service_id uuid NOT NULL REFERENCES provider_services(id) ON DELETE RESTRICT,
  PRIMARY KEY (package_id, provider_service_id)
);

CREATE TABLE package_media (
  package_id uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order smallint NOT NULL DEFAULT 0,
  is_cover   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (package_id, media_id)
);

CREATE TABLE package_itinerary_days (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  day_number     smallint NOT NULL CHECK (day_number >= 1),
  title          text NOT NULL,
  description    text,
  transport      text,
  meals          text,
  lodging        text,
  guide_id       uuid REFERENCES guides(id) ON DELETE SET NULL,
  recommendations text,
  UNIQUE (package_id, day_number)
);

CREATE TABLE package_itinerary_activities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id         uuid NOT NULL REFERENCES package_itinerary_days(id) ON DELETE CASCADE,
  start_time     time,
  end_time       time CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time),
  title          text NOT NULL,
  description    text,
  destination_id uuid REFERENCES destinations(id) ON DELETE SET NULL,
  sort_order     smallint NOT NULL DEFAULT 0
);
CREATE INDEX package_itinerary_activities_day_idx ON package_itinerary_activities(day_id, sort_order);

CREATE TABLE package_inclusions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('transport','food','lodging','guide','activities','entrance_fees','equipment','insurance','other')),
  description text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);
CREATE INDEX package_inclusions_pkg_idx ON package_inclusions(package_id);

CREATE TABLE package_exclusions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  description text NOT NULL,
  sort_order  smallint NOT NULL DEFAULT 0
);
CREATE INDEX package_exclusions_pkg_idx ON package_exclusions(package_id);

CREATE TABLE package_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  price_type     price_type NOT NULL,
  amount         numeric(10,2) NOT NULL CHECK (amount >= 0),
  min_group_size smallint CHECK (min_group_size >= 2),
  discount_pct   numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  valid_from     date NOT NULL DEFAULT current_date,
  valid_to       date CHECK (valid_to IS NULL OR valid_to >= valid_from),
  is_active      boolean NOT NULL DEFAULT true,
  verified_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (price_type <> 'group' OR min_group_size IS NOT NULL)
);
CREATE TRIGGER package_prices_updated BEFORE UPDATE ON package_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX package_prices_lookup_idx ON package_prices(package_id, price_type, valid_from) WHERE is_active;

-- Historial de precios (inmutable)
CREATE TABLE package_price_history (
  id          bigserial PRIMARY KEY,
  price_id    uuid NOT NULL,
  package_id  uuid NOT NULL,
  price_type  price_type NOT NULL,
  old_amount  numeric(10,2),
  new_amount  numeric(10,2),
  old_discount numeric(5,2),
  new_discount numeric(5,2),
  operation   text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX package_price_history_pkg_idx ON package_price_history(package_id, changed_at DESC);

CREATE OR REPLACE FUNCTION log_package_price() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, new_amount, new_discount, operation)
    VALUES (NEW.id, NEW.package_id, NEW.price_type, NEW.amount, NEW.discount_pct, TG_OP);
  ELSIF TG_OP = 'UPDATE' AND (NEW.amount, NEW.discount_pct) IS DISTINCT FROM (OLD.amount, OLD.discount_pct) THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, old_amount, new_amount, old_discount, new_discount, operation)
    VALUES (NEW.id, NEW.package_id, NEW.price_type, OLD.amount, NEW.amount, OLD.discount_pct, NEW.discount_pct, TG_OP);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, old_amount, old_discount, operation)
    VALUES (OLD.id, OLD.package_id, OLD.price_type, OLD.amount, OLD.discount_pct, TG_OP);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER package_prices_history AFTER INSERT OR UPDATE OR DELETE ON package_prices
  FOR EACH ROW EXECUTE FUNCTION log_package_price();

CREATE TABLE package_departures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  departure_date date NOT NULL,
  return_date    date NOT NULL CHECK (return_date >= departure_date),
  meeting_time   time,
  meeting_point  text,
  capacity       smallint NOT NULL CHECK (capacity > 0),
  seats_held     smallint NOT NULL DEFAULT 0 CHECK (seats_held >= 0),
  status         departure_status NOT NULL DEFAULT 'scheduled',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_held <= capacity),
  UNIQUE (package_id, departure_date)
);
CREATE INDEX package_departures_date_idx ON package_departures(departure_date) WHERE status = 'scheduled';

-- Disponibilidad por fecha para paquetes sin salidas fijas (privados/personalizados)
CREATE TABLE package_availability (
  package_id uuid NOT NULL REFERENCES tour_packages(id) ON DELETE CASCADE,
  date       date NOT NULL,
  capacity   smallint NOT NULL CHECK (capacity >= 0),
  is_blocked boolean NOT NULL DEFAULT false,
  note       text,
  PRIMARY KEY (package_id, date)
);
