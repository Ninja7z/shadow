# Shadow session closeout — 2026-11-23

## Current state

- Host: Linux Mint 24.04-based environment.
- Local project clone: `~/Projects/shadow`.
- Public repository: https://github.com/Ninja7z/shadow, branch `main`.
- Shadow gateway: active on `127.0.0.1:4000`.
- Latest health check before this closeout: 48 aliases, 37 fallback groups, 0 cycles, no missing environment variables.

## Requesty credential

- New Requesty key is the only active `REQUESTY_API_KEY`.
- The previous key was revoked and removed from the active vault, Desktop API file and local env backups.
- Do not recreate or restore the previous key.
- Requesty free Nemotron 3.5 Lightning route is tested via OpenAI Chat Completions and Anthropic Messages, including structured tool calling. Usage responses reported cost 0.

## Claude Code diagnostic fix

- Baseline warning reproduced: `[claude-code:unrecognized_model]`.
- Fixed using Claude Code's documented `modelPicker.options[].behavesAs` support.
- The gateway alias remains unchanged; `behavesAs: claude-sonnet-4-6` is only the local compatibility profile.
- Generated private settings live in `~/.config/shadow/claude-model-settings/`, mode 600.
- `claude-requesty` smoke test after the fix returned `SHADOW_MODEL_PICKER_OK`, exit code 0, with no unrecognized-model diagnostic.
- The launcher no longer requires unrelated NVIDIA/Gemini keys just to start another provider route.

## Client verification

- Claude Code: pass via `claude-requesty`.
- Aider: pass via `aider-shadow-requesty`.
- Cline: pass in Plan mode using a separate Shadow profile; original Cline profile remains untouched.
- OpenCode: pass via `router-requesty-nemotron-free` with provider fallback.
- Continue CLI: pass using a temporary read-only config and the protected global secret file.

## Provider status snapshot

- Requesty: validated and active.
- Cloudflare Workers AI: validated for Chat Completions and structured tool calls.
- Gonka Broker: validated; free tier requires SMS verification and is rate-limited to about 6 RPM.
- BazaarLink: validated free-tier key; zero-priced Nemotron free model; small daily quota; route uses `X-Free-Fallback: false`.

Quotas and model IDs can change. Recheck provider dashboards before relying on free limits.

## Security and repo

- Provider secret files are local with mode 600.
- GitHub repository contains sanitized templates and docs only.
- `API.txt`, env files, logs, databases, models, caches, local SDKs and generated agent state are ignored.
- Old revoked Requesty key references were removed from the active vault and sanitized local backups.
- The repository contains no live provider key values.

## Next session

1. Open `~/Projects/shadow` and check `git status`.
2. Run `shadow doctor`.
3. If any provider quota changed, check its dashboard before sending inference.
4. Consider adding a small automated smoke-test script for all provider routes.
5. The PC is currently running Linux Mint; a Windows System Restore Point cannot be created from this Linux session. If booting into Windows for the next maintenance session, create a restore point before making Windows-side changes.
