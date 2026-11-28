# Shadow roadmap

The release goal is a dependable, terminal-first gateway before adding a web interface. The web experience is the final planned delivery in the 1.0.0 milestone, not a reason to rush the reliability work. The current published baseline is `shadow-gateway@0.1.9`; the planned path below gives the project room to mature through several `0.x` releases before the stable web launch.

## Before 1.0.0

1. **Foundation:** reproducible installation, pinned dependencies, configuration and CLI onboarding.
2. **Reliability:** interrupted-install recovery, clean managed-runtime rebuilds, update rollback, health checks and safe diagnostics.
3. **Security:** credential handling, filesystem permissions, process boundaries and supply-chain controls.
4. **Compatibility:** Linux, Windows and macOS validation, supported Node/Python versions, providers and client integrations.
5. **Web interface:** optional local interface started by `web-shadow`, with the terminal remaining fully supported.

## Planned version path

These are release targets, not promises or already-published versions. Version numbers track product maturity; they do not map one-to-one to phase numbers. Keep the Gateway terminal-first and do not bundle skills, MCP servers, agent tools, or unrelated runtime features into it.

| Version target | Purpose | Relationship to the roadmap |
| --- | --- | --- |
| `0.1.x` | Existing foundation and current published line. | Current baseline; `0.1.9` is the latest verified package version. |
| `0.2.0` | First compatibility milestone: close the current Phase 4 baseline with repeatable smoke tests, documented client/protocol support, clean-package validation, green Linux/Windows/macOS CI, the MIT license for Gateway code, and a hash-locked public LiteLLM proxy runtime without the proprietary Enterprise package. | Commercial use of Shadow Gateway code is permitted by MIT; every connected provider keeps its own separate terms and permissions. No web interface. This is the next planned release target. |
| `0.3.x` | Broaden provider/client combinations and close the highest-value cross-platform E2E gaps. | Continue compatibility improvements without expanding the Gateway beyond its core role. |
| `0.4.x` | Consolidate reliability, recovery, rollback, diagnostics, security and supply-chain hardening against the release checklist. | Finish remaining Phase 2 and Phase 3 hardening work. |
| `0.5.x` | Stabilize the terminal-first experience, installation/update paths, documentation, package contents and full regression coverage. | Pre-1.0 release-readiness line; prepare the Phase 5 scope without shipping a premature web UI. |
| `1.0.0` | First stable release that delivers the optional local `web-shadow` interface while preserving full terminal functionality. | Phase 5 delivery and stable Gateway milestone. |

The `0.2.0` gate is evidence-based: the supported compatibility baseline must be reproducible, documented, and pass the agreed automated and local checks before the release is considered ready. Subsequent `0.x` milestones may be adjusted when testing exposes real gaps, but the stable web launch remains targeted at `1.0.0`. Publishing any npm version still requires the user's explicit approval in that moment.

## 1.x after the 1.0.0 launch

After the complete 1.0.0 release, work shifts to maintenance and incremental evolution: bug and security fixes, reliability and performance improvements, compatibility updates, new provider/client integrations, and improvements to both terminal and web experiences. No major feature phase is allowed to compromise the stability of existing installations.

## Installation recovery contract

- A failed or interrupted managed-runtime installation is retried from a clean, hash-verified dependency environment.
- The reset boundary is limited to Shadow-owned runtime artifacts.
- `.env`, local configuration, user data, Ollama installations/models, and shared caches are never part of automatic cleanup.
- The CLI records an installation-state marker so a later invocation can recognize an interrupted operation.
- Manual `reinstall` requires confirmation and follows the same narrow cleanup boundary.

## Community and growth

The community goal is 1,000 GitHub stars during the five months beginning on the public release date of `shadow-gateway@0.2.0`. This is an ambitious target, not a guarantee. The launch baseline and ethical growth plan are documented in [`docs/project/GROWTH-PLAN-1000-STARS.md`](docs/project/GROWTH-PLAN-1000-STARS.md). The project handoff for future development sessions is [`docs/project/HANDOFF-2026-11-26.md`](docs/project/HANDOFF-2026-11-26.md).
