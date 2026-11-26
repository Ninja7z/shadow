# Shadow Gateway 0.1.8

## CLI community shortcuts

- Add dedicated `shadow-repository` and `shadow-feedback` npm executables.
- Add both commands to `shadow-gateway --help` and support `shadow-gateway repository` / `shadow-gateway feedback` aliases.
- Show the star and feedback commands at the end of first-time terminal setup, with the correct global or npx invocation.

## Update notifications

- Check the npm registry for a newer CLI release when the CLI starts.
- Cache successful checks for 24 hours and failed/offline checks for one hour.
- Use a short network timeout, fail silently when offline, and never auto-update or install anything.
- Show the manual update command when a newer version is available.

## Web UI readiness

The registry/version-check logic is isolated in the CLI layer. The future `web-shadow` interface should reuse the same release-notification behavior through a small backend endpoint rather than performing registry requests from the browser.

## Validation

- Node CLI tests
- Python core tests
- npm package dry run
- Production dependency audit
