-- XPLORA DARIÉN · 0005 · Clientes, reservas y cotizaciones
-- Las reservas nunca se confirman automáticamente: nacen como 'received'.
CREATE TYPE booking_status AS ENUM (
  'received',      -- Solicitud recibida
  'pending',       -- Pendiente de confirmación
  'quoting',       -- En cotización
  'confirmed',     -- Confirmada
  'paid',          -- Pagada
  'cancelled',     -- Cancelada
  'completed'      -- Completada
);
CREATE TYPE quote_status AS ENUM ('draft','sent','accepted','expired','rejected');

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  email       citext NOT NULL,
  phone       text NOT NULL,
  country     char(2) NOT NULL,                -- ISO 3166-1 alfa-2
  locale      text NOT NULL DEFAULT 'es',
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);
CREATE TRIGGER customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE booking_code_seq;

CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,         -- XD-2026-000123
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  package_id       uuid NOT NULL REFERENCES tour_packages(id) ON DELETE RESTRICT,
  departure_id     uuid REFERENCES package_departures(id) ON DELETE SET NULL,
  travel_date      date NOT NULL,
  adults           smallint NOT NULL CHECK (adults >= 1),
  children         smallint NOT NULL DEFAULT 0 CHECK (children >= 0),
  status           booking_status NOT NULL DEFAULT 'received',
  currency         char(3) NOT NULL,
  subtotal         numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount_total   numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total        numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  services_total   numeric(12,2) NOT NULL DEFAULT 0 CHECK (services_total >= 0),
  total            numeric(12,2) NOT NULL CHECK (total >= 0),
  price_snapshot   jsonb NOT NULL,               -- precios usados en el cálculo
  itinerary_snapshot jsonb,
  notes            text,
  source           text NOT NULL DEFAULT 'web',
  assigned_to      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX bookings_status_idx ON bookings(status, created_at DESC);
CREATE INDEX bookings_customer_idx ON bookings(customer_id);
CREATE INDEX bookings_package_date_idx ON bookings(package_id, travel_date);

CREATE TABLE booking_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  is_child    boolean NOT NULL DEFAULT false,
  age         smallint CHECK (age BETWEEN 0 AND 120),
  notes       text
);
CREATE INDEX booking_participants_booking_idx ON booking_participants(booking_id);

CREATE TABLE booking_services (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_service_id uuid REFERENCES provider_services(id) ON DELETE SET NULL,
  description         text NOT NULL,
  quantity            smallint NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(10,2),              -- NULL = a cotizar
  total               numeric(12,2)
);
CREATE INDEX booking_services_booking_idx ON booking_services(booking_id);

-- Historial de estados (cambios relevantes de reservas)
CREATE TABLE booking_status_history (
  id          bigserial PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status booking_status,
  to_status   booking_status NOT NULL,
  changed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  note        text,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_status_history_booking_idx ON booking_status_history(booking_id, changed_at);

CREATE OR REPLACE FUNCTION log_booking_status() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO booking_status_history(booking_id, to_status, changed_by, note)
    VALUES (NEW.id, NEW.status, NULLIF(current_setting('app.user_id', true), '')::uuid, 'created');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO booking_status_history(booking_id, from_status, to_status, changed_by, note)
    VALUES (NEW.id, OLD.status, NEW.status,
            NULLIF(current_setting('app.user_id', true), '')::uuid,
            NULLIF(current_setting('app.status_note', true), ''));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER bookings_status_history AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION log_booking_status();

CREATE TABLE quotes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  booking_id  uuid REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  currency    char(3) NOT NULL,
  total       numeric(12,2) NOT NULL CHECK (total >= 0),
  line_items  jsonb NOT NULL,
  valid_until date NOT NULL,
  status      quote_status NOT NULL DEFAULT 'draft',
  pdf_path    text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER quotes_updated BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX quotes_status_idx ON quotes(status, created_at DESC);
