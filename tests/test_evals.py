"""Eval suite structure checks (offline)."""

from __future__ import annotations

import unittest

from tests.frontmatter import PLUGIN, parse, split_list

EVALS = PLUGIN / "evals"
CASES = {"scout-call-sites", "implement-discount", "docs-lookup", "tiny-edit"}
PROMPT_KEYS = {"schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome",
               "model", "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env"}
GRADER_TYPES = {"regex", "tool_used", "tool_order", "file_exists", "llm", "baseline"}


class EvalTests(unittest.TestCase):
    def test_case_set(self) -> None:
        found = {p.parent.name for p in EVALS.glob("*/prompt.md")}
        self.assertEqual(found, CASES)

    def test_prompt_frontmatter(self) -> None:
        for case in CASES:
            with self.subTest(case=case):
                meta, body = parse(EVALS / case / "prompt.md")
                self.assertLessEqual(set(meta), PROMPT_KEYS)
                self.assertTrue(body.strip())
                tools = set(split_list(meta["allowed_tools"]))
                self.assertNotIn("Bash", tools, "native Windows refuses Bash-granting eval runs")
                self.assertTrue({"Agent", "Skill"} <= tools)

    def test_graders(self) -> None:
        for case in CASES:
            with self.subTest(case=case):
                graders = list((EVALS / case / "graders").glob("*.md"))
                self.assertGreaterEqual(len(graders), 2)
                for grader in graders:
                    self.assertIn(parse(grader)[0]["type"], GRADER_TYPES)
                no_astra = EVALS / case / "graders" / "no-astra.md"
                self.assertTrue(no_astra.is_file(), "every case must forbid astra-expert")
                self.assertEqual(parse(no_astra)[0]["type"], "tool_used")

    def test_frontmatter_scalars_are_yaml_safe(self) -> None:
        # Claude Code parses this frontmatter as real YAML. An unquoted scalar that ends with ":"
        # or contains ": " is a parse error there, even though our flat parser accepts it.
        files = [EVALS / case / "prompt.md" for case in CASES]
        files += [g for case in CASES for g in (EVALS / case / "graders").glob("*.md")]
        for path in files:
            with self.subTest(file=str(path.relative_to(EVALS))):
                for key, value in parse(path)[0].items():
                    if value.startswith(('"', "'", "[", "{")):
                        continue
                    self.assertFalse(value.endswith(":"), f"{key}: unquoted value ends with ':'")
                    self.assertNotIn(": ", value, f"{key}: unquoted value contains ': '")

    def test_scaffold_scripts_exist(self) -> None:
        for case in CASES:
            with self.subTest(case=case):
                self.assertTrue((EVALS / case / "scaffold.sh").is_file())
                self.assertIn("scaffold.sh", (EVALS / case / "case.yaml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
