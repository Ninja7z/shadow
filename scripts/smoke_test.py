#!/usr/bin/env python3
"""Safe health/auth/model checks for the local Shadow multi-provider gateway.

Default mode performs only health, catalog, and key-status GET requests.
Pass --tool-calls to spend one small structured inference request per provider.
Pass --anthropic-tools to additionally test Requesty and Gonka Anthropic Messages.
Secrets are read locally and are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REQUESTY_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
GONKA_MODEL = "zai-org/GLM-5.3-Flash"
BAZAAR_MODEL = "nvidia/nemotron-3.5-lightning-free:free"
CLOUDFLARE_MODEL = "@cf/zai-org/glm-4.7-flash"

CHAT_ROUTES = [
    ("Requesty", "router-requesty-nemotron-free"),
    ("Cloudflare Workers AI", "router-cloudflare"),
    ("Gonka", "claude-code-gonka-glm53-free"),
    ("BazaarLink", "claude-code-bazaarlink-nemotron-free"),
]
ANTHROPIC_ROUTES = [
    ("Requesty Anthropic", "claude-code-requesty-nemotron-free"),
    ("Gonka Anthropic", "claude-code-gonka-glm53-anthropic"),
]


def _read_env_file(path: Path) -> dict[str, str]:
    """Read simple KEY=VALUE files without shell evaluation."""
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
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values


def load_environment(config_dir: Path) -> None:
    """Load protected Shadow env files; already-exported values win."""
    for filename in ("providers.env", "extra-providers.env"):
        for key, value in _read_env_file(config_dir / filename).items():
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
    request = urllib.request.Request(
        url, data=body, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(3_000_000)
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                parsed = None
            return response.status, parsed if isinstance(parsed, dict) else None
    except urllib.error.HTTPError as exc:
        # Never echo response bodies: upstream error payloads can contain sensitive metadata.
        return exc.code, None
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
        print(
            f"\nSUMMARY  passed={self.passed} failed={self.failed} skipped={self.skipped}"
        )
        return 1 if self.failed else 0


def _bearer(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def safe_checks(args: argparse.Namespace, report: Reporter) -> tuple[str, list[str]]:
    base = args.base_url.rstrip("/")
    local_key = os.environ.get("LITELLM_MASTER_KEY", "")
    if not local_key:
        report.fail("local gateway key", "LITELLM_MASTER_KEY missing in protected env")
        return base, []

    code, _ = http_json(f"{base}/health/liveliness", timeout=args.timeout)
    if code == 200:
        report.ok("gateway liveliness", f"HTTP {code}")
    else:
        report.fail("gateway liveliness", f"HTTP {status_text(code)}")
        return base, []

    code, model_data = http_json(
        f"{base}/v1/models",
        headers=_bearer(local_key),
        timeout=args.timeout,
    )
    if code != 200 or not model_data:
        report.fail("gateway model catalog", f"HTTP {status_text(code)}")
        return base, []
    aliases = {
        str(item.get("id"))
        for item in model_data.get("data", [])
        if isinstance(item, dict) and item.get("id")
    }
    required_aliases = {
        "router-requesty-nemotron-free",
        "claude-code-requesty-nemotron-free",
        "router-cloudflare",
        "claude-code-gonka-glm53-free",
        "claude-code-gonka-glm53-anthropic",
        "claude-code-bazaarlink-nemotron-free",
    }
    missing = sorted(required_aliases - aliases)
    if missing:
        report.fail("gateway route aliases", "missing: " + ", ".join(missing))
    else:
        report.ok("gateway route aliases", f"{len(aliases)} catalogued; all 6 required routes present")

    # Requesty model catalog and exact free model ID.
    requesty_key = os.environ.get("REQUESTY_API_KEY", "")
    if requesty_key:
        code, data = http_json(
            "https://router.requesty.ai/v1/models",
            headers=_bearer(requesty_key),
            timeout=args.timeout,
        )
        rows = data.get("data", []) if data else []
        present = any(
            isinstance(row, dict) and row.get("id") == REQUESTY_MODEL
            for row in rows
        )
        if code == 200 and present:
            report.ok("Requesty auth/catalog", f"HTTP 200; {len(rows)} model IDs; Nemotron present")
        elif code == 200:
            report.fail("Requesty model", "catalog returned HTTP 200 but expected free model ID is absent")
        else:
            report.fail("Requesty auth/catalog", f"HTTP {status_text(code)}")
    else:
        report.fail("Requesty auth/catalog", "REQUESTY_API_KEY missing")

    # Gonka exposes its auth test at the root, not under /v1.
    gonka_key = os.environ.get("GONKA_API_KEY", "")
    if gonka_key:
        code, data = http_json(
            "https://proxy.gonkabroker.com/test-auth",
            headers=_bearer(gonka_key),
            timeout=args.timeout,
        )
        settings = (data or {}).get("settings") or {}
        if code == 200 and (data or {}).get("status") == "ok":
            report.ok("Gonka auth", f"HTTP 200; maxRpm={settings.get('maxRpm', 'unknown')}")
        else:
            report.fail("Gonka auth", f"HTTP {status_text(code)}")
        code, catalog = http_json(
            "https://proxy.gonkabroker.com/v1/models",
            headers=_bearer(gonka_key),
            timeout=args.timeout,
        )
        rows = (catalog or {}).get("data", [])
        found = any(
            isinstance(row, dict)
            and str(row.get("id", "")).lower() == GONKA_MODEL.lower()
            for row in rows
        )
        if code == 200 and found:
            report.ok("Gonka model catalog", f"HTTP 200; {len(rows)} model IDs")
        elif code == 200:
            report.skip("Gonka model ID", "catalog naming differs; auth remains valid")
        else:
            report.fail("Gonka model catalog", f"HTTP {status_text(code)}")
    else:
        report.fail("Gonka auth", "GONKA_API_KEY missing")

    # Bazaar metadata is a cheap GET and reports free-tier / management-key status.
    bazaar_key = os.environ.get("BAZAARLINK_API_KEY", "")
    if bazaar_key:
        code, data = http_json(
            "https://api.bazaarlink.ai/v1/key",
            headers=_bearer(bazaar_key),
            timeout=args.timeout,
        )
        meta = (data or {}).get("data") or {}
        if code == 200 and meta.get("is_free_tier") is True and meta.get("is_management_key") is False:
            quota = []
            if meta.get("requests_daily") is not None:
                quota.append(f"requests_today={meta.get('requests_daily')}")
            if meta.get("limit_remaining") is not None:
                quota.append(f"remaining={meta.get('limit_remaining')}")
            suffix = "; ".join(quota)
            report.ok(
                "BazaarLink key",
                "HTTP 200; free-tier key; not a management key" + (f"; {suffix}" if suffix else ""),
            )
        elif code == 200:
            report.fail("BazaarLink key metadata", "HTTP 200 but free-tier/key-type flags differ")
        else:
            report.fail("BazaarLink key", f"HTTP {status_text(code)}")
        code, catalog = http_json(
            "https://api.bazaarlink.ai/v1/models",
            headers=_bearer(bazaar_key),
            timeout=args.timeout,
        )
        rows = (catalog or {}).get("data", [])
        found = any(
            isinstance(row, dict) and row.get("id") == BAZAAR_MODEL for row in rows
        )
        if code == 200 and found:
            report.ok("BazaarLink free model", f"HTTP 200; {len(rows)} model IDs")
        elif code == 200:
            report.fail("BazaarLink free model", "expected zero-priced Nemotron ID not found")
        else:
            report.fail("BazaarLink model catalog", f"HTTP {status_text(code)}")
    else:
        report.fail("BazaarLink key", "BAZAARLINK_API_KEY missing")

    # Cloudflare has two independent tokens: account API token and Workers AI token.
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    account_token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    workers_token = os.environ.get("CLOUDFLARE_WORKERS_AI_TOKEN", "")
    if account_id and account_token:
        url = f"https://api.cloudflare.com/client/v4/accounts/{urllib.parse.quote(account_id, safe='')}/tokens/verify"
        code, data = http_json(url, headers=_bearer(account_token), timeout=args.timeout)
        status = ((data or {}).get("result") or {}).get("status")
        if code == 200 and (data or {}).get("success") is True and status == "active":
            report.ok("Cloudflare account token", "HTTP 200; active")
        else:
            report.fail("Cloudflare account token", f"HTTP {status_text(code)}; status={status or 'unknown'}")
    else:
        report.fail("Cloudflare account token", "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN missing")

    if account_id and workers_token:
        query = urllib.parse.urlencode({"search": "glm-4.7-flash", "per_page": 5})
        url = (
            f"https://api.cloudflare.com/client/v4/accounts/"
            f"{urllib.parse.quote(account_id, safe='')}/ai/models/search?{query}"
        )
        code, data = http_json(url, headers=_bearer(workers_token), timeout=args.timeout)
        rows = (data or {}).get("result", [])
        found = any(
            isinstance(row, dict)
            and "glm-4.7-flash" in str(row.get("name", "")).lower()
            for row in rows
        )
        if code == 200 and (data or {}).get("success") is True and found:
            report.ok("Cloudflare Workers AI catalog", "HTTP 200; GLM-4.7 Flash present")
        elif code == 200 and (data or {}).get("success") is True:
            report.skip("Cloudflare Workers AI catalog", "search response did not return exact display name")
        else:
            report.fail("Cloudflare Workers AI catalog", f"HTTP {status_text(code)}")
    else:
        report.fail("Cloudflare Workers AI catalog", "account ID or Workers AI token missing")

    return base, sorted(aliases)


def _chat_tool_call(base: str, master_key: str, alias: str, status: str, timeout: int) -> tuple[bool, str]:
    payload = {
        "model": alias,
        "messages": [{
            "role": "user",
            "content": f"Call status_check now with status exactly {status}. Do not answer in prose."
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
    calls = message.get("tool_calls") or []
    valid = False
    for call in calls:
        function = call.get("function") or {}
        if function.get("name") != "status_check":
            continue
        try:
            arguments = json.loads(function.get("arguments") or "{}")
        except json.JSONDecodeError:
            continue
        if arguments.get("status") == status:
            valid = True
    used_model = str(data.get("model") or alias)
    usage = data.get("usage") or {}
    cost = usage.get("cost")
    suffix = f"model={used_model}"
    if cost is not None:
        suffix += f"; cost={cost}"
    return valid, suffix if valid else suffix + "; tool_call missing/invalid"


def _anthropic_tool_call(base: str, master_key: str, alias: str, status: str, timeout: int) -> tuple[bool, str]:
    payload = {
        "model": alias,
        "max_tokens": 128,
        "messages": [{
            "role": "user",
            "content": f"Call status_check now with status exactly {status}. Do not answer in prose."
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
    blocks = data.get("content") or []
    valid = any(
        block.get("type") == "tool_use"
        and block.get("name") == "status_check"
        and (block.get("input") or {}).get("status") == status
        for block in blocks
    )
    usage = data.get("usage") or {}
    suffix = f"stop={data.get('stop_reason', 'unknown')}"
    if usage.get("cost") is not None:
        suffix += f"; cost={usage['cost']}"
    return valid, suffix if valid else suffix + "; tool_use missing/invalid"


def inference_checks(args: argparse.Namespace, base: str, report: Reporter) -> None:
    master_key = os.environ.get("LITELLM_MASTER_KEY", "")
    if not master_key:
        report.fail("tool-call checks", "LITELLM_MASTER_KEY missing")
        return
    if args.tool_calls:
        for index, (provider, alias) in enumerate(CHAT_ROUTES, start=1):
            status = f"SHADOW_SMOKE_{index}"
            ok, detail = _chat_tool_call(
                base, master_key, alias, status, args.inference_timeout
            )
            if ok:
                report.ok(f"{provider} structured tool call", detail)
            else:
                report.fail(f"{provider} structured tool call", detail)
    if args.anthropic_tools:
        selected = [
            item for item in ANTHROPIC_ROUTES
            if args.anthropic_provider == "all"
            or item[0].lower().startswith(args.anthropic_provider)
        ]
        for index, (provider, alias) in enumerate(selected, start=1):
            status = f"SHADOW_ANTHROPIC_SMOKE_{index}"
            ok, detail = _anthropic_tool_call(
                base, master_key, alias, status, args.inference_timeout
            )
            if ok:
                report.ok(f"{provider} Anthropic tool_use", detail)
            else:
                report.fail(f"{provider} Anthropic tool_use", detail)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check Shadow gateway and provider status without printing credentials."
    )
    parser.add_argument(
        "--config-dir",
        type=Path,
        default=Path.home() / ".config/shadow",
        help="Directory containing providers.env and extra-providers.env",
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
        default=35,
        help="Timeout for optional inference/tool-call checks",
    )
    parser.add_argument(
        "--anthropic-provider",
        choices=("all", "requesty", "gonka"),
        default="all",
        help="Select the Anthropic provider when using --anthropic-tools",
    )
    parser.add_argument(
        "--tool-calls",
        action="store_true",
        help="Send one small structured inference request through each Chat Completions route",
    )
    parser.add_argument(
        "--anthropic-tools",
        action="store_true",
        help="Also send one Anthropic Messages tool_use request through Requesty and Gonka",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_environment(args.config_dir)
    report = Reporter()
    print("Shadow smoke test")
    print(f"Gateway: {args.base_url}")
    print(
        "Mode: "
        + ("tool-calls" if args.tool_calls else "safe GET checks")
        + (" + Anthropic tool_use" if args.anthropic_tools else "")
    )
    base, _ = safe_checks(args, report)
    if args.tool_calls or args.anthropic_tools:
        inference_checks(args, base, report)
    return report.summary()


if __name__ == "__main__":
    raise SystemExit(main())
