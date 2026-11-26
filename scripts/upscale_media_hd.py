"""Versiones HD de las fotos de la app con Real-ESRGAN (skill upscale-for-print).

- Lee las fotos de imagen/ y review/instagram/ SIN modificarlas.
- Escribe la versión mejorada en storage/media-hd/<imagen|instagram>/<misma ruta y nombre>.
- Escala ×4 con IA y luego reduce con Lanczos hasta un máximo de MAX_SIDE px (misma proporción).
- Si una foto no se puede procesar (o es una hoja de contacto interna), deja un enlace al original,
  así la carpeta HD siempre está completa y la app nunca pide un archivo inexistente.
- Es reanudable: salta las fotos que ya tienen versión HD.

Uso (con el entorno de la skill):
  ~/.claude/skills/upscale-for-print/.venv/bin/python scripts/upscale_media_hd.py [--limit N] [--only RUTA]
"""
import argparse
import os
import sys
import time

SKILL = os.path.expanduser("~/.claude/skills/upscale-for-print")
sys.path.insert(0, os.path.join(SKILL, "scripts"))
import upscale_for_print as up  # noqa: E402  (funciones de la skill)
from PIL import Image  # noqa: E402
from spandrel import ModelLoader  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = {"imagen": os.path.join(ROOT, "imagen"), "instagram": os.path.join(ROOT, "review", "instagram")}
OUT = os.path.join(ROOT, "storage", "media-hd")
# Las fotos nuevas se escriben primero FUERA del proyecto y se mueven a OUT al final:
# el servidor de desarrollo (Turbopack) vigila pageWeb y recargaría la página con cada foto.
WORK = os.path.join(os.path.expanduser("~"), ".cache", "xplora-media-hd-work")
EXTS = (".jpg", ".jpeg", ".png", ".webp")
SKIP_DIRS = ("contact-sheets",)  # hojas de contacto internas: no se muestran al público
MAX_SIDE = 2560
# Fotos que ya miden más que esto se ven nítidas: se deja el original (ampliarlas ×4 satura la máquina).
MAX_SOURCE_SIDE = 1280


def link_original(src, dst):
    rel = os.path.relpath(src, os.path.dirname(dst))
    if os.path.islink(dst) and os.readlink(dst) == rel:
        return  # ya enlazado: no tocar (evita recargas del servidor de desarrollo)
    if os.path.lexists(dst):
        os.remove(dst)
    os.symlink(rel, dst)


def publish_work():
    """Mueve a OUT todas las fotos terminadas en WORK (también las de una corrida interrumpida)."""
    n = 0
    for dp, _, files in os.walk(WORK):
        for f in files:
            if ".tmp." in f:
                continue
            src = os.path.join(dp, f)
            dst = os.path.join(OUT, os.path.relpath(src, WORK))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.lexists(dst):
                os.remove(dst)
            os.replace(src, dst)
            n += 1
    return n


def save(im, dst):
    ext = os.path.splitext(dst)[1].lower()
    tmp = dst + ".tmp" + ext
    if ext in (".jpg", ".jpeg"):
        im.save(tmp, quality=90, optimize=True, progressive=True, subsampling=0)
    elif ext == ".webp":
        im.save(tmp, quality=88, method=6)
    else:
        im.save(tmp, optimize=True)
    os.replace(tmp, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--tile", type=int, default=512)
    args = ap.parse_args()

    jobs = []
    for key, base in SOURCES.items():
        for dp, _, files in os.walk(base):
            for f in sorted(files):
                if f.lower().endswith(EXTS):
                    src = os.path.join(dp, f)
                    rel = os.path.relpath(src, base)
                    if args.only and not any(o in f"{key}/{rel}" for o in args.only):
                        continue
                    jobs.append((src, os.path.join(OUT, key, rel), rel))
    if args.limit:
        jobs = jobs[: args.limit]

    # Deja CPU libre para el resto del sistema (servidor de desarrollo, API).
    import torch
    torch.set_num_threads(max(1, (os.cpu_count() or 4) // 3))
    device = up.select_device("auto")
    weights = up.resolve_weights("realesrgan-x4plus", os.path.join(SKILL, "models"))
    model = ModelLoader().load_from_file(weights).to(device).eval()
    print(f"{len(jobs)} fotos · modelo realesrgan-x4plus ×{model.scale} · {device}", flush=True)

    done = skipped = linked = 0
    pending = []  # (destino final) de fotos mejoradas en WORK
    t0 = time.time()
    for i, (src, dst, rel) in enumerate(jobs, 1):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        work = os.path.join(WORK, os.path.relpath(dst, OUT))
        if (os.path.exists(dst) and not os.path.islink(dst)) or os.path.exists(work):
            skipped += 1
            continue
        if any(f"{d}{os.sep}" in rel or rel.startswith(d) for d in SKIP_DIRS):
            link_original(src, dst)
            linked += 1
            continue
        try:
            t = time.time()
            img = up.load_image(src)
            h, w = img.shape[:2]
            s = min(model.scale, MAX_SIDE / max(w, h))
            if s <= 1.05 or max(w, h) > MAX_SOURCE_SIDE:  # ya es grande: se deja el original
                link_original(src, dst)
                linked += 1
                continue
            big = up.upscale_once(img, model, model.scale, device, args.tile, 32)
            tw, th = round(w * s), round(h * s)
            im = Image.fromarray(big).resize((tw, th), Image.LANCZOS)
            os.makedirs(os.path.dirname(work), exist_ok=True)
            save(im, work)
            done += 1
            print(f"[{i}/{len(jobs)}] {rel}: {w}x{h} → {tw}x{th} ({time.time() - t:.1f}s)", flush=True)
        except Exception as e:  # noqa: BLE001
            link_original(src, dst)
            linked += 1
            print(f"[{i}/{len(jobs)}] {rel}: ERROR {e} → se usa el original", flush=True)
    moved = publish_work()
    print(f"publicadas {moved} fotos HD en storage/media-hd", flush=True)
    print(f"listo: {done} mejoradas, {skipped} ya existían, {linked} enlazadas al original · {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
