from __future__ import annotations

import importlib.util
import tempfile
from contextlib import redirect_stdout
import io
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "smoke_test.py"
SPEC = importlib.util.spec_from_file_location("shadow_smoke_test", MODULE_PATH)
assert SPEC and SPEC.loader
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class EnvFileTests(unittest.TestCase):
    def test_reads_simple_assignments_and_export(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env_file = Path(temp) / "providers.env"
            env_file.write_text(
                "# comment\nA=one\nexport B='two words'\nC=\"three\"\nINVALID LINE\n"
            )
            values = smoke._read_env_file(env_file)
        self.assertEqual(values, {"A": "one", "B": "two words", "C": "three"})

    def test_missing_file_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(smoke._read_env_file(Path(temp) / "missing"), {})


class ResponseShapeTests(unittest.TestCase):
    def test_chat_tool_call_parser_accepts_expected_function(self) -> None:
        data = {
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "function": {
                            "name": "status_check",
                            "arguments": '{"status":"SHADOW_SMOKE_1"}',
                        }
                    }]
                }
            }]
        }
        calls = data["choices"][0]["message"]["tool_calls"]
        self.assertEqual(calls[0]["function"]["name"], "status_check")

    def test_anthropic_tool_use_shape_is_recognized(self) -> None:
        data = {
            "content": [{
                "type": "tool_use",
                "name": "status_check",
                "input": {"status": "SHADOW_ANTHROPIC_SMOKE_1"},
            }]
        }
        block = data["content"][0]
        self.assertEqual(block["type"], "tool_use")
        self.assertEqual(block["input"]["status"], "SHADOW_ANTHROPIC_SMOKE_1")


    def test_chat_tool_call_function_accepts_expected_status(self) -> None:
        fake = {
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "function": {
                            "name": "status_check",
                            "arguments": '{"status":"EXPECTED"}',
                        }
                    }]
                }
            }],
            "model": "test-model",
            "usage": {"cost": 0},
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)):
            ok, detail = smoke._chat_tool_call(
                "http://127.0.0.1:4000",
                "local-test-key",
                "test-alias",
                "EXPECTED",
                1,
            )
        self.assertTrue(ok)
        self.assertIn("cost=0", detail)

    def test_anthropic_tool_call_function_accepts_expected_status(self) -> None:
        fake = {
            "content": [{
                "type": "tool_use",
                "name": "status_check",
                "input": {"status": "EXPECTED"},
            }],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 5, "output_tokens": 4},
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)):
            ok, detail = smoke._anthropic_tool_call(
                "http://127.0.0.1:4000",
                "local-test-key",
                "test-alias",
                "EXPECTED",
                1,
            )
        self.assertTrue(ok)
        self.assertIn("stop=tool_use", detail)


    def test_anthropic_only_does_not_send_chat_tool_calls(self) -> None:
        args = SimpleNamespace(
            tool_calls=False,
            anthropic_tools=True,
            anthropic_provider="gonka",
            inference_timeout=30,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master-key"}):
            with patch.object(smoke, "_chat_tool_call") as chat_call:
                with patch.object(
                    smoke,
                    "_anthropic_tool_call",
                    return_value=(True, "stop=end_turn"),
                ) as anthropic_call:
                    with redirect_stdout(io.StringIO()):
                        smoke.inference_checks(args, "http://127.0.0.1:4000", report)
        chat_call.assert_not_called()
        anthropic_call.assert_called_once()
        self.assertEqual(report.passed, 1)
        self.assertEqual(report.failed, 0)



    def test_http_json_distinguishes_timeout_from_unreachable(self) -> None:
        import urllib.error

        with patch.object(
            smoke.urllib.request,
            "urlopen",
            side_effect=urllib.error.URLError(TimeoutError("slow")),
        ):
            status, data = smoke.http_json("https://example.invalid", timeout=1)
        self.assertEqual(status, -1)
        self.assertIsNone(data)
        self.assertEqual(smoke.status_text(status), "timeout")


if __name__ == "__main__":
    unittest.main()
