-- XPLORA DARIÉN · 0009 · Temporadas y precios por temporada
-- Una temporada se repite cada año entre dos fechas mes-día (puede cruzar el año: 12-15 → 04-30).
-- Un precio puede ser general (sin temporada) o de una temporada; si existe precio de temporada
-- para la fecha del viaje, ese precio reemplaza al general.

CREATE TABLE seasons (
  id          smallserial PRIMARY KEY,
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  description text,
  start_md    char(5) NOT NULL CHECK (start_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  end_md      char(5) NOT NULL CHECK (end_md ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  sort_order  smallint NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER seasons_updated BEFORE UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Temporadas del clima de Darién (verano seco y lluvias). El administrador puede ajustar fechas.
INSERT INTO seasons (key, name, description, start_md, end_md, sort_order) VALUES
  ('alta', 'Temporada alta (verano seco)', 'Diciembre a abril: menos lluvia, ríos más claros, mejores atardeceres en la costa.', '12-15', '04-30', 1),
  ('baja', 'Temporada baja (lluvias)', 'Mayo a mediados de diciembre: más caudal en cascadas y ríos; algunos accesos pueden cerrarse.', '05-01', '12-14', 2);

-- ¿La fecha cae dentro de la temporada? (maneja temporadas que cruzan el año)
CREATE OR REPLACE FUNCTION season_covers(p_season smallint, p_date date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN s.start_md <= s.end_md
              THEN to_char(p_date, 'MM-DD') BETWEEN s.start_md AND s.end_md
              ELSE to_char(p_date, 'MM-DD') >= s.start_md OR to_char(p_date, 'MM-DD') <= s.end_md END
  FROM seasons s WHERE s.id = p_season AND s.is_active
$$;

ALTER TABLE package_prices ADD COLUMN season_id smallint REFERENCES seasons(id) ON DELETE RESTRICT;
CREATE INDEX package_prices_season_idx ON package_prices(package_id, season_id) WHERE is_active;
-- Una sola tarifa activa por paquete + tipo + temporada (+ tamaño de grupo).
CREATE UNIQUE INDEX package_prices_one_active ON package_prices
  (package_id, price_type, COALESCE(season_id, 0), COALESCE(min_group_size, 0)) WHERE is_active;

ALTER TABLE package_price_history ADD COLUMN season_id smallint;
CREATE OR REPLACE FUNCTION log_package_price() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, season_id, new_amount, new_discount, operation)
    VALUES (NEW.id, NEW.package_id, NEW.price_type, NEW.season_id, NEW.amount, NEW.discount_pct, TG_OP);
  ELSIF TG_OP = 'UPDATE' AND (NEW.amount, NEW.discount_pct, NEW.is_active) IS DISTINCT FROM (OLD.amount, OLD.discount_pct, OLD.is_active) THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, season_id, old_amount, new_amount, old_discount, new_discount, operation)
    VALUES (NEW.id, NEW.package_id, NEW.price_type, NEW.season_id, OLD.amount, NEW.amount, OLD.discount_pct, NEW.discount_pct,
            CASE WHEN NOT NEW.is_active AND OLD.is_active THEN 'DEACTIVATE' ELSE TG_OP END);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO package_price_history(price_id, package_id, price_type, season_id, old_amount, old_discount, operation)
    VALUES (OLD.id, OLD.package_id, OLD.price_type, OLD.season_id, OLD.amount, OLD.discount_pct, TG_OP);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

INSERT INTO permissions (key, description) VALUES ('seasons.manage', 'Definir fechas de temporadas')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE p.key = 'seasons.manage' AND r.key IN ('superadmin', 'admin', 'operator')
ON CONFLICT DO NOTHING;
