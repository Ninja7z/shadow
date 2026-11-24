from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

import yaml
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "shadow.py"
SPEC = importlib.util.spec_from_file_location("shadow_cli", MODULE)
assert SPEC and SPEC.loader
shadow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(shadow)


class GeneratedConfigTests(unittest.TestCase):
    def test_local_only_config_has_no_remote_provider(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret"})
        names = [item["model_name"] for item in config["model_list"]]
        self.assertEqual(names, ["shadow-local", "shadow-auto"])
        self.assertEqual(config["router_settings"]["fallbacks"], [{"shadow-auto": ["shadow-local"]}])

    def test_optional_providers_require_their_own_credentials(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "GEMINI_API_KEY": "gemini-test", "CLOUDFLARE_WORKERS_AI_TOKEN": "cf-test"})
        names = [item["model_name"] for item in config["model_list"]]
        self.assertIn("shadow-gemini-flash", names)
        self.assertNotIn("shadow-cloudflare-free", names)
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "ollama/llama3.2:3b")

    def test_free_remote_provider_can_join_auto_fallback(self):
        config = shadow.build_config({
            "LITELLM_MASTER_KEY": "local-secret",
            "REQUESTY_API_KEY": "requesty-test",
            "GONKA_API_KEY": "gonka-test",
            "OPENAI_API_KEY": "paid-test",
        })
        self.assertEqual(config["model_list"][1]["model_name"], "shadow-auto")
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "openai/nvidia/nemotron-3.5-lightning-30b-a3b")
        fallbacks = config["router_settings"]["fallbacks"][0]["shadow-auto"]
        self.assertEqual(fallbacks, ["shadow-gonka-free", "shadow-local"])
        self.assertNotIn("shadow-openai", fallbacks)

    def test_paid_provider_is_not_automatically_selected(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "OPENAI_API_KEY": "openai-test"})
        self.assertIn("shadow-openai", [x["model_name"] for x in config["model_list"]])
        self.assertEqual(config["model_list"][1]["litellm_params"]["model"], "ollama/llama3.2:3b")

    def test_custom_openai_and_anthropic_endpoints_are_supported(self):
        config = shadow.build_config({
            "LITELLM_MASTER_KEY": "local-secret",
            "CUSTOM_OPENAI_API_KEY": "custom-openai-secret",
            "CUSTOM_OPENAI_BASE_URL": "https://example.test/v1",
            "CUSTOM_OPENAI_MODEL": "vendor/model-x",
            "CUSTOM_ANTHROPIC_API_KEY": "custom-anthropic-secret",
            "CUSTOM_ANTHROPIC_BASE_URL": "https://example.test",
            "CUSTOM_ANTHROPIC_MODEL": "claude-compatible-model",
        })
        rows = {x["model_name"]: x["litellm_params"] for x in config["model_list"]}
        self.assertEqual(rows["shadow-custom-openai"]["model"], "openai/vendor/model-x")
        self.assertEqual(rows["shadow-custom-anthropic"]["model"], "anthropic/claude-compatible-model")
        self.assertNotIn("custom-openai-secret", str(config))
        self.assertNotIn("custom-anthropic-secret", str(config))

    def test_cloudflare_requires_account_id_and_substitutes_it(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "CLOUDFLARE_WORKERS_AI_TOKEN": "cf-test", "CLOUDFLARE_ACCOUNT_ID": "account-placeholder"})
        item = next(row for row in config["model_list"] if row["model_name"] == "shadow-cloudflare-free")
        self.assertIn("account-placeholder", item["litellm_params"]["api_base"])
        self.assertFalse(item["litellm_params"]["api_base"].startswith("$"))

    def test_keys_are_environment_references_not_literals(self):
        config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret", "REQUESTY_API_KEY": "requesty-test"})
        item = next(row for row in config["model_list"] if row["model_name"] == "shadow-requesty-free")
        self.assertEqual(item["litellm_params"]["api_key"], "os.environ/REQUESTY_API_KEY")
        self.assertNotIn("requesty-test", str(config))

    def test_multiple_private_custom_providers_are_supported(self):
        providers = {
            "providers": [
                {"id": "api-a", "label": "API A", "protocol": "openai", "model_name": "shadow-custom-api-a", "model": "vendor/model-a", "api_base": "https://a.example/v1", "api_key_env": "SHADOW_CUSTOM_API_A_API_KEY", "access": "free", "auto_fallback": False},
                {"id": "api-b", "label": "API B", "protocol": "anthropic", "model_name": "shadow-custom-api-b", "model": "model-b", "api_base": "https://b.example", "api_key_env": "SHADOW_CUSTOM_API_B_API_KEY", "access": "paid", "auto_fallback": False},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({
                    "LITELLM_MASTER_KEY": "local-secret",
                    "SHADOW_CUSTOM_API_A_API_KEY": "secret-a",
                    "SHADOW_CUSTOM_API_B_API_KEY": "secret-b",
                })
        rows = {row["model_name"]: row["litellm_params"] for row in config["model_list"]}
        self.assertEqual(rows["shadow-custom-api-a"]["model"], "openai/vendor/model-a")
        self.assertEqual(rows["shadow-custom-api-b"]["model"], "anthropic/model-b")
        self.assertEqual(rows["shadow-custom-api-a"]["api_key"], "os.environ/SHADOW_CUSTOM_API_A_API_KEY")
        self.assertNotIn("secret-a", str(config))
        self.assertNotIn("secret-b", str(config))
        self.assertEqual(config["router_settings"]["fallbacks"], [{"shadow-auto": ["shadow-local"]}])

    def test_private_custom_provider_without_key_is_not_enabled(self):
        providers = {
            "providers": [
                {"id": "api-a", "label": "API A", "protocol": "openai", "model_name": "shadow-custom-api-a", "model": "vendor/model-a", "api_base": "https://a.example/v1", "api_key_env": "SHADOW_CUSTOM_API_A_API_KEY", "access": "unknown", "auto_fallback": False},
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "providers.local.yaml"
            path.write_text(yaml.safe_dump(providers), encoding="utf-8")
            with patch.object(shadow, "LOCAL_PROVIDERS", path):
                config = shadow.build_config({"LITELLM_MASTER_KEY": "local-secret"})
        self.assertNotIn("shadow-custom-api-a", [row["model_name"] for row in config["model_list"]])


class AddProviderWizardTests(unittest.TestCase):
    def test_wizard_keeps_key_out_of_provider_metadata_and_console(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            providers_path = Path(directory) / "providers.local.yaml"
            prompts = ["my-api", "My API", "1", "https://api.example/v1", "vendor/model-x", "free"]
            output = io.StringIO()
            with patch.object(shadow, "ENV_FILE", env_path), patch.object(shadow, "LOCAL_PROVIDERS", providers_path), patch("builtins.input", side_effect=prompts), patch("getpass.getpass", return_value="top-secret-key"), contextlib.redirect_stdout(output):
                result = shadow.add_provider(None)
            self.assertEqual(result, 0)
            self.assertIn("SHADOW_CUSTOM_MY_API_API_KEY=top-secret-key", env_path.read_text(encoding="utf-8"))
            metadata = providers_path.read_text(encoding="utf-8")
            self.assertIn("shadow-custom-my-api", metadata)
            self.assertNotIn("top-secret-key", metadata)
            self.assertNotIn("top-secret-key", output.getvalue())
            if hasattr(env_path.stat(), "st_mode"):
                self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
