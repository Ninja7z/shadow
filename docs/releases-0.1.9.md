# Shadow Gateway 0.1.9

## Community command update notifications

- Pass the package version from the dedicated `shadow-repository` and `shadow-feedback` npm executables into the shared CLI runtime.
- Both commands now show the same cached npm update notice as `shadow-gateway` before opening their destinations.
- Add an end-to-end test that simulates a newer release, checks the warning, and verifies both GitHub destinations without launching a real browser.

## Validation

- Node CLI tests
- Python unit tests
- Windows terminal CI
- npm package dry run and production dependency audit
