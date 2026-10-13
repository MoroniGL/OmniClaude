"""Marketplace and plugin manifest invariants."""

from __future__ import annotations

import json
import unittest

from tests.frontmatter import PLUGIN, ROOT

DISCLAIMER = "Unofficial; not affiliated with Anthropic."


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


class ManifestTests(unittest.TestCase):
    def test_marketplace_points_at_the_single_plugin(self) -> None:
        market = load(ROOT / ".claude-plugin" / "marketplace.json")
        self.assertEqual(market["name"], "moronigl")
        self.assertTrue(market["owner"]["name"].strip())
        self.assertIn(DISCLAIMER, market["description"])
        self.assertEqual(len(market["plugins"]), 1)
        entry = market["plugins"][0]
        self.assertEqual(entry["name"], "omniclaude")
        self.assertEqual(entry["source"], "./plugins/omniclaude")
        self.assertNotIn("version", entry, "version lives only in plugin.json")
        self.assertIn(DISCLAIMER, entry["description"])

    def test_plugin_manifest(self) -> None:
        plugin = load(PLUGIN / ".claude-plugin" / "plugin.json")
        self.assertEqual(plugin["name"], "omniclaude")
        self.assertEqual(plugin["version"], (ROOT / "VERSION").read_text(encoding="utf-8").strip())
        self.assertIn(DISCLAIMER, plugin["description"])
        self.assertEqual(plugin["license"], "MIT")
        self.assertTrue(plugin["author"]["name"].strip())
        self.assertTrue(plugin["homepage"].startswith("https://"))

    def test_names_avoid_reserved_prefixes(self) -> None:
        for name in ("omniclaude", "moronigl"):
            self.assertFalse(name.startswith(("claude-", "anthropic-")))

    def test_plugin_ships_no_settings_or_bin(self) -> None:
        self.assertFalse((PLUGIN / "settings.json").exists())
        self.assertFalse((PLUGIN / "bin").exists())


if __name__ == "__main__":
    unittest.main()
