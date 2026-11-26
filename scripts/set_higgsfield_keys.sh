#!/usr/bin/env bash
# Guarda las credenciales de Higgsfield en backend/.env sin mostrarlas en pantalla
# ni dejarlas en el historial de la terminal.
set -euo pipefail
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/backend/.env"

read -r -s -p "Higgsfield Key ID: " KEY_ID; echo
read -r -s -p "Higgsfield Secret: " KEY_SECRET; echo
if [[ -z "$KEY_ID" || -z "$KEY_SECRET" ]]; then
  echo "Valores vacíos: no se guardó nada." >&2
  exit 1
fi

python3 -I - "$ENV_FILE" "$KEY_ID" "$KEY_SECRET" <<'PY'
import sys, re
path, kid, sec = sys.argv[1:4]
text = open(path).read()
for k, v in (("HIGGSFIELD_API_KEY_ID", kid), ("HIGGSFIELD_API_KEY_SECRET", sec)):
    line = f"{k}={v}"
    if re.search(rf"^{k}=.*$", text, re.M):
        text = re.sub(rf"^{k}=.*$", lambda _: line, text, flags=re.M)
    else:
        text += f"\n{line}\n"
open(path, "w").write(text)
PY
unset KEY_ID KEY_SECRET
echo "guardado en backend/.env"
