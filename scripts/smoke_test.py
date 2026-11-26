#!/usr/bin/env python3
"""Generic health and optional inference checks for any Shadow installation."""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def _read_env_file(path: Path) -> dict[str, str]:
    """Read simple KEY=VALUE files without evaluating shell code."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key or not key.replace("_", "a").isalnum() or (not key[0].isalpha() and key[0] != "_"):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def load_environment(env_file: Path) -> None:
    """Load the clone's private .env; values already exported by the user win."""
    for key, value in _read_env_file(env_file).items():
        os.environ.setdefault(key, value)


def http_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 12,
) -> tuple[int, dict[str, Any] | None]:
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    body = None
    if payload is not None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(3_000_000)
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                parsed = None
            return response.status, parsed if isinstance(parsed, dict) else None
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(3_000_000)
            parsed = json.loads(raw)
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            parsed = None
        return exc.code, parsed if isinstance(parsed, dict) else None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, TimeoutError):
            return -1, None
        return 0, None
    except TimeoutError:
        return -1, None
    except OSError:
        return 0, None


def status_text(code: int) -> str:
    if code == -1:
        return "timeout"
    return str(code) if code else "unreachable"


class Reporter:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.skipped = 0

    def ok(self, name: str, detail: str = "") -> None:
        self.passed += 1
        print(f"PASS  {name}" + (f" | {detail}" if detail else ""))

    def fail(self, name: str, detail: str = "") -> None:
        self.failed += 1
        print(f"FAIL  {name}" + (f" | {detail}" if detail else ""))

    def skip(self, name: str, detail: str = "") -> None:
        self.skipped += 1
        print(f"SKIP  {name}" + (f" | {detail}" if detail else ""))

    def summary(self) -> int:
        print(f"\nSUMMARY  passed={self.passed} failed={self.failed} skipped={self.skipped}")
        return 1 if self.failed else 0


def _bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def configured_aliases(config_file: Path) -> list[str]:
    """Read model aliases from Shadow's local config when LiteLLM discovery is unavailable."""
    try:
        import yaml

        config = yaml.safe_load(config_file.read_text(encoding="utf-8")) or {}
    except Exception:
        return []
    models = config.get("model_list", []) if isinstance(config, dict) else []
    if not isinstance(models, list):
        return []
    return sorted({
        item["model_name"]
        for item in models
        if isinstance(item, dict) and isinstance(item.get("model_name"), str) and item["model_name"]
    })


def safe_checks(args: argparse.Namespace, report: Reporter) -> tuple[str, list[str]]:
    base = args.base_url.rstrip("/")
    master_key = os.environ.get("LITELLM_MASTER_KEY", "")
    if not master_key:
        report.fail("local gateway key", "LITELLM_MASTER_KEY missing from .env or process environment")
        return base, []

    code, _ = http_json(f"{base}/health/liveliness", timeout=args.timeout)
    if code == 200:
        report.ok("gateway liveliness", "HTTP 200")
    else:
        report.fail("gateway liveliness", f"HTTP {status_text(code)}")
        return base, []

    code, data = http_json(
        f"{base}/v1/models",
        headers=_bearer(master_key),
        timeout=args.timeout,
    )
    if code != 200 or not data:
        error = data.get("error", {}) if isinstance(data, dict) else {}
        if code == 400 and isinstance(error, dict) and error.get("type") == "no_db_connection":
            config_file = getattr(args, "config_file", args.env_file.parent / "config" / "shadow.yaml")
            aliases = configured_aliases(config_file)
            if aliases:
                report.ok("local model configuration", f"{len(aliases)} aliases loaded; LiteLLM API discovery needs a database")
                for required in ("shadow-local", "shadow-auto"):
                    if required in aliases:
                        report.ok(f"required alias {required}")
                    else:
                        report.fail(f"required alias {required}", "missing from local config")
                return base, aliases
        report.fail("gateway model catalog", f"HTTP {status_text(code)}")
        return base, []

    aliases = sorted({
        str(item.get("id"))
        for item in data.get("data", [])
        if isinstance(item, dict) and item.get("id")
    })
    if not aliases:
        report.fail("gateway model catalog", "no model aliases were returned")
        return base, []

    report.ok("gateway model catalog", f"{len(aliases)} aliases available")
    for required in ("shadow-local", "shadow-auto"):
        if required in aliases:
            report.ok(f"required alias {required}")
        else:
            report.fail(f"required alias {required}", "missing from /v1/models")
    return base, aliases


def _chat_tool_call(
    base: str, master_key: str, alias: str, status: str, timeout: int
) -> tuple[bool, str]:
    payload = {
        "model": alias,
        "messages": [{
            "role": "user",
            "content": f"Call status_check now with status exactly {status}. Do not answer in prose.",
        }],
        "tools": [{
            "type": "function",
            "function": {
                "name": "status_check",
                "description": "Record a smoke-test status",
                "parameters": {
                    "type": "object",
                    "properties": {"status": {"type": "string"}},
                    "required": ["status"],
                    "additionalProperties": False,
                },
            },
        }],
        "tool_choice": "auto",
        "max_tokens": 192,
        "stream": False,
    }
    code, data = http_json(
        f"{base}/v1/chat/completions",
        method="POST",
        payload=payload,
        headers=_bearer(master_key),
        timeout=timeout,
    )
    if code != 200 or not data:
        return False, f"HTTP {status_text(code)}"
    choices = data.get("choices") or []
    message = (choices[0].get("message") or {}) if choices else {}
    valid = False
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        if function.get("name") != "status_check":
            continue
        try:
            arguments = json.loads(function.get("arguments") or "{}")
        except json.JSONDecodeError:
            continue
        if arguments.get("status") == status:
            valid = True
    detail = f"model={data.get('model') or alias}"
    cost = (data.get("usage") or {}).get("cost")
    if cost is not None:
        detail += f"; cost={cost}"
    return valid, detail if valid else detail + "; tool_call missing/invalid"


def _anthropic_tool_call(
    base: str, master_key: str, alias: str, status: str, timeout: int
) -> tuple[bool, str]:
    payload = {
        "model": alias,
        "max_tokens": 128,
        "messages": [{
            "role": "user",
            "content": f"Call status_check now with status exactly {status}. Do not answer in prose.",
        }],
        "tools": [{
            "name": "status_check",
            "description": "Record a smoke-test status",
            "input_schema": {
                "type": "object",
                "properties": {"status": {"type": "string"}},
                "required": ["status"],
            },
        }],
        "tool_choice": {"type": "tool", "name": "status_check"},
    }
    headers = _bearer(master_key)
    headers["anthropic-version"] = "2023-06-01"
    code, data = http_json(
        f"{base}/v1/messages",
        method="POST",
        payload=payload,
        headers=headers,
        timeout=timeout,
    )
    if code != 200 or not data:
        return False, f"HTTP {status_text(code)}"
    valid = any(
        block.get("type") == "tool_use"
        and block.get("name") == "status_check"
        and (block.get("input") or {}).get("status") == status
        for block in data.get("content") or []
    )
    detail = f"stop={data.get('stop_reason', 'unknown')}"
    cost = (data.get("usage") or {}).get("cost")
    if cost is not None:
        detail += f"; cost={cost}"
    return valid, detail if valid else detail + "; tool_use missing/invalid"


def inference_checks(
    args: argparse.Namespace, base: str, aliases: list[str], report: Reporter
) -> None:
    master_key = os.environ.get("LITELLM_MASTER_KEY", "")
    if not master_key:
        report.fail("inference checks", "LITELLM_MASTER_KEY missing")
        return

    if args.tool_calls:
        alias = args.model
        if alias not in aliases:
            report.fail("Chat Completions tool call", f"alias {alias!r} is not in /v1/models")
        else:
            ok, detail = _chat_tool_call(
                base, master_key, alias, "SHADOW_SMOKE_CHAT", args.inference_timeout
            )
            (report.ok if ok else report.fail)("Chat Completions tool call", detail)

    if args.anthropic_tools:
        alias = args.anthropic_model
        if alias not in aliases:
            report.fail("Anthropic Messages tool_use", f"alias {alias!r} is not in /v1/models")
        else:
            ok, detail = _anthropic_tool_call(
                base, master_key, alias, "SHADOW_SMOKE_ANTHROPIC", args.inference_timeout
            )
            (report.ok if ok else report.fail)("Anthropic Messages tool_use", detail)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check any Shadow installation without printing credentials."
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=ROOT / ".env",
        help="Private env file created by Shadow setup (default: repository .env)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("SHADOW_BASE_URL", "http://127.0.0.1:4000"),
        help="Local Shadow LiteLLM URL",
    )
    parser.add_argument("--timeout", type=int, default=12, help="Timeout for health/catalog GET checks")
    parser.add_argument(
        "--inference-timeout",
        type=int,
        default=150,
        help="Timeout for optional inference/tool-call checks (allows a cold local-model load)",
    )
    parser.add_argument(
        "--model",
        default="shadow-auto",
        help="Alias to test through OpenAI Chat Completions",
    )
    parser.add_argument(
        "--anthropic-model",
        default="shadow-auto",
        help="Alias to test through Anthropic Messages",
    )
    parser.add_argument(
        "--tool-calls",
        action="store_true",
        help="Send one structured tool-call inference request through --model",
    )
    parser.add_argument(
        "--anthropic-tools",
        action="store_true",
        help="Send one Anthropic Messages tool_use inference request through --anthropic-model",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_environment(args.env_file)
    report = Reporter()
    print("Shadow smoke test")
    print(f"Gateway: {args.base_url}")
    print(
        "Mode: "
        + ("Chat Completions tool call" if args.tool_calls else "safe GET checks")
        + (" + Anthropic Messages tool_use" if args.anthropic_tools else "")
    )
    base, aliases = safe_checks(args, report)
    if args.tool_calls or args.anthropic_tools:
        inference_checks(args, base, aliases, report)
    return report.summary()


if __name__ == "__main__":
    raise SystemExit(main())
