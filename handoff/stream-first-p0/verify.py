#!/usr/bin/env python3
from __future__ import annotations

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


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def require_contains(text: str, needle: str) -> None:
    if needle not in text:
        raise SystemExit(f"VERIFY_FAILED: required text missing: {needle}")


def require_absent(text: str, needle: str) -> None:
    if needle in text:
        raise SystemExit(f"VERIFY_FAILED: forbidden text remains: {needle}")


for path in [
    "worker/game-proxy-v2.js",
    "pages/sidebar.js",
    "pages/ui.js",
    "pages/tts.js",
    "pages/stream.js",
]:
    result = run(["node", "--check", path], check=False)
    if result.returncode != 0:
        raise SystemExit(result.stdout + result.stderr)

result = run(["git", "diff", "--check"], check=False)
if result.returncode != 0:
    raise SystemExit(result.stdout + result.stderr)

worker_text = WORKER.read_text(encoding="utf-8")
require_contains(worker_text, "stream: true")
require_contains(worker_text, "new Response(deepseekRes.body")
require_absent(worker_text, "PLAYER_SETUP_CANDIDATES_INVALID")
require_absent(worker_text, "STRUCTURED_RESOLUTION_UNAVAILABLE")
require_absent(worker_text, "player_recommendations:")
require_absent(worker_text, "const PLAYER_SETUP_CHOICES")
require_contains(worker_text, "const degradedAllowed = !isStructuredAppTransaction")
require_contains(worker_text, "const hasPersistedSexualCompletion")
require_contains(worker_text, "상식개변 앱 열기")
require_contains(worker_text, "이걸로 시작")

changed = run(["git", "diff", "--name-only"]).stdout.splitlines()
unexpected = sorted(path for path in changed if path and path not in ALLOWED_CHANGED)
if unexpected:
    raise SystemExit("VERIFY_FAILED: unexpected changed files: " + ", ".join(unexpected))

result = run([
    "node",
    "-e",
    "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK'))",
], check=False)
if result.returncode != 0:
    raise SystemExit(result.stdout + result.stderr)

print("VERIFY_OK")
