"""Mod packaging invariants: the hooks module is declared and typed."""

from __future__ import annotations

import json
import unittest

from tests.frontmatter import PLUGIN


class ModTests(unittest.TestCase):
    def test_hooks_module_declared(self) -> None:
        hooks = json.loads((PLUGIN / "hooks" / "hooks.json").read_text(encoding="utf-8"))
        self.assertEqual(hooks, {"modules": ["./register.ts"]})
        self.assertTrue((PLUGIN / "hooks" / "register.ts").is_file())

    def test_manifest_declares_types_and_profile_option(self) -> None:
        manifest = json.loads((PLUGIN / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["types"], "./types/index.d.ts")
        self.assertTrue((PLUGIN / "types" / "index.d.ts").is_file())
        profile = manifest["userConfig"]["profile"]
        self.assertEqual(profile["type"], "string")
        self.assertEqual(profile["default"], "auto")
        self.assertEqual(profile["options"], ["auto", "economy", "balanced", "quality", "max"])


if __name__ == "__main__":
    unittest.main()
