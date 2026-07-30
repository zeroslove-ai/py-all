#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
node --check worker/game-proxy-v2.js
node --check pages/sidebar.js
node --check pages/ui.js
node --check pages/tts.js
node --check pages/stream.js
git diff --check
grep -F "stream: true" worker/game-proxy-v2.js >/dev/null
grep -F "new Response(deepseekRes.body" worker/game-proxy-v2.js >/dev/null
! grep -F "PLAYER_SETUP_CANDIDATES_INVALID" worker/game-proxy-v2.js
! grep -F "STRUCTURED_RESOLUTION_UNAVAILABLE" worker/game-proxy-v2.js
! grep -F "player_recommendations:" worker/game-proxy-v2.js
! grep -F "const PLAYER_SETUP_CHOICES" worker/game-proxy-v2.js
grep -F "const degradedAllowed = !isStructuredAppTransaction" worker/game-proxy-v2.js >/dev/null
grep -F "const hasPersistedSexualCompletion" worker/game-proxy-v2.js >/dev/null
grep -F "상식개변 앱 열기" worker/game-proxy-v2.js >/dev/null
grep -F "이걸로 시작" worker/game-proxy-v2.js >/dev/null
changed="$(git diff --name-only)"
while IFS= read -r path; do
  [ -z "$path" ] && continue
  case "$path" in
    worker/game-proxy-v2.js|AGENTS.md|worker/AGENTS.md|docs/project_v2/STREAM_FIRST_ARCHITECTURE.md|docs/project_v2/HARD_GATE_ALLOWLIST.md) ;;
    *) echo "UNEXPECTED_CHANGED_FILE: $path"; exit 1 ;;
  esac
done <<< "$changed"
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK'))"
echo "VERIFY_OK"
