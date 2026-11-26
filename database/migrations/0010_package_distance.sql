-- XPLORA DARIÉN · 0010 · Distancia aproximada desde Ciudad de Panamá (para ordenar y orientar al viajero)
ALTER TABLE tour_packages
  ADD COLUMN distance_km smallint CHECK (distance_km >= 0),
  ADD COLUMN access_note text;   -- p. ej. "+ bote por el río Tuira"

UPDATE tour_packages t SET distance_km = v.km, access_note = v.note
FROM (VALUES
  ('XD-EMBUDO-1D', 170, 'Por la Panamericana hasta Tortí'),
  ('XD-GIBA-2D1N', 170, 'Por la Panamericana hasta Tortí'),
  ('XD-CULTURA-1D', 245, 'Por la Panamericana'),
  ('XD-ARENAL-1D', 260, 'Por la Panamericana hasta Río Congo Arriba'),
  ('XD-REFORESTA-2D1N', 260, 'Por la Panamericana hasta Río Congo Arriba'),
  ('XD-PMUERTO-3D2N', 260, 'Panamericana hasta Puerto Quimba + bote por el golfo de San Miguel'),
  ('XD-PND-3D2N', 270, 'Panamericana hasta Yaviza + bote por el río Tuira')
) AS v(code, km, note)
WHERE t.code = v.code;
