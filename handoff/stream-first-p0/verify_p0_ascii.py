#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
WORKER = ROOT / "worker" / "game-proxy-v2.js"
ALLOWED_CHANGED = {
    "worker/game-proxy-v2.js",
    "AGENTS.md",
    "worker/AGENTS.md",
    "docs/project_v2/STREAM_FIRST_ARCHITECTURE.md",
    "docs/project_v2/HARD_GATE_ALLOWLIST.md",
}
ALLOWED_UNTRACKED_PREFIXES = (".wrangler/", "worker/.wrangler/")


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def fail(message: str) -> None:
    raise SystemExit(f"VERIFY_FAILED: {message}")


def find_node() -> str:
    candidates: list[str] = []
    which = shutil.which("node")
    if which:
        candidates.append(which)
    for env_name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        base = os.environ.get(env_name)
        if not base:
            continue
        candidates.extend([
            str(Path(base) / "nodejs" / "node.exe"),
            str(Path(base) / "Programs" / "nodejs" / "node.exe"),
        ])
    candidates.append(r"C:\Program Files\nodejs\node.exe")
    candidates.append(r"C:\Program Files (x86)\nodejs\node.exe")
    seen: set[str] = set()
    for candidate in candidates:
        normalized = str(Path(candidate))
        if normalized in seen:
            continue
        seen.add(normalized)
        if Path(normalized).is_file():
            return normalized
    fail("NODE_EXE_NOT_FOUND")


node = find_node()
print(f"NODE_EXE={node}")

for path in [
    "worker/game-proxy-v2.js",
    "pages/sidebar.js",
    "pages/ui.js",
    "pages/tts.js",
    "pages/stream.js",
]:
    result = run([node, "--check", path], check=False)
    if result.returncode != 0:
        raise SystemExit(result.stdout + result.stderr + f"\nNODE_CHECK_FAILED: {path}")

result = run(["git", "diff", "--check"], check=False)
if result.returncode != 0:
    raise SystemExit(result.stdout + result.stderr)

worker_text = WORKER.read_text(encoding="utf-8")
required_ascii = [
    "stream: true",
    "new Response(deepseekRes.body",
    "function normalizeExplicitAppCommand(",
    "function resolveCsaAppUiRoute(input)",
    "const degradedAllowed = !isStructuredAppTransaction",
    "const hasPersistedSexualCompletion",
    "function isApprovalInput(",
    "function buildDefaultPlayerSetupChoices()",
    "return [];",
    "function buildPlayerSetupOnlyExtractPrompt",
]
for needle in required_ascii:
    if needle not in worker_text:
        fail(f"REQUIRED_ASCII_MISSING: {needle}")

forbidden_ascii = [
    "PLAYER_SETUP_CANDIDATES_INVALID",
    "STRUCTURED_RESOLUTION_UNAVAILABLE",
    "player_recommendations:",
    "const PLAYER_SETUP_CHOICES",
    "hasPotentialUnrecordedFirstEncounter,",
    "canUseDegradedExtract,",
]
for needle in forbidden_ascii:
    if needle in worker_text:
        fail(f"FORBIDDEN_ASCII_REMAINS: {needle}")

changed = set(run(["git", "diff", "--name-only"]).stdout.splitlines())
untracked = set(run(["git", "ls-files", "--others", "--exclude-standard"]).stdout.splitlines())
for path in sorted(changed | untracked):
    if not path:
        continue
    if path in ALLOWED_CHANGED:
        continue
    if path.startswith(ALLOWED_UNTRACKED_PREFIXES):
        continue
    fail(f"UNEXPECTED_CHANGED_PATH: {path}")

result = run([
    node,
    "-e",
    "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})",
], check=False)
if result.returncode != 0:
    raise SystemExit(result.stdout + result.stderr)
if result.stdout.strip():
    print(result.stdout.strip())

print("VERIFY_OK")
