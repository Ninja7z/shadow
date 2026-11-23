# Shadow MCP Hub

Shadow MCP Hub is the single local MCP gateway shared by Claude Code, OpenCode and Cline. It aggregates GitHub and Runcrate behind six meta-tools:

- list_servers
- list_tools
- get_tool_schema
- call_tool
- wake_server
- sleep_server

The current upstream inventory is 46 GitHub tools + 60 Runcrate tools = 106 tools. Each client starts one local stdio process named shadow; upstream tools are discovered and invoked through the hub on demand.

## Current connected clients

- Claude Code: one user-scope MCP named shadow, stdio, connected. The former GitHub, Runcrate and temporary shadow-hub-login entries are removed.
- OpenCode 2.3.2: global MCP shadow is connected. Its old direct Runcrate entry is retained but disabled.
- Cline CLI 3.0.75: MCP shadow is configured and enabled as stdio. Its old direct Runcrate entry is retained but disabled; config visibility was verified with the Cline CLI.
- Codex and Cursor: no executable/configuration was found in this Linux installation, so they are not connected.

## Runtime and credentials

The runtime is installed under ~/.local/share/shadow-mcp-hub. The local configuration is under ~/.config/shadow/mcp-hub.

The GitHub Authorization bearer header is stored only in:

    ~/.config/shadow/mcp-hub/github.token

That file must have mode 600. The wrapper reads it at process start, exports it to the hub process, and never prints it. It is not stored in Claude Code MCP configuration anymore.

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
