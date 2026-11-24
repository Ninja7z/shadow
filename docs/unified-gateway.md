# Shadow API Gateway

Shadow runs a local LiteLLM Proxy and exposes one API for model clients. Each clone uses its own credentials, local configuration and provider accounts.

## Default endpoints

The gateway binds to 127.0.0.1:4000 by default.

| Protocol | Endpoint | Typical clients |
|---|---|---|
| OpenAI-compatible base URL | http://127.0.0.1:4000/v1 | OpenCode, Cline, Continue, Kilo Code, Aider |
| OpenAI Chat Completions | http://127.0.0.1:4000/v1/chat/completions | OpenAI-compatible clients |
| OpenAI Responses | http://127.0.0.1:4000/v1/responses | Clients using Responses; verify upstream support |
| Anthropic Messages | http://127.0.0.1:4000/v1/messages | Claude Code and Anthropic-compatible clients |
| Model catalog | http://127.0.0.1:4000/v1/models | Model discovery |

For OpenAI-compatible clients, use the base URL ending in /v1. For Anthropic clients that append /v1/messages automatically, use the gateway root: http://127.0.0.1:4000.

## Authentication

Use the LITELLM_MASTER_KEY generated in the private .env file. This is the local gateway's administrative key, not an upstream provider key.

The default single-user setup is bound to loopback. Do not expose it to other machines or the internet using the master key. Multi-user deployments should configure PostgreSQL-backed LiteLLM virtual keys, scoped permissions, budgets, rate limits and TLS/private networking first.

## Model aliases

The model aliases are generated from the local catalog and the credentials enabled by the owner of each installation. Query /v1/models and use the returned id exactly.

Common aliases include shadow-local, shadow-auto and shadow-custom-<id>. The actual available set depends on the local setup; no public document should assume the maintainer's private model inventory.

## Client setup

See [Client integrations](client-integrations.md) for fresh-clone recipes covering OpenCode, Cline, Continue, Kilo Code, Aider and Claude Code.

## Protocol and feature compatibility

The gateway translates between client request formats and configured upstream providers where LiteLLM supports the route. Model capabilities are not universal. Tool calling, streaming, image input, reasoning, prompt caching, context limits and structured output must be checked per model and provider.

Keep fallback chains protocol-compatible. Do not assume that a model which accepts Chat Completions also supports every Anthropic Messages feature.

## Model API and MCP are separate

The model gateway is the LiteLLM HTTP API on port 4000. The Shadow MCP Hub is a separate tool-server component with its own configuration and credentials. A model API connection does not automatically configure MCP tools, and the MCP Hub does not provide model inference.

See [MCP Hub](mcp-hub.md) for its independent setup and security requirements.
