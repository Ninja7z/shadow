from __future__ import annotations

import importlib.util
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "smoke_test.py"
SPEC = importlib.util.spec_from_file_location("shadow_smoke_test", MODULE_PATH)
assert SPEC and SPEC.loader
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


class EnvFileTests(unittest.TestCase):
    def test_reads_simple_assignments_and_export(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env_file = Path(temp) / ".env"
            env_file.write_text(
                "# comment\nA=one\nexport B='two words'\nC=\"three\"\nINVALID LINE\n=empty-key\n"
            )
            values = smoke._read_env_file(env_file)
        self.assertEqual(values, {"A": "one", "B": "two words", "C": "three"})

    def test_missing_file_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(smoke._read_env_file(Path(temp) / "missing"), {})

    def test_load_environment_preserves_existing_process_value(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            env_file = Path(temp) / ".env"
            env_file.write_text("SHADOW_TEST_KEY=file-value\n")
            with patch.dict("os.environ", {"SHADOW_TEST_KEY": "process-value"}):
                smoke.load_environment(env_file)
                self.assertEqual(__import__("os").environ["SHADOW_TEST_KEY"], "process-value")


class GatewayChecksTests(unittest.TestCase):
    def test_default_inference_timeout_allows_cold_local_model_load(self) -> None:
        with patch("sys.argv", ["smoke_test.py"]):
            args = smoke.parse_args()
        self.assertGreaterEqual(args.inference_timeout, 150)

    def test_safe_checks_use_only_local_gateway_endpoints(self) -> None:
        args = SimpleNamespace(base_url="http://127.0.0.1:4000", timeout=5)
        report = smoke.Reporter()
        models = {"data": [{"id": "shadow-local"}, {"id": "shadow-auto"}, {"id": "shadow-custom-test"}]}
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "http_json", side_effect=[(200, {}), (200, models)]) as request:
                with redirect_stdout(io.StringIO()):
                    base, aliases = smoke.safe_checks(args, report)
        self.assertEqual(base, "http://127.0.0.1:4000")
        self.assertEqual(aliases, ["shadow-auto", "shadow-custom-test", "shadow-local"])
        self.assertEqual(request.call_count, 2)
        self.assertEqual(report.failed, 0)
        self.assertTrue(all("127.0.0.1:4000" in call.args[0] for call in request.call_args_list))


    def test_configured_aliases_reads_only_model_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / "shadow.yaml"
            config.write_text(
                "model_list:\n  - model_name: shadow-local\n  - model_name: shadow-auto\n  - model_name: shadow-local\n",
                encoding="utf-8",
            )
            self.assertEqual(smoke.configured_aliases(config), ["shadow-auto", "shadow-local"])

    def test_db_less_master_key_catalog_error_uses_local_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            env_file = root / ".env"
            env_file.write_text("LITELLM_MASTER_KEY=test-master\n")
            config_file = root / "config" / "shadow.yaml"
            config_file.parent.mkdir()
            config_file.write_text(
                "model_list:\n  - model_name: shadow-local\n  - model_name: shadow-auto\n",
                encoding="utf-8",
            )
            args = SimpleNamespace(base_url="http://127.0.0.1:4000", timeout=5, env_file=env_file)
            report = smoke.Reporter()
            payload = {"error": {"type": "no_db_connection", "message": "No connected db."}}
            with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
                with patch.object(smoke, "http_json", side_effect=[(200, {}), (400, payload)]):
                    with redirect_stdout(io.StringIO()):
                        base, aliases = smoke.safe_checks(args, report)
            self.assertEqual(base, "http://127.0.0.1:4000")
            self.assertEqual(aliases, ["shadow-auto", "shadow-local"])
            self.assertEqual(report.failed, 0)
            self.assertEqual(report.passed, 4)

    def test_safe_checks_reports_missing_master_key(self) -> None:
        args = SimpleNamespace(base_url="http://127.0.0.1:4000", timeout=5)
        report = smoke.Reporter()
        with patch.dict("os.environ", {}, clear=True):
            with patch.object(smoke, "http_json") as request:
                with redirect_stdout(io.StringIO()):
                    _, aliases = smoke.safe_checks(args, report)
        request.assert_not_called()
        self.assertEqual(aliases, [])
        self.assertEqual(report.failed, 1)


class ResponseShapeTests(unittest.TestCase):
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
                "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
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
                "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
            )
        self.assertTrue(ok)
        self.assertIn("stop=tool_use", detail)

    def test_inference_checks_use_the_selected_alias(self) -> None:
        args = SimpleNamespace(
            tool_calls=True,
            anthropic_tools=False,
            model="shadow-custom-demo",
            anthropic_model="shadow-auto",
            inference_timeout=30,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "_chat_tool_call", return_value=(True, "ok")) as call:
                with redirect_stdout(io.StringIO()):
                    smoke.inference_checks(args, "http://127.0.0.1:4000", ["shadow-custom-demo"], report)
        call.assert_called_once_with(
            "http://127.0.0.1:4000", "test-master", "shadow-custom-demo", "SHADOW_SMOKE_CHAT", 30
        )
        self.assertEqual(report.passed, 1)

    def test_anthropic_only_does_not_send_chat_tool_calls(self) -> None:
        args = SimpleNamespace(
            tool_calls=False,
            anthropic_tools=True,
            model="shadow-auto",
            anthropic_model="shadow-local",
            inference_timeout=30,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "_chat_tool_call") as chat_call:
                with patch.object(smoke, "_anthropic_tool_call", return_value=(True, "stop=end_turn")) as anthropic_call:
                    with redirect_stdout(io.StringIO()):
                        smoke.inference_checks(
                            args, "http://127.0.0.1:4000", ["shadow-local"], report
                        )
        chat_call.assert_not_called()
        anthropic_call.assert_called_once()
        self.assertEqual(report.passed, 1)
        self.assertEqual(report.failed, 0)

    def test_http_json_preserves_structured_http_error_for_diagnosis(self) -> None:
        import json
        import urllib.error
        from io import BytesIO

        error = urllib.error.HTTPError(
            "http://127.0.0.1:4000/v1/models", 400, "Bad Request", {},
            BytesIO(json.dumps({"error": {"type": "no_db_connection"}}).encode()),
        )
        with patch.object(smoke.urllib.request, "urlopen", side_effect=error):
            status, data = smoke.http_json("http://127.0.0.1:4000/v1/models")
        self.assertEqual(status, 400)
        self.assertEqual(data, {"error": {"type": "no_db_connection"}})

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
