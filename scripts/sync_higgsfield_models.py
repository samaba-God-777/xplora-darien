#!/usr/bin/env python3
"""Sincroniza el catálogo de modelos de video de Higgsfield desde la documentación oficial.

Lee https://docs.higgsfield.ai/docs/sitemap.xml, descarga la página .md de cada modelo
text-to-video / image-to-video y extrae el "Endpoint ID" y el "Complete JSON schema"
publicados. Genera database/seeds/003_video_models.sql (idempotente).

No inventa capacidades: si un modelo no documenta `aspect_ratio`, no se ofrece.

Uso: python3 -I scripts/sync_higgsfield_models.py
"""
import datetime
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = "https://docs.higgsfield.ai/docs/sitemap.xml"
UA = {"User-Agent": "xplora-darien-model-sync/1.0"}
# Modelos multimodales (Cinema Studio, Ads Studio) usan otros flujos; se pueden añadir aquí.
EXCLUDE = re.compile(r"soul|ideogram|grok-image|qwen|recraft|z-image|marketing-studio|ads-studio|cinema-studio")


def get(url: str) -> str:
    # curl usa los certificados del sistema (el Python de python.org en macOS no los trae).
    return subprocess.run(["curl", "-fsSL", "-A", UA["User-Agent"], url], check=True, capture_output=True, text=True).stdout


def parse(md: str):
    ep = re.search(r"\*\*Endpoint ID:\*\* `([^`]+)`", md)
    block = re.search(r"> \[accordion\] Complete JSON schema\n>\n> ```json[^\n]*\n(.*?)\n> ```", md, re.S)
    if not ep or not block:
        return None
    raw = "\n".join(line[2:] if line.startswith("> ") else line.lstrip(">") for line in block.group(1).split("\n"))
    schema = json.loads(raw)
    defs = schema.get("$defs", {}) or schema.get("definitions", {})

    def res(x):
        while isinstance(x, dict) and "$ref" in x:
            x = defs[x["$ref"].split("/")[-1]]
        return x

    params = {}
    for name, spec in schema.get("properties", {}).items():
        spec = res(spec)
        if "anyOf" in spec:
            opts = [res(o) for o in spec["anyOf"] if res(o).get("type") != "null"]
            if len(opts) == 1:
                spec = {**opts[0], **({"default": spec["default"]} if "default" in spec else {})}
        p = {k: spec[k] for k in ("type", "enum", "default", "minimum", "maximum", "maxLength", "format", "maxItems", "minItems", "description") if k in spec}
        if spec.get("type") == "array" and isinstance(spec.get("items"), dict):
            it = res(spec["items"])
            p["items"] = {k: it[k] for k in ("type", "format", "enum") if k in it}
        params[name] = p
    title = re.search(r"^# (.+?)(?: API)?$", md, re.M).group(1)
    return ep.group(1), title, params, schema.get("required", [])


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def main():
    urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", get(SITEMAP))
            if re.search(r"/models/[^/]+/.*(text-to-video|image-to-video)", u) and not EXCLUDE.search(u)]
    today = datetime.date.today().isoformat()
    rows = []
    for url in sorted(urls):
        parsed = parse(get(url + ".md"))
        if not parsed:
            print("sin esquema:", url)
            continue
        endpoint, title, params, required = parsed
        mode = "image-to-video" if "image-to-video" in endpoint else "text-to-video"
        image_param = "image_url" if "image_url" in params else None
        family = url.split("/models/")[1].split("/")[0]
        rows.append(
            f"INSERT INTO video_models (endpoint_id, family, title, mode, params_schema, required, image_param, doc_url, verified_at) VALUES ("
            f"{q(endpoint)}, {q(family)}, {q(title)}, {q(mode)}, {q(json.dumps(params, ensure_ascii=False))}::jsonb, "
            f"ARRAY[{','.join(q(r) for r in required)}]::text[], {q(image_param)}, {q(url)}, {q(today)}) "
            f"ON CONFLICT (endpoint_id) DO UPDATE SET title = EXCLUDED.title, params_schema = EXCLUDED.params_schema, "
            f"required = EXCLUDED.required, image_param = EXCLUDED.image_param, doc_url = EXCLUDED.doc_url, verified_at = EXCLUDED.verified_at;"
        )
    out = ROOT / "database" / "seeds" / "003_video_models.sql"
    out.write_text(
        f"-- Generado por scripts/sync_higgsfield_models.py el {today} desde la documentación oficial de Higgsfield.\nBEGIN;\n"
        + "\n".join(rows) + "\nCOMMIT;\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} modelos → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
