-- XPLORA DARIÉN · 0007 · Funciones auxiliares
-- tr(): devuelve la traducción de un campo o el valor base (español) si no existe.
CREATE OR REPLACE FUNCTION tr(p_entity text, p_id text, p_locale text, p_field text, p_fallback text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT value FROM translations
      WHERE entity_type = p_entity AND entity_id = p_id AND locale = p_locale AND field = p_field),
    p_fallback)
$$;

-- Plazas confirmadas para un paquete y fecha (reservas que ocupan cupo).
CREATE OR REPLACE FUNCTION seats_taken(p_package uuid, p_date date)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(adults + children), 0)::int FROM bookings
  WHERE package_id = p_package AND travel_date = p_date AND status IN ('confirmed','paid')
$$;
