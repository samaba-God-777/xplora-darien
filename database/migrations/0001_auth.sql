-- XPLORA DARIÉN · 0001 · Extensiones, utilidades, usuarios, roles y permisos
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Mantiene updated_at automáticamente.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,               -- Argon2id (PHC string)
  full_name     text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
  id          smallserial PRIMARY KEY,
  key         text NOT NULL UNIQUE,          -- superadmin, admin, editor, operator, booking_manager
  name        text NOT NULL,
  description text
);

CREATE TABLE permissions (
  id          smallserial PRIMARY KEY,
  key         text NOT NULL UNIQUE,          -- p.ej. destinations.write
  description text
);

CREATE TABLE role_permissions (
  role_id       smallint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id smallint NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    smallint NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles(role_id);

-- Datos de referencia: roles y permisos
INSERT INTO roles (key, name, description) VALUES
  ('superadmin',      'Superadministrador',  'Acceso total, incluida la gestión de usuarios y roles'),
  ('admin',           'Administrador',       'Gestión completa del contenido y operaciones'),
  ('editor',          'Editor',              'Contenido: destinos, experiencias, blog, medios'),
  ('operator',        'Operador turístico',  'Paquetes, itinerarios, salidas y disponibilidad'),
  ('booking_manager', 'Gestor de reservas',  'Reservas, cotizaciones y clientes');

INSERT INTO permissions (key, description) VALUES
  ('destinations.write', 'Crear y editar destinos'),
  ('destinations.publish', 'Publicar, despublicar y destacar destinos'),
  ('packages.write', 'Crear y editar paquetes'),
  ('packages.publish', 'Publicar, despublicar y destacar paquetes'),
  ('packages.pricing', 'Definir precios y disponibilidad'),
  ('experiences.write', 'Gestionar experiencias'),
  ('bookings.read', 'Ver reservas'),
  ('bookings.manage', 'Cambiar estado de reservas y crear cotizaciones'),
  ('customers.read', 'Ver clientes'),
  ('guides.write', 'Gestionar guías y proveedores'),
  ('media.write', 'Gestionar fotografías y videos'),
  ('ai.generate', 'Usar el estudio Higgsfield'),
  ('content.write', 'Blog, testimonios y promociones'),
  ('routes.verify', 'Marcar rutas como verificadas'),
  ('users.manage', 'Gestionar usuarios y roles'),
  ('settings.manage', 'Configuración del sistema'),
  ('audit.read', 'Consultar auditoría y reportes');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'superadmin'
   OR (r.key = 'admin' AND p.key NOT IN ('users.manage'))
   OR (r.key = 'editor' AND p.key IN ('destinations.write','experiences.write','media.write','content.write','ai.generate'))
   OR (r.key = 'operator' AND p.key IN ('packages.write','packages.pricing','experiences.write','guides.write','bookings.read','routes.verify'))
   OR (r.key = 'booking_manager' AND p.key IN ('bookings.read','bookings.manage','customers.read'));
