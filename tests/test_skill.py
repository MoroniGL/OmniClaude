"""Routing skill invariants."""

from __future__ import annotations

import re
import unittest

from tests.frontmatter import PLUGIN, parse
from tests.test_agents import AGENTS

SKILL = PLUGIN / "skills" / "routing" / "SKILL.md"


class SkillTests(unittest.TestCase):
    def test_frontmatter(self) -> None:
        meta, _ = parse(SKILL)
        self.assertEqual(meta["name"], "routing")
        self.assertGreater(len(meta["description"].split()), 15)
        self.assertNotIn("model", meta, "the skill must not switch the parent model")
        self.assertNotIn("disable-model-invocation", meta)

    def test_body_is_small_and_names_every_worker(self) -> None:
        _, body = parse(SKILL)
        self.assertLessEqual(len(body.splitlines()), 80)
        for name in AGENTS:
            self.assertIn(f"omniclaude:{name}", body)

    def test_relative_links_resolve(self) -> None:
        _, body = parse(SKILL)
        links = re.findall(r"\]\((references/[^)]+)\)", body)
        self.assertEqual(set(links), {"references/routing.md", "references/efficiency.md"})
        for link in links:
            self.assertTrue((SKILL.parent / link).is_file(), link)

    def test_honesty_and_date_rules_present(self) -> None:
        _, body = parse(SKILL)
        self.assertIn("today's date", body)
        self.assertIn("Never claim a model switch", body)


if __name__ == "__main__":
    unittest.main()
