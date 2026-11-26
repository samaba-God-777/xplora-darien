//! Validación de parámetros contra el esquema documentado de cada modelo de Higgsfield.
//! Cada modelo admite parámetros distintos: se rechaza todo lo que no esté documentado.
use serde_json::{Map, Value};

/// Valida `params` (sin `prompt` ni la imagen, que el estudio añade aparte si el modelo los admite).
pub fn validate(schema: &Map<String, Value>, required: &[String], params: &Map<String, Value>) -> Result<(), Vec<String>> {
    let mut errors = Vec::new();
    for (key, value) in params {
        let Some(spec) = schema.get(key) else {
            errors.push(format!("`{key}` no es un parámetro de este modelo"));
            continue;
        };
        if let Err(e) = check(key, spec, value) {
            errors.push(e);
        }
    }
    for r in required {
        let present = params.get(r).is_some_and(|v| !v.is_null() && v.as_str() != Some(""));
        if !present {
            errors.push(format!("`{r}` es obligatorio para este modelo"));
        }
    }
    if errors.is_empty() { Ok(()) } else { Err(errors) }
}

fn check(key: &str, spec: &Value, value: &Value) -> Result<(), String> {
    if value.is_null() {
        return Ok(());
    }
    if let Some(allowed) = spec.get("enum").and_then(Value::as_array)
        && !allowed.contains(value)
    {
        return Err(format!("`{key}` debe ser uno de {}", Value::Array(allowed.clone())));
    }
    let ty = spec.get("type").and_then(Value::as_str).unwrap_or("");
    let ok = match ty {
        "string" => value.is_string(),
        "integer" => value.as_i64().is_some() || value.as_f64().is_some_and(|f| f.fract() == 0.0),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => true,
    };
    if !ok {
        return Err(format!("`{key}` debe ser de tipo {ty}"));
    }
    if let Some(n) = value.as_f64() {
        if let Some(min) = spec.get("minimum").and_then(Value::as_f64)
            && n < min
        {
            return Err(format!("`{key}` mínimo {min}"));
        }
        if let Some(max) = spec.get("maximum").and_then(Value::as_f64)
            && n > max
        {
            return Err(format!("`{key}` máximo {max}"));
        }
    }
    if let (Some(s), Some(max)) = (value.as_str(), spec.get("maxLength").and_then(Value::as_u64))
        && s.chars().count() as u64 > max
    {
        return Err(format!("`{key}` admite como máximo {max} caracteres"));
    }
    if let Some(arr) = value.as_array() {
        if let Some(max) = spec.get("maxItems").and_then(Value::as_u64)
            && arr.len() as u64 > max
        {
            return Err(format!("`{key}` admite como máximo {max} elementos"));
        }
        if let Some(min) = spec.get("minItems").and_then(Value::as_u64)
            && (arr.len() as u64) < min
        {
            return Err(format!("`{key}` requiere al menos {min} elementos"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn schema() -> Map<String, Value> {
        json!({
            "prompt": {"type": "string", "maxLength": 20},
            "duration": {"type": "integer", "enum": [5, 10]},
            "aspect_ratio": {"type": "string", "enum": ["16:9", "9:16", "1:1"]},
            "cfg_scale": {"type": "number", "minimum": 0, "maximum": 1},
            "image_url": {"type": "string"}
        })
        .as_object()
        .unwrap()
        .clone()
    }

    fn p(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn accepts_documented_values() {
        let r = validate(&schema(), &["prompt".into()], &p(json!({"prompt": "selva", "duration": 10, "aspect_ratio": "9:16", "cfg_scale": 0.5})));
        assert!(r.is_ok(), "{r:?}");
    }

    #[test]
    fn rejects_undocumented_and_out_of_range() {
        let e = validate(&schema(), &["prompt".into(), "image_url".into()], &p(json!({
            "prompt": "x".repeat(21), "duration": 7, "aspect_ratio": "4:5", "cfg_scale": 2, "resolution": "4k"
        })))
        .unwrap_err();
        assert_eq!(e.len(), 6, "{e:?}");
        assert!(e.iter().any(|m| m.contains("resolution")));
        assert!(e.iter().any(|m| m.contains("image_url")));
    }

    #[test]
    fn model_without_aspect_ratio_rejects_it() {
        let s = json!({"prompt": {"type": "string"}, "duration": {"type": "integer", "enum": [6, 10]}}).as_object().unwrap().clone();
        assert!(validate(&s, &[], &p(json!({"aspect_ratio": "9:16"}))).is_err());
    }
}
