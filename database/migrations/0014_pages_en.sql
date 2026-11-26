-- XPLORA DARIÉN · 0014 · Versión en inglés de las páginas de confianza (editable en Panel → Configuración).
-- Traducción de los textos iniciales en español; si el equipo cambia el español, debe actualizar también el inglés.
INSERT INTO system_settings (key, value, description) VALUES
('page.about.en', to_jsonb($t$XPLORA DARIÉN was born in Darién, from its people. Since 2021 we have been sharing the corners of the province on @xplore_darien: waterfalls such as Arenal and El Jobo, rivers, hills and the Pacific coast.

Since 2022 we have organized the **Explore and Reforest** days: children, young people and adults from Darién and other provinces come together to plant fruit trees, timber trees and endangered species in the Arenal valley while discovering its waterfalls. More than 1,500 plants were planted in the first edition.

We work with local guides and communities, because we believe tourism in Darién should leave its benefits in Darién.$t$::text), 'Quiénes somos (inglés)'),
('page.cancellation.en', to_jsonb($t$The cancellation terms for each tour are shown on its page and confirmed in writing, together with the quote, before any payment.

- A booking request has no cost or commitment until we confirm it.
- No booking is confirmed without checking the availability of guides, transport and spots.
- If a trip is suspended due to weather, flooding, sea conditions or safety, we offer you a new date or a refund of what you paid.$t$::text), 'Cancelaciones (inglés)'),
('page.privacy.en', to_jsonb($t$**What data we keep.** When you request a booking we keep your first and last name, email, phone, country, number of participants and your notes. We use them only to manage your trip and contact you.

**What we don't keep.** The gallery records views anonymously: we don't store your IP address or personal data while you browse.

**Who we share it with.** Only with the staff and suppliers needed for your trip (guide, transport). We don't sell data.

**Your rights.** You can ask for a copy or the deletion of your data by writing to our contact email.$t$::text), 'Privacidad (inglés)'),
('page.terms.en', to_jsonb($t$By requesting a booking you accept that the tour information (itinerary, price and included services) is confirmed in writing before payment. Prices are in US dollars (USD) per person and may vary by season. Nature activities depend on the weather and on the guides' instructions, who may change or suspend an activity for safety reasons.$t$::text), 'Términos (inglés)')
ON CONFLICT (key) DO NOTHING;
