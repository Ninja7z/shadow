# Shadow smoke tests

scripts/smoke_test.py checks the local gateway and the currently approved provider routes without printing credentials.

## Requirements

- Python 3.10+
- A running Shadow/LiteLLM gateway, normally at http://127.0.0.1:4000
- Protected local files:
  - ~/.config/shadow/providers.env
  - ~/.config/shadow/extra-providers.env

The script reads simple KEY=VALUE and export KEY=VALUE entries. Values already exported in the process take precedence over file values. It does not evaluate shell code.

## Safe mode: GET checks only

    python3 scripts/smoke_test.py

This is the default and recommended frequent check. It performs no inference. It checks:

- Local gateway liveliness and model aliases.
- Requesty model catalog and expected Nemotron ID.
- Gonka authentication and model catalog.
- BazaarLink key type/free-tier metadata and expected free model ID.
- Cloudflare account token status and Workers AI model catalog.

It does not print keys, authorization headers, response bodies, or credential fingerprints.

Optional settings:

    python3 scripts/smoke_test.py --base-url http://127.0.0.1:4000 --timeout 15

## Structured tool-call checks

    python3 scripts/smoke_test.py --tool-calls

This sends one short structured status_check tool request through each Chat Completions alias:

- Requesty
- Cloudflare Workers AI
- Gonka
- BazaarLink

These are real inference requests and may consume free quota. Run only when needed. The tool-call timeout is separate from the safe GET timeout:

    python3 scripts/smoke_test.py --tool-calls --inference-timeout 40

## Anthropic Messages tool-use checks

    python3 scripts/smoke_test.py --anthropic-tools

This sends one Anthropic tool_use request through the Requesty and Gonka aliases. Select one provider to avoid unnecessary calls:

    python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider requesty
    python3 scripts/smoke_test.py --anthropic-tools --anthropic-provider gonka --inference-timeout 40

The Anthropic-only option does not run the four Chat Completions tests. This is covered by a unit test.

## Unit tests

The parser and response-shape tests use only the Python standard library:

    python3 -m unittest discover -s tests -v

The current suite covers environment-file parsing, OpenAI-compatible tool_calls, Anthropic tool_use, and ensures that Anthropic-only mode does not issue Chat Completions inference calls.

## Quota notes

- Safe mode uses GET requests only.
- Requesty free tier advertises a daily request allowance; check its current dashboard.
- Gonka free access is rate-limited (the verified account returned maxRpm=6).
- BazaarLink has a small daily weighted quota.
- Cloudflare Workers AI consumes Neurons.
- Never run --tool-calls or --anthropic-tools in a tight monitoring loop.

The script is a diagnostic aid, not a billing guarantee. Provider model IDs, quotas and free-tier conditions may change.
