# Security policy

Shadow is a gateway for several upstream AI providers. Its provider credentials are high-value secrets.

## Never commit

- `.env`, `*.env`, `providers.env`, `extra-providers.env`.
- Provider API keys, Cloudflare account tokens, LiteLLM master keys, OAuth tokens or service-account JSON.
- Runtime configuration backups, logs, SQLite databases, request traces, model blobs, caches or local virtual environments.
- Screenshots or diagnostic output that may contain authorization headers or token values.

## Local secret handling

- Keep provider credentials outside the repository, preferably in a local secret manager or a file with permissions `600`.
- Keep `.env` private. `.env.example` may contain variable names and blank placeholders only.
- The gateway should receive upstream credentials through environment-variable references such as `os.environ/REQUESTY_API_KEY`.
- Coding clients should authenticate to the local Shadow gateway with the local master key. Do not give upstream provider keys directly to clients unless intentionally bypassing Shadow.

## Before every commit

1. Run `git status --short`.
2. Review the staged file list and `git diff --cached`.
3. Search staged text for common token prefixes and `Authorization: Bearer`.
4. Confirm that secret files, `.env`, provider env files, logs and backups are ignored.

## If a credential is committed

Revoke or rotate it immediately in the provider dashboard, remove it from the repository history, replace it in the local secret store, and validate the new credential. Deleting the file in a later commit does not remove it from Git history.
