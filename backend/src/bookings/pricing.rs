//! Cálculo de precio de una reserva a partir de los precios configurados por el administrador.
//! Función pura (sin BD) para poder probarla de forma exhaustiva.
use rust_decimal::{Decimal, RoundingStrategy};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone)]
pub struct PriceRow {
    pub price_type: String,
    pub amount: Decimal,
    pub min_group_size: Option<i16>,
    pub discount_pct: Decimal,
}

#[derive(Debug, Clone, Serialize, ToSchema, PartialEq)]
pub struct Breakdown {
    /// `false` si el paquete no tiene precio configurado: la solicitud queda "a cotizar".
    pub priced: bool,
    pub currency: String,
    #[schema(value_type = Option<String>)]
    pub adult_unit: Option<Decimal>,
    #[schema(value_type = Option<String>)]
    pub child_unit: Option<Decimal>,
    pub applied_rate: Option<String>,
    #[schema(value_type = String)]
    pub subtotal: Decimal,
    #[schema(value_type = String)]
    pub discount_total: Decimal,
    #[schema(value_type = String)]
    pub tax_total: Decimal,
    #[schema(value_type = String)]
    pub total: Decimal,
}

fn round(d: Decimal) -> Decimal {
    d.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
}

fn net(p: &PriceRow) -> Decimal {
    p.amount * (Decimal::ONE_HUNDRED - p.discount_pct) / Decimal::ONE_HUNDRED
}

/// Reglas:
/// - Adulto: el menor precio neto entre `adult`, `per_person`, `special` y `group` (si el grupo alcanza el mínimo).
/// - Niño: precio `child` si existe; si no, se cobra como adulto.
/// - Descuentos por porcentaje de cada tarifa; impuesto sobre el neto.
pub fn calculate(prices: &[PriceRow], adults: i16, children: i16, tax_rate: Decimal, currency: &str) -> Breakdown {
    let people = adults + children;
    let adult_candidates = prices.iter().filter(|p| match p.price_type.as_str() {
        "adult" | "per_person" | "special" => true,
        "group" => p.min_group_size.is_some_and(|m| people >= m),
        _ => false,
    });
    let adult = adult_candidates.min_by_key(|p| net(p));
    let Some(adult) = adult else {
        return Breakdown {
            priced: false,
            currency: currency.into(),
            adult_unit: None,
            child_unit: None,
            applied_rate: None,
            subtotal: Decimal::ZERO,
            discount_total: Decimal::ZERO,
            tax_total: Decimal::ZERO,
            total: Decimal::ZERO,
        };
    };
    let child = prices.iter().find(|p| p.price_type == "child").unwrap_or(adult);

    let a = Decimal::from(adults);
    let c = Decimal::from(children);
    let gross = adult.amount * a + child.amount * c;
    let net_total = net(adult) * a + net(child) * c;
    let discount = round(gross - net_total);
    let subtotal = round(gross);
    let tax = round(net_total * tax_rate);
    Breakdown {
        priced: true,
        currency: currency.into(),
        adult_unit: Some(adult.amount),
        child_unit: (children > 0).then_some(child.amount),
        applied_rate: Some(adult.price_type.clone()),
        subtotal,
        discount_total: discount,
        tax_total: tax,
        total: subtotal - discount + tax,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::dec;

    fn p(t: &str, amount: Decimal, min: Option<i16>, disc: Decimal) -> PriceRow {
        PriceRow { price_type: t.into(), amount, min_group_size: min, discount_pct: disc }
    }

    #[test]
    fn no_prices_means_quote_pending() {
        let b = calculate(&[], 2, 0, dec!(0.07), "USD");
        assert!(!b.priced);
        assert_eq!(b.total, Decimal::ZERO);
    }

    #[test]
    fn adults_children_and_tax() {
        let prices = [p("adult", dec!(100), None, dec!(0)), p("child", dec!(60), None, dec!(0))];
        let b = calculate(&prices, 2, 1, dec!(0.07), "USD");
        assert_eq!(b.subtotal, dec!(260.00));
        assert_eq!(b.tax_total, dec!(18.20));
        assert_eq!(b.total, dec!(278.20));
    }

    #[test]
    fn child_falls_back_to_adult() {
        let b = calculate(&[p("per_person", dec!(50), None, dec!(0))], 1, 2, dec!(0), "USD");
        assert_eq!(b.total, dec!(150));
    }

    #[test]
    fn group_rate_only_when_size_reached() {
        let prices = [p("adult", dec!(100), None, dec!(0)), p("group", dec!(80), Some(6), dec!(0))];
        assert_eq!(calculate(&prices, 5, 0, dec!(0), "USD").total, dec!(500));
        let b = calculate(&prices, 6, 0, dec!(0), "USD");
        assert_eq!(b.total, dec!(480));
        assert_eq!(b.applied_rate.as_deref(), Some("group"));
    }

    #[test]
    fn discount_applies_before_tax() {
        let b = calculate(&[p("adult", dec!(100), None, dec!(10))], 2, 0, dec!(0.10), "USD");
        assert_eq!(b.subtotal, dec!(200));
        assert_eq!(b.discount_total, dec!(20));
        assert_eq!(b.tax_total, dec!(18));
        assert_eq!(b.total, dec!(198));
    }
}
