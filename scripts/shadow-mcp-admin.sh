#!/usr/bin/env bash
set -euo pipefail
HUB_DIR="$HOME/.config/shadow/mcp-hub"
RUNTIME="$HOME/.local/share/shadow-mcp-hub"
export CONFIG_PATH="$HUB_DIR/mcp.json"
export DATA_PATH="$HUB_DIR/data"
export EXTERNAL_URL="${SHADOW_MCP_HUB_EXTERNAL_URL:-http://127.0.0.1:7690}"
export HOST="${SHADOW_MCP_HUB_HOST:-127.0.0.1}"
export PORT="${SHADOW_MCP_HUB_PORT:-7690}"
if [[ -r "$HUB_DIR/bootstrap.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HUB_DIR/bootstrap.env"
  set +a
fi
export SHADOW_GITHUB_AUTH="$(
python3 - <<'PY'
from pathlib import Path
import json
data=json.loads((Path.home()/".claude.json").read_text())
value=data.get("mcpServers",{}).get("github",{}).get("headers",{}).get("Authorization","")
if not value: raise SystemExit("GitHub credential source is missing.")
print(value,end="")
PY
)"
exec "$RUNTIME/node_modules/.bin/mcp-hub-admin" "$@"
