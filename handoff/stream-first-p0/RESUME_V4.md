# Resume Stream-first P0 with runner v4

Use only when local state is:

- branch: `apply/stream-first-p0-20260730`
- HEAD: `5c18e161622e4ceb27d502b48933d411004a14bd`
- only untracked entries: `?? .wrangler/`, `?? worker/.wrangler/`

The previous runners stopped before writing tracked files. Do not recreate, reset, rebase, or delete the current branch.

## Commands (PowerShell)

```powershell
git fetch origin --prune
git branch --show-current
git rev-parse HEAD
git status --short

python -c "import subprocess,pathlib; pathlib.Path('.git/stream-first-p0-run-v4.py').write_bytes(subprocess.check_output(['git','show','origin/handoff/stream-first-p0-20260730:handoff/stream-first-p0/run_handoff_v4.py']))"
python -m py_compile .git/stream-first-p0-run-v4.py
python .git/stream-first-p0-run-v4.py
```

Use `py -3` instead of `python` only if needed.

Expected output:

```text
PATCH_APPLIED
VERIFY_OK
HANDOFF_APPLIED_AND_VERIFIED
```

Runner v4 removes the brittle wording-only `optional setup extract choices` hard stop. It still fails if the entire setup Extract function or its core `player_recommendation` rule is missing. It also replaces the Extract failure block only between exact markers inside `runExtractPipeline()`.

After success, commit, fast-forward push, and deploy only `game-proxy-v2` according to `README.md`. Do not touch Supabase or gameplay endpoints. Do not deploy `gamebuilder-v2`, and never recreate deleted `game-builder-v2`.
