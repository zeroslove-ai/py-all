# Resume after stale export syntax failure

Use this only for the current local state:

- branch: `apply/stream-first-p0-20260730`
- HEAD: `5c18e161622e4ceb27d502b48933d411004a14bd`
- the P0 patch is already applied
- `worker/game-proxy-v2.js` is modified
- `AGENTS.md`, `worker/AGENTS.md`, `docs/project_v2/STREAM_FIRST_ARCHITECTURE.md`, and `docs/project_v2/HARD_GATE_ALLOWLIST.md` are untracked
- `.wrangler/` and `worker/.wrangler/` may be untracked

Do not rerun any handoff runner or `apply_patch.py`.

## 1. Apply the exact stale-export correction and run the complete verifier

```powershell
git fetch origin --prune
python -c "import subprocess,pathlib; pathlib.Path('.git/fix-stale-exports-and-verify.ps1').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/fix_stale_exports_and_verify.ps1']))"
powershell -NoProfile -ExecutionPolicy Bypass -File .git/fix-stale-exports-and-verify.ps1
```

Expected final output includes:

```text
STALE_EXPORT_FIX_APPLIED
NODE_EXE=C:\Program Files\nodejs\node.exe
ESM_IMPORT_OK
VERIFY_OK
```

This correction removes only these two stale export entries after their obsolete helper functions were intentionally removed:

```text
hasPotentialUnrecordedFirstEncounter,
canUseDegradedExtract,
```

If verification fails, do not edit or rerun the patch. Report the full output and:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
```

## 2. Commit and push after `VERIFY_OK` only

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

## 3. Deploy only `game-proxy-v2`

```powershell
$NPX = (Get-Command npx.cmd -ErrorAction Stop).Source
$HEAD_SHA = (git rev-parse HEAD).Trim()
& $NPX wrangler deploy --cwd worker --keep-vars --tag $HEAD_SHA.Substring(0,12) --message "git:$HEAD_SHA"
```

Do not recreate or deploy deleted `game-builder-v2`. Do not redeploy `gamebuilder-v2`. Do not touch Supabase or call Story, Extract, Commit, Reset, choice-click, or gameplay endpoints.

Required completion line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
