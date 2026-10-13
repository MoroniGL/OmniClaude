"""CLI profile files (claude --settings) invariants."""

from __future__ import annotations

import json
import unittest

from tests.frontmatter import PLUGIN

PROFILES = {
    "economy": {"model": "sonnet", "effortLevel": "medium"},
    "balanced": {"model": "opus", "effortLevel": "medium", "env": {"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"}},
    "quality": {"model": "opus", "effortLevel": "high"},
    "max": {"model": "fable", "effortLevel": "high", "env": {"CLAUDE_CODE_SUBAGENT_MODEL": "opus"}},
}
FORBIDDEN_ENV = {"CLAUDE_CODE_EFFORT_LEVEL", "CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "ANTHROPIC_MODEL"}
PROFILE_DIR = PLUGIN / "profiles"


class ProfileTests(unittest.TestCase):
    def test_profile_set(self) -> None:
        names = {p.name.removesuffix(".settings.json") for p in PROFILE_DIR.glob("*.settings.json")}
        self.assertEqual(names, set(PROFILES))

    def test_profile_contents_are_exact(self) -> None:
        for name, expected in PROFILES.items():
            with self.subTest(profile=name):
                data = json.loads((PROFILE_DIR / f"{name}.settings.json").read_text(encoding="utf-8"))
                self.assertEqual(data, expected)

    def test_forbidden_keys_and_values(self) -> None:
        for name in PROFILES:
            with self.subTest(profile=name):
                data = json.loads((PROFILE_DIR / f"{name}.settings.json").read_text(encoding="utf-8"))
                self.assertNotEqual(data.get("effortLevel"), "max")
                self.assertFalse(FORBIDDEN_ENV & set(data.get("env", {})))


if __name__ == "__main__":
    unittest.main()
