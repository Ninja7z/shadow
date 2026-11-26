# Shadow roadmap

The release goal is a dependable, terminal-first gateway before adding a web interface. The web experience is the final planned delivery in the 1.0.0 milestone, not a reason to rush the reliability work.

## Before 1.0.0

1. **Foundation:** reproducible installation, pinned dependencies, configuration and CLI onboarding.
2. **Reliability:** interrupted-install recovery, clean managed-runtime rebuilds, update rollback, health checks and safe diagnostics.
3. **Security:** credential handling, filesystem permissions, process boundaries and supply-chain controls.
4. **Compatibility:** Linux, Windows and macOS validation, supported Node/Python versions, providers and client integrations.
5. **Web interface:** optional local interface started by `web-shadow`, with the terminal remaining fully supported.

## 1.x after the 1.0.0 launch

After the complete 1.0.0 release, work shifts to maintenance and incremental evolution: bug and security fixes, reliability and performance improvements, compatibility updates, new provider/client integrations, and improvements to both terminal and web experiences. No major feature phase is allowed to compromise the stability of existing installations.

## Installation recovery contract

- A failed or interrupted managed-runtime installation is retried from a clean, hash-verified dependency environment.
- The reset boundary is limited to Shadow-owned runtime artifacts.
- `.env`, local configuration, user data, Ollama installations/models, and shared caches are never part of automatic cleanup.
- The CLI records an installation-state marker so a later invocation can recognize an interrupted operation.
- Manual `reinstall` requires confirmation and follows the same narrow cleanup boundary.
