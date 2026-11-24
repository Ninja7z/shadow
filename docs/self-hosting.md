# Run your own Shadow API

> **License notice:** Shadow is licensed under the PolyForm Noncommercial License 1.0.0 (`PolyForm-Noncommercial-1.0.0`). It permits use, modification and distribution only for noncommercial purposes. It explicitly includes personal uses and certain noncommercial organizations (charitable, educational, public research, public safety/health, environmental protection and government institutions). Commercial use is prohibited. Each provider, API, model, SDK and service remains subject to its own license and terms. Read the official [license text](https://polyformproject.org/licenses/noncommercial/1.0.0) and the repository's LICENSE file.

Shadow is designed to be cloned and run by its owner. The gateway software and configuration are free; you do not need a Shadow account, a hosted Shadow server, or someone else's API key.

There are two ways to get inference:

1. **Fully local, no API bill:** run Ollama on your own computer and download a model. Prompts stay on your machine. This uses your CPU/GPU/RAM and local electricity.
2. **Remote provider accounts:** add your own free-tier or paid API credentials. Shadow normalizes them behind one OpenAI-compatible endpoint and applies a fallback chain. Each provider controls its own quotas, pricing, eligibility, and availability.

A public Git repository cannot safely include shared provider keys or promise unlimited third-party inference for free. Remote free tiers generally require each user to create their own account/key, may have daily limits, and can change without notice.

## Requirements

- Python 3.11 or newer.
- Ollama for the zero-cloud-cost local starter: https://ollama.com/download
- Network access only for installation, model downloads, and whichever remote providers you choose.

## Quick start

Clone the repository, then from its root:

    python scripts/shadow.py onboard

On a fresh clone, this creates an isolated .venv, installs LiteLLM and dependencies, copies .env.example to a private .env, generates a random local gateway key, creates config/shadow.yaml and opens the interactive onboarding menu. The generated files are ignored by Git. The menu can check Ollama, connect a catalog provider, register custom endpoints and show client setup details.

Install a local model if you want local inference:

    ollama pull llama3.2:3b

Start the API in a separate terminal:

    python scripts/shadow.py start

The service binds to 127.0.0.1:4000 by default. It is not exposed to your LAN or the public internet.

- OpenAI-compatible Base URL: http://127.0.0.1:4000/v1
- Anthropic Messages Base URL: http://127.0.0.1:4000
- Local model alias: shadow-local
- Automatic route: shadow-auto
- Model catalog: http://127.0.0.1:4000/v1/models

Use the generated LITELLM_MASTER_KEY from your private .env as the client key. Never paste upstream provider keys into coding-agent settings.

## Add free or paid providers

1. Open .env in a text editor.
2. Add the key for a provider you chose. For example:

       GEMINI_API_KEY=your-own-key
       GROQ_API_KEY=your-own-key
       OPENROUTER_API_KEY=your-own-key
       HF_TOKEN=your-own-token
       REQUESTY_API_KEY=your-own-key
       GONKA_API_KEY=your-own-key
       BAZAARLINK_API_KEY=your-own-key
       CLOUDFLARE_ACCOUNT_ID=your-account-id
       CLOUDFLARE_WORKERS_AI_TOKEN=your-own-token

3. Rebuild the generated config:

       python scripts/shadow.py refresh

4. Restart Shadow. The new aliases appear in /v1/models. Only catalog entries marked `auto_fallback: true` and classified as free-only are eligible for `shadow-auto`. Any access label containing `paid` or `mixed` remains manual even if the flag is set. Custom endpoints start manual; free custom endpoints can opt in during the wizard, while paid/mixed custom endpoints require typing `SIM`. Local Ollama remains the final fallback.

See config/providers.catalog.yaml for the provider catalog, model IDs, required environment variables, access classification and official setup links. A blank variable does not enable a provider. To register multiple custom endpoints without editing code or the public catalog, run `python scripts/shadow.py add-provider`. The interactive wizard accepts OpenAI Chat Completions or Anthropic Messages endpoints, asks for the Base URL, exact model ID and access type, and reads the API key without echoing it. Keys stay in the private `.env`; endpoint metadata is stored in `config/providers.local.yaml`, which is ignored by Git. Run `refresh`, restart the gateway and use the `shadow-custom-<id>` alias shown in `/v1/models`. Custom endpoints are manual-only by default. Free endpoints can opt into automatic fallback; paid or mixed-access endpoints require typing `SIM` to confirm possible charges. APIs with proprietary protocols need a LiteLLM adapter. The legacy `CUSTOM_OPENAI_*` and `CUSTOM_ANTHROPIC_*` variables remain supported. For a permanent reusable adapter, add a catalog entry with a LiteLLM model ID, API base and environment-variable name.

configure prints which optional provider variables are currently enabled:

    python scripts/shadow.py configure

The catalog is a starter integration list, not a guarantee of a free plan. Confirm current prices and quotas with each provider before using it. Only providers classified as free-only can enter `shadow-auto`; mixed free/paid and credit-based providers stay manual even if `auto_fallback: true` is set. For custom endpoints, the wizard provides an explicit consent step before a paid or mixed route can join automatic fallback.

## Connect a client

The common connection details are:

- OpenAI-compatible Base URL: http://127.0.0.1:4000/v1
- Anthropic Messages Base URL: http://127.0.0.1:4000
- Client API key: the local LITELLM_MASTER_KEY from your private .env
- Model: an exact alias returned by /v1/models

See [Client integrations](client-integrations.md) for copy-ready setup instructions for OpenCode, Cline, Continue, Kilo Code, Aider and Claude Code. Do not paste upstream provider keys into client settings.

Provider feature compatibility varies. Tool calling, vision, streaming, reasoning, prompt caching, context length and Anthropic Messages translation must be verified per model.

## Commands

    python scripts/shadow.py setup      # create local environment/config
    python scripts/shadow.py configure  # show catalog and custom endpoints
    python scripts/shadow.py add-provider  # register a custom endpoint interactively
    python scripts/shadow.py refresh    # regenerate config after editing .env
    python scripts/shadow.py validate   # validate generated aliases
    python scripts/shadow.py start      # run local API

The starter does not install Ollama or download models automatically. This avoids silently consuming disk, network, GPU or CPU resources. Install only the model(s) you want.

## Security and sharing

- .env, config/shadow.yaml, config/providers.local.yaml, .venv, logs and runtime data are local and ignored by Git.
- The generated master key is administrative. Keep it private and use it only for your local gateway.
- The default bind address is loopback. Do not expose the gateway on 0.0.0.0 or the internet without TLS, authentication, rate limits and a proper key-management/database setup.
- Never commit personal API keys, OAuth sessions, provider account IDs where sensitive, request logs or local backups.
- If you deploy Shadow for multiple users, configure PostgreSQL-backed LiteLLM virtual keys and issue scoped keys instead of sharing the master key.
