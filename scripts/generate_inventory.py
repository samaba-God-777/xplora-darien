#!/usr/bin/env python3
"""Genera docs/ASSET_INVENTORY.md y frontend/src/data/media-manifest.json.

Lee (sin modificar) los recursos originales de imagen/ y review/instagram/.
Requiere ffprobe (Homebrew: brew install ffmpeg).

Uso:  python3 -I scripts/generate_inventory.py
"""
import hashlib
import json
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "imagen", ROOT / "review" / "instagram"]
MEDIA_EXT = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".mp4", ".mov"}

# Uso recomendado por archivo de imagen/ (identificado visualmente).
CURATED = {
    "arenal.jpg": ("Cascada Arenal con visitantes", "Destino: Cascada Arenal · Hero de cascadas"),
    "arenal2.jpeg": ("Cascada Arenal, vista frontal", "Destino: Cascada Arenal · Galería"),
    "casgada arenal.jpeg": ("Cascada Arenal, pozas inferiores", "Destino: Cascada Arenal · Galería"),
    "image1.jpeg": ("Muelle sobre la costa pacífica", "Destino: La Palma · Playas y costa"),
    "img10.jpeg": ("Ruinas Casa-fuerte de Yaviza", "Destino: Yaviza · Cultura e historia"),
    "img2.jpeg": ("Arco 'Bienvenidos a Darién'", "POI: Entrada a Darién · Portada / promociones"),
    "img3.jpeg": ("Río verde entre selva", "Categoría Ríos · Galería"),
    "img3.webp": ("Aérea de río serpenteante en selva", "Naturaleza y biodiversidad · Banner panorámico"),
    "img4.jpeg": ("Gráfica MiAmbiente 'Darién, pulmón verde'", "Solo referencia (pieza de terceros, no usar como foto)"),
    "img5.jpeg": ("Aérea de río y montañas", "Destino: Parque Nacional Darién · Banner"),
    "img6.jpg": ("Costa con vegetación y bahía", "Destino: Bahía Piña / costa · Galería"),
    "img7.jpeg": ("Letrero Parque Nacional Darién", "Destino: Parque Nacional Darién · Ficha"),
    "img8.avif": ("Comunidad Emberá con trajes tradicionales", "Cultura y comunidades (DUPLICADO de lara.avif)"),
    "la chunga.jpeg": ("Viviendas tradicionales con techo de palma", "Destino: La Chunga · Comunidades"),
    "lara.avif": ("Comunidad Emberá con trajes tradicionales", "Destino: Puerto Lara · Cultura"),
    "mapa-darien.avif": ("Mapa de Panamá con Darién resaltado", "Página Mapa · referencia de ubicación"),
    "mogue.jpeg": ("Aldea con casas de palma", "Destino: Mogué · Comunidades"),
    "playa mueto2.jpeg": ("Playa Muerto desde el mirador", "Destino: Playa Muerto · Hero de playas"),
    "playamuerto3.jpeg": ("Playa Muerto entre la selva", "Destino: Playa Muerto · Galería"),
    "playmuerto.jpeg": ("Aérea de costa y selva (Playa Muerto)", "Destino: Playa Muerto · Banner"),
    "puerto lara darien.avif": ("Casa Emberá decorada (Puerto Lara)", "Destino: Puerto Lara · Ficha"),
    "rio.jpeg": ("Río cristalino (vertical)", "Categoría Ríos · tarjeta vertical"),
    "yaviza.jpg": ("Aérea de Yaviza y el río Chucunaque", "Destino: Yaviza · Hero alta resolución"),
}

# Asociación de publicaciones de Instagram con destinos (por el pie de foto).
POST_DESTINATION = {
    "Dfk_rYaGOA2": "parque-nacional-darien",
    "DfiYvP4hpeX": "parque-nacional-darien",
    "DfgX-g1Dq5f": "cascada-arenal",
    "DPz0Gerja3Z": "cascada-infiernillo",
    "DPovSRODfHd": "chorro-rio-venao",
    "DNTsjVjPh3N": "el-embudo",
    "DNRXk6ov-H4": "el-embudo",
    "DNAItQeMV9f": "cerro-chucanti",
    "CrO2CohvgYG": "cerro-chucanti",
    "DL-5eo6PMvD": "bahia-pina",
    "DBIQrXZtZXZ": "cascada-el-jobo",
    "Cp0UqliOI4Q": "giba-del-toro",
    "CpOd3tTMaCW": "giba-del-toro",
    "CnStkvpKBmS": "costa-darienita",
    "CbYdLx0F7_L": "parque-nacional-darien",
    "CbBBvsmuFF_": "parque-nacional-darien",
    "CWtvo9_v4IK": "yaviza",
    "CWtgRN1vXPq": "cascada-arenal",
    "CfWv0KUuh_m": "cascada-arenal",
    "CeO4spZO-ad": "cascada-arenal",
    "CtXWUvzvLMO": "cascada-arenal",
}


def probe(path: Path):
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path),
    ]
    try:
        data = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
        s = (data.get("streams") or [{}])[0]
        dur = data.get("format", {}).get("duration")
        return s.get("width"), s.get("height"), float(dur) if dur and path.suffix == ".mp4" else None
    except Exception:
        return None, None, None


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def orientation(w, h):
    if not w or not h:
        return "?"
    r = w / h
    return "horizontal" if r > 1.15 else "vertical" if r < 0.87 else "cuadrada"


def human(n):
    return f"{n/1024/1024:.1f} MB" if n > 1024 * 1024 else f"{n/1024:.0f} KB"


def post_code(name: str):
    parts = name.split("_")
    if len(parts) >= 2:
        # Los códigos pueden contener '_' (p.ej. CbYdLx0F7_L); se buscan por prefijo.
        rest = name[11:]
        for code in POST_DESTINATION:
            if rest.startswith(code):
                return code
    return None


def main():
    files = []
    for src in SOURCES:
        for p in sorted(src.rglob("*")):
            if p.is_file() and p.suffix.lower() in MEDIA_EXT:
                files.append(p)

    by_hash = defaultdict(list)
    rows, manifest = [], []
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        w, h, dur = probe(p)
        digest = sha(p)
        by_hash[digest].append(rel)
        kind = "video" if p.suffix.lower() in {".mp4", ".mov"} else "imagen"
        if p.parent.name == "imagen":
            desc, use = CURATED.get(p.name, ("", ""))
            section = use
        else:
            sub = p.parent.name
            code = post_code(p.name)
            dest = POST_DESTINATION.get(code or "", "")
            desc = {"posters": "Portada de publicación", "slides": "Foto de carrusel",
                    "videos": "Video de Instagram", "contact-sheets": "Hoja de contactos (interna)",
                    "profile": "Avatar / logotipo de la marca"}.get(sub, sub)
            use = {
                "videos": "Hero / videos cinematográficos / Reels",
                "contact-sheets": "Solo uso interno de revisión",
                "profile": "Referencia de logotipo (baja resolución)",
            }.get(sub, "Galería / ficha de destino")
            section = f"Destino: {dest}" if dest else use
        rows.append((rel, kind, p.suffix.lower()[1:], w, h, orientation(w, h), p.stat().st_size, dur, desc, use, section))
        manifest.append({
            "path": rel, "type": kind, "width": w, "height": h,
            "orientation": orientation(w, h), "bytes": p.stat().st_size,
            "duration": round(dur, 1) if dur else None, "description": desc,
            "destination": POST_DESTINATION.get(post_code(p.name) or "") if p.parent.name != "imagen" else None,
            "internal": p.parent.name == "contact-sheets",
        })

    dupes = [g for g in by_hash.values() if len(g) > 1]
    dup_set = {f for g in dupes for f in g[1:]}
    for m in manifest:
        m["duplicateOf"] = next((g[0] for g in dupes if m["path"] in g[1:]), None)

    out = ROOT / "docs" / "ASSET_INVENTORY.md"
    out.parent.mkdir(exist_ok=True)
    n_img = sum(1 for r in rows if r[1] == "imagen")
    n_vid = len(rows) - n_img
    total = sum(r[6] for r in rows)
    L = [
        "# Inventario de recursos — XPLORA DARIÉN",
        "",
        "> Generado por `scripts/generate_inventory.py`. Los archivos originales de `imagen/` y `review/` **no se modifican, mueven ni renombran**.",
        "> El frontend los sirve mediante enlaces simbólicos en `frontend/public/media/` (sin copias).",
        "",
        "## Resumen",
        "",
        f"- Archivos multimedia: **{len(rows)}** ({n_img} imágenes, {n_vid} videos) · {human(total)}",
        f"- Grupos de duplicados exactos (SHA-256): **{len(dupes)}**",
        "- Carpetas: `imagen/` (fotos curadas de destinos), `review/instagram/` (respaldo de @xplore_darien: posters, slides, videos, hojas de contacto, avatar, `inventory.json` con pies de foto).",
        "- Videos: **todos verticales** (9:16 / 3:4). No hay video horizontal panorámico → el hero usa un vertical recortado (`object-fit: cover`).",
        "",
        "## Recursos faltantes",
        "",
        "| Recurso | Estado | Acción recomendada |",
        "|---|---|---|",
        "| Logotipo vectorial (SVG/PDF) o PNG ≥ 1000 px | Solo avatar 150×150 | Solicitar archivo original del logo |",
        "| Video horizontal panorámico (16:9) para el hero | No existe | Grabar con dron o generar en el Estudio Higgsfield |",
        "| Fotos de El Real de Santa María, La Palma (verificadas) | Parcial | Sesión fotográfica |",
        "| Fotos propias de Bahía Piña, Cascada Infiernillo, El Jobo | Solo dentro de videos/slides | Extraer fotogramas o sesión fotográfica |",
        "| Fotos de guías y proveedores | No existen | Solicitar con autorización de uso de imagen |",
        "| Coordenadas verificadas en campo | No existen | Validar con GPS (ver `frontend/src/data/destinations.ts`) |",
        "",
        "## Duplicados",
        "",
    ]
    for g in dupes:
        L.append(f"- `{g[0]}` = " + ", ".join(f"`{x}`" for x in g[1:]))
    L += ["", "## Inventario completo", "",
          "| Archivo | Tipo | Formato | Dimensiones | Orientación | Tamaño | Duración | Descripción | Uso recomendado | Sección |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for rel, kind, fmt, w, h, ori, size, dur, desc, use, section in rows:
        dims = f"{w}×{h}" if w else "—"
        mark = " ⚠️ dup" if rel in dup_set else ""
        L.append(f"| `{rel}`{mark} | {kind} | {fmt} | {dims} | {ori} | {human(size)} | {f'{dur:.0f} s' if dur else '—'} | {desc} | {use} | {section} |")
    out.write_text("\n".join(L) + "\n", encoding="utf-8")

    mf = ROOT / "frontend" / "src" / "data" / "media-manifest.json"
    mf.parent.mkdir(parents=True, exist_ok=True)
    mf.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(rows)} archivos · {len(dupes)} grupos duplicados → {out.relative_to(ROOT)}, {mf.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
