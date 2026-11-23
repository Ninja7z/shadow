# Provider status and free-tier notes

This is a dated operational snapshot, not a promise that provider quotas or model IDs will remain unchanged. Re-check each provider's dashboard and catalog before relying on it.

## Requesty

- Official free-model catalog: 8 zero-cost model IDs and 200 free-model requests per day, no payment method required on the free plan.
- Verified model: `nvidia/nemotron-3.5-lightning-30b-a3b`.
- Catalog pricing for the NVIDIA deployment showed input and output price `0`.
- Tested directly and through Shadow using both OpenAI Chat Completions and Anthropic Messages. Structured tool calls passed; the test responses reported `cost: 0`. A one-turn `claude-requesty` CLI smoke test completed through Shadow (exit code 0); Aider, Cline, OpenCode and Continue CLI passed end-to-end smoke tests through Shadow. Continue resolves the gateway key from ~/.continue/.env (mode 600). Cline uses an isolated profile at ~/.config/shadow/cline/gateway; the user's default profile remains unchanged. The initial `unrecognized_model` diagnostic was eliminated with the documented `modelPicker.behavesAs` compatibility profile; Shadow still receives the original provider alias.
- Active Shadow aliases: `router-requesty-nemotron-free` (OpenAI-compatible) and `claude-code-requesty-nemotron-free` (Anthropic Messages). The previous Requesty credential was revoked on 2026-11-23 and removed from the active vault. Only the current key is used by `REQUESTY_API_KEY`.
- OpenAI-compatible base URL: `https://router.requesty.ai/v1`.
- Claude Code base URL: `https://router.requesty.ai` (without a trailing `/v1` when the client appends `/v1/messages`).
- Official sources: https://www.requesty.ai/models/free, https://www.requesty.ai/agents/claude-code, https://www.requesty.ai/terms.

## Cloudflare Workers AI

- Verified model: `@cf/zai-org/glm-4.7-flash`.
- Direct and through Shadow, OpenAI Chat Completions and structured tool calling returned HTTP 200.
- The Workers AI credential and the Cloudflare account API token are separate credentials and must remain separate.
- Workers Free currently includes 10,000 Neurons per day. On the Free plan, requests fail after the allowance is exhausted; charges above the allowance require a Workers Paid plan.
- The Anthropic Messages adapter test through the local gateway timed out, so use the OpenAI-compatible route for this model unless retested.
- Official sources: https://developers.cloudflare.com/workers-ai/platform/pricing/, https://developers.cloudflare.com/workers-ai/get-started/rest-api/.

## Gonka Broker

- Verified model: `zai-org/GLM-5.3-Flash`.
- Root authentication endpoint: `https://proxy.gonkabroker.com/test-auth` (do not add `/v1` to this diagnostic path).
- The tested free credential returned `status=ok` and `maxRpm=6`.
- Chat Completions and native Anthropic Messages tool calls passed directly and through Shadow.
- The advertised free tier provides at least 1 million tokens per month after mobile/SMS verification. Watch the provider dashboard for the remaining balance; the rate limit can still return HTTP 429.
- Official documentation: https://docs.gonkabroker.com/reference/limits-and-quotas/.

## BazaarLink

- Verified model: `nvidia/nemotron-3.5-lightning-free:free`.
- Key metadata confirmed `is_free_tier=true` and `is_management_key=false`.
- The model catalog returned zero input and output prices. Structured Chat Completions tool calls passed directly and through Shadow; the usage response omitted a cost field.
- The free account has a small daily weighted quota. Monitor the key dashboard.
- Shadow sends `X-Free-Fallback: false` for this route so an exhausted free model does not silently fall through to a paid BazaarLink model.
- Official provider site: https://bazaarlink.ai/.

## Requesty concurrency fallback

The free-tier organization may return HTTP 429 when another request is already in flight. Shadow has an explicit Chat Completions fallback chain for the Requesty alias: Cloudflare Workers AI → Gonka → BazaarLink → LLM7 → AI Horde. The Anthropic Messages alias falls back to native Anthropic Gonka → NVIDIA → AI Horde. The revoked Requesty key is not configured as an automatic or manual active fallback.
