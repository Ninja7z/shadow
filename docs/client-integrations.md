# Connect your apps to Shadow

This guide targets a fresh GitHub clone. It does not rely on the maintainer's accounts, models, filesystem paths, or credentials.

## 1. Start and validate Shadow

From the repository directory, prepare and configure the installation:

~~~bash
python scripts/shadow.py onboard
~~~

In a separate terminal, start the API:

~~~bash
python scripts/shadow.py start
~~~

Validate it from another terminal:

~~~bash
python scripts/shadow.py validate
curl -fsS http://127.0.0.1:4000/health/liveliness
~~~

The starter configuration is local-first. For local inference, install Ollama, pull a model, and keep the service running. For remote providers, configure your own accounts and credentials.

## 2. Discover available aliases

The master key is generated in your private .env file. Never put upstream provider keys in client applications.

~~~bash
set -a
source .env
set +a
curl -fsS http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
~~~

Use the returned model id exactly. Common aliases include:

- **shadow-local:** route to the configured Ollama model.
- **shadow-auto:** automatic route using providers you enabled for fallback, ending with the local route.
- **shadow-custom-<id>:** custom endpoints registered with the interactive wizard.
- Other aliases: catalog providers enabled with your own credentials.

If an alias is not returned by /v1/models, do not assume it exists. On DB-less LiteLLM builds, master-key auth may return `400 no_db_connection` for model discovery. Run `shadow-gateway status` to read the locally configured aliases and enter them manually in the client. Keep authentication enabled.

## 3. Configure each client

### Match the client to the API protocol

Shadow exposes separate compatibility surfaces. Pick the one the client adapter actually speaks; a model alias does not change the API protocol.

| Shadow endpoint | Client configuration | Typical client |
|---|---|---|
| `POST /v1/chat/completions` | OpenAI Chat Completions / OpenAI Compatible | OpenCode compatible provider, Cline OpenAI Compatible, Kilo OpenAI Compatible |
| `POST /v1/responses` | OpenAI Responses | OpenCode Responses package, Kilo OpenAI Responses |
| `POST /v1/messages` | Anthropic Messages | OpenCode Anthropic-compatible package, Claude Code, Kilo Anthropic Messages |

The default OpenCode, Cline and Kilo examples below use Chat Completions. OpenCode also has separate Responses and Anthropic-compatible profiles, and Claude Code uses Anthropic Messages. LiteLLM also exposes the Responses and Anthropic Messages surfaces; the selected upstream model still determines which tools, images, reasoning features and streaming behaviors work. Do not treat protocol translation as feature parity.

Examples use your local master key. It is an administrative credential suitable only for a single-user installation bound to 127.0.0.1. Do not share it with untrusted users or machines.

### OpenCode

Edit opencode.json or opencode.jsonc and add:

~~~jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "shadow/shadow-auto",
  "providers": {
    "shadow": {
      "name": "Shadow Gateway",
      "env": ["LITELLM_MASTER_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:4000/v1"
      },
      "models": {
        "shadow-auto": { "name": "Shadow Auto" },
        "shadow-local": { "name": "Shadow Local" }
      }
    }
  }
}
~~~

Export the variable before launching OpenCode:

~~~bash
set -a
source /path/to/shadow/.env
set +a
opencode
~~~

To use another route, add its exact /v1/models alias under models and select shadow/<alias>.

OpenCode's package above uses Chat Completions. To select the Responses API instead, register a separate provider with the Responses-compatible package and keep the same gateway base URL:

~~~jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "shadow-responses/shadow-auto",
  "providers": {
    "shadow-responses": {
      "name": "Shadow Gateway · Responses",
      "env": ["LITELLM_MASTER_KEY"],
      "package": "@opencode/ai/providers/openai-compatible/responses",
      "settings": {
        "baseURL": "http://127.0.0.1:4000/v1"
      },
      "models": {
        "shadow-auto": { "name": "Shadow Auto · Responses" }
      }
    }
  }
}
~~~

For custom OpenCode models, declare capabilities and context/output limits that match the actual route. Set tool support only when the model behind that alias (including every possible `shadow-auto` fallback) has been validated for tool calling; OpenCode cannot infer those capabilities from the alias.

To use the Anthropic Messages surface, configure a distinct Anthropic-compatible provider. The Anthropic base URL is the gateway root, not the OpenAI `/v1` base:

~~~jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "shadow-anthropic/shadow-auto",
  "providers": {
    "shadow-anthropic": {
      "name": "Shadow Gateway · Anthropic",
      "env": ["LITELLM_MASTER_KEY"],
      "package": "@opencode/ai/providers/anthropic-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:4000"
      },
      "models": {
        "shadow-auto": { "name": "Shadow Auto · Anthropic" }
      }
    }
  }
}
~~~

### Cline

1. Open Cline settings.
2. Set API Provider to **OpenAI Compatible**.
3. Enter:
   - Base URL: http://127.0.0.1:4000/v1
   - API Key: the LITELLM_MASTER_KEY value from your .env
   - Model ID: an exact alias, for example shadow-auto
4. Save and use Verify if it is available in your installed version.

Do not select the native OpenAI provider. Choose OpenAI Compatible. This recipe targets Shadow's Chat Completions endpoint. It does not configure the Responses or Anthropic Messages adapters.

### Continue

Add a model to Continue's config.yaml:

~~~yaml
name: Shadow Gateway
version: 0.0.1
schema: v1

models:
  - name: Shadow Auto
    provider: openai
    model: shadow-auto
    apiBase: http://127.0.0.1:4000/v1
    apiKey: ${{ secrets.LITELLM_MASTER_KEY }}
    roles:
      - chat
      - edit
      - apply
~~~

Put the variable in ~/.continue/.env:

~~~env
LITELLM_MASTER_KEY=your-local-master-key
~~~

Continue resolves secrets.* from its supported .env files. Do not rely only on a shell export when using the editor extension.


### Kilo Code

1. Open Settings → Providers → Custom provider.
2. Create a provider with ID shadow and display name Shadow Gateway.
3. Set Provider API to **OpenAI Compatible** for `/v1/chat/completions`. Kilo also offers **OpenAI Responses** for `/v1/responses` and **Anthropic Messages** for `/v1/messages`; choose the matching API mode when using those surfaces instead.
4. Enter:
   - Base URL: http://127.0.0.1:4000/v1
   - API key: this installation's LITELLM_MASTER_KEY
   - Models: exact aliases returned by /v1/models, such as shadow-auto and shadow-local.
5. Save and select the model.

If automatic model discovery fails, add aliases manually. Do not put upstream keys in Kilo.

### Aider

From your code project directory:

~~~bash
set -a
source /path/to/shadow/.env
set +a
export OPENAI_API_BASE=http://127.0.0.1:4000/v1
export OPENAI_API_KEY="$LITELLM_MASTER_KEY"
aider --model openai/shadow-auto
~~~

Replace shadow-auto with another alias listed by /v1/models to change routes.

### Claude Code

Claude Code uses Anthropic Messages. Use the gateway root, without appending /v1:

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

Replace shadow-auto with an alias listed by /v1/models. `ANTHROPIC_MODEL` must match a configured LiteLLM `model_name` exactly. Claude Code's built-in model-picker names are not automatically aliases on Shadow; selecting one that is absent from `model_list` will fail. Tool use, streaming, vision, and context depend on the upstream model and LiteLLM translation. The scripts/claude-route.sh launcher is a separate advanced flow and may require additional local configuration; the example above is the direct path for a fresh clone.

### Windows PowerShell

The UI-based Cline and Kilo steps are the same on Windows. For OpenCode, Aider or Claude Code, load the generated key in PowerShell first:

~~~powershell
$env:LITELLM_MASTER_KEY = ((Get-Content .env | Where-Object { $_ -match '^LITELLM_MASTER_KEY=' } | Select-Object -First 1) -replace '^LITELLM_MASTER_KEY=', '')
~~~

OpenCode:

~~~powershell
opencode
~~~

Aider:

~~~powershell
$env:OPENAI_API_BASE = 'http://127.0.0.1:4000/v1'
$env:OPENAI_API_KEY = $env:LITELLM_MASTER_KEY
aider --model openai/shadow-auto
~~~

Claude Code:

~~~powershell
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:4000'
$env:ANTHROPIC_AUTH_TOKEN = $env:LITELLM_MASTER_KEY
$env:ANTHROPIC_MODEL = 'shadow-auto'
claude
~~~

## 4. Troubleshooting

~~~bash
curl -fsS http://127.0.0.1:4000/health/liveliness
set -a && source .env && set +a
curl -fsS http://127.0.0.1:4000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
python scripts/shadow.py validate
~~~

- **Connection refused:** start the gateway and check the port.
- **401 Unauthorized:** verify the client received this installation's master key.
- **404 / model not found:** use an alias returned by /v1/models.
- **API responds but inference fails:** check provider enablement, upstream credentials, and quota.
- **Tools or images fail:** verify model and protocol support. Endpoint compatibility does not imply feature parity.

## 5. Security boundaries

- LITELLM_MASTER_KEY is administrative. Use it only for a single-user local installation.
- Do not expose 127.0.0.1:4000 directly to a network or the internet.
- For multiple users or devices, configure PostgreSQL and LiteLLM virtual keys with scoped permissions, limits, and budgets before sharing the service.
- Keep provider credentials only in Shadow's private environment.
- Shadow does not turn a free tier into unlimited usage or remove provider quotas and charges.

## Official client documentation

- [OpenCode: Providers](https://opencode.ai/docs/providers)
- [Cline: OpenAI Compatible](https://docs.cline.bot/provider-config/openai-compatible)
- [Continue: OpenAI-compatible providers](https://docs.continue.dev/customize/model-providers/top-level/openai)
- [Kilo Code: OpenAI Compatible](https://kilo.ai/docs/ai-providers/openai-compatible)
- [Aider: OpenAI-compatible APIs](https://aider.chat/docs/llms/openai-compat.html)
- [Claude Code: Environment settings](https://docs.anthropic.com/en/docs/claude-code/settings)
