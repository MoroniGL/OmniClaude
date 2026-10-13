"""Minimal stdlib parser for the flat YAML frontmatter used by OmniClaude assets."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "omniclaude"


def parse(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: missing frontmatter")
    end = text.find("\n---\n", 3)
    if end == -1:
        raise ValueError(f"{path}: unterminated frontmatter")
    meta: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise ValueError(f"{path}: bad frontmatter line {line!r}")
        meta[key.strip()] = value.strip()
    return meta, text[end + 5:]


def split_list(value: str) -> list[str]:
    value = value.strip().removeprefix("[").removesuffix("]")
    return [item.strip() for item in value.split(",") if item.strip()]
