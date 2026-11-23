#!/usr/bin/env bash
set -euo pipefail
HUB_DIR="$HOME/.config/shadow/mcp-hub"
RUNTIME="$HOME/.local/share/shadow-mcp-hub"
PACKAGE_DIR="$RUNTIME/node_modules/.bin"
GITHUB_SOURCE="$HOME/.claude.json"

node "$RUNTIME/patch-mcp-hub-compat.mjs" >&2
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
python3 - "$GITHUB_SOURCE" <<'PY'
from pathlib import Path
import json,sys
data=json.loads(Path(sys.argv[1]).read_text())
value=data.get("mcpServers",{}).get("github",{}).get("headers",{}).get("Authorization","")
if not value:
    raise SystemExit("GitHub credential source is missing from the private Claude Code config.")
print(value,end="")
PY
)"

MODE="${1:---stdio}"
if [[ "$MODE" == "http" ]]; then
  shift
  exec "$PACKAGE_DIR/mcp-hub" "$@"
elif [[ "$MODE" == "--stdio" || "$MODE" == "stdio" ]]; then
  shift || true
  exec "$PACKAGE_DIR/mcp-hub-stdio" "$@"
else
  exec "$PACKAGE_DIR/mcp-hub-stdio" "$@"
fi
