-- XPLORA DARIÉN · 0013 · Persona de contacto visible en el sitio
INSERT INTO system_settings (key, value, description)
VALUES ('contact.name', '""', 'Persona que atiende el contacto (aparece en el pie y en los correos)')
ON CONFLICT (key) DO NOTHING;
