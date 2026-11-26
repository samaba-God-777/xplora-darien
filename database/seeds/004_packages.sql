-- XPLORA DARIÉN · Paquetes turísticos iniciales (BORRADORES).
-- Contenido basado en los destinos y publicaciones de @xplore_darien.
-- NO incluye precios, horarios ni alojamientos: los define y verifica el administrador
-- en /admin/paquetes (precios por temporada) antes de publicar. Idempotente por código.
BEGIN;

CREATE TEMP TABLE _pkg (code text, slug text, name text, ptype text, short text, descr text, days int, nights int,
  difficulty text, min_age int, min_p int, max_c int, packing text, weather text, reqs text, cancel text,
  dests text[]) ON COMMIT DROP;

INSERT INTO _pkg VALUES
('XD-ARENAL-1D', 'cascadas-del-valle-de-arenal', 'Cascadas del valle de Arenal', 'day_trip',
 'Un día entre la Cascada Arenal y el Chorro Río Venao, con baño en pozas naturales.',
 'Caminata guiada por el valle de Arenal (Río Congo Arriba) hasta la Cascada Arenal, una de las cascadas emblemáticas de Darién, con tiempo para refrescarse en sus pozas. Por la tarde, visita al Chorro Río Venao, escondido pero muy cercano. Un trip de naturaleza ideal para un fin de semana.',
 1, 0, 'moderada', NULL, 2, 15,
 'Calzado con agarre para roca mojada, ropa de baño, muda de ropa, bloqueador biodegradable, repelente, agua y bolsa seca.',
 'En temporada lluviosa las cascadas tienen más caudal; si hay crecida, el guía puede cambiar o suspender la visita.',
 'Saber nadar es recomendable para el baño en pozas.', NULL,
 ARRAY['cascada-arenal','chorro-rio-venao']),
('XD-EMBUDO-1D', 'el-embudo-cascada-entre-la-niebla', 'El Embudo: cascada entre la niebla', 'day_trip',
 'Caminata de unas 1,5 horas en la Cordillera de Majé hasta una cascada rodeada de musgo y frío.',
 'Desde Tortí, una caminata de aproximadamente hora y media por la Cordillera de Majé lleva a El Embudo: clima lluvioso, musgo y aire frío que hacen sentir otro ecosistema. Un clásico para los amantes de las cascadas.',
 1, 0, 'moderada', NULL, 2, 12,
 'Impermeable, abrigo ligero, calzado de montaña, ropa de baño, agua y snacks.',
 'Sendero húmedo y resbaladizo todo el año; se evita con crecidas.',
 NULL, NULL, ARRAY['el-embudo']),
('XD-GIBA-2D1N', 'amanecer-en-la-giba-del-toro', 'Amanecer en La Giba del Toro', 'two_days_one_night',
 'Ascenso al cerro de Tortí (≈950 msnm), noche de campamento y amanecer sobre las nubes.',
 'El cerro que se eleva abruptamente sobre Tortí. Ascenso guiado, campamento en la cima con clima fresco de día y frío intenso de noche, y amanecer con vistas espectaculares. Para muchos participantes, su primera experiencia de camping y hiking.',
 2, 1, 'exigente', 12, 2, 12,
 'Saco de dormir, abrigo, linterna frontal, impermeable, calzado de montaña, agua (mínimo 3 L) y comida de marcha.',
 'Mejor en verano seco (diciembre–abril). Noches frías en la cima.',
 'Buena condición física. Ascenso solo con guía.', NULL,
 ARRAY['giba-del-toro']),
('XD-REFORESTA-2D1N', 'explora-y-reforesta-arenal', 'Explora y Reforesta en Arenal', 'two_days_one_night',
 'Dos días de exploración de cascadas y siembra de árboles en el valle de Arenal.',
 'Inspirado en las jornadas Explora & Reforesta de @xplore_darien: un día de reforestación con especies forestales, frutales y de importancia ecológica en el valle de Arenal, y otro de exploración de la Cascada Arenal y la Cascada El Jobo. Viajar dejando huella.',
 2, 1, 'moderada', 8, 4, 30,
 'Guantes de trabajo, sombrero, calzado cerrado, ropa de baño, repelente, bloqueador biodegradable.',
 'Las jornadas de siembra se planifican al inicio de la temporada lluviosa.',
 NULL, NULL, ARRAY['cascada-arenal','cascada-el-jobo']),
('XD-PND-3D2N', 'parque-nacional-darien-y-el-real', 'Parque Nacional Darién y El Real', 'three_days_two_nights',
 'Yaviza, río Tuira, El Real de Santa María y la selva del Parque Nacional Darién.',
 'Por la Panamericana hasta Yaviza, fin de la carretera y kilómetro 12 580 desde Alaska. Desde allí, en bote por el río Tuira a El Real de Santa María, pueblo histórico con pequeños restos coloniales, y la entrada al Parque Nacional Darién, Patrimonio de la Humanidad y Reserva de la Biosfera, para caminatas y observación de aves.',
 3, 2, 'exigente', 12, 2, 10,
 'Botas de caminata, ropa de manga larga, impermeable, repelente, linterna, binoculares, documento de identidad.',
 'Recomendado en verano seco (diciembre–abril).',
 'Permiso de MiAmbiente y registro en los puestos de control. Documento de identidad obligatorio. Solo con operador autorizado.', NULL,
 ARRAY['yaviza','el-real-de-santa-maria','parque-nacional-darien']),
('XD-PMUERTO-3D2N', 'playa-muerto-selva-y-pacifico', 'Playa Muerto: selva y Pacífico', 'three_days_two_nights',
 'Bahía salvaje sin acceso terrestre, comunidad Emberá, miradores y atardeceres.',
 'Desde La Palma, capital de Darién, travesía en bote hasta Playa Muerto: arena oscura enmarcada por selva y montañas, una comunidad Emberá que recibe al visitante, senderos a miradores y los atardeceres más espectaculares de la costa entre enero y abril.',
 3, 2, 'moderada', NULL, 2, 12,
 'Bolsa seca, ropa de baño, calzado de agua, repelente, bloqueador biodegradable, linterna.',
 'La travesía depende del estado del mar y de las mareas.',
 'Visita a la comunidad solo con su autorización. Chaleco salvavidas obligatorio en el bote.', NULL,
 ARRAY['la-palma','playa-muerto']),
('XD-CULTURA-1D', 'puerto-lara-cultura-viva', 'Puerto Lara: cultura viva', 'cultural',
 'Visita cultural autorizada a una comunidad indígena: arquitectura, artesanía y tradición.',
 'Experiencia cultural organizada con la comunidad de Puerto Lara: arquitectura tradicional de casas de palma, tejidos, tallas y convivencia. Sin escenificaciones inventadas: lo que la comunidad decida compartir.',
 1, 0, 'facil', NULL, 2, 20,
 'Ropa cómoda, efectivo para artesanías, bloqueador, repelente.',
 NULL,
 'Pedir permiso antes de fotografiar a personas. Respetar las normas comunitarias.', NULL,
 ARRAY['puerto-lara']);

INSERT INTO tour_packages (code, slug, name, package_type, short_description, description, days, nights, difficulty, min_age,
  min_participants, max_capacity, currency, tax_rate, packing_list, weather_notes, special_requirements, cancellation_policy, status)
SELECT code, slug, name, ptype::package_type, short, descr, days, nights, difficulty::difficulty_level, min_age, min_p, max_c,
  'USD', 0, packing, weather, reqs, cancel, 'draft'
FROM _pkg ON CONFLICT (code) DO NOTHING;

INSERT INTO package_destinations (package_id, destination_id, sort_order)
SELECT p.id, d.id, k.ord - 1 FROM _pkg x JOIN tour_packages p ON p.code = x.code,
  unnest(x.dests) WITH ORDINALITY k(slug, ord) JOIN destinations d ON d.slug = k.slug
ON CONFLICT DO NOTHING;

-- Itinerario (sin horarios: los fija el operador)
CREATE TEMP TABLE _day (code text, day int, title text, descr text, lodging text) ON COMMIT DROP;
INSERT INTO _day VALUES
('XD-ARENAL-1D', 1, 'Cascada Arenal y Chorro Río Venao', 'Traslado a Río Congo Arriba, caminata guiada a la Cascada Arenal y baño en pozas. Visita al Chorro Río Venao y regreso.', NULL),
('XD-EMBUDO-1D', 1, 'Caminata a El Embudo', 'Encuentro en Tortí, caminata de ≈1,5 h por la Cordillera de Majé, tiempo en la cascada y regreso.', NULL),
('XD-GIBA-2D1N', 1, 'Ascenso y campamento', 'Encuentro en Tortí, ascenso guiado a La Giba del Toro y montaje del campamento en la cima.', 'Campamento en la cima (por confirmar)'),
('XD-GIBA-2D1N', 2, 'Amanecer y descenso', 'Amanecer sobre las nubes, desayuno de campamento y descenso.', NULL),
('XD-REFORESTA-2D1N', 1, 'Jornada de reforestación', 'Siembra de árboles en el valle de Arenal con la comunidad y charla sobre especies nativas.', 'Por confirmar'),
('XD-REFORESTA-2D1N', 2, 'Cascadas Arenal y El Jobo', 'Exploración guiada de la Cascada Arenal y la Cascada El Jobo.', NULL),
('XD-PND-3D2N', 1, 'Yaviza: fin de la Panamericana', 'Viaje por la Panamericana hasta Yaviza; recorrido por el pueblo y las ruinas de la casa-fuerte.', 'Por confirmar'),
('XD-PND-3D2N', 2, 'Río Tuira y El Real de Santa María', 'Bote por el río Tuira a El Real, visita histórica y traslado a la entrada del Parque Nacional Darién.', 'Por confirmar'),
('XD-PND-3D2N', 3, 'Selva del Parque Nacional', 'Caminata guiada y observación de aves; regreso a Yaviza.', NULL),
('XD-PMUERTO-3D2N', 1, 'La Palma y travesía', 'Llegada a La Palma y travesía en bote hasta Playa Muerto (según mar y marea).', 'Por confirmar'),
('XD-PMUERTO-3D2N', 2, 'Selva, mirador y comunidad', 'Sendero al mirador, tiempo de playa y convivencia autorizada con la comunidad Emberá.', 'Por confirmar'),
('XD-PMUERTO-3D2N', 3, 'Regreso', 'Travesía de regreso a La Palma.', NULL),
('XD-CULTURA-1D', 1, 'Visita a Puerto Lara', 'Recibimiento por la comunidad, recorrido por la aldea, artesanía y convivencia.', NULL);

INSERT INTO package_itinerary_days (package_id, day_number, title, description, lodging, transport, meals)
SELECT p.id, x.day, x.title, x.descr, x.lodging, 'Por confirmar con el operador', 'Por confirmar'
FROM _day x JOIN tour_packages p ON p.code = x.code
ON CONFLICT (package_id, day_number) DO NOTHING;

INSERT INTO package_inclusions (package_id, kind, description, sort_order)
SELECT p.id, 'guide', 'Guía local', 0 FROM tour_packages p
WHERE p.code IN (SELECT code FROM _pkg) AND NOT EXISTS (SELECT 1 FROM package_inclusions i WHERE i.package_id = p.id);

INSERT INTO package_exclusions (package_id, description, sort_order)
SELECT p.id, e.d, e.o FROM tour_packages p, (VALUES ('Gastos personales', 0), ('Propinas', 1)) e(d, o)
WHERE p.code IN (SELECT code FROM _pkg) AND NOT EXISTS (SELECT 1 FROM package_exclusions x WHERE x.package_id = p.id);

-- Galería de cada paquete: fotos publicadas de sus destinos (con procedencia comprobable).
INSERT INTO media_packages (package_id, media_id, sort_order, is_cover)
SELECT p.id, md.media_id, row_number() OVER (PARTITION BY p.id ORDER BY pd.sort_order, md.is_cover DESC, md.sort_order) - 1, false
FROM tour_packages p
JOIN package_destinations pd ON pd.package_id = p.id
JOIN media_destinations md ON md.destination_id = pd.destination_id AND md.attribution <> 'editorial_guess'
JOIN media_assets m ON m.id = md.media_id AND m.status = 'published' AND m.deleted_at IS NULL AND NOT m.is_internal
WHERE p.code IN (SELECT code FROM _pkg)
ON CONFLICT DO NOTHING;
UPDATE media_packages mp SET is_cover = true
WHERE (mp.package_id, mp.sort_order) IN (SELECT package_id, min(sort_order) FROM media_packages
  WHERE package_id IN (SELECT id FROM tour_packages WHERE code IN (SELECT code FROM _pkg)) GROUP BY package_id)
  AND mp.media_id IN (SELECT id FROM media_assets WHERE content_type = 'photo');

COMMIT;
