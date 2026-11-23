"""Minimal .env editor: set/get/remove one key, leave every other line alone."""
from __future__ import annotations

import os
import re
from pathlib import Path

_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _unquote(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        out, i, body = [], 0, raw[1:-1]
        while i < len(body):
            ch = body[i]
            if ch == "\\" and i + 1 < len(body):
                nxt = body[i + 1]
                out.append({"n": "\n", "t": "\t"}.get(nxt, nxt))
                i += 2
                continue
            out.append(ch)
            i += 1
        return "".join(out)
    if len(raw) >= 2 and raw[0] == raw[-1] == "'":
        return raw[1:-1]
    return raw.split(" #", 1)[0].strip()


def _read_lines(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _write_lines(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    os.replace(tmp, path)


def get_var(path: Path, key: str) -> str | None:
    for line in _read_lines(path):
        m = _LINE.match(line)
        if m and m.group(1) == key:
            return _unquote(m.group(2))
    return None


def set_var(path: Path, key: str, value: str) -> None:
    lines = _read_lines(path)
    new_line = f"{key}={_quote(value)}"
    out, done = [], False
    for line in lines:
        m = _LINE.match(line)
        if m and m.group(1) == key:
            if not done:
                out.append(new_line)
                done = True
            continue
        out.append(line)
    if not done:
        out.append(new_line)
    _write_lines(path, out)
    os.environ[key] = value


def remove_var(path: Path, key: str) -> None:
    lines = _read_lines(path)
    out = [l for l in lines if not ((m := _LINE.match(l)) and m.group(1) == key)]
    if out != lines:
        _write_lines(path, out)
    os.environ.pop(key, None)
