# Stream-first P0 — GitHub handoff

## Delivery branch

- Repository: `zeroslove-ai/py-all`
- Delivery-only branch: `handoff/stream-first-p0-20260730`
- Production branch: `feature/csa-only`
- Required production HEAD before applying: `5c18e161622e4ceb27d502b48933d411004a14bd`

This delivery branch is not a production branch. Do not merge or deploy it. The handoff runner reads the delivery files directly from the Git object database and applies them only to a clean local branch created from `origin/feature/csa-only`.

Supabase `opening_scenario` was already updated directly for the operating, external tester, and E2E games. Do not run any SQL or mutate Supabase.

## Windows-safe exact apply procedure

The existing local branch may be unrelated or stale. Preserve it. Do not reset, rebase, or delete it.

Run from the repository root in PowerShell or cmd:

```powershell
git status --porcelain
```

The output must be empty. If it is not empty, stop and report it.

Then:

```powershell
git fetch origin --prune
git rev-parse origin/feature/csa-only
```

The result must be exactly:

```text
5c18e161622e4ceb27d502b48933d411004a14bd
```

Create a fresh local application branch without altering the current historical branch:

```powershell
git switch --detach origin/feature/csa-only
git switch -c apply/stream-first-p0-20260730
git fetch origin handoff/stream-first-p0-20260730
```

Load the cross-platform runner directly from the delivery branch without `tar`, ZIP upload, checkout, or merge:

```powershell
python -c "import subprocess,pathlib; pathlib.Path('.git/stream-first-p0-run.py').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/run_handoff.py']))"
python .git/stream-first-p0-run.py
```

If `python` is unavailable but the Windows launcher exists, use:

```powershell
py -3 -c "import subprocess,pathlib; pathlib.Path('.git/stream-first-p0-run.py').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/run_handoff.py']))"
py -3 .git/stream-first-p0-run.py
```

Expected final output:

```text
VERIFY_OK
HANDOFF_APPLIED_AND_VERIFIED
```

Do not manually edit around a mismatch. If the runner fails, stop and report the complete output, current branch, current SHA, and `git status --short`.

## Expected changed files

```text
worker/game-proxy-v2.js
AGENTS.md
worker/AGENTS.md
docs/project_v2/STREAM_FIRST_ARCHITECTURE.md
docs/project_v2/HARD_GATE_ALLOWLIST.md
```

Files written under `.git/stream-first-p0-handoff` and `.git/stream-first-p0-run.py` are not part of the worktree and must not be committed.

## Commit and push

```powershell
git add worker/game-proxy-v2.js AGENTS.md worker/AGENTS.md docs/project_v2/STREAM_FIRST_ARCHITECTURE.md docs/project_v2/HARD_GATE_ALLOWLIST.md
git commit -m "fix: make streamed turns fail open at P0"

git fetch origin --prune
git rev-parse origin/feature/csa-only
git merge-base --is-ancestor origin/feature/csa-only HEAD
```

Before push:

- `origin/feature/csa-only` must still be `5c18e161622e4ceb27d502b48933d411004a14bd`.
- `git merge-base --is-ancestor` must exit with code `0`.

Then use normal fast-forward push only:

```powershell
git push origin HEAD:feature/csa-only
```

Do not force-push. If the ordinary push is rejected, stop and report the new remote SHA.

## Deploy

After push, deploy only the API Worker:

PowerShell:

```powershell
$HEAD_SHA = git rev-parse HEAD
npx wrangler deploy --cwd worker --keep-vars --tag $HEAD_SHA.Substring(0,12) --message "git:$HEAD_SHA"
```

- Deploy: `game-proxy-v2`
- Deleted `game-builder-v2` no longer exists and must not be recreated.
- Runtime frontend files are unchanged, so do not manually redeploy `gamebuilder-v2`.

## Prohibited actions

- Do not redesign or add validation/repair layers.
- Do not merge the delivery branch into `feature/csa-only`.
- Do not run Story, Extract, Commit, Reset, choice-click, or gameplay tests.
- Do not mutate Supabase.
- Do not resolve patch mismatches manually.
- Do not reset, rebase, or delete the existing `integrate/setup-csa-gateway-hotfix` branch.

## Completion report

Report:

1. Starting SHA
2. Final functional SHA
3. Changed files
4. Static verification output
5. API Worker Version ID
6. `/api/version` status and tag
7. Operating/external/E2E URL HTTP status
8. Confirmation that DB, turns, Story/Extract/Commit/Reset were untouched

Required final line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
