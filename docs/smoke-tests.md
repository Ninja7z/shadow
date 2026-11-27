# Shadow smoke tests

scripts/smoke_test.py is provider-agnostic. It checks the local gateway and, only when requested, sends one small tool-call request through a model alias chosen by the installation owner.

## Requirements

- Python 3.11+
- A running Shadow/LiteLLM gateway, normally at http://127.0.0.1:4000
- The private .env created by python scripts/shadow.py setup

The script reads simple KEY=VALUE and export KEY=VALUE entries from the selected env file. Values already exported in the process take precedence. It does not evaluate shell code and never prints credentials or response bodies.

## Safe mode: GET checks only

~~~bash
python scripts/smoke_test.py
~~~

This is the default and recommended frequent check. It performs no inference. It checks:

- Gateway liveliness.
- Authenticated model catalog access when supported by the installed LiteLLM build.
- Presence of the standard shadow-local and shadow-auto aliases.

If LiteLLM returns `400 no_db_connection` for the catalog in a DB-less, master-key-protected installation, the script falls back to the local `config/shadow.yaml` and validates its aliases. This is a discovery limitation in that LiteLLM runtime, not a reason to disable gateway authentication. Clients can use the aliases shown by `shadow-gateway status` manually.

Use another gateway or env file when needed:

~~~bash
python scripts/smoke_test.py --base-url http://127.0.0.1:4000 --env-file .env
~~~

The setup provider catalog is ordered OpenAI first, Anthropic second, then other providers. This controls the order shown by the setup wizard only; it does not make paid providers automatic fallbacks or change routing priority.

## Optional Chat Completions tool-call check

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto
~~~

This sends one short structured status_check tool request through the selected alias. It is a real inference request and may consume provider quota or incur charges. Choose an alias known to support tool calling.

## Optional OpenAI Responses API function-call check

~~~bash
python scripts/smoke_test.py --responses-tools --responses-model shadow-auto
~~~

This exercises the native /v1/responses contract (input, Responses function tools, function_call output items, and max_output_tokens). It is separate from Chat Completions and is not translated into a messages payload. The endpoint is available in the pinned LiteLLM version. This is a real inference request and may consume provider quota or incur charges.

## Optional Anthropic Messages tool-use check

~~~bash
python scripts/smoke_test.py --anthropic-tools --anthropic-model shadow-auto
~~~

This sends one Anthropic Messages tool_use request through the selected alias using the native x-api-key and anthropic-version headers expected by Anthropic SDK clients. The alias must be available and its upstream route must support the requested capability. This is a real inference request and may consume provider quota or incur charges.

Use a longer inference timeout for slow providers:

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto --inference-timeout 60
python scripts/smoke_test.py --responses-tools --responses-model shadow-auto --inference-timeout 60
python scripts/smoke_test.py --anthropic-tools --anthropic-model shadow-auto --inference-timeout 60
~~~

Do not run inference checks in a tight monitoring loop.

## Unit tests

~~~bash
python -m unittest discover -s tests -v
~~~

The suite uses local fixtures and mocked HTTP responses. It does not contact upstream providers or spend inference quota.
