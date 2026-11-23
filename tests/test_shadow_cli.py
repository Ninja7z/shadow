from __future__ import annotations
import importlib.util
import unittest
from pathlib import Path
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
        self.assertEqual(
            config["model_list"][1]["litellm_params"]["model"],
            "openai/nvidia/nemotron-3.5-lightning-30b-a3b",
        )
        fallbacks = config["router_settings"]["fallbacks"][0]["shadow-auto"]
        self.assertEqual(
            fallbacks,
            ["shadow-gonka-free", "shadow-local"],
        )
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

if __name__ == "__main__":
    unittest.main()
