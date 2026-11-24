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
- Authenticated model catalog access.
- Presence of the standard shadow-local and shadow-auto aliases.

Use another gateway or env file when needed:

~~~bash
python scripts/smoke_test.py --base-url http://127.0.0.1:4000 --env-file .env
~~~

## Optional Chat Completions tool-call check

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto
~~~

This sends one short structured status_check tool request through the selected alias. It is a real inference request and may consume provider quota or incur charges. Choose an alias known to support tool calling.

## Optional Anthropic Messages tool-use check

~~~bash
python scripts/smoke_test.py --anthropic-tools --anthropic-model shadow-auto
~~~

This sends one Anthropic Messages tool_use request through the selected alias. The alias must be available and its upstream route must support the requested capability.

Use a longer inference timeout for slow providers:

~~~bash
python scripts/smoke_test.py --tool-calls --model shadow-auto --inference-timeout 60
~~~

Do not run inference checks in a tight monitoring loop.

## Unit tests

~~~bash
python -m unittest discover -s tests -v
~~~

The suite uses local fixtures and mocked HTTP responses. It does not contact upstream providers or spend inference quota.
