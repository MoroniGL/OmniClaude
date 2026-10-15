"""Worker agent invariants: tiers, tools, and anti-nesting."""

from __future__ import annotations

import unittest

from tests.frontmatter import PLUGIN, parse, split_list

AGENTS = {
    "haiku-researcher": ("haiku", "medium"),
    "sonnet-explorer": ("sonnet", "low"),
    "sonnet-implementer": ("sonnet", "medium"),
    "opus-planner": ("opus", "medium"),
    "opus-reviewer": ("opus", "medium"),
    "opus-debugger": ("opus", "high"),
    "fable-expert": ("fable", "low"),
}
ALLOWLISTS = {
    "haiku-researcher": {"Read", "Grep", "Glob", "WebSearch", "WebFetch"},
    "sonnet-explorer": {"Read", "Grep", "Glob", "Bash"},
}
NO_WRITE = {"opus-planner", "opus-reviewer"}
COLORS = {"red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"}
AGENT_DIR = PLUGIN / "agents"


def load(name):
    return parse(AGENT_DIR / f"{name}.md")


class AgentTests(unittest.TestCase):
    def test_exactly_the_seven_workers_exist(self) -> None:
        self.assertEqual({p.stem for p in AGENT_DIR.glob("*.md")}, set(AGENTS))

    def test_tier_model_and_effort(self) -> None:
        for name, (model, effort) in AGENTS.items():
            with self.subTest(agent=name):
                meta, body = load(name)
                self.assertEqual(meta["name"], name)
                self.assertEqual(meta["model"], model)
                self.assertEqual(meta["effort"], effort)
                self.assertIn(meta["color"], COLORS)
                self.assertTrue(body.strip())

    def test_descriptions_are_short_and_name_the_tier(self) -> None:
        for name in AGENTS:
            with self.subTest(agent=name):
                description = load(name)[0]["description"]
                self.assertLessEqual(len(description.split()), 60)
                self.assertIn(f"Tier: {name.split('-')[0]}", description)

    def test_no_worker_can_spawn_subagents(self) -> None:
        for name in AGENTS:
            with self.subTest(agent=name):
                self.assertIn("Agent", split_list(load(name)[0]["disallowedTools"]))

    def test_read_only_workers_have_explicit_allowlists(self) -> None:
        for name, tools in ALLOWLISTS.items():
            with self.subTest(agent=name):
                meta = load(name)[0]
                self.assertEqual(set(split_list(meta["tools"])), tools)
                self.assertEqual(meta["omitClaudeMd"], "true")

    def test_planner_and_reviewer_cannot_write(self) -> None:
        for name in NO_WRITE:
            with self.subTest(agent=name):
                denied = set(split_list(load(name)[0]["disallowedTools"]))
                self.assertTrue({"Edit", "Write", "NotebookEdit"} <= denied)

    def test_models_are_aliases_not_ids(self) -> None:
        for name in AGENTS:
            with self.subTest(agent=name):
                self.assertNotIn("claude-", load(name)[0]["model"])


if __name__ == "__main__":
    unittest.main()
