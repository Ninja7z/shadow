# Releasing Shadow

Shadow releases use npm Trusted Publishing (GitHub Actions OIDC) and npm staged publishing. The workflow never publishes directly or changes dist-tags. Python runtime dependencies are installed from the universal, hash-verified `requirements.lock`; update that lock only after exercising the supported platforms.

## Release checklist

1. Update `version` in `package.json` and `package-lock.json` together.
2. When changing Python dependencies, update `requirements.txt` and `requirements.constraints.txt`, then regenerate the universal hash lock with `uv pip compile requirements.txt --constraint requirements.constraints.txt --universal --python-version 3.12 --generate-hashes --output-file requirements.lock`.
3. Verify the lock without changing the current environment: `uv pip install --python <shadow-python> --dry-run --require-hashes -r requirements.lock`.
4. Run `npm test`, the Python unit suite, both configuration validators, the safe smoke test, and `npm pack --dry-run`.
5. Commit the release and push `main`.
6. Create and push the matching tag: `v<package-version>` (for example, `v0.1.1`).
7. GitHub Actions runs `.github/workflows/publish.yml`. It verifies that the tag matches `package.json`, runs both test suites, and calls `npm stage publish` with OIDC.
8. Review the staged package in npm, inspect its contents, and approve it with 2FA. The staged workflow does not have direct-publish or dist-tag permissions.
9. Verify the live version and `latest` dist-tag after approval.

## Trusted publisher configuration

- Publisher: GitHub Actions
- Owner: `Ninja7z`
- Repository: `shadow`
- Workflow filename: `publish.yml`
- Environment: empty
- Allowed actions: `npm stage publish` only
- Package publishing access: require 2FA and disallow bypass tokens

The first successful staged publish from this workflow validates the trusted publisher. Keep the trusted-publisher fields aligned with the workflow identity; npm treats them as immutable after creation.

## Safety notes

- Never add an npm write token to GitHub secrets for this workflow. OIDC is the authentication mechanism.
- Do not add `npm publish`, `npm dist-tag`, or `NODE_AUTH_TOKEN` to the workflow.
- Staging creates a review candidate only. A maintainer must approve it on npm with 2FA before it reaches the public registry.
- Never publish a release tag until the package version, lockfile, tests, and contents have been reviewed.
