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
GITHUB_TOKEN_FILE="$HUB_DIR/github.token"
if [[ ! -r "$GITHUB_TOKEN_FILE" ]]; then
  echo "Missing private GitHub token file: $GITHUB_TOKEN_FILE" >&2
  exit 3
fi
export SHADOW_GITHUB_AUTH="$(<"$GITHUB_TOKEN_FILE")"
if [[ -z "${SHADOW_GITHUB_AUTH}" ]]; then
  echo "Private GitHub token file is empty." >&2
  exit 3
fi

# GitHub's upstream bearer credential is stored separately with mode 600.

if [[ -r "$HOME/.config/shadow/extra-providers.env" ]]; then
  source "$HOME/.config/shadow/extra-providers.env"
  export MISTRAL_API_KEY
  export HF_TOKEN
fi

exec "$RUNTIME/node_modules/.bin/mcp-hub-admin" "$@"
