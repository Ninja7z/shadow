# Terminal installation (npm)

Shadow is distributed as an npm package with an interactive terminal installer. It prepares the gateway and guides the entire setup in the terminal. The optional local web interface is a future project and is not part of this installation.

## Requirements

- Node.js 20.12+ and npm (required to run npx).
- Internet access while uv, Python and gateway dependencies are installed.
- Linux, macOS or Windows on x64/ARM64.

Python and uv do not need to be installed in advance. The installer provisions uv and Python 3.12 in the user's space when needed. Ollama is optional; the installer detects it and asks before downloading a large model.

## First installation

```bash
npx shadow-gateway
```

The assistant:

1. Detects the operating system, architecture and existing installation.
2. Installs uv in the Shadow directory when missing.
3. Provisions Python 3.12 with uv when missing.
4. Creates a private virtual environment and installs LiteLLM and gateway dependencies.
5. Generates the local master key and starter configuration.
6. Asks whether you want Ollama, remote providers or both.
7. Lets you configure catalog providers and custom endpoints.
8. Validates the configuration and shows how to start the gateway.
9. Offers to install the permanent global shadow command through npm.
10. Shows the GitHub star and feedback links.

Provider keys are requested through hidden prompts and saved only in the private `.env` file.

## After installation

If you accepted the global CLI install:

```bash
shadow start
shadow status
shadow doctor
shadow provider add
shadow provider list
shadow provider refresh
shadow clients
shadow update
```

To run without a global installation:

```bash
npx shadow-gateway start
npx shadow-gateway status
npx shadow-gateway doctor
npx shadow-gateway provider add
```

`start` keeps the gateway in the foreground. Press Ctrl+C to stop it.

## Where files live

By default, the runtime and installation data live in `~/.shadow` (also on Windows, under the user's home directory). Set `SHADOW_HOME` before launching the installer to choose another location.

Package updates synchronize only Shadow-managed files. The installer preserves `.env`, `.venv`, `config/shadow.yaml` and `config/providers.local.yaml`, including your credentials and personal choices.

## Ollama and local models

Ollama is optional, not a gateway requirement. If it is missing, the assistant shows where to get it. If it is installed without models, the assistant may offer to download `llama3.2:3b`; the transfer starts only after explicit confirmation.

## Diagnostics

```bash
shadow doctor
shadow status
```

- `doctor` checks local runtime files and core dependencies.
- `status` queries the health endpoint and local model catalog.
- `provider add` registers an OpenAI-compatible or Anthropic Messages custom API.
- `provider refresh` regenerates the gateway configuration.

## Security

- The master key is generated locally and never printed in the terminal.
- Upstream credentials stay in the private `.env` file with restricted permissions.
- The gateway binds to `127.0.0.1` by default.
- Do not share the administrative master key with untrusted clients or machines.
- Remote providers remain subject to the quotas, terms, prices and privacy policies of your own accounts.

The product is terminal-only at this stage. The `web-shadow` command and local web interface will be introduced only after the CLI and gateway are complete and stable.
