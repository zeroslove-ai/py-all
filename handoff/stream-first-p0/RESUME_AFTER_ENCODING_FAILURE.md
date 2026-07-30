# Resume after stale-export fix / PowerShell encoding failure

Use this only for the current local state:

- branch: `apply/stream-first-p0-20260730`
- HEAD: `5c18e161622e4ceb27d502b48933d411004a14bd`
- `worker/game-proxy-v2.js` is modified
- the four contract files are untracked
- `.wrangler/` and `worker/.wrangler/` may be present
- stale exports were already removed

Do not rerun any patch or stale-export fixer. The last failure was only a mojibake check inside the PowerShell verifier.

## 1. Fetch and run the ASCII-only verifier

```powershell
git fetch origin --prune
python -c "import subprocess,pathlib; pathlib.Path('.git/verify-p0-ascii.py').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/verify_p0_ascii.py']))"
python -m py_compile .git/verify-p0-ascii.py
python .git/verify-p0-ascii.py
```

If `python` is unavailable, replace it with `py -3`.

Expected final output:

```text
NODE_EXE=C:\Program Files\nodejs\node.exe
ESM_IMPORT_OK
VERIFY_OK
```

This verifier uses only ASCII structural tokens. It does not check Korean source text and is not affected by PowerShell code-page conversion.

If verification fails, do not edit or rerun the patch. Report the full output plus:

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

```powershell
$NPX = (Get-Command npx.cmd -ErrorAction Stop).Source
$HEAD_SHA = (git rev-parse HEAD).Trim()
& $NPX wrangler deploy --cwd worker --keep-vars --tag $HEAD_SHA.Substring(0,12) --message "git:$HEAD_SHA"
```

Deploy only `game-proxy-v2`.

Do not recreate or deploy deleted `game-builder-v2`. Do not redeploy `gamebuilder-v2`. Do not touch Supabase or call Story, Extract, Commit, Reset, choice-click, or gameplay endpoints.

Required final line:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
