# Resume P0 handoff from current Windows apply branch

Use this only when the current local state is:

- branch: `apply/stream-first-p0-20260730`
- HEAD: `5c18e161622e4ceb27d502b48933d411004a14bd`
- worktree entries are only:
  - `?? .wrangler/`
  - `?? worker/.wrangler/`

The previous failure did not modify tracked files. Do not delete or recreate the branch.

## 1. Refresh the delivery branch

```powershell
git fetch origin --prune
git rev-parse HEAD
git branch --show-current
git status --short
```

Confirm the state above exactly.

## 2. Load the validated revision-3 runner

Do not reuse `run_handoff.py` or `run_handoff_v2.py`.

```powershell
python -c "import subprocess,pathlib; pathlib.Path('.git/stream-first-p0-run-v3.py').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/run_handoff_v3.py']))"
python -m py_compile .git/stream-first-p0-run-v3.py
python .git/stream-first-p0-run-v3.py
```

If `python` is unavailable, replace each `python` with `py -3`.

The expected final output includes all three lines:

```text
PATCH_APPLIED
VERIFY_OK
HANDOFF_APPLIED_AND_VERIFIED
```

The revision-3 runner fixes the prior patch bug by replacing only the `runExtractPipeline()` Extract failure block between exact start/end markers. It does not use the earlier file-wide `// H2` regular expression.

## 3. Stop conditions

If any command fails, do not edit the Worker manually. Report:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
git diff --stat
git diff -- worker/game-proxy-v2.js
```

## 4. Commit, push, deploy after success only

```powershell
git add worker/game-proxy-v2.js AGENTS.md worker/AGENTS.md docs/project_v2/STREAM_FIRST_ARCHITECTURE.md docs/project_v2/HARD_GATE_ALLOWLIST.md
git commit -m "fix: make streamed turns fail open at P0"

git fetch origin --prune
git rev-parse origin/feature/csa-only
git merge-base --is-ancestor origin/feature/csa-only HEAD
git push origin HEAD:feature/csa-only
```

The remote must still be `5c18e161622e4ceb27d502b48933d411004a14bd` before push, and the merge-base command must exit `0`.

Deploy only the API Worker:

```powershell
$HEAD_SHA = git rev-parse HEAD
npx wrangler deploy --cwd worker --keep-vars --tag $HEAD_SHA.Substring(0,12) --message "git:$HEAD_SHA"
```

Do not deploy or recreate deleted `game-builder-v2`. Do not redeploy `gamebuilder-v2`. Do not touch Supabase or call Story, Extract, Commit, Reset, or gameplay endpoints.
