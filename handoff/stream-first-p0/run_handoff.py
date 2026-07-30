#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BASE_SHA = "5c18e161622e4ceb27d502b48933d411004a14bd"
HANDOFF_REF = "origin/handoff/stream-first-p0-20260730"
HANDOFF_DIR = "handoff/stream-first-p0"
ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
CACHE = ROOT / ".git" / "stream-first-p0-handoff"
ALLOWED_UNTRACKED = {
    "?? .wrangler/",
    "?? worker/.wrangler/",
}


def git(*args: str, text: bool = True) -> str | bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=text)


def fail(message: str) -> None:
    raise SystemExit(f"HANDOFF_ABORTED: {message}")


def unexpected_worktree_entries() -> list[str]:
    lines = [line.rstrip() for line in git("status", "--porcelain", "--untracked-files=normal").splitlines() if line.strip()]
    return [line for line in lines if line not in ALLOWED_UNTRACKED]


head = git("rev-parse", "HEAD").strip()
if head != BASE_SHA:
    fail(f"HEAD mismatch: current={head} required={BASE_SHA}")

unexpected = unexpected_worktree_entries()
if unexpected:
    fail("unexpected worktree entries: " + " | ".join(unexpected))

branch = git("branch", "--show-current").strip()
if branch != "feature/csa-only" and not branch.startswith("apply/stream-first-p0"):
    fail(f"unexpected branch: {branch or '(detached)'}")

CACHE.mkdir(parents=True, exist_ok=True)
for name in ["apply_patch.py", "verify.py", "README.md"]:
    data = git("show", f"{HANDOFF_REF}:{HANDOFF_DIR}/{name}", text=False)
    (CACHE / name).write_bytes(data)

subprocess.run([sys.executable, str(CACHE / "apply_patch.py")], cwd=ROOT, check=True)
subprocess.run([sys.executable, str(CACHE / "verify.py")], cwd=ROOT, check=True)
print("HANDOFF_APPLIED_AND_VERIFIED")
