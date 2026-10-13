"""Tests for the stdlib frontmatter helper used by the asset tests."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tests.frontmatter import parse, split_list


class FrontmatterTests(unittest.TestCase):
    def write(self, text: str) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8", newline="")
        handle.write(text)
        handle.close()
        self.addCleanup(Path(handle.name).unlink)
        return Path(handle.name)

    def test_parses_scalar_keys_and_body(self) -> None:
        meta, body = parse(self.write("---\nname: luna\ndescription: a: b\n---\nBody line\n"))
        self.assertEqual(meta, {"name": "luna", "description": "a: b"})
        self.assertEqual(body, "Body line\n")

    def test_accepts_crlf(self) -> None:
        meta, body = parse(self.write("---\r\nname: x\r\n---\r\nB\r\n"))
        self.assertEqual(meta["name"], "x")
        self.assertEqual(body, "B\n")

    def test_rejects_missing_or_unterminated_block(self) -> None:
        with self.assertRaises(ValueError):
            parse(self.write("name: x\n"))
        with self.assertRaises(ValueError):
            parse(self.write("---\nname: x\n"))

    def test_split_list(self) -> None:
        self.assertEqual(split_list("Read, Grep,Glob"), ["Read", "Grep", "Glob"])
        self.assertEqual(split_list("[Read, Skill]"), ["Read", "Skill"])
        self.assertEqual(split_list(""), [])


if __name__ == "__main__":
    unittest.main()
