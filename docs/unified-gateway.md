# Shadow API Gateway

Shadow already has a local multi-provider model API. The gateway is LiteLLM, configured and operated as Shadow; a second model proxy or a from-scratch protocol implementation is not needed.

## Current local service

- Runtime: LiteLLM 1.110.2
- Bind address: 127.0.0.1:4000 (loopback only)
- Config: ~/.config/shadow/config.yaml
- Provider credentials: ~/.config/shadow/providers.env and ~/.config/shadow/extra-providers.env
- Client credential: LITELLM_MASTER_KEY
- Catalog: 48 configured model aliases
- Routing: 37 fallback groups

The 48 entries are route aliases, not a claim that every provider/model combination has been re-tested end to end. Check the per-provider smoke test before relying on a route or a specific capability.

## One host, protocol-compatible paths

Use the same local host and gateway credential. The path depends on the client protocol:

| API | Endpoint | Use |
|---|---|---|
| OpenAI Chat Completions | http://127.0.0.1:4000/v1/chat/completions | OpenCode, Cline, Continue, Kilo, Aider and OpenAI-compatible clients |
| OpenAI Responses | http://127.0.0.1:4000/v1/responses | Clients built around the Responses API; verify provider/model support |
| OpenAI model catalog | http://127.0.0.1:4000/v1/models | Model discovery and picker |
| Anthropic Messages | http://127.0.0.1:4000/v1/messages | Claude Code and Anthropic-compatible clients |

For OpenAI-compatible clients, the Base URL is http://127.0.0.1:4000/v1.

For Anthropic SDKs/clients that append /v1/messages themselves, use the base URL http://127.0.0.1:4000.

All model aliases come from the same model_list; clients should select the exact alias returned by /v1/models. The gateway translates the request and response format between the client protocol and each configured provider, subject to provider-specific feature support.

LiteLLM documents translated OpenAI Chat Completions, OpenAI Responses and Anthropic Messages endpoints. It also supports many native and pass-through endpoints. See https://docs.litellm.ai/docs/supported_endpoints.

## Current client integration audit — 2026-11-23

| Client | Current state | API configuration |
|---|---|---|
| OpenCode | Configured | provider shadow, http://127.0.0.1:4000/v1, key resolved from LITELLM_MASTER_KEY |
| Cline default profile | Configured | OpenAI-compatible, http://127.0.0.1:4000/v1 |
| Cline isolated gateway profile | Configured | OpenAI-compatible, http://127.0.0.1:4000/v1 |
| Continue | Configured | 17 model entries, all using http://127.0.0.1:4000/v1; SHADOW_API_KEY matches the current gateway master key |
| Claude Code | Configured | claude-route launcher sets the Anthropic Messages base URL to the local gateway |
| Aider | Installed | A persistent local config was not found in this audit; it can use the OpenAI-compatible base URL and a Shadow model alias |
| Kilo Code | Not installed/detected in this Linux environment | Configure as an OpenAI Compatible custom provider when installed |

### Kilo Code setup

Kilo Code's current custom-provider flow supports OpenAI Compatible, OpenAI Responses and Anthropic Messages. For Shadow's Chat Completions routes:

- Provider API: OpenAI Compatible
- Base URL: http://127.0.0.1:4000/v1
- API key: current Shadow gateway credential (currently LITELLM_MASTER_KEY; replace with a scoped virtual key when available)
- Model: select an exact alias from /v1/models, e.g. router-shadow-free or router-fast

Kilo can fetch models automatically from /v1/models. Do not add upstream provider API keys to Kilo; keep those only in Shadow's protected environment.

Official setup: https://kilo.ai/docs/ai-providers/openai-compatible

## Authentication and the remaining security work

The current clients use the single LITELLM_MASTER_KEY. This works for a single-user gateway bound to loopback, but the master key is the LiteLLM Proxy Admin key. It is not an ideal long-term application credential.

LiteLLM virtual keys allow model allowlists, budgets, rate limits and separate credentials per app. The current Shadow gateway has no DATABASE_URL and no local PostgreSQL service. LiteLLM requires PostgreSQL for virtual-key management and spend tracking; virtual keys/budgets are not available in the current no-database setup.

Before exposing Shadow to other machines or users:

1. Add a private PostgreSQL database for LiteLLM key management.
2. Keep LITELLM_MASTER_KEY only for gateway administration.
3. Issue separate virtual keys for OpenCode, Cline, Kilo, Continue, Claude Code and Aider.
4. Restrict each key to the intended model aliases and, once the MCP gateway is enabled, only the MCP servers/tools required by that client.
5. Set per-key budgets/rate limits where applicable.
6. Keep the service on loopback, or expose it only through an authenticated private network/TLS reverse proxy. Do not bind the raw gateway to 0.0.0.0 without that protection.

Official docs: https://docs.litellm.ai/docs/proxy/virtual_keys

## Model API and MCP tools are separate protocols

The model API and the Shadow MCP Hub are complementary:

- Model API: OpenAI/Anthropic-compatible model requests, on port 4000.
- MCP Hub: GitHub, Runcrate, Mistral, Hugging Face, Cloudflare Docs and Cloudflare API tools, currently exposed by the local shadow-mcp-hub stdio server to MCP-capable clients.

The current MCP Hub inventory is 208 tools. Claude Code, OpenCode and Cline each connect to this shared Hub. Their MCP connection is separate from their model-provider configuration.

LiteLLM has its own MCP Gateway, which can expose upstream MCP servers on /mcp and can also bridge MCP tools into supported Chat Completions/Responses requests. A local proof of concept was tested on port 4002 using the existing shadow-mcp-hub as an upstream stdio process:

- /v1/models returned all 48 model aliases.
- The shadow_tools MCP server registered, but tools/list returned 403 forbidden from that upstream.
- The lab gateway was stopped and its temporary config/log/PID removed.
- Production port 4000 and the currently working Shadow MCP Hub were not changed.

Do not replace the current MCP Hub or point clients at :4000/mcp until this stdio/authorization integration is fixed and the full tool catalog and read-only forwarding tests pass.

## Important limitations

- A single gateway does not remove upstream free-tier quotas, rate limits, model availability changes or provider-specific feature differences.
- Tool calling, streaming, vision, reasoning, prompt caching and context limits vary by model/provider and need per-alias verification.
- Preserve protocol-compatible fallback chains. An OpenAI-only route must not be inserted into an Anthropic Messages fallback chain.
- The 48 aliases and 37 fallback groups are the current configured inventory; they are not 48 independent providers and do not imply every route is currently healthy.
