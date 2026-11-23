# Claude Code integration

Shadow exposes an Anthropic Messages endpoint through LiteLLM at `http://127.0.0.1:4000`. The local wrapper is `~/.local/bin/claude-route`, and provider-specific launchers call it with a model alias.

## Model picker compatibility

Claude Code 2.1.257+ supports `modelPicker.options[].behavesAs`. Shadow uses this to tell Claude Code that custom provider aliases follow the capability profile of Claude Sonnet 4.6. The **actual model ID is not rewritten**: the route alias is still sent to the local gateway and LiteLLM selects the provider/model configured for that alias.

The launcher creates a private settings file per alias under `~/.config/shadow/claude-model-settings/`, with mode `600`. It sets:
- `modelPicker.options[].model` to the actual Shadow alias.
- `behavesAs: claude-sonnet-4-6` for Claude Code capability/effort handling.
- `autoCompactWindow` to a conservative route-specific limit (usually 131,072 tokens).

This removes the `[claude-code:unrecognized_model]` diagnostic without pretending the upstream model is Claude. The behavior profile is only a Claude Code compatibility hint; the gateway continues receiving the original alias.

## Credentials and gateway

The launcher reads `~/.config/shadow/providers.env` and `extra-providers.env`, which must be private files with mode `600`. Claude Code receives only the local LiteLLM master key as `ANTHROPIC_AUTH_TOKEN`; upstream provider keys remain server-side.

Only `LITELLM_MASTER_KEY` is required by the launcher. It must not require unrelated provider keys such as Gemini or NVIDIA when the chosen route is Requesty, Gonka, or Cloudflare.

## Current Requesty route

- Launcher: `claude-requesty`
- Shadow alias: `claude-code-requesty-nemotron-free`
- Upstream: `nvidia/nemotron-3.5-lightning-30b-a3b`
- Anthropic Messages and structured `tool_use` were tested directly and through Shadow.
- A CLI one-turn smoke test succeeded with exit code 0 and no `unrecognized_model` diagnostic after the model picker compatibility fix.

## Notes

- Custom provider aliases should have an explicit model picker entry and a conservative context compaction window.
- Keep the model picker settings local; do not commit generated files from `~/.config/shadow/claude-model-settings/`.
- Provider fallback chains must remain protocol-compatible. An OpenAI-only fallback must not be added to an Anthropic Messages route.
