# Shadow MCP Hub

Shadow MCP Hub is the single active MCP connection used by Claude Code. The hub aggregates GitHub and Runcrate behind six meta-tools:

- list_servers
- list_tools
- get_tool_schema
- call_tool
- wake_server
- sleep_server

The current upstream inventory is 46 GitHub tools + 60 Runcrate tools = 106 tools. Claude Code connects to one local stdio process named shadow; upstream tools are discovered and invoked through the hub on demand.

## Current Claude Code state

In the Shadow workspace (~/Desktop/shadow):

- shadow: connected, user scope, stdio.
- github: disabled for this project. Its existing private config remains as the credential source consumed by the wrapper; the token is not copied into a second file.
- runcrate: removed as a separate Claude Code connector.
- shadow-hub-login: temporary OAuth login connector removed after setup.

The same GitHub helper is disabled for the other currently registered Claude Code project (/home/mint). New project paths should disable the helper using Claude Code's /mcp panel, while retaining its credential entry for the wrapper.

## Install / repair

The supported local version is pinned to @ni-c/mcp-hub@0.13.1. Install it into the private runtime directory, then apply the three compatibility patches:

    mkdir -p ~/.local/share/shadow-mcp-hub
    npm install --prefix ~/.local/share/shadow-mcp-hub --no-audit --no-fund --save-exact @ni-c/mcp-hub@0.13.1
    cp scripts/patch-mcp-hub-compat.mjs ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
    node ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs

The patches are idempotent and preserve original package files in ~/.local/share/shadow-mcp-hub/patch-originals/:

1. Bind the optional HTTP OAuth/admin listener to 127.0.0.1 by default.
2. Pass DATA_PATH into the stdio entrypoint so it can reuse the OAuth credentials authorized by the HTTP hub.
3. Skip the periodic ping probe for Runcrate 1.5.1. It accepts MCP initialize/tools calls but responds Method not found: ping; the hub otherwise tears down a healthy connection repeatedly.

Install the wrappers:

    install -m 700 scripts/shadow-mcp-hub.sh ~/.local/bin/shadow-mcp-hub
    install -m 700 scripts/shadow-mcp-admin.sh ~/.local/bin/shadow-mcp-admin

Install/update the example config only when no real local config exists:

    mkdir -p ~/.config/shadow/mcp-hub/data
    chmod 700 ~/.config/shadow/mcp-hub ~/.config/shadow/mcp-hub/data
    cp config/mcp-hub.example.json ~/.config/shadow/mcp-hub/mcp.json
    chmod 600 ~/.config/shadow/mcp-hub/mcp.json

Do not overwrite ~/.config/shadow/mcp-hub/data/state.json: it holds the hub's OAuth state, client registrations and upstream tokens. Keep the directory private (mode 700).

## Configure Claude Code

    claude mcp add --scope user shadow ~/.local/bin/shadow-mcp-hub stdio

Then check:

    claude mcp list
    claude mcp get shadow

For a single active server, disable the separate GitHub connector in each project through the /mcp panel. Keep its user config entry until the wrapper is moved to another approved GitHub credential source. Remove the old separate Runcrate and temporary hub-login entries only after the shadow MCP reports connected and both upstreams pass forwarding tests.

## First-time / renewed Runcrate authorization

The HTTP listener is needed only to complete browser OAuth. It binds to loopback by default:

    ~/.local/bin/shadow-mcp-hub http

In another terminal:

    ~/.local/bin/shadow-mcp-admin upstream login runcrate --no-wait

Open the printed authorization URL in the same browser profile that signed into the local hub. After the Runcrate success page appears, it may try to send the callback in a cross-site iframe; if the hub reports an invalid/missing callback, open the callback URL as a top-level browser navigation so the local SameSite=Lax session cookie is included.

Check:

    ~/.local/bin/shadow-mcp-admin upstream status runcrate

The authorization completed on 2026-11-23. Runcrate supplied an access token expiring 2027-02-21 but no refresh token. Reauthorize before that expiry; automatic refresh is not available with the current provider response. The access token is stored only in the hub's private data/state.json.

## Verified forwarding

- GitHub search_repositories found Ninja7z/shadow through call_tool.
- Runcrate list_gpu_types returned 162 entries through call_tool.
- Final upstream inventory: GitHub 46 tools, Runcrate 60 tools.
- The Claude Code MCP list shows shadow connected and the separate GitHub helper disabled in the active Shadow project.

## Security boundaries

- The HTTP listener is loopback-only; do not expose port 7690 to the LAN or Internet.
- The GitHub credential is read at process start from the existing private Claude Code MCP config and passed through the process environment; it is never printed by the launcher.
- The hub config contains only an environment-variable reference for the GitHub authorization header.
- bootstrap.env, mcp.json, and data/state.json are local-only and must never be committed.
- Do not commit .claude.json, token backups, OAuth state, access tokens, refresh tokens, or generated runtime files.
