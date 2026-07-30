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
ALLOWED_UNTRACKED = {"?? .wrangler/", "?? worker/.wrangler/"}


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


if git("rev-parse", "HEAD").strip() != BASE_SHA:
    fail(f"HEAD mismatch: current={git('rev-parse', 'HEAD').strip()} required={BASE_SHA}")
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

apply_path = CACHE / "apply_patch.py"
apply_text = apply_path.read_text(encoding="utf-8")

# 1) Replace the unsafe file-wide H2 regex with a marker-bounded replacement.
helper_boundary = "\n\n\nhead = subprocess.check_output"
if apply_text.count(helper_boundary) != 1:
    fail(f"helper boundary count={apply_text.count(helper_boundary)}")
helper_code = """


def replace_between_once(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        fail(f"{label}: expected one start/end marker, found start={start_count} end={end_count}")
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    return text[:start_index] + replacement + text[end_index:]
"""
apply_text = apply_text.replace(helper_boundary, helper_code + helper_boundary, 1)

call_anchor = "text = replace_regex_once(\n    text,\n    r'''  // H2: caps this turn"
if apply_text.count(call_anchor) != 1:
    fail(f"unsafe call anchor count={apply_text.count(call_anchor)}")
call_start = apply_text.index(call_anchor)
new_block_start = apply_text.index("new_failure_block = r'''")
partial_marker = "  let { extract,'''\n"
partial_start = apply_text.rfind(partial_marker, new_block_start, call_start)
if partial_start < 0:
    fail("new_failure_block partial marker not found")
apply_text = apply_text[:partial_start] + "'''\n" + apply_text[partial_start + len(partial_marker):]

call_start = apply_text.index(call_anchor)
call_end = apply_text.index("\n)\n", call_start) + len("\n)\n")
safe_call = """text = replace_between_once(
    text,
    "  // H2: caps this turn to at most one auxiliary LLM recovery call, and lets",
    "  let { extract, jsonRepaired, mindMonitorRepaired, validation, rawText, effectiveWorldState } = firstPass;",
    new_failure_block,
    "unified extract fail-open",
)
"""
apply_text = apply_text[:call_start] + safe_call + apply_text[call_end:]

# 2) The exact setup-Extract sentence is not a structural prerequisite. Replace it
# when present; if an earlier prompt replacement already removed or changed only
# that sentence, keep going. Still require the setup Extract function and its core
# recommendation rule so a genuinely swallowed function cannot pass silently.
old_optional_call = '''text = replace_once(
    text,
    "- Copy the narrative's [3. 선택지] lines into choices as-is.\\n",
    "- If [3. 선택지] exists, copy its lines into choices as-is. If absent, use an empty array.\\n",
    "optional setup extract choices",
)
'''
new_optional_call = '''if "function buildPlayerSetupOnlyExtractPrompt" not in text:
    fail("setup Extract function missing after prior replacements")
if "- Copy the single player recommendation just shown in the narrative into player_recommendation." not in text:
    fail("setup Extract core recommendation rule missing after prior replacements")
old_choices_rule = "- Copy the narrative's [3. 선택지] lines into choices as-is.\\n"
new_choices_rule = "- If [3. 선택지] exists, copy its lines into choices as-is. If absent, use an empty array.\\n"
if old_choices_rule in text:
    text = text.replace(old_choices_rule, new_choices_rule, 1)
# If the old sentence is absent, choices are already optional in the Story prompt
# and choices defaults remain an empty array. This wording-only replacement must
# never block the runtime patch.
'''
if apply_text.count(old_optional_call) != 1:
    fail(f"optional choices patch-call count={apply_text.count(old_optional_call)}")
apply_text = apply_text.replace(old_optional_call, new_optional_call, 1)

if "r'''  // H2: caps this turn.*?\\n  let \\{ extract," in apply_text:
    fail("unsafe file-wide H2 regex still present")
if apply_text.count("def replace_between_once(") != 1:
    fail("scoped replacement helper count is not one")
if apply_text.count("unified extract fail-open") != 1:
    fail("scoped extract replacement count is not one")
if "optional setup extract choices" in apply_text:
    fail("brittle optional-choice hard gate still present")

apply_path.write_text(apply_text, encoding="utf-8")

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
