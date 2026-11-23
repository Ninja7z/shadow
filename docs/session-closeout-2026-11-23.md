# Shadow session closeout — 2026-11-23

## Current state

- Host: Linux Mint 24.04-based environment.
- Local project clone: `~/Projects/shadow`.
- Public repository: https://github.com/Ninja7z/shadow, branch `main`.
- Shadow gateway: active on `127.0.0.1:4000`.
- Final health check: 48 aliases, 37 fallback groups, 0 cycles, no missing environment variables. Gateway service is active.

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
- `claude-requesty` smoke tests after the fix returned `SHADOW_MODEL_PICKER_OK` and `SHADOW_FINAL_E2E_OK`, exit code 0, with no unrecognized-model diagnostic. A subsequent test after syncing the versioned launcher also passed.
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
- BazaarLink: final key check HTTP 200; `is_free_tier=true`, `is_management_key=false`; zero-priced Nemotron free model; small daily quota; route uses `X-Free-Fallback: false`.
- Requesty: final catalog check HTTP 200, 787 model IDs; active key matches the only Requesty entry left in Desktop/API.txt.
- Gonka: final root auth check HTTP 200, `status=ok`, `maxRpm=6`.
- Cloudflare: account token verification HTTP 200 with status active; Workers AI catalog HTTP 200.

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
4. Smoke-test automation is complete: scripts/smoke_test.py plus docs/smoke-tests.md and unit tests. Safe GET checks passed 9/9; Chat Completions structured tool calls passed 4/4; Requesty and Gonka Anthropic tool_use passed. The suite contains 8 unit tests.
5. The PC is currently running Linux Mint. Timeshift 25.12.4 is installed, but `/etc/timeshift/timeshift.json` is absent, so no Timeshift snapshot was created. The elevated snapshot operation was blocked in this session. A Windows System Restore Point cannot be created from this Linux session; if booting into Windows next time, create one before Windows-side changes.


## Follow-up work completed later on 2026-11-23

- Added scripts/smoke_test.py with safe GET-only default mode, optional Chat Completions tool-call mode, and selectable Anthropic Messages tool_use checks.
- Safe mode performs no inference and checks gateway health, route aliases, provider auth/catalogs and Cloudflare token/model status.
- Added 8 unit tests covering env-file parsing, tool-call response shapes, Anthropic-only selection and timeout classification.
- Final test results: 8/8 unit tests; 9/9 safe GET checks; 4/4 Chat Completions tool calls; Requesty Anthropic tool_use passed; Gonka Anthropic tool_use passed.
- A first Anthropic sweep exposed that a short GET timeout was reused for inference and Anthropic-only mode inadvertently ran Chat Completions checks. Both issues were fixed and covered by tests: inference now has a separate 35-second default, provider selection can target only Requesty or Gonka, and Anthropic-only mode does not trigger Chat Completions calls.
- BazaarLink key metadata at the final safe check reported requests_today=5 and limit_remaining=10. Avoid frequent inference tests; safe mode is GET-only.

## MCP consolidation completed — 2026-11-23 15:xx -0300

- Installed and pinned @ni-c/mcp-hub 0.13.1 under ~/.local/share/shadow-mcp-hub.
- Claude Code now has one active MCP server: shadow (stdio).
- The old GitHub and Runcrate MCP connectors and temporary shadow-hub-login connector were removed from Claude Code user config. Claude Code now has only shadow.
- The GitHub Authorization bearer header was moved to ~/.config/shadow/mcp-hub/github.token (mode 600). Both hub/admin wrappers read it at process start. The GitHub MCP entry was removed from ~/.claude.json after the moved credential passed real forwarding tests.
- GitHub and Runcrate are upstreams inside the Shadow Hub. The hub exposes six meta-tools: list_servers, list_tools, get_tool_schema, call_tool, wake_server and sleep_server.
- Verified upstream counts: GitHub 46 tools; Runcrate 60 tools; total 106.
- Verified forwarding after the temporary HTTP panel was stopped: GitHub search_repositories found Ninja7z/shadow; Runcrate list_gpu_types returned 162 entries. Forwarding passed again after moving the GitHub credential to github.token and removing the GitHub user-scope MCP.
- Added repeatable setup and repair files: scripts/patch-mcp-hub-compat.mjs, scripts/shadow-mcp-hub.sh, scripts/shadow-mcp-admin.sh, config/mcp-hub.example.json and docs/mcp-hub.md.
- Pinned MCP Hub compatibility patches: bind HTTP admin/OAuth listener to 127.0.0.1; pass DATA_PATH into stdio so the OAuth token store is reused; skip unsupported periodic ping for Runcrate 1.5.1, which otherwise disconnects despite successful tool calls.
- Runcrate authorization is active until 2027-02-21T18:45:25Z. The provider did not return a refresh token; reauthorize before expiry. No automatic refresh is claimed.
- Temporary HTTP listener on 127.0.0.1:7690 was stopped after authorization. The normal stdio Shadow connection continues working without it.
- Upstream OAuth state and access token remain local in ~/.config/shadow/mcp-hub/data/state.json (mode 600 file under a mode 700 directory). Never commit this state, bootstrap.env, github.token, or Claude/OpenCode/Cline config backups.


## Cross-client MCP synchronization — 2026-11-23 16:05 -0300

- Claude Code user MCP names now contain only shadow; claude mcp list from ~/Desktop/shadow shows shadow connected.
- OpenCode 2.3.2 global config uses shadow (local stdio), reports connected; direct Runcrate remote MCP remains present but disabled.
- Cline CLI 3.0.75 settings use shadow (stdio, enabled); direct Runcrate Streamable HTTP entry remains present but disabled. Verified with cline config mcp --json.
- Codex and Cursor executables/configurations were not found in this Linux installation.
- The GitHub credential was moved once into ~/.config/shadow/mcp-hub/github.token, mode 600. After updating both wrappers, a real GitHub search and Runcrate GPU-types tool call passed through Shadow. The Claude Code GitHub user MCP was then removed. A private ~/.claude.json backup was retained outside Git.
- The old GitHub helper no longer needs project-level disabledMcpServers entries.
- Cross-client config/renewal instructions are in docs/mcp-hub.md.


## MCP Hub expansion — Mistral, Hugging Face and Cloudflare — 2026-11-23

- Added official Mistral Studio MCP at https://api.mistral.ai/mcp, authenticated from MISTRAL_API_KEY in the protected extra-providers.env. Launcher exports only this key, not every variable from the file. Mistral reports 91 tools; read-only whoami call passed.
- Added official Hugging Face Hub MCP at https://huggingface.co/mcp, authenticated from HF_TOKEN in extra-providers.env. Launcher exports only HF_TOKEN. It reports 4 baseline tools; read-only hub_repo_search for Qwen3.5 passed.
- Added official Cloudflare API MCP at https://mcp.cloudflare.com/mcp with DCR OAuth. Registration succeeded, but user consent remains pending. Do not mark it connected until OAuth status is authorized and tools/list succeeds. The official API MCP exposes 2 Code Mode tools backed by more than 2,500 API endpoints.
- Added Cloudflare documentation MCP at https://docs.mcp.cloudflare.com/mcp. It is public/no-auth, exposes 2 read-only tools, and a real search_cloudflare_documentation call returned Workers AI documentation.
- Current live tool inventory: GitHub 46 + Runcrate 60 + Mistral 91 + Hugging Face 4 + Cloudflare Docs 2 = 203. Cloudflare API not counted until OAuth is authorized.
- Updated config/mcp-hub.example.json and docs/mcp-hub.md.
- Groq and NVIDIA docs reviewed: their APIs consume remote MCP tools; neither is a hosted MCP upstream to add directly to this Hub. Keep those keys in the LLM/model routing layer.


## Cloudflare API MCP completed with static token — 2026-11-23 17:38 -0300

- The last non-empty line of Desktop/API.txt contained the misspelled label CLOUDFARE_API_TOKEN using KEY: VALUE syntax.
- Imported the value into protected ~/.config/shadow/extra-providers.env as canonical CLOUDFLARE_API_TOKEN. Created a backup before replacing the previous value; file mode remains 600. The secret value was never printed.
- Cloudflare /user/tokens/verify returned HTTP 200, success=true, status=active.
- OAuth DCR was not used because the official authorization callback consistently failed issuer validation (missing iss parameter). Cloudflare API MCP is now configured with the CLOUDFLARE_API_TOKEN environment-variable placeholder in its Authorization header.
- Updated both hub/admin launchers and their versioned source scripts to export only CLOUDFLARE_API_TOKEN alongside existing selected keys. The smoke test now verifies user API tokens at /user/tokens/verify (not the old account-scoped endpoint).
- Cloudflare MCP is up and exposes five tools: docs, search, execute, whoami, submit_feedback.
- whoami succeeded; tool annotations declare readOnlyHint=true. GET /accounts returned success with one account; GET /zones returned success with zero zones visible. The updated safe smoke suite passed 9/9 checks. The token-detail endpoint returned 403, so policy metadata could not be enumerated independently. The setup used the Read All Resources template; no write/destructive calls were made.
- Active inventory is now GitHub 46 + Runcrate 60 + Mistral 91 + Hugging Face 4 + Cloudflare Docs 2 + Cloudflare API 5 = 208 tools.
