#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BASE_SHA = "5c18e161622e4ceb27d502b48933d411004a14bd"
HANDOFF_REF = "origin/handoff/stream-first-p0-20260730"
HANDOFF_DIR = "handoff/stream-first-p0"
ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
CACHE = ROOT / ".git" / "stream-first-p0-handoff"
EXCLUDE_FILE = ROOT / ".git" / "stream-first-p0-local-excludes"
ALLOWED_UNTRACKED = {
    "?? .wrangler/",
    "?? worker/.wrangler/",
}


def git(*args: str, text: bool = True) -> str | bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=text)


def fail(message: str) -> None:
    raise SystemExit(f"HANDOFF_ABORTED: {message}")


def unexpected_worktree_entries() -> list[str]:
    lines = [
        line.rstrip()
        for line in git("status", "--porcelain", "--untracked-files=normal").splitlines()
        if line.strip()
    ]
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

# Revision 2 correction: the original patch used a broad regex beginning at the
# first file-wide "// H2: caps this turn" comment. That could consume unrelated
# helper functions before runExtractPipeline. Replace it in the cached copy with
# exact start/end markers scoped to runExtractPipeline. The delivery branch is
# never merged, and only this corrected cached script touches the worktree.
apply_path = CACHE / "apply_patch.py"
apply_text = apply_path.read_text(encoding="utf-8")

helper_anchor = '''def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:\n    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)\n    if count != 1:\n        fail(f"{label}: expected exactly one regex match, found {count}")\n    return updated\n\n\n'''
helper_insert = helper_anchor + '''def replace_between_once(text: str, start: str, end: str, replacement: str, label: str) -> str:\n    start_count = text.count(start)\n    end_count = text.count(end)\n    if start_count != 1 or end_count != 1:\n        fail(f"{label}: expected one start/end marker, found start={start_count} end={end_count}")\n    start_index = text.index(start)\n    end_index = text.index(end, start_index)\n    return text[:start_index] + replacement + text[end_index:]\n\n\n'''
if apply_text.count(helper_anchor) != 1:
    fail(f"apply helper anchor count={apply_text.count(helper_anchor)}")
apply_text = apply_text.replace(helper_anchor, helper_insert, 1)

old_tail = '''  }\n\n  let { extract,''\'\ntext = replace_regex_once(\n    text,\n    r'''  // H2: caps this turn.*?\\n  let \\{ extract,''',\n    new_failure_block,\n    "unified extract fail-open",\n)\n'''
new_tail = '''  }\n\n'''\ntext = replace_between_once(\n    text,\n    "  // H2: caps this turn to at most one auxiliary LLM recovery call, and lets",\n    "  let { extract, jsonRepaired, mindMonitorRepaired, validation, rawText, effectiveWorldState } = firstPass;",\n    new_failure_block,\n    "unified extract fail-open",\n)\n'''
if apply_text.count(old_tail) != 1:
    fail(f"unsafe extract replacement anchor count={apply_text.count(old_tail)}")
apply_text = apply_text.replace(old_tail, new_tail, 1)

if "r'''  // H2: caps this turn.*?\\n  let \\{ extract," in apply_text:
    fail("unsafe file-wide H2 regex still present")
if "replace_between_once(" not in apply_text:
    fail("scoped replacement helper missing")

apply_path.write_text(apply_text, encoding="utf-8")

# Hide only the two known generated Wrangler cache directories from the nested
# patch process. Any other modified or untracked entry stays visible and fatal.
EXCLUDE_FILE.write_text("/.wrangler/\n/worker/.wrangler/\n", encoding="utf-8")
child_env = os.environ.copy()
child_env.update({
    "GIT_CONFIG_COUNT": "1",
    "GIT_CONFIG_KEY_0": "core.excludesFile",
    "GIT_CONFIG_VALUE_0": str(EXCLUDE_FILE),
})

subprocess.run([sys.executable, "-m", "py_compile", str(apply_path)], cwd=ROOT, env=child_env, check=True)
subprocess.run([sys.executable, str(apply_path)], cwd=ROOT, env=child_env, check=True)
subprocess.run([sys.executable, str(CACHE / "verify.py")], cwd=ROOT, env=child_env, check=True)
print("HANDOFF_APPLIED_AND_VERIFIED")
