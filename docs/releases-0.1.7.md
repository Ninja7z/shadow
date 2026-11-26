# Shadow Gateway 0.1.7

## Reliability and diagnostics

- `shadow-gateway status` now falls back to the local model configuration when LiteLLM returns `400 no_db_connection` for authenticated model discovery in a DB-less installation.
- The status output explains that aliases can be entered manually in clients and explicitly keeps gateway authentication enabled.
- The smoke test recognizes LiteLLM's structured `no_db_connection` error, validates local aliases, and keeps the standard `shadow-local` and `shadow-auto` checks.
- HTTP error JSON is parsed without printing provider credentials or response bodies.

## Compatibility note

Some LiteLLM runtime builds require a database for authenticated `/v1/models` discovery when a master key is configured. Shadow remains loopback-bound and authenticated; this release improves diagnostics and local alias fallback rather than weakening authentication or silently provisioning a database.

## Validation

- Node CLI tests
- Python unit tests
- Example configuration validation
- Live safe-mode smoke test against the maintainer's local gateway
