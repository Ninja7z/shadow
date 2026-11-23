# Shadow MCP Hub

Shadow MCP Hub is the single local MCP gateway shared by Claude Code, OpenCode and Cline. It aggregates GitHub and Runcrate behind six meta-tools:

- list_servers
- list_tools
- get_tool_schema
- call_tool
- wake_server
- sleep_server

The current active inventory is 46 GitHub + 60 Runcrate + 91 Mistral + 4 Hugging Face + 2 Cloudflare Docs + 5 Cloudflare API = 208 tools across six connected upstreams. Each client starts one local stdio process named shadow; upstream tools are discovered and invoked through the hub on demand.

## Current connected clients

- Claude Code: one user-scope MCP named shadow, stdio, connected. The former GitHub, Runcrate and temporary shadow-hub-login entries are removed.
- OpenCode 2.3.2: global MCP shadow is connected. Its old direct Runcrate entry is retained but disabled.
- Cline CLI 3.0.75: MCP shadow is configured and enabled as stdio. Its old direct Runcrate entry is retained but disabled; config visibility was verified with the Cline CLI.
- Codex and Cursor: no executable/configuration was found in this Linux installation, so they are not connected.

## Runtime and credentials

The runtime is installed under ~/.local/share/shadow-mcp-hub. The local configuration is under ~/.config/shadow/mcp-hub.

The GitHub Authorization bearer header is stored only in:

    ~/.config/shadow/mcp-hub/github.token

That file must have mode 600. The wrapper reads it at process start, exports it to the hub process, and never prints it. It is not stored in Claude Code MCP configuration anymore. The wrapper also loads only MISTRAL_API_KEY, HF_TOKEN and CLOUDFLARE_API_TOKEN from the protected extra-providers.env file, exporting those selected values to the hub process; other provider variables are not exported by the launcher.

Runcrate OAuth state and its access token are stored locally in:

    ~/.config/shadow/mcp-hub/data/state.json

The data directory must have mode 700 and the state file mode 600. Never commit this state, github.token, bootstrap.env, or the local mcp.json.

## Install / repair

The supported package version is pinned to @ni-c/mcp-hub@0.13.1. Install it into the private runtime directory and apply the compatibility patches:

    mkdir -p ~/.local/share/shadow-mcp-hub
    npm install --prefix ~/.local/share/shadow-mcp-hub --no-audit --no-fund --save-exact @ni-c/mcp-hub@0.13.1
    cp scripts/patch-mcp-hub-compat.mjs ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
    node ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs

The patches are idempotent and preserve original package files in ~/.local/share/shadow-mcp-hub/patch-originals/:

1. Bind the optional HTTP OAuth/admin listener to 127.0.0.1 by default.
2. Pass DATA_PATH into the stdio entrypoint so it reuses the OAuth credentials authorized by the HTTP hub.
3. Skip the periodic ping probe for Runcrate 1.5.1. It accepts MCP initialize/tools calls but responds Method not found: ping; the hub otherwise tears down a healthy connection repeatedly.

Install the wrappers:

    install -m 700 scripts/shadow-mcp-hub.sh ~/.local/bin/shadow-mcp-hub
    install -m 700 scripts/shadow-mcp-admin.sh ~/.local/bin/shadow-mcp-admin

Create the private config only if it does not already exist:

    mkdir -p ~/.config/shadow/mcp-hub/data
    chmod 700 ~/.config/shadow/mcp-hub ~/.config/shadow/mcp-hub/data
    cp config/mcp-hub.example.json ~/.config/shadow/mcp-hub/mcp.json
    chmod 600 ~/.config/shadow/mcp-hub/mcp.json

Do not overwrite ~/.config/shadow/mcp-hub/data/state.json. It contains OAuth state, client registrations and upstream tokens.

## Configure Claude Code

Ensure the GitHub bearer header is stored in ~/.config/shadow/mcp-hub/github.token with mode 600, then add the single user-level MCP:

    claude mcp add --scope user shadow ~/.local/bin/shadow-mcp-hub stdio

Check it with:

    claude mcp list
    claude mcp get shadow

The expected Claude Code list contains only shadow.

## Configure OpenCode

The current global config is ~/.config/opencode/opencode.json. shadow is enabled and connected; the previous direct Runcrate entry is disabled.

On a new machine:

    opencode mcp add --global shadow -- ~/.local/bin/shadow-mcp-hub stdio
    opencode mcp list

## Configure Cline

The Cline MCP file is ~/.cline/data/settings/cline_mcp_settings.json. shadow is enabled as a stdio server; the previous Runcrate Streamable HTTP entry is disabled.

Check it with:

    cline config mcp --json

On a new machine:

    cline mcp add shadow --yes -- ~/.local/bin/shadow-mcp-hub stdio

Each client keeps its own model-provider settings. The MCP Hub shares tools and upstream OAuth; it does not merge model-provider configurations.

## First-time / renewed Runcrate authorization

The HTTP listener is needed only to complete browser OAuth. It binds to loopback:

    ~/.local/bin/shadow-mcp-hub http

In another terminal:

    ~/.local/bin/shadow-mcp-admin upstream login runcrate --no-wait

Open the printed authorization URL in the same browser profile that signed into the local hub. After the Runcrate success page appears, it may try to send the callback in a cross-site iframe. If the callback is rejected, open the callback URL as a top-level browser navigation so the local SameSite=Lax session cookie is included.

Check:

    ~/.local/bin/shadow-mcp-admin upstream status runcrate

The authorization completed on 2026-11-23. Runcrate supplied an access token expiring 2027-02-21 but no refresh token. Reauthorize before that expiry; automatic refresh is not available with the current provider response.

After completing OAuth, stop the temporary HTTP listener. The normal stdio MCP continues working without the panel.

## Verified forwarding

- GitHub search_repositories found Ninja7z/shadow through call_tool.
- Runcrate list_gpu_types returned 162 entries through call_tool.
- Final upstream inventory: GitHub 46 tools, Runcrate 60 tools.
- Forwarding was retested after moving the GitHub token to github.token.
- Claude Code, OpenCode and Cline are configured to use the shared shadow MCP; Claude Code and OpenCode report connected.

## Security boundaries

- The HTTP listener is loopback-only. Do not expose port 7690 to the LAN or Internet.
- github.token and data/state.json are local secrets; keep the file mode 600 and their parent directory mode 700.
- The hub config contains only an environment-variable reference for the GitHub Authorization header.
- bootstrap.env, github.token, mcp.json, and data/state.json are local-only and must never be committed.
- Do not commit .claude.json, Cline/OpenCode auth stores, token backups, OAuth state, access tokens, refresh tokens, or generated runtime files.


## Additional official MCP upstreams

### Mistral Studio

- Endpoint: https://api.mistral.ai/mcp
- Transport: Streamable HTTP
- Authentication: Authorization: Bearer MISTRAL_API_KEY (environment variable reference in the local MCP config).
- The key is read from ~/.config/shadow/extra-providers.env; the launcher exports only MISTRAL_API_KEY.
- Connected and verified with 91 tools. A read-only whoami call returned the configured account/workspace.
- Available tool groups depend on the key's workspace and enabled features. The official server can expose write-capable tools (publish apps, manage knowledge, delete libraries/secrets, deploy workflows); review before calling write/destructive tools.

### Cloudflare Documentation MCP

- Endpoint: https://docs.mcp.cloudflare.com/mcp
- Authentication: none required.
- Connected and verified with two read-only tools: search_cloudflare_documentation and migrate_pages_to_workers_guide.
- A read-only search for Workers AI inference documentation returned Cloudflare documentation chunks.

### Cloudflare API MCP

- Endpoint: https://mcp.cloudflare.com/mcp
- Transport: Streamable HTTP
- Authentication: Authorization header uses the local CLOUDFLARE_API_TOKEN environment-variable placeholder.
- OAuth DCR was abandoned because the Cloudflare authorization response omitted the iss parameter expected by the hub (issuer mismatch during code exchange).
- The API token was imported from the final API.txt line into the protected extra-providers.env after correcting the misspelled label CLOUDFARE_API_TOKEN to CLOUDFLARE_API_TOKEN. The source line was normalized to CLOUDFLARE_API_TOKEN=VALUE.
- Cloudflare /user/tokens/verify returned HTTP 200, success=true, status=active.
- The MCP whoami call passed and its tool metadata declares readOnlyHint=true.
- The token-detail endpoint returned 403, so token policy details could not be independently enumerated through the API. The setup used the Read All Resources template; avoid calling write/destructive operations. Only read-only calls have been tested. GET /accounts returned success with one account; GET /zones returned success with zero zones visible.
- The MCP exposes five tools: docs, search, execute, whoami and submit_feedback. execute can invoke Cloudflare API operations; effective permissions are constrained by the API token, not by the MCP tool name. The execute tool itself is marked destructive-capable, so Shadow usage must remain limited to GET requests and read-only tools. Do not issue POST, PUT, PATCH or DELETE calls against this upstream.
### Hugging Face Hub MCP

- Endpoint: https://huggingface.co/mcp
- Transport: Streamable HTTP
- Authentication: Authorization: Bearer HF_TOKEN (environment variable reference in the local MCP config).
- The key is read from ~/.config/shadow/extra-providers.env; the launcher exports only HF_TOKEN.
- Connected and verified with 4 configured baseline tools: hf_whoami, hub_repo_search, hub_repo_details, and hf_fs. A read-only search for Qwen3.5 returned repository results.
- Additional tools, Jobs, sandboxes and community Spaces depend on user settings at https://huggingface.co/settings/mcp and token permissions. Compute-backed Jobs/Spaces may consume resources; configure only what you intend to use.

### Providers not added as MCP upstreams

Groq's MCP support is a Responses API feature that lets a Groq-hosted model call remote MCP servers; it is not itself a Groq-hosted MCP service. NVIDIA NIM similarly consumes MCP tools from the client side and does not expose a managed NVIDIA MCP endpoint in the docs reviewed. Those API keys belong in the model-routing/API layer, not as MCP Hub upstreams.
