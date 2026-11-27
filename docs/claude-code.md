# Claude Code integration

Shadow exposes an Anthropic Messages-compatible endpoint through LiteLLM.

## Fresh clone setup

Start Shadow and read the local master key from the private .env file. From a shell:

~~~bash
set -a
source /path/to/shadow/.env
set +a
unset ANTHROPIC_API_KEY
ANTHROPIC_BASE_URL=http://127.0.0.1:4000 \
ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY" \
ANTHROPIC_MODEL=shadow-auto \
claude
~~~

Use the exact model alias returned by GET /v1/models. The gateway root is intentional: Claude Code appends the Anthropic Messages path (`/v1/messages`). `ANTHROPIC_MODEL` must match a configured LiteLLM `model_name` exactly. Claude Code's built-in model-picker names are not automatically aliases on Shadow; selecting one that is absent from `model_list` will fail.

## Credentials

Claude Code receives only the local LITELLM_MASTER_KEY. Upstream provider keys stay in Shadow's private .env and must never be copied into Claude Code settings.

The master key is administrative. Keep this setup on a single-user local machine bound to 127.0.0.1. For shared or remote deployments, configure scoped LiteLLM virtual keys and network protections before connecting clients.

## Capabilities and limitations

The Anthropic Messages endpoint translates requests through LiteLLM. Tool use, streaming, vision, reasoning, context size and prompt caching depend on the chosen upstream model and its compatibility with the translation layer. Test each route before relying on advanced features.

The scripts/claude-route.sh file is an advanced launcher for a separate local configuration layout. A fresh clone does not need it; use the direct environment-variable setup above unless you have deliberately configured that launcher.

See [Client integrations](client-integrations.md) for the complete set of supported client recipes.
