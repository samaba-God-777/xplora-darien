-- XPLORA DARIÉN · 0012 · Contacto, páginas de confianza, opiniones verificadas y avisos

-- ---------------------------------------------------------------- Opiniones (testimonios)
ALTER TABLE reviews
  ADD COLUMN email     citext,
  ADD COLUMN country   char(2),
  ADD COLUMN verified  boolean NOT NULL DEFAULT false,   -- ligada a una reserva real (código + correo)
  ADD COLUMN locale    text NOT NULL DEFAULT 'es',
  ADD COLUMN moderated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN moderated_at timestamptz;
-- Una sola opinión por reserva.
CREATE UNIQUE INDEX reviews_one_per_booking ON reviews(booking_id) WHERE booking_id IS NOT NULL;

INSERT INTO permissions (key, description) VALUES ('reviews.moderate', 'Moderar opiniones y testimonios')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE p.key = 'reviews.moderate' AND r.key IN ('superadmin', 'admin', 'editor', 'booking_manager')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- Avisos
ALTER TABLE notifications
  ADD COLUMN locale text NOT NULL DEFAULT 'es',
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX notifications_due_idx ON notifications(next_attempt_at) WHERE status = 'pending' AND channel = 'email';

-- ---------------------------------------------------------------- Configuración pública del sitio
-- Contacto: vacío hasta que el administrador lo confirme (el botón de WhatsApp no aparece sin número).
INSERT INTO system_settings (key, value, description) VALUES
  ('contact.whatsapp', '""', 'Número de WhatsApp del negocio con código de país, solo dígitos (p. ej. 5076…)'),
  ('contact.email', '""', 'Correo público de contacto'),
  ('contact.phone', '""', 'Teléfono público'),
  ('contact.address', '""', 'Dirección o base de operaciones'),
  ('notify.email', '""', 'Correo interno que recibe el aviso de cada nueva solicitud'),
  ('page.about', to_jsonb($$XPLORA DARIÉN nace en Darién y de su gente. Desde 2021 compartimos en @xplore_darien los rincones de la provincia: cascadas como Arenal y El Jobo, ríos, cerros y la costa del Pacífico.

Desde 2022 organizamos las jornadas **Explora y Reforesta**: niños, jóvenes y adultos de Darién y de otras provincias se reúnen para sembrar árboles frutales, forestales y especies en riesgo en el valle de Arenal y, al mismo tiempo, descubrir sus cascadas. En la primera edición se sembraron más de 1 500 plantas.

Trabajamos con guías y comunidades locales, porque creemos que el turismo en Darién debe dejar beneficios en Darién.$$::text), 'Texto de la página Quiénes somos (Markdown simple)'),
  ('page.cancellation', to_jsonb($$Las condiciones de cancelación de cada paquete se indican en su ficha y se confirman por escrito, junto con la cotización, antes de cualquier pago.

- Una solicitud de reserva no tiene costo ni compromiso hasta que la confirmamos.
- Ninguna reserva se confirma sin verificar la disponibilidad de guías, transporte y cupo.
- Si un viaje se suspende por clima, crecidas, estado del mar o seguridad, te ofrecemos una nueva fecha o la devolución de lo pagado.$$::text), 'Texto de la página de cancelaciones'),
  ('page.privacy', to_jsonb($$**Qué datos guardamos.** Cuando solicitas una reserva guardamos tu nombre, apellidos, correo, teléfono, país, número de participantes y tus observaciones. Los usamos solo para gestionar tu viaje y contactarte.

**Qué no guardamos.** La galería registra vistas de forma anónima: no guardamos tu dirección IP ni datos personales al navegar.

**Con quién los compartimos.** Solo con el personal y los proveedores necesarios para tu viaje (guía, transporte). No vendemos datos.

**Tus derechos.** Puedes pedir una copia o la eliminación de tus datos escribiendo a nuestro correo de contacto.$$::text), 'Texto de la política de privacidad'),
  ('page.terms', to_jsonb($$Al solicitar una reserva aceptas que la información del paquete (itinerario, precio y servicios incluidos) se confirma por escrito antes del pago. Los precios se expresan en dólares (USD) por persona y pueden variar según la temporada. Las actividades en la naturaleza dependen del clima y de las indicaciones de los guías, que pueden modificar o suspender una actividad por seguridad.$$::text), 'Texto de los términos y condiciones')
ON CONFLICT (key) DO NOTHING;
