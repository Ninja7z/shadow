# Shadow MCP Hub

The Shadow MCP Hub aggregates optional upstream MCP servers behind one local stdio connection. It is separate from the model gateway: the LiteLLM API routes model requests, while the MCP Hub routes tool discovery and tool calls.

The example configuration is config/mcp-hub.example.json. It contains endpoint definitions and environment-variable references only; each person must supply their own credentials and authorize their own OAuth accounts.

## Components and configuration

- Runtime: ~/.local/share/shadow-mcp-hub
- Private configuration: ~/.config/shadow/mcp-hub/mcp.json
- OAuth and server state: ~/.config/shadow/mcp-hub/data
- Optional GitHub token file: ~/.config/shadow/mcp-hub/github.token
- Optional provider credentials: ~/.config/shadow/extra-providers.env

Do not commit any files from these private directories.

## Install or repair

The tested package version is pinned to @ni-c/mcp-hub@0.13.1. Install it into the private runtime directory and apply the repository compatibility patch:

~~~bash
mkdir -p ~/.local/share/shadow-mcp-hub
npm install --prefix ~/.local/share/shadow-mcp-hub --no-audit --no-fund --save-exact @ni-c/mcp-hub@0.13.1
cp scripts/patch-mcp-hub-compat.mjs ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
node ~/.local/share/shadow-mcp-hub/patch-mcp-hub-compat.mjs
~~~

The patch is idempotent and preserves original package files in the private runtime directory. It binds the optional HTTP admin/OAuth listener to loopback, passes DATA_PATH to the stdio entrypoint, and disables a periodic Runcrate ping probe that is unsupported by the pinned upstream version.

Install the wrappers:

~~~bash
install -m 700 scripts/shadow-mcp-hub.sh ~/.local/bin/shadow-mcp-hub
install -m 700 scripts/shadow-mcp-admin.sh ~/.local/bin/shadow-mcp-admin
~~~

Create the private configuration only if it does not already exist:

~~~bash
mkdir -p ~/.config/shadow/mcp-hub/data
chmod 700 ~/.config/shadow/mcp-hub ~/.config/shadow/mcp-hub/data
cp config/mcp-hub.example.json ~/.config/shadow/mcp-hub/mcp.json
chmod 600 ~/.config/shadow/mcp-hub/mcp.json
~~~

Do not overwrite data/state.json. It may contain OAuth state, client registrations and upstream tokens.

## Configure upstream credentials

Enable only the upstream servers you intend to use in your private mcp.json. The example configuration includes GitHub, Runcrate, Mistral, Hugging Face and Cloudflare endpoints.

- GitHub: when the GitHub entry is enabled, place its bearer value in ~/.config/shadow/mcp-hub/github.token and set mode 600. The wrapper loads it as SHADOW_GITHUB_AUTH. If GitHub is not enabled in mcp.json, the token file is not required.
- Mistral, Hugging Face and Cloudflare API: add your own values to ~/.config/shadow/extra-providers.env. The wrapper exports only MISTRAL_API_KEY, HF_TOKEN and CLOUDFLARE_API_TOKEN to the Hub process.
- Runcrate: authorize through its OAuth flow. OAuth state and tokens are stored under the private data directory.
- Cloudflare Docs: the example endpoint is public and does not require a credential.

Keep the credential directory private. Do not paste tokens into the MCP JSON file or commit your local config.

## Connect MCP clients

The Hub runs as one local stdio server. Add it to each MCP-capable client using its own configuration mechanism.

Claude Code:

~~~bash
claude mcp add --scope user shadow ~/.local/bin/shadow-mcp-hub stdio
claude mcp list
~~~

OpenCode:

~~~bash
opencode mcp add --global shadow -- ~/.local/bin/shadow-mcp-hub stdio
opencode mcp list
~~~

Cline CLI:

~~~bash
cline mcp add shadow --yes -- ~/.local/bin/shadow-mcp-hub stdio
cline config mcp --json
~~~

Each client maintains its own model-provider settings. The MCP Hub shares tools and upstream authorization; it does not merge model configurations.

## First-time or renewed Runcrate authorization

The HTTP listener is needed only to complete browser OAuth. It binds to loopback:

~~~bash
~/.local/bin/shadow-mcp-hub http
~~~

In another terminal:

~~~bash
~/.local/bin/shadow-mcp-admin upstream login runcrate --no-wait
~~~

Open the printed authorization URL and complete the provider's consent flow. Check the result:

~~~bash
~/.local/bin/shadow-mcp-admin upstream status runcrate
~~~

If the provider does not issue a refresh token, authorization may need to be repeated when its access token expires. Follow the current provider response and dashboard; do not assume automatic renewal.

Stop the temporary HTTP listener after authorization. Normal stdio operation does not require the admin panel.

## Security boundaries

- The HTTP listener is loopback-only by default. Do not expose its port to the LAN or internet.
- Keep the private config and data directories at mode 700; credential/state files should be mode 600.
- The wrappers load only selected credential variables, not every variable from the model gateway's .env.
- Never commit github.token, extra-providers.env, bootstrap.env, mcp.json, data/state.json, OAuth backups or client auth stores.
- Review upstream tool permissions and annotations before invoking write or destructive operations.
- Upstream services receive the requests forwarded to them. Review their privacy, retention and billing terms.
