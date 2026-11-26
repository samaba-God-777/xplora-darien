//! Avisos por correo: confirmación al cliente, alerta interna de nuevas solicitudes y cambios de estado.
//! Se encolan en `notifications` dentro de la misma transacción que la reserva y los envía el worker.
//! Sin `MAIL_URL` configurado quedan pendientes (no se simula el envío).
use std::time::Duration;

use lettre::{
    AsyncFileTransport, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;

enum Transport {
    Smtp(AsyncSmtpTransport<Tokio1Executor>),
    File(AsyncFileTransport<Tokio1Executor>),
}

fn transport(config: &Config) -> anyhow::Result<Option<Transport>> {
    let Some(url) = config.mail_url.as_deref() else { return Ok(None) };
    if let Some(dir) = url.strip_prefix("file://") {
        std::fs::create_dir_all(dir)?;
        return Ok(Some(Transport::File(AsyncFileTransport::<Tokio1Executor>::new(dir))));
    }
    let t = AsyncSmtpTransport::<Tokio1Executor>::from_url(url)?.timeout(Some(Duration::from_secs(20))).build();
    Ok(Some(Transport::Smtp(t)))
}

/// Encola un correo (se usa dentro de transacciones de reservas).
pub async fn enqueue<'e, E: sqlx::PgExecutor<'e>>(
    db: E,
    recipient: &str,
    template: &str,
    payload: &Value,
    booking_id: Option<Uuid>,
    locale: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO notifications (channel, recipient, template, payload, booking_id, locale) VALUES ('email', $1, $2, $3, $4, $5)")
        .bind(recipient)
        .bind(template)
        .bind(payload)
        .bind(booking_id)
        .bind(locale)
        .execute(db)
        .await?;
    Ok(())
}

/// Lee un ajuste de texto de `system_settings` ("" si no existe).
pub async fn setting(db: &PgPool, key: &str) -> String {
    sqlx::query_scalar::<_, Option<String>>("SELECT value #>> '{}' FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .flatten()
        .unwrap_or_default()
}

struct Contact {
    name: String,
    whatsapp: String,
    email: String,
    phone: String,
}

fn s<'a>(p: &'a Value, k: &str) -> &'a str {
    p.get(k).and_then(Value::as_str).unwrap_or("")
}

/// Asunto y cuerpo (texto plano) de cada plantilla.
fn render(template: &str, p: &Value, en: bool, c: &Contact, site: &str) -> Option<(String, String)> {
    let code = s(p, "code");
    let total = if p.get("priced").and_then(Value::as_bool).unwrap_or(false) {
        format!("{} {}", s(p, "currency"), s(p, "total"))
    } else if en {
        "to be quoted".into()
    } else {
        "a cotizar".into()
    };
    let mut contact = Vec::new();
    if !c.name.is_empty() {
        contact.push(format!("{}: {}", if en { "Contact" } else { "Contacto" }, c.name));
    }
    if !c.whatsapp.is_empty() {
        contact.push(format!("WhatsApp: https://wa.me/{}", c.whatsapp));
    }
    if !c.phone.is_empty() {
        contact.push(format!("{}: {}", if en { "Phone" } else { "Teléfono" }, c.phone));
    }
    if !c.email.is_empty() {
        contact.push(format!("Email: {}", c.email));
    }
    let contact = contact.join("\n");
    let details = if en {
        format!("Code: {code}\nPackage: {}\nDate: {}\nTravelers: {}\nTotal: {total}", s(p, "package"), s(p, "date"), p["people"])
    } else {
        format!("Código: {code}\nPaquete: {}\nFecha: {}\nViajeros: {}\nTotal: {total}", s(p, "package"), s(p, "date"), p["people"])
    };
    match template {
        "booking_received" => Some(if en {
            (
                format!("We received your request {code} · XPLORA DARIÉN"),
                format!("Hello {},\n\nThank you for choosing Darién. We received your booking request:\n\n{details}\n\nThis is not a confirmed booking yet: our team will verify availability (guides, transport and spots) and contact you to confirm.\n\n{contact}\n\nXPLORA DARIÉN · {site}", s(p, "name")),
            )
        } else {
            (
                format!("Recibimos tu solicitud {code} · XPLORA DARIÉN"),
                format!("Hola {},\n\nGracias por elegir Darién. Recibimos tu solicitud de reserva:\n\n{details}\n\nTodavía no es una reserva confirmada: nuestro equipo verificará la disponibilidad (guías, transporte y cupo) y te contactará para confirmarla.\n\n{contact}\n\nXPLORA DARIÉN · {site}", s(p, "name")),
            )
        }),
        "booking_new" => Some((
            format!("Nueva solicitud {code}: {} ({})", s(p, "package"), s(p, "date")),
            format!("Nueva solicitud de reserva.\n\n{details}\n\nCliente: {}\nCorreo: {}\nTeléfono: {}\nPaís: {}\nNotas: {}\n\nRevisar: {site}/admin/reservas",
                s(p, "name"), s(p, "email"), s(p, "phone"), s(p, "country"), s(p, "notes")),
        )),
        "booking_status" => {
            let st = s(p, "status");
            let (es_title, en_title, es_msg, en_msg) = match st {
                "confirmed" => ("confirmada", "confirmed", "Verificamos la disponibilidad y tu viaje está confirmado. Te contactaremos con los detalles de pago y punto de encuentro.", "We verified availability and your trip is confirmed. We will contact you with payment details and the meeting point."),
                "cancelled" => ("cancelada", "cancelled", "Tu reserva fue cancelada. Si no lo solicitaste o quieres otra fecha, escríbenos.", "Your booking was cancelled. If you did not request it or want another date, write to us."),
                _ => return None,
            };
            Some(if en {
                (format!("Your booking {code} is {en_title} · XPLORA DARIÉN"), format!("Hello {},\n\n{en_msg}\n\n{details}\n\n{contact}\n\nXPLORA DARIÉN · {site}", s(p, "name")))
            } else {
                (format!("Tu reserva {code} está {es_title} · XPLORA DARIÉN"), format!("Hola {},\n\n{es_msg}\n\n{details}\n\n{contact}\n\nXPLORA DARIÉN · {site}", s(p, "name")))
            })
        }
        _ => None,
    }
}

/// Envía hasta `limit` correos pendientes. Devuelve cuántos se enviaron.
pub async fn process(db: &PgPool, config: &Config, limit: i64) -> anyhow::Result<usize> {
    let Some(transport) = transport(config)? else { return Ok(0) };
    let rows: Vec<(Uuid, String, String, Value, String, i16)> = sqlx::query_as(
        "SELECT id, recipient, template, payload, locale, attempts FROM notifications
         WHERE status = 'pending' AND channel = 'email' AND next_attempt_at <= now() ORDER BY created_at LIMIT $1",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;
    if rows.is_empty() {
        return Ok(0);
    }
    let contact = Contact {
        name: setting(db, "contact.name").await,
        whatsapp: setting(db, "contact.whatsapp").await,
        email: setting(db, "contact.email").await,
        phone: setting(db, "contact.phone").await,
    };
    let from: Mailbox = config.mail_from.parse()?;
    let mut sent = 0;
    for (id, to, template, payload, locale, attempts) in rows {
        let result: anyhow::Result<()> = async {
            let (subject, body) = render(&template, &payload, locale == "en", &contact, &config.site_url)
                .ok_or_else(|| anyhow::anyhow!("plantilla desconocida: {template}"))?;
            let mut builder = Message::builder().from(from.clone()).to(to.parse()?).subject(subject);
            if !contact.email.is_empty() && template != "booking_new" {
                builder = builder.reply_to(contact.email.parse()?);
            }
            let msg = builder.header(ContentType::TEXT_PLAIN).body(body)?;
            match &transport {
                Transport::Smtp(t) => {
                    t.send(msg).await?;
                }
                Transport::File(t) => {
                    t.send(msg).await?;
                }
            }
            Ok(())
        }
        .await;
        match result {
            Ok(()) => {
                sent += 1;
                sqlx::query("UPDATE notifications SET status = 'sent', sent_at = now(), attempts = attempts + 1, error = NULL WHERE id = $1").bind(id).execute(db).await?;
            }
            Err(e) => {
                tracing::warn!(%id, error = %e, "no se pudo enviar el correo");
                sqlx::query(
                    "UPDATE notifications SET attempts = attempts + 1, error = $2,
                       status = CASE WHEN $3 >= 4 THEN 'failed' ELSE 'pending' END,
                       next_attempt_at = now() + make_interval(mins => power(2, $3)::int) WHERE id = $1",
                )
                .bind(id).bind(e.to_string()).bind(attempts as i32)
                .execute(db)
                .await?;
            }
        }
    }
    Ok(sent)
}

/// Estado de los avisos para el panel.
pub async fn summary(db: &PgPool, config: &Config) -> Result<Value, sqlx::Error> {
    let counts: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM notifications WHERE channel = 'email' GROUP BY 1) s")
        .fetch_one(db)
        .await?;
    Ok(json!({ "configured": config.mail_url.is_some(), "counts": counts }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c() -> Contact {
        Contact { name: "Equipo".into(), whatsapp: "50760000000".into(), email: "info@x.test".into(), phone: String::new() }
    }

    #[test]
    fn templates_render_in_both_languages() {
        let p = json!({"code": "XD-2026-000001", "name": "Ana", "package": "Arenal", "date": "2027-01-10", "people": 3, "priced": true, "currency": "USD", "total": "120.00"});
        let (s_es, b_es) = render("booking_received", &p, false, &c(), "https://x").unwrap();
        assert!(s_es.contains("XD-2026-000001") && b_es.contains("USD 120.00") && b_es.contains("wa.me/50760000000"));
        assert!(b_es.contains("Todavía no es una reserva confirmada"));
        let (s_en, _) = render("booking_received", &p, true, &c(), "https://x").unwrap();
        assert!(s_en.starts_with("We received"));
        let mut st = p.clone();
        st["status"] = json!("confirmed");
        assert!(render("booking_status", &st, false, &c(), "x").unwrap().0.contains("confirmada"));
        st["status"] = json!("quoting");
        assert!(render("booking_status", &st, false, &c(), "x").is_none(), "solo se avisa de estados relevantes");
        let quote = json!({"code": "X", "priced": false});
        assert!(render("booking_received", &quote, false, &c(), "x").unwrap().1.contains("a cotizar"));
    }
}
