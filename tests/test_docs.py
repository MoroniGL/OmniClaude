"""User-facing documentation invariants."""

from __future__ import annotations

import unittest

from tests.frontmatter import ROOT
from tests.test_manifests import DISCLAIMER


class DocsTests(unittest.TestCase):
    def test_readme_essentials(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(DISCLAIMER, readme)
        self.assertIn("/plugin marketplace add MoroniGL/Omniclaude", readme)
        self.assertIn("/plugin install omniclaude@moronigl", readme)
        self.assertIn((ROOT / "VERSION").read_text(encoding="utf-8").strip(), readme)
        self.assertIn("not a savings guarantee", readme.lower())

    def test_changelog_has_current_version(self) -> None:
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        self.assertIn(f"## {version}", (ROOT / "CHANGELOG.md").read_text(encoding="utf-8"))

    def test_docs_exist(self) -> None:
        for name in ("architecture.md", "profiles.md"):
            self.assertTrue((ROOT / "docs" / name).is_file(), name)


if __name__ == "__main__":
    unittest.main()
