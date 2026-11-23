# Run your own Shadow API

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

    python scripts/shadow.py setup

This creates an isolated .venv, installs LiteLLM and dependencies, copies .env.example to a private .env, generates a random local gateway key, and creates config/shadow.yaml. The generated files are ignored by Git.

Install a local model:

    ollama pull llama3.2:3b

Start the API:

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

4. Restart Shadow. The new aliases appear in /v1/models. Only catalog entries explicitly marked auto_fallback: true are eligible for shadow-auto. Paid, credit-based and mixed free/paid routes stay manual-only by default; select their alias explicitly when you want to use them. Local Ollama remains the final fallback.

See config/providers.catalog.yaml for the provider catalog, model IDs, required environment variables, access classification and official setup links. A blank variable does not enable a provider. You can add any OpenAI-compatible service without editing code by setting CUSTOM_OPENAI_API_KEY, CUSTOM_OPENAI_BASE_URL and CUSTOM_OPENAI_MODEL. For an Anthropic Messages-compatible service, set CUSTOM_ANTHROPIC_API_KEY, CUSTOM_ANTHROPIC_BASE_URL and CUSTOM_ANTHROPIC_MODEL. These appear as shadow-custom-openai and shadow-custom-anthropic. Custom routes are manual-only and are never inserted into automatic fallback by default. For a permanent reusable adapter, add a catalog entry with a LiteLLM model ID, API base and environment-variable name.

configure prints which optional provider variables are currently enabled:

    python scripts/shadow.py configure

The catalog is a starter integration list, not a guarantee of a free plan. Confirm current prices and quotas with each provider before using it. Paid providers are deliberately excluded from shadow-auto by default to avoid surprise charges. You can opt a provider into automatic fallback by setting auto_fallback: true in its catalog entry, after reviewing its billing behavior.

## Connect a client

OpenAI-compatible clients (OpenCode, Cline, Continue, Kilo, Aider):

- Base URL: http://127.0.0.1:4000/v1
- API key: your local LITELLM_MASTER_KEY
- Model: shadow-auto, shadow-local, or an enabled provider alias.

Anthropic-compatible clients:

- Base URL: http://127.0.0.1:4000
- API key: your local LITELLM_MASTER_KEY
- Model: choose a model alias that the selected upstream supports through Anthropic Messages.

Provider feature compatibility varies. Tool calling, vision, streaming, reasoning, prompt caching, context length and Anthropic Messages translation must be verified per model. Do not assume every OpenAI-compatible upstream supports every capability.

## Commands

    python scripts/shadow.py setup      # create local environment/config
    python scripts/shadow.py configure  # show optional provider setup
    python scripts/shadow.py refresh    # regenerate config after editing .env
    python scripts/shadow.py validate   # validate generated aliases
    python scripts/shadow.py start      # run local API

The starter does not install Ollama or download models automatically. This avoids silently consuming disk, network, GPU or CPU resources. Install only the model(s) you want.

## Security and sharing

- .env, config/shadow.yaml, .venv, logs and runtime data are local and ignored by Git.
- The generated master key is administrative. Keep it private and use it only for your local gateway.
- The default bind address is loopback. Do not expose the gateway on 0.0.0.0 or the internet without TLS, authentication, rate limits and a proper key-management/database setup.
- Never commit personal API keys, OAuth sessions, provider account IDs where sensitive, request logs or local backups.
- If you deploy Shadow for multiple users, configure PostgreSQL-backed LiteLLM virtual keys and issue scoped keys instead of sharing the master key.
