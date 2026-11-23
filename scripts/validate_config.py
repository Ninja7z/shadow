#!/usr/bin/env python3
"""Validate a public Shadow/LiteLLM config template without printing secrets."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml


SECRET_PATTERNS = [
    re.compile(r"rqsty-[A-Za-z0-9_-]{20,}"),
    re.compile(r"cfut_[A-Za-z0-9_-]{20,}"),
    re.compile(r"gnk-prx-[A-Za-z0-9_-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{24,}"),
    re.compile(r"(?i)authorization\s*:\s*bearer\s+\S+"),
]


def main() -> int:
    config_path = Path(sys.argv[1] if len(sys.argv) > 1 else "config/shadow.example.yaml")
    text = config_path.read_text(encoding="utf-8")
    hits = [pattern.pattern for pattern in SECRET_PATTERNS if pattern.search(text)]
    if hits:
        print("FAIL: possible credential material found in config template")
        return 2

    config = yaml.safe_load(text)
    models = config.get("model_list", [])
    names = [item.get("model_name") for item in models]
    if not names or any(not name for name in names):
        print("FAIL: every model_list entry must have model_name")
        return 2
    if len(names) != len(set(names)):
        print("FAIL: duplicate model_name")
        return 2

    for item in models:
        params = item.get("litellm_params", {})
        key_ref = params.get("api_key")
        if key_ref and str(key_ref) != "ollama" and not str(key_ref).startswith("os.environ/"):
            print(f"FAIL: {item['model_name']} uses a non-environment api_key reference")
            return 2

    fallbacks = config.get("router_settings", {}).get("fallbacks", [])
    known = set(names) | {key for item in fallbacks for key in item}
    graph = {}
    for item in fallbacks:
        for key, targets in item.items():
            graph[key] = list(targets or [])
            for target in graph[key]:
                if target not in known:
                    print(f"FAIL: fallback target {target!r} is not declared")
                    return 2

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return False
        if node in visited:
            return True
        visiting.add(node)
        for target in graph.get(node, []):
            if not visit(target):
                return False
        visiting.remove(node)
        visited.add(node)
        return True

    if not all(visit(node) for node in graph):
        print("FAIL: fallback cycle detected")
        return 2

    print(f"OK: {len(names)} model aliases, {len(fallbacks)} fallback groups, no obvious secrets or cycles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
