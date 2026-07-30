# Resume after PATCH_APPLIED / Node PATH failure

Use this only when the current local state is:

- branch: `apply/stream-first-p0-20260730`
- HEAD: `5c18e161622e4ceb27d502b48933d411004a14bd`
- `worker/game-proxy-v2.js` is modified
- the four contract files are untracked
- `.wrangler/` and `worker/.wrangler/` may be present

Do not rerun any handoff runner. The patch has already been applied.

## 1. Fetch the latest delivery verifier

```powershell
git fetch origin --prune
python -c "import subprocess,pathlib; pathlib.Path('.git/verify-stream-first-p0.ps1').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/verify_windows_node_path.ps1']))"
powershell -NoProfile -ExecutionPolicy Bypass -File .git/verify-stream-first-p0.ps1
```

Expected final lines include:

```text
NODE_EXE=...
ESM_IMPORT_OK
VERIFY_OK
```

The verifier locates `node.exe` by absolute Windows paths and does not depend on Python's inherited PATH.

If verification fails, do not rerun the patch and do not edit files. Report the full verifier output plus:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
```

## 2. Commit and push after VERIFY_OK only

```powershell
git add worker/game-proxy-v2.js AGENTS.md worker/AGENTS.md docs/project_v2/STREAM_FIRST_ARCHITECTURE.md docs/project_v2/HARD_GATE_ALLOWLIST.md
git commit -m "fix: make streamed turns fail open at P0"

git fetch origin --prune
$REMOTE_SHA = (git rev-parse origin/feature/csa-only).Trim()
if ($REMOTE_SHA -ne '5c18e161622e4ceb27d502b48933d411004a14bd') { throw "REMOTE_MOVED: $REMOTE_SHA" }
git merge-base --is-ancestor origin/feature/csa-only HEAD
if ($LASTEXITCODE -ne 0) { throw 'NOT_FAST_FORWARD' }
git push origin HEAD:feature/csa-only
```

Do not force-push.

## 3. Deploy API Worker only

Locate `npx.cmd` explicitly so deployment does not depend on shell aliases:

```powershell
$NPX = (Get-Command npx.cmd -ErrorAction Stop).Source
$HEAD_SHA = (git rev-parse HEAD).Trim()
& $NPX wrangler deploy --cwd worker --keep-vars --tag $HEAD_SHA.Substring(0,12) --message "git:$HEAD_SHA"
```

Deploy only `game-proxy-v2`.

- Do not recreate or deploy deleted `game-builder-v2`.
- Do not redeploy `gamebuilder-v2`.
- Do not touch Supabase.
- Do not call Story, Extract, Commit, Reset, choice-click, or gameplay endpoints.

## 4. Completion report

Report:

1. Starting SHA
2. Final functional SHA
3. Changed files
4. `NODE_EXE`, `ESM_IMPORT_OK`, `VERIFY_OK`
5. API Worker Version ID
6. `/api/version` status and tag
7. Operating/external/E2E URL HTTP status
8. Confirmation that DB, turns, Story/Extract/Commit/Reset were untouched

Required final line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
