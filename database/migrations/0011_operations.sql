-- XPLORA DARIÉN · 0011 · Operación del negocio: personal, asignaciones, inventario, pagos y gastos
-- No se cargan datos ficticios: el equipo registra trabajadores, inventario, cobros y gastos reales.

-- ---------------------------------------------------------------- Personal
CREATE TYPE staff_role AS ENUM ('guide','boat_operator','driver','cook','porter','coordinator','admin','other');
CREATE TYPE pay_type AS ENUM ('per_day','per_trip','monthly');

CREATE TABLE staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     text NOT NULL CHECK (length(trim(full_name)) > 1),
  role          staff_role NOT NULL,
  phone         text,
  email         citext,
  document_id   text,                        -- cédula/pasaporte (solo panel)
  community     text,                        -- pueblo o comunidad de origen
  pay_type      pay_type NOT NULL DEFAULT 'per_day',
  pay_rate      numeric(10,2) NOT NULL DEFAULT 0 CHECK (pay_rate >= 0),
  languages     text[] NOT NULL DEFAULT '{es}',
  guide_id      uuid REFERENCES guides(id) ON DELETE SET NULL,   -- perfil público, si es guía
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  hired_on      date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER staff_updated BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX staff_active_idx ON staff(is_active, role);

-- Asignación de trabajadores a reservas (genera costo de personal).
CREATE TABLE staff_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  role        staff_role NOT NULL,
  work_date   date NOT NULL,
  days        smallint NOT NULL DEFAULT 1 CHECK (days BETWEEN 1 AND 30),
  amount      numeric(10,2) NOT NULL CHECK (amount >= 0),   -- pago acordado por esta asignación
  paid        boolean NOT NULL DEFAULT false,
  paid_at     timestamptz,
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, staff_id)
);
CREATE INDEX staff_assignments_staff_idx ON staff_assignments(staff_id, work_date);
CREATE INDEX staff_assignments_date_idx ON staff_assignments(work_date);

-- ---------------------------------------------------------------- Inventario
CREATE TYPE inventory_category AS ENUM ('camping','safety','water','transport','kitchen','first_aid','photo_video','office','other');
CREATE TYPE item_condition AS ENUM ('new','good','fair','repair','retired');
CREATE TYPE movement_type AS ENUM ('purchase','return','checkout','loss','repair','adjustment');

CREATE TABLE inventory_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  category      inventory_category NOT NULL,
  sku           text UNIQUE,
  unit          text NOT NULL DEFAULT 'unidad',
  quantity      int NOT NULL DEFAULT 0 CHECK (quantity >= 0),       -- disponible en bodega
  in_use        int NOT NULL DEFAULT 0 CHECK (in_use >= 0),         -- prestado en viajes
  in_repair     int NOT NULL DEFAULT 0 CHECK (in_repair >= 0),
  min_stock     int NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_cost     numeric(10,2) CHECK (unit_cost >= 0),
  condition     item_condition NOT NULL DEFAULT 'good',
  location      text,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER inventory_items_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_movements (
  id          bigserial PRIMARY KEY,
  item_id     uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type        movement_type NOT NULL,
  quantity    int NOT NULL CHECK (quantity <> 0),
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  unit_cost   numeric(10,2),
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_item_idx ON inventory_movements(item_id, created_at DESC);

-- Aplica cada movimiento a los contadores; los CHECK impiden existencias negativas.
CREATE OR REPLACE FUNCTION apply_inventory_movement() RETURNS trigger AS $$
DECLARE q int := abs(NEW.quantity);
BEGIN
  CASE NEW.type
    WHEN 'purchase'   THEN UPDATE inventory_items SET quantity = quantity + q WHERE id = NEW.item_id;
    WHEN 'checkout'   THEN UPDATE inventory_items SET quantity = quantity - q, in_use = in_use + q WHERE id = NEW.item_id;
    WHEN 'return'     THEN UPDATE inventory_items SET quantity = quantity + q, in_use = in_use - q WHERE id = NEW.item_id;
    WHEN 'repair'     THEN UPDATE inventory_items SET quantity = quantity - q, in_repair = in_repair + q WHERE id = NEW.item_id;
    WHEN 'loss'       THEN UPDATE inventory_items SET quantity = quantity - q WHERE id = NEW.item_id;
    WHEN 'adjustment' THEN UPDATE inventory_items SET quantity = quantity + NEW.quantity WHERE id = NEW.item_id;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_movements_apply AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();

-- ---------------------------------------------------------------- Finanzas
CREATE TYPE payment_method AS ENUM ('cash','transfer','card','yappy','other');

-- Cobros reales recibidos por reserva (ingresos).
CREATE TABLE booking_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  amount      numeric(12,2) NOT NULL CHECK (amount <> 0),   -- negativo = reembolso
  method      payment_method NOT NULL,
  paid_on     date NOT NULL DEFAULT current_date,
  reference   text,
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_payments_date_idx ON booking_payments(paid_on);
CREATE INDEX booking_payments_booking_idx ON booking_payments(booking_id);

CREATE TYPE expense_category AS ENUM ('transport','fuel','food','lodging','equipment','permits','marketing','ai_generation','salaries','maintenance','commissions','other');

CREATE TABLE expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    expense_category NOT NULL,
  description text NOT NULL,
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  spent_on    date NOT NULL DEFAULT current_date,
  booking_id  uuid REFERENCES bookings(id) ON DELETE SET NULL,
  package_id  uuid REFERENCES tour_packages(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  reference   text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_date_idx ON expenses(spent_on);

-- Libro mensual: ingresos (cobros), gastos registrados y pagos de personal asignados.
CREATE OR REPLACE VIEW finance_monthly AS
WITH months AS (
  SELECT date_trunc('month', paid_on)::date AS month, sum(amount) AS income, 0::numeric AS expenses, 0::numeric AS payroll FROM booking_payments GROUP BY 1
  UNION ALL
  SELECT date_trunc('month', spent_on)::date, 0, sum(amount), 0 FROM expenses GROUP BY 1
  UNION ALL
  SELECT date_trunc('month', work_date)::date, 0, 0, sum(amount) FROM staff_assignments GROUP BY 1
)
SELECT month, sum(income) AS income, sum(expenses) AS expenses, sum(payroll) AS payroll,
       sum(income) - sum(expenses) - sum(payroll) AS profit
FROM months GROUP BY month;

-- ---------------------------------------------------------------- Permisos
INSERT INTO permissions (key, description) VALUES
  ('staff.manage', 'Gestionar trabajadores y asignaciones'),
  ('inventory.manage', 'Gestionar inventario y movimientos'),
  ('finance.read', 'Ver panel de ganancias'),
  ('finance.write', 'Registrar cobros y gastos')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE (r.key IN ('superadmin','admin') AND p.key IN ('staff.manage','inventory.manage','finance.read','finance.write'))
   OR (r.key = 'operator' AND p.key IN ('staff.manage','inventory.manage'))
   OR (r.key = 'booking_manager' AND p.key IN ('finance.write'))
ON CONFLICT DO NOTHING;
