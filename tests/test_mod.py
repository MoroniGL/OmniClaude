"""Mod packaging invariants: the hooks module is declared and typed."""

from __future__ import annotations

import json
import re
import unittest

from tests.frontmatter import PLUGIN, ROOT, parse

HOOKS = PLUGIN / "hooks"


class ModTests(unittest.TestCase):
    def test_mod_version_matches_release_version(self) -> None:
        omni = (HOOKS / "omni.ts").read_text(encoding="utf-8")
        match = re.search(r"export const MOD_VERSION = '([^']+)'", omni)
        self.assertIsNotNone(match, "omni.ts must export MOD_VERSION as a string literal")
        self.assertEqual(match.group(1), (ROOT / "VERSION").read_text(encoding="utf-8").strip())

    def test_worker_tiers_match_agent_frontmatter(self) -> None:
        policy = (HOOKS / "policy.ts").read_text(encoding="utf-8")
        block = re.search(r"export const WORKER_TIERS[^=]*=\s*\{(.*?)\n\}", policy, re.S)
        self.assertIsNotNone(block, "policy.ts must declare WORKER_TIERS as an object literal")
        tiers = dict(re.findall(r"'omniclaude:([a-z-]+)':\s*'([a-z]+)'", block.group(1)))
        agents = {path.stem: parse(path)[0]["model"] for path in (PLUGIN / "agents").glob("*.md")}
        self.assertEqual(tiers, agents)

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
