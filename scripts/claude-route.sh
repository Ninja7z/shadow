#!/usr/bin/env bash
# Start Claude Code against the local Shadow LiteLLM gateway.
# Upstream provider credentials stay in ~/.config/shadow/*.env (mode 600).
set -eo pipefail

CONFIG_DIR="$HOME/.config/shadow"
if [[ -n "$SHADOW_CONFIG_DIR" ]]; then CONFIG_DIR="$SHADOW_CONFIG_DIR"; fi
ENV_FILE="$CONFIG_DIR/providers.env"
EXTRA_ENV_FILE="$CONFIG_DIR/extra-providers.env"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
LOG_FILE="$CONFIG_DIR/litellm.log"
PORT=4000
if [[ -n "$SHADOW_PORT" ]]; then PORT="$SHADOW_PORT"; fi

if [[ $# -lt 1 ]]; then
  echo "Usage: claude-route.sh <shadow-model-alias> [claude arguments...]" >&2
  exit 2
fi

MODEL_ALIAS="$1"
shift
if [[ ! "$MODEL_ALIAS" =~ ^[A-Za-z0-9._:-]+$ ]]; then
  echo "Unsafe model alias." >&2
  exit 2
fi

if [[ ! -r "$ENV_FILE" || ! -r "$CONFIG_FILE" ]]; then
  echo "Shadow configuration is incomplete: $CONFIG_DIR" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
if [[ -r "$EXTRA_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$EXTRA_ENV_FILE"
fi
set +a

if [[ -z "$LITELLM_MASTER_KEY" ]]; then
  echo "Missing LITELLM_MASTER_KEY in protected providers.env." >&2
  exit 3
fi

if ! command -v litellm >/dev/null 2>&1; then
  echo "LiteLLM is not installed. Install it with: uv tool install 'litellm[proxy]'" >&2
  exit 4
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to check the local gateway." >&2
  exit 4
fi

if ! curl -fsS "http://127.0.0.1:$PORT/health/liveliness" >/dev/null 2>&1; then
  nohup litellm --config "$CONFIG_FILE" --host 127.0.0.1 --port "$PORT" >>"$LOG_FILE" 2>&1 </dev/null &
  ready=0
  for _ in $(seq 1 45); do
    if curl -fsS "http://127.0.0.1:$PORT/health/liveliness" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "LiteLLM did not become ready. Check $LOG_FILE." >&2
    exit 5
  fi
fi

export ANTHROPIC_BASE_URL="http://127.0.0.1:$PORT"
export CLAUDE_CODE_USE_VERTEX=""
export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"
unset ANTHROPIC_API_KEY || true
export ANTHROPIC_MODEL="$MODEL_ALIAS"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL_ALIAS"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL_ALIAS"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL_ALIAS"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1

case "$MODEL_ALIAS" in
  *gemini*|router-vision)
    export DISABLE_PROMPT_CACHING=1
    export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576
    ;;
  claude-code|claude-code-opus|router-smart)
    unset DISABLE_PROMPT_CACHING || true
    export CLAUDE_CODE_MAX_CONTEXT_TOKENS=262144
    ;;
  *)
    unset DISABLE_PROMPT_CACHING || true
    export CLAUDE_CODE_MAX_CONTEXT_TOKENS=131072
    ;;
esac

# Claude Code 2.1.257+ supports modelPicker.behavesAs. This registers the
# actual Shadow alias as a supported custom row while preserving the exact
# alias sent to LiteLLM. The Sonnet 4.6 behavior profile prevents the
# unrecognized_model diagnostic; compaction is capped conservatively below.
SETTINGS_DIR="$CONFIG_DIR/claude-model-settings"
mkdir -p "$SETTINGS_DIR"
chmod 700 "$SETTINGS_DIR"
MODEL_SETTINGS="$SETTINGS_DIR/$MODEL_ALIAS.json"

python3 - "$MODEL_SETTINGS" "$MODEL_ALIAS" "$CLAUDE_CODE_MAX_CONTEXT_TOKENS" <<'PYSETTINGS'
import json
import os
import re
import sys
import tempfile

path, alias, context = sys.argv[1:4]
if not re.fullmatch(r"[A-Za-z0-9._:-]+", alias):
    raise SystemExit("Unsafe model alias for settings path.")

labels = {
    "claude-code-requesty-nemotron-free": "Requesty · Nemotron 3.5 Lightning Free",
    "claude-code-gonka-glm53-anthropic": "Gonka · GLM-5.3-Flash",
    "claude-code-gonka-glm53-free": "Gonka · GLM-5.3-Flash",
    "claude-code-bazaarlink-nemotron-free": "BazaarLink · Nemotron 3.5 Lightning Free",
    "claude-code-cloudflare": "Cloudflare Workers AI · GLM-4.7 Flash",
    "claude-code-nvidia": "NVIDIA NIM",
}
label = labels.get(alias, "Shadow · " + alias)

settings = {
    "modelPicker": {
        "options": [{
            "model": alias,
            "label": label,
            "description": "Shadow gateway route. Provider model ID is preserved; Sonnet 4.6 is used only as a Claude Code compatibility profile.",
            "behavesAs": "claude-sonnet-4-6"
        }],
        "replaceBuiltInOptions": True
    },
    "autoCompactWindow": int(context)
}

fd, tmp = tempfile.mkstemp(prefix=".model-settings-", dir=os.path.dirname(path))
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    os.chmod(path, 0o600)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
PYSETTINGS

CLAUDE_BIN="$HOME/.local/bin/claude"
if [[ ! -x "$CLAUDE_BIN" ]]; then
  CLAUDE_BIN="$(command -v claude || true)"
fi
if [[ -z "$CLAUDE_BIN" || ! -x "$CLAUDE_BIN" ]]; then
  echo "Claude Code executable not found." >&2
  exit 6
fi

exec "$CLAUDE_BIN" --settings "$MODEL_SETTINGS" --model "$MODEL_ALIAS" "$@"
