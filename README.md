# Shadow

Shadow is a local multi-provider LLM gateway. It gives coding agents one stable endpoint while routing requests to independently configured providers and free-tier model options.

## What it provides

- OpenAI-compatible API for OpenCode, Continue, Aider, Cline and other clients.
- Anthropic Messages API for Claude Code, using providers that expose a compatible Messages interface.
- Explicit model aliases and fallback chains, so clients do not need provider-specific credentials.
- Per-provider credential isolation through environment variables.
- Local health checks and configuration validation.

The public repository contains templates and documentation only. **It must never contain live API keys, account tokens, provider environment files, logs, model blobs or local runtime state.**

## Current verified free routes

The current local gateway has verified routes for:

| Provider | Model | Verified interfaces |
|---|---|---|
| Requesty | `nvidia/nemotron-3.5-lightning-30b-a3b` | Chat Completions and Anthropic Messages; structured tool calls; reported cost $0 |
| Cloudflare Workers AI | `@cf/zai-org/glm-4.7-flash` | Chat Completions; structured tool calls |
| Gonka Broker | `zai-org/GLM-5.3-Flash` | Chat Completions and native Anthropic Messages; structured tool calls |
| BazaarLink | `nvidia/nemotron-3.5-lightning-free:free` | Chat Completions; structured tool calls; catalog price $0/$0 |

Free quotas and model availability can change. Check the provider's own dashboard and current catalog before relying on a model.

## Local API

By default, the local LiteLLM gateway listens on:

- OpenAI-compatible: `http://127.0.0.1:4000/v1`
- Anthropic Messages: `http://127.0.0.1:4000/v1/messages`

Use the local Shadow master key as the client credential. Never put upstream provider keys in an agent's configuration; keep them in the gateway's protected environment.

## Credential variables

The local gateway uses environment variables such as:

- `LITELLM_MASTER_KEY`
- `REQUESTY_API_KEY`
- `CLOUDFLARE_WORKERS_AI_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `GONKA_API_KEY`
- `BAZAARLINK_API_KEY`
- `NVIDIA_NIM_API_KEY`
- `AI_HORDE_API_KEY`

Create a private local environment file from `.env.example` or your secret manager. Do not commit that file.

## Claude Code launchers

The local machine has dedicated launchers:

- `claude-requesty`
- `claude-gonka`
- `claude-nvidia`

The versioned launcher template is `scripts/claude-route.sh`. It generates a private model-picker settings file using Claude Code's documented `behavesAs` compatibility profile, preserves the Shadow alias sent upstream, and conservatively caps context compaction. See [Claude Code integration](docs/claude-code.md).

The `claude-requesty` CLI smoke test completed successfully through Shadow. Aider, Cline, OpenCode and Continue CLI also passed end-to-end smoke tests. Continue resolves `SHADOW_API_KEY` from the protected global `~/.continue/.env`. Cline uses a dedicated config at `~/.config/shadow/cline/gateway`, leaving the existing Cline profile untouched. Claude Code emits a non-fatal `unrecognized_model` notice for this custom alias, but the request completed.

These select provider aliases through the local gateway. The launcher and active alias should be tested after changing LiteLLM or provider configuration.

## Fallback policy

The current free chat fallback chain is ordered to prefer higher-allowance or broadly available options before smaller daily quotas:

Groq OSS → Kilo Auto → Kilo → OpenRouter Nemotron → Gemini Flash-Lite → NVIDIA → Cloudflare Workers AI → Requesty → Gonka → BazaarLink → LLM7 → AI Horde.

The OpenAI-compatible Requesty alias has an explicit fallback chain for concurrency 429s: Cloudflare Workers AI → Gonka → BazaarLink → LLM7 → AI Horde. The Claude Code-specific Requesty route falls back to native Anthropic Gonka, then NVIDIA and AI Horde. Provider fallbacks should be kept protocol-compatible; an OpenAI-only route must not be inserted into an Anthropic Messages chain.

## Repository layout

- `config/shadow.example.yaml`: minimal provider/fallback example.
- `config/shadow.runtime.example.yaml`: sanitized snapshot of the current 48-alias / 37-fallback local router (all credentials remain environment references; Cloudflare Account ID is a placeholder).
- `docs/`: provider status, quota notes and operating guidance.
- `scripts/`: local validation, Claude Code gateway launcher and maintenance helpers.
- `docs/claude-code.md`: Claude Code model-picker compatibility and launcher behavior.
- `docs/session-closeout-2026-11-23.md`: dated handoff/checkpoint for the next session.
- `.env.example`: names of required variables, no values.

## Security

See [SECURITY.md](SECURITY.md). Before every commit, review `git status` and `git diff --cached`. Do not commit `API.txt`, `.env`, `extra-providers.env`, backups, logs, databases or model files.
