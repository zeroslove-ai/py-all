# Stream-first P0 — GitHub handoff

## Delivery branch

- Repository: `zeroslove-ai/py-all`
- Delivery-only branch: `handoff/stream-first-p0-20260730`
- Production branch: `feature/csa-only`
- Required production HEAD before applying: `5c18e161622e4ceb27d502b48933d411004a14bd`

This delivery branch is not a production branch. Do not merge or deploy it. Extract the handoff files into `.git/stream-first-p0-handoff`, apply them while checked out on `feature/csa-only`, then commit only the generated runtime/document changes.

Supabase `opening_scenario` was already updated directly for the operating, external tester, and E2E games. Do not run any SQL or mutate Supabase.

## Exact apply procedure

Run from the repository root:

```bash
git fetch origin --prune
git switch feature/csa-only
git pull --ff-only

test "$(git rev-parse HEAD)" = "5c18e161622e4ceb27d502b48933d411004a14bd"
test -z "$(git status --porcelain)"

git fetch origin handoff/stream-first-p0-20260730
rm -rf .git/stream-first-p0-handoff
mkdir -p .git/stream-first-p0-handoff

git archive origin/handoff/stream-first-p0-20260730 handoff/stream-first-p0 \
  | tar -x -C .git/stream-first-p0-handoff --strip-components=2

python3 .git/stream-first-p0-handoff/apply_patch.py
bash .git/stream-first-p0-handoff/verify.sh
```

Do not manually edit around a mismatch. If `apply_patch.py` or `verify.sh` fails, stop and report the full output and current SHA.

## Expected changed files

```text
worker/game-proxy-v2.js
AGENTS.md
worker/AGENTS.md
docs/project_v2/STREAM_FIRST_ARCHITECTURE.md
docs/project_v2/HARD_GATE_ALLOWLIST.md
```

The delivery files under `.git/stream-first-p0-handoff` are not part of the worktree and must not be committed.

## Commit and push

```bash
git add \
  worker/game-proxy-v2.js \
  AGENTS.md \
  worker/AGENTS.md \
  docs/project_v2/STREAM_FIRST_ARCHITECTURE.md \
  docs/project_v2/HARD_GATE_ALLOWLIST.md

git commit -m "fix: make streamed turns fail open at P0"
git push origin HEAD:feature/csa-only
```

Use normal fast-forward push only. Do not force-push.

## Deploy

After push, deploy only the API Worker:

```bash
HEAD_SHA="$(git rev-parse HEAD)"
npx wrangler deploy --cwd worker --keep-vars \
  --tag "${HEAD_SHA:0:12}" \
  --message "git:$HEAD_SHA"
```

- Deploy: `game-proxy-v2`
- Do not deploy deleted `game-builder-v2`
- Runtime frontend files are unchanged, so do not manually redeploy `gamebuilder-v2`

## Prohibited actions

- Do not redesign or add new validation/repair layers.
- Do not merge the delivery branch into `feature/csa-only`.
- Do not run Story, Extract, Commit, Reset, choice-click, or gameplay tests.
- Do not mutate Supabase.
- Do not resolve patch mismatches manually.

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
