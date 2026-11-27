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
    def test_cli_exposes_separate_chat_completions_responses_and_anthropic_checks(self) -> None:
        with patch("sys.argv", ["smoke_test.py"]):
            args = smoke.parse_args()
        self.assertFalse(args.tool_calls)
        self.assertFalse(args.responses_tools)
        self.assertFalse(args.stream_tool_calls)
        self.assertFalse(args.anthropic_tools)
        self.assertFalse(args.anthropic_stream_tools)
        self.assertEqual(args.responses_model, "shadow-auto")
        self.assertEqual(args.anthropic_model, "shadow-auto")
        self.assertEqual(args.expect_alias, [])
        self.assertIsNone(args.reasoning_effort)

    def test_default_inference_timeout_allows_cold_local_model_load(self) -> None:
        with patch("sys.argv", ["smoke_test.py"]):
            args = smoke.parse_args()
        self.assertGreaterEqual(args.inference_timeout, 150)

    def test_safe_checks_use_only_local_gateway_endpoints(self) -> None:
        args = SimpleNamespace(
            base_url="http://127.0.0.1:4000",
            timeout=5,
            expect_alias=["router-local"],
        )
        report = smoke.Reporter()
        models = {"data": [{"id": "router-local"}, {"id": "router-remote"}]}
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "http_json", side_effect=[(200, {}), (200, models)]) as request:
                with redirect_stdout(io.StringIO()):
                    base, aliases = smoke.safe_checks(args, report)
        self.assertEqual(base, "http://127.0.0.1:4000")
        self.assertEqual(aliases, ["router-local", "router-remote"])
        self.assertEqual(request.call_count, 2)
        self.assertEqual(report.failed, 0)
        self.assertTrue(all("127.0.0.1:4000" in call.args[0] for call in request.call_args_list))


    def test_safe_checks_does_not_require_shadow_local_or_shadow_auto(self) -> None:
        args = SimpleNamespace(
            base_url="http://127.0.0.1:4401",
            timeout=5,
            expect_alias=[],
        )
        report = smoke.Reporter()
        models = {"data": [{"id": "router-local"}]}
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "http_json", side_effect=[(200, {}), (200, models)]):
                with redirect_stdout(io.StringIO()):
                    _, aliases = smoke.safe_checks(args, report)
        self.assertEqual(aliases, ["router-local"])
        self.assertEqual(report.failed, 0)

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
            args = SimpleNamespace(
                base_url="http://127.0.0.1:4000",
                timeout=5,
                env_file=env_file,
                expect_alias=["shadow-auto", "shadow-local"],
            )
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

    def test_chat_tool_call_uses_openai_chat_completions_contract(self) -> None:
        fake = {
            "choices": [{"message": {"tool_calls": [{
                "function": {"name": "status_check", "arguments": '{"status":"EXPECTED"}'}
            }]}}],
            "model": "test-model",
            "usage": {"total_tokens": 9},
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            ok, _ = smoke._chat_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-openai", "EXPECTED", 1
            )
        self.assertTrue(ok)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "http://127.0.0.1:4000/v1/chat/completions")
        self.assertEqual(kwargs["method"], "POST")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer local-test-key")
        self.assertEqual(kwargs["payload"]["model"], "shadow-openai")
        self.assertEqual(kwargs["payload"]["tools"][0]["type"], "function")
        self.assertEqual(
            kwargs["payload"]["tool_choice"],
            {"type": "function", "function": {"name": "status_check"}},
        )
        self.assertIs(kwargs["payload"]["stream"], False)

    def test_reasoning_effort_is_sent_only_when_explicitly_requested(self) -> None:
        fake = {
            "choices": [{"message": {"tool_calls": [{
                "function": {"name": "status_check", "arguments": '{"status":"EXPECTED"}'}
            }]}}],
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            smoke._chat_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
            )
        self.assertNotIn("reasoning_effort", request.call_args.kwargs["payload"])

        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            smoke._chat_tool_call(
                "http://127.0.0.1:4000",
                "local-test-key",
                "test-alias",
                "EXPECTED",
                1,
                reasoning_effort="none",
            )
        self.assertEqual(request.call_args.kwargs["payload"]["reasoning_effort"], "none")

    def test_chat_tool_call_treats_malformed_provider_shapes_as_a_failed_check(self) -> None:
        malformed_responses = [
            {"choices": [None], "usage": "invalid"},
            {"choices": [{"message": "not-an-object"}]},
            {"choices": [{"message": {"tool_calls": {"function": "invalid"}}}]},
            {"choices": [{"message": {"tool_calls": [{
                "function": {"name": "status_check", "arguments": "[\"not-an-object\"]"}
            }]}}]},
            {"choices": [{"message": {"tool_calls": [{
                "function": {"name": "status_check", "arguments": {"status": "EXPECTED"}}
            }]}}]},
        ]
        for response in malformed_responses:
            with self.subTest(response=response):
                with patch.object(smoke, "http_json", return_value=(200, response)):
                    ok, detail = smoke._chat_tool_call(
                        "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
                    )
                self.assertFalse(ok)
                self.assertIn("tool_call missing/invalid", detail)

    def test_chat_stream_tool_call_joins_argument_fragments_and_requires_done(self) -> None:
        events = [
            {"model": "test-model", "choices": [{"delta": {"tool_calls": [{
                "index": 0,
                "function": {"name": "status_check", "arguments": '{"status":"'}
            }]}}]},
            {"choices": [{"delta": {"tool_calls": [{
                "index": 0,
                "function": {"arguments": 'EXPECTED"}'}
            }]}}]},
            {"_sse_done": True},
        ]
        with patch.object(smoke, "http_sse_events", return_value=(200, events)) as request:
            ok, detail = smoke._chat_stream_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-openai", "EXPECTED", 1
            )
        self.assertTrue(ok)
        self.assertIn("done=True", detail)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "http://127.0.0.1:4000/v1/chat/completions")
        self.assertTrue(kwargs["payload"]["stream"])
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer local-test-key")

    def test_chat_stream_tool_call_rejects_incomplete_stream(self) -> None:
        events = [{
            "choices": [{"delta": {"tool_calls": [{
                "index": 0,
                "function": {"name": "status_check", "arguments": '{"status":"EXPECTED"}'}
            }]}}],
        }]
        with patch.object(smoke, "http_sse_events", return_value=(200, events)):
            ok, detail = smoke._chat_stream_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-openai", "EXPECTED", 1
            )
        self.assertFalse(ok)
        self.assertIn("stream incomplete", detail)

    def test_responses_tool_call_uses_native_openai_responses_contract(self) -> None:
        fake = {
            "id": "resp_test",
            "object": "response",
            "model": "test-model",
            "output": [{
                "type": "function_call",
                "call_id": "call_test",
                "name": "status_check",
                "arguments": '{"status":"EXPECTED"}',
            }],
            "usage": {"input_tokens": 4, "output_tokens": 3, "total_tokens": 7},
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            ok, _ = smoke._responses_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-openai", "EXPECTED", 1
            )
        self.assertTrue(ok)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "http://127.0.0.1:4000/v1/responses")
        self.assertEqual(kwargs["method"], "POST")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer local-test-key")
        payload = kwargs["payload"]
        self.assertEqual(payload["model"], "shadow-openai")
        self.assertIn("Call status_check", payload["input"])
        self.assertEqual(payload["tools"][0]["type"], "function")
        self.assertEqual(payload["tools"][0]["name"], "status_check")
        self.assertEqual(payload["tool_choice"], {"type": "function", "name": "status_check"})
        self.assertTrue(payload["tools"][0]["strict"])
        self.assertEqual(payload["max_output_tokens"], 192)
        self.assertNotIn("messages", payload)

    def test_responses_tool_call_handles_malformed_output_without_crashing(self) -> None:
        malformed = [
            {"output": [None], "usage": "invalid"},
            {"output": [{"type": "function_call", "name": "status_check", "arguments": ["invalid"]}]},
            {"output": [{"type": "function_call", "name": "status_check", "arguments": '["invalid"]'}]},
            {"output": "not-an-array"},
        ]
        for response in malformed:
            with self.subTest(response=response):
                with patch.object(smoke, "http_json", return_value=(200, response)):
                    ok, detail = smoke._responses_tool_call(
                        "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
                    )
                self.assertFalse(ok)
                self.assertIn("function_call missing/invalid", detail)

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

    def test_anthropic_tool_call_treats_malformed_provider_shapes_as_a_failed_check(self) -> None:
        malformed_responses = [
            {"content": [None], "usage": "invalid"},
            {"content": [{"type": "tool_use", "name": "status_check", "input": ["invalid"]}]},
            {"content": "not-an-array"},
            {"content": [{"type": "text", "text": "done"}]},
        ]
        for response in malformed_responses:
            with self.subTest(response=response):
                with patch.object(smoke, "http_json", return_value=(200, response)):
                    ok, detail = smoke._anthropic_tool_call(
                        "http://127.0.0.1:4000", "local-test-key", "test-alias", "EXPECTED", 1
                    )
                self.assertFalse(ok)
                self.assertIn("tool_use missing/invalid", detail)

    def test_anthropic_stream_tool_use_joins_input_json_deltas(self) -> None:
        events = [
            {"type": "message_start", "message": {"id": "msg_test"}},
            {"type": "content_block_start", "index": 0, "content_block": {
                "type": "tool_use", "id": "tool_test", "name": "status_check", "input": {}
            }},
            {"type": "content_block_delta", "index": 0, "delta": {
                "type": "input_json_delta", "partial_json": '{"status":"'
            }},
            {"type": "content_block_delta", "index": 0, "delta": {
                "type": "input_json_delta", "partial_json": 'EXPECTED"}'
            }},
            {"type": "message_delta", "delta": {"stop_reason": "tool_use"}},
            {"type": "message_stop"},
        ]
        with patch.object(smoke, "http_sse_events", return_value=(200, events)) as request:
            ok, detail = smoke._anthropic_stream_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-anthropic", "EXPECTED", 1
            )
        self.assertTrue(ok)
        self.assertIn("message_stop=True", detail)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "http://127.0.0.1:4000/v1/messages")
        self.assertTrue(kwargs["payload"]["stream"])
        self.assertEqual(kwargs["headers"]["x-api-key"], "local-test-key")
        self.assertEqual(kwargs["headers"]["anthropic-version"], "2023-06-01")

    def test_anthropic_stream_tool_use_rejects_stream_without_message_stop(self) -> None:
        events = [
            {"type": "content_block_start", "index": 0, "content_block": {
                "type": "tool_use", "name": "status_check", "input": {"status": "EXPECTED"}
            }},
        ]
        with patch.object(smoke, "http_sse_events", return_value=(200, events)):
            ok, detail = smoke._anthropic_stream_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-anthropic", "EXPECTED", 1
            )
        self.assertFalse(ok)
        self.assertIn("stream incomplete", detail)

    def test_anthropic_messages_uses_native_api_key_header(self) -> None:
        fake = {
            "content": [{"type": "tool_use", "name": "status_check", "input": {"status": "EXPECTED"}}],
            "stop_reason": "tool_use",
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            smoke._anthropic_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-anthropic", "EXPECTED", 1
            )
        headers = request.call_args.kwargs["headers"]
        self.assertEqual(headers["x-api-key"], "local-test-key")
        self.assertEqual(headers["anthropic-version"], "2023-06-01")
        self.assertNotIn("Authorization", headers)

    def test_anthropic_tool_call_uses_messages_contract_and_version_header(self) -> None:
        fake = {
            "content": [{"type": "tool_use", "name": "status_check", "input": {"status": "EXPECTED"}}],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 5, "output_tokens": 4},
        }
        with patch.object(smoke, "http_json", return_value=(200, fake)) as request:
            ok, _ = smoke._anthropic_tool_call(
                "http://127.0.0.1:4000", "local-test-key", "shadow-anthropic", "EXPECTED", 1
            )
        self.assertTrue(ok)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "http://127.0.0.1:4000/v1/messages")
        self.assertEqual(kwargs["method"], "POST")
        self.assertEqual(kwargs["headers"]["x-api-key"], "local-test-key")
        self.assertNotIn("Authorization", kwargs["headers"])
        self.assertEqual(kwargs["headers"]["anthropic-version"], "2023-06-01")
        self.assertEqual(kwargs["payload"]["model"], "shadow-anthropic")
        self.assertEqual(kwargs["payload"]["tool_choice"], {"type": "tool", "name": "status_check"})
        schema = kwargs["payload"]["tools"][0]["input_schema"]
        self.assertEqual(schema["required"], ["status"])
        self.assertFalse(schema["additionalProperties"])

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

    def test_responses_only_uses_selected_responses_alias(self) -> None:
        args = SimpleNamespace(
            tool_calls=False,
            responses_tools=True,
            responses_model="shadow-openai-responses",
            anthropic_tools=False,
            model="shadow-auto",
            anthropic_model="shadow-auto",
            inference_timeout=45,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(
                smoke, "_responses_tool_call", return_value=(True, "model=test")
            ) as responses_call:
                with patch.object(smoke, "_chat_tool_call") as chat_call:
                    with patch.object(smoke, "_anthropic_tool_call") as anthropic_call:
                        with redirect_stdout(io.StringIO()):
                            smoke.inference_checks(
                                args,
                                "http://127.0.0.1:4000",
                                ["shadow-openai-responses"],
                                report,
                            )
        responses_call.assert_called_once_with(
            "http://127.0.0.1:4000",
            "test-master",
            "shadow-openai-responses",
            "SHADOW_SMOKE_RESPONSES",
            45,
        )
        chat_call.assert_not_called()
        anthropic_call.assert_not_called()
        self.assertEqual(report.passed, 1)
        self.assertEqual(report.failed, 0)

    def test_openai_stream_only_uses_chat_stream_route(self) -> None:
        args = SimpleNamespace(
            tool_calls=False,
            stream_tool_calls=True,
            responses_tools=False,
            anthropic_tools=False,
            anthropic_stream_tools=False,
            model="shadow-openai-stream",
            inference_timeout=30,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(smoke, "_chat_stream_tool_call", return_value=(True, "done=True")) as stream:
                with patch.object(smoke, "_chat_tool_call") as non_stream:
                    with patch.object(smoke, "_responses_tool_call") as responses:
                        with redirect_stdout(io.StringIO()):
                            smoke.inference_checks(
                                args, "http://127.0.0.1:4000", ["shadow-openai-stream"], report
                            )
        stream.assert_called_once()
        non_stream.assert_not_called()
        responses.assert_not_called()
        self.assertEqual(report.passed, 1)

    def test_anthropic_stream_only_uses_selected_anthropic_alias(self) -> None:
        args = SimpleNamespace(
            tool_calls=False,
            stream_tool_calls=False,
            responses_tools=False,
            anthropic_tools=False,
            anthropic_stream_tools=True,
            model="shadow-auto",
            anthropic_model="shadow-anthropic-stream",
            inference_timeout=50,
        )
        report = smoke.Reporter()
        with patch.dict("os.environ", {"LITELLM_MASTER_KEY": "test-master"}):
            with patch.object(
                smoke, "_anthropic_stream_tool_call", return_value=(True, "message_stop=True")
            ) as stream:
                with patch.object(smoke, "_anthropic_tool_call") as non_stream:
                    with patch.object(smoke, "_chat_stream_tool_call") as openai_stream:
                        with redirect_stdout(io.StringIO()):
                            smoke.inference_checks(
                                args,
                                "http://127.0.0.1:4000",
                                ["shadow-anthropic-stream"],
                                report,
                            )
        stream.assert_called_once_with(
            "http://127.0.0.1:4000",
            "test-master",
            "shadow-anthropic-stream",
            "SHADOW_SMOKE_ANTHROPIC_STREAM",
            50,
        )
        non_stream.assert_not_called()
        openai_stream.assert_not_called()
        self.assertEqual(report.passed, 1)
        self.assertEqual(report.failed, 0)

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

    def test_http_sse_parser_reads_json_data_events_and_done_marker(self) -> None:
        class FakeResponse(io.BytesIO):
            status = 200

        body = (
            b": keep-alive\n\n"
            b"event: message\n"
            b'data: {"type":"message_start","value":1}\n\n'
            b'data: {"type":"message_stop"}\n\n'
            b"data: [DONE]\n\n"
        )
        with patch.object(smoke.urllib.request, "urlopen", return_value=FakeResponse(body)):
            status, events = smoke.http_sse_events(
                "http://127.0.0.1:4000/v1/messages", timeout=1
            )
        self.assertEqual(status, 200)
        self.assertEqual(events, [
            {"type": "message_start", "value": 1},
            {"type": "message_stop"},
            {"_sse_done": True},
        ])

    def test_http_sse_parser_enforces_total_response_limit(self) -> None:
        class FakeResponse(io.BytesIO):
            status = 200

        with patch.object(
            smoke.urllib.request,
            "urlopen",
            return_value=FakeResponse(b"data: " + (b"x" * 100) + b"\\n\\n"),
        ):
            status, events = smoke.http_sse_events(
                "http://127.0.0.1:4000/v1/chat/completions",
                timeout=1,
                max_bytes=32,
            )
        self.assertEqual(status, -2)
        self.assertEqual(events, [])

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
