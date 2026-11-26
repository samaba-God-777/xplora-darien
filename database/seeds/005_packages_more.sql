-- XPLORA DARIÉN · Paquetes para los destinos que no tenían paquete (BORRADORES).
-- Contenido basado solo en la ficha verificada de cada destino. Sin alojamiento, comidas ni horarios inventados:
-- quedan "por confirmar con el operador". Los precios (aprobados por el dueño) se cargan desde /admin/paquetes.
-- Bahía Piña lleva un precio referencial (nota visible en la ficha) hasta tener cotización del transporte.
-- Idempotente por código.
BEGIN;

CREATE TEMP TABLE _pkg (code text, slug text, name text, ptype text, short text, descr text, days int, nights int,
  difficulty text, min_age int, min_p int, max_c int, packing text, weather text, reqs text,
  km int, note text, dests text[]) ON COMMIT DROP;

INSERT INTO _pkg VALUES
('XD-INFIERNILLO-1D', 'cascada-infiernillo-aventura', 'Cascada Infiernillo: aventura en la selva', 'day_trip',
 'Unas dos horas de caminata por selva y río hasta una cascada remota con una poza profunda al pie.',
 'Día completo de caminata guiada por selva y río hasta la Cascada Infiernillo, una cascada remota con una poza profunda al pie. Son unas dos horas por trayecto. El punto de partida y el sendero se confirman con el operador antes del viaje: no se intenta sin guía.',
 1, 0, 'exigente', 12, 2, 12,
 'Calzado con agarre para roca mojada y cruces de río, ropa de baño, muda de ropa, repelente, bloqueador biodegradable, agua (mínimo 2 L), snacks y bolsa seca.',
 'Mejor en verano (diciembre–abril). Con crecidas el guía puede cambiar o suspender la caminata.',
 'Buena condición física. Ubicación y sendero por confirmar con el operador; solo con guía.',
 240, 'Por la Panamericana; punto de partida por confirmar', ARRAY['cascada-infiernillo','entrada-a-darien']),
('XD-CHUCANTI-2D1N', 'cerro-chucanti-bosque-nuboso', 'Cerro Chucantí: bosque nuboso', 'two_days_one_night',
 'Ascenso a la Reserva Natural Privada Cerro Chucantí, bosque nuboso con especies que solo existen aquí.',
 'Dos días en la Serranía de Majé, en la Reserva Natural Privada administrada por la ONG Adopta Bosque, dedicada a la conservación, la investigación y la educación ambiental. Ascenso a pie hasta el bosque nuboso, uno de los lugares más estudiados de Darién, con especies únicas como el helecho gigante. La visita se coordina previamente con Adopta Bosque.',
 2, 1, 'exigente', 12, 2, 10,
 'Abrigo, impermeable, calzado de montaña, linterna frontal, saco de dormir, repelente, agua y comida de marcha.',
 'Mejor en verano (diciembre–abril). Clima frío y lluvioso en la cima todo el año.',
 'Buena condición física. Visita sujeta a la coordinación previa con Adopta Bosque.',
 200, 'Por la Panamericana + ascenso a pie', ARRAY['cerro-chucanti']),
('XD-CHUNGA-1D', 'la-chunga-comunidad-y-tradicion', 'La Chunga: comunidad y tradición', 'cultural',
 'Visita autorizada a una comunidad de casas de palma entre jardines y selva, con artesanía y gastronomía local.',
 'Experiencia cultural organizada con la comunidad de La Chunga, en el golfo de San Miguel: arquitectura tradicional de techos de palma, artesanía y gastronomía local. Se llega por agua y la visita se coordina con la comunidad: lo que la comunidad decida compartir.',
 1, 0, 'facil', NULL, 2, 20,
 'Ropa cómoda, efectivo para artesanías, bloqueador, repelente y bolsa seca para el bote.',
 'Acceso por agua sujeto al mar y la marea.',
 'Chaleco salvavidas en el bote. Visitar solo con autorización de la comunidad; pedir permiso antes de fotografiar a personas.',
 260, 'Por la Panamericana + bote', ARRAY['la-chunga','entrada-a-darien']),
('XD-MOGUE-2D1N', 'mogue-aldea-embera-y-aves', 'Mogué: aldea Emberá y aves', 'two_days_one_night',
 'Bote desde La Palma hasta la aldea Emberá de Mogué, selva y observación de aves con guías locales.',
 'Travesía en bote desde La Palma por el río Mogué hasta la comunidad Emberá, con casas de palma sobre pilotes. Recorridos por la selva y observación de aves con guías locales de la comunidad. El horario del bote depende de la marea.',
 2, 1, 'moderada', NULL, 2, 12,
 'Binoculares, ropa de manga larga, repelente, impermeable, linterna, calzado para barro y bolsa seca.',
 'Todo el año; las mareas condicionan el acceso en bote.',
 'Chaleco salvavidas obligatorio en el bote. Respetar las normas comunitarias.',
 260, 'Por la Panamericana + bote desde La Palma', ARRAY['mogue','la-palma','entrada-a-darien']),
('XD-BPINA-3D2N', 'bahia-pina-pacifico-salvaje', 'Bahía Piña: Pacífico salvaje', 'three_days_two_nights',
 'Pueblo costero sin acceso por tierra: mar abierto, selva costera y pesca deportiva en el Pacífico.',
 'Bahía Piña es prácticamente una isla: se llega en avioneta desde Ciudad de Panamá o en bote por la costa. Mar abierto, selva costera y fama mundial por la pesca deportiva en el Pacífico. Pesca solo donde esté permitida y con operador autorizado.',
 3, 2, 'facil', NULL, 2, 8,
 'Ropa ligera, bloqueador biodegradable, sombrero, repelente y bolsa seca.',
 'Mejor en verano (diciembre–abril).',
 'Transporte (avioneta o bote) por cotizar. Pesca solo con operador autorizado.',
 NULL, 'Avioneta desde Ciudad de Panamá o bote por la costa', ARRAY['bahia-pina']);

INSERT INTO tour_packages (code, slug, name, package_type, short_description, description, days, nights, difficulty, min_age,
  min_participants, max_capacity, currency, tax_rate, packing_list, weather_notes, special_requirements, distance_km, access_note, status)
SELECT code, slug, name, ptype::package_type, short, descr, days, nights, difficulty::difficulty_level, min_age, min_p, max_c,
  'USD', 0, packing, weather, reqs, km, note, 'draft'
FROM _pkg ON CONFLICT (code) DO NOTHING;

INSERT INTO package_destinations (package_id, destination_id, sort_order)
SELECT p.id, d.id, k.ord - 1 FROM _pkg x JOIN tour_packages p ON p.code = x.code,
  unnest(x.dests) WITH ORDINALITY k(slug, ord) JOIN destinations d ON d.slug = k.slug
ON CONFLICT DO NOTHING;

-- "Bienvenidos a Darién" como parada de los paquetes existentes que cruzan el límite provincial por la Panamericana.
INSERT INTO package_destinations (package_id, destination_id, sort_order)
SELECT p.id, d.id, 99 FROM tour_packages p, destinations d
WHERE d.slug = 'entrada-a-darien'
  AND p.code IN ('XD-ARENAL-1D','XD-REFORESTA-2D1N','XD-CULTURA-1D','XD-PMUERTO-3D2N','XD-PND-3D2N')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE _day (code text, day int, title text, descr text, lodging text) ON COMMIT DROP;
INSERT INTO _day VALUES
('XD-INFIERNILLO-1D', 1, 'Caminata a la Cascada Infiernillo', 'Viaje por la Panamericana (con la parada en el arco de Bienvenidos a Darién), caminata guiada de ≈2 h por selva y río, tiempo en la poza y regreso.', NULL),
('XD-CHUCANTI-2D1N', 1, 'Ascenso al bosque nuboso', 'Encuentro con el equipo de Adopta Bosque y ascenso a pie hacia la reserva.', 'Por confirmar con Adopta Bosque'),
('XD-CHUCANTI-2D1N', 2, 'Bosque nuboso y descenso', 'Recorrido guiado por el bosque nuboso y descenso.', NULL),
('XD-CHUNGA-1D', 1, 'Visita a La Chunga', 'Viaje por la Panamericana, traslado en bote y recibimiento por la comunidad: recorrido, artesanía y gastronomía local.', NULL),
('XD-MOGUE-2D1N', 1, 'La Palma y río Mogué', 'Llegada a La Palma y bote por el río Mogué hasta la aldea Emberá (según marea).', 'Por confirmar con la comunidad'),
('XD-MOGUE-2D1N', 2, 'Aves y selva', 'Observación de aves y caminata por la selva con guías locales; regreso en bote a La Palma.', NULL),
('XD-BPINA-3D2N', 1, 'Llegada a Bahía Piña', 'Traslado en avioneta o bote (por cotizar) y recorrido por el pueblo costero.', 'Por confirmar'),
('XD-BPINA-3D2N', 2, 'Pacífico y selva costera', 'Día de mar y selva costera; pesca solo con operador autorizado.', 'Por confirmar'),
('XD-BPINA-3D2N', 3, 'Regreso', 'Traslado de regreso a Ciudad de Panamá.', NULL);

INSERT INTO package_itinerary_days (package_id, day_number, title, description, lodging, transport, meals)
SELECT p.id, x.day, x.title, x.descr, x.lodging, 'Por confirmar con el operador', 'Por confirmar'
FROM _day x JOIN tour_packages p ON p.code = x.code
ON CONFLICT (package_id, day_number) DO NOTHING;

INSERT INTO package_inclusions (package_id, kind, description, sort_order)
SELECT p.id, 'guide', 'Guía local', 0 FROM tour_packages p
WHERE p.code IN (SELECT code FROM _pkg) AND NOT EXISTS (SELECT 1 FROM package_inclusions i WHERE i.package_id = p.id);

INSERT INTO package_exclusions (package_id, description, sort_order)
SELECT p.id, e.d, e.o FROM tour_packages p, (VALUES ('Gastos personales', 0), ('Propinas', 1), ('Alojamiento, comidas y transporte: se confirman con el operador', 2)) e(d, o)
WHERE p.code IN (SELECT code FROM _pkg) AND NOT EXISTS (SELECT 1 FROM package_exclusions x WHERE x.package_id = p.id);

-- Fotos de cada paquete (tarjeta): solo fotos publicadas de su destino principal y con procedencia comprobable.
INSERT INTO media_packages (package_id, media_id, sort_order, is_cover)
SELECT p.id, md.media_id, row_number() OVER (PARTITION BY p.id ORDER BY pd.sort_order, md.is_cover DESC, md.sort_order) - 1, false
FROM tour_packages p
JOIN package_destinations pd ON pd.package_id = p.id AND pd.sort_order = 0
JOIN media_destinations md ON md.destination_id = pd.destination_id AND md.attribution <> 'editorial_guess'
JOIN media_assets m ON m.id = md.media_id AND m.kind = 'image' AND m.status = 'published' AND m.deleted_at IS NULL AND NOT m.is_internal
WHERE p.code IN (SELECT code FROM _pkg)
ON CONFLICT DO NOTHING;
UPDATE media_packages mp SET is_cover = true
WHERE mp.sort_order = 0 AND mp.package_id IN (SELECT p.id FROM tour_packages p JOIN _pkg x ON x.code = p.code)
  AND NOT EXISTS (SELECT 1 FROM media_packages o WHERE o.package_id = mp.package_id AND o.is_cover);

-- Bahía Piña: precio referencial (aprobado como provisional por el dueño) hasta cotizar el transporte.
UPDATE tour_packages SET fees_note = 'Precio referencial: puede cambiar según la cotización del transporte (avioneta o bote). El equipo lo confirma antes de reservar.'
WHERE code = 'XD-BPINA-3D2N' AND fees_note IS NULL;

COMMIT;
