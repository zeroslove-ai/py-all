# GitHub Actions + Playwright 운영 E2E 테스트

## 목적

PC Codex·Claude Code를 사용하지 않고 GitHub의 Ubuntu runner에서 실제 Chromium 브라우저로 운영 페이지를 점검한다.

- Workflow: `.github/workflows/game-e2e.yml`
- Playwright 설정: `playwright.config.js`
- 테스트: `test/e2e/game.spec.js`

## 자동 실행

매일 09:00(KST)에 읽기 전용 `smoke`가 실행된다.

검사 항목:

- `GET /api/version`
- 운영 게임의 `POST /api/context`
- 실제 게임 페이지 접속
- 게임 제목·턴 수 로드
- API와 UI의 턴 수 일치
- 브라우저 page error 없음
- TTS OFF 확인

Smoke는 Story·Extract·Commit을 호출하지 않으므로 턴과 세이브를 변경하지 않는다.

## 모바일에서 수동 실행

1. GitHub 저장소 `zeroslove-ai/py-all`을 연다.
2. `Actions` 탭으로 이동한다.
3. `Game E2E`를 선택한다.
4. `Run workflow`를 누른다.
5. `smoke` 또는 `one_turn`을 선택한다.

### smoke

기본값 그대로 실행한다. 운영 게임을 읽기만 한다.

### one_turn

반드시 별도 자동화 전용 `test_game_id`를 입력해야 한다.

안전장치:

- `test_game_id`가 비어 있으면 실패
- `test_game_id`가 운영 `smoke_game_id`와 같으면 실패
- 브라우저 localStorage에서 자동 TTS를 OFF로 설정

현재 Supabase에는 운영 게임만 있으므로, 테스트 게임이 생성되기 전에는 `one_turn`을 실행하지 않는다.

## 배포 version 대기

Cloudflare 자동 배포가 늦을 때 선택적으로 사용할 수 있다.

1. Cloudflare에서 확인한 Worker `version_id`를 `expected_worker_version_id`에 입력한다.
2. `version_wait_minutes`를 15·30·60 중 하나로 설정한다.
3. 테스트는 `/api/version`이 해당 ID가 될 때까지 30초 간격으로 기다린다.

ID를 비워 두면 현재 배포본을 기록만 하고 즉시 테스트한다.

## 실제 1턴 검증 항목

- 전용 게임의 초기 `turn_count`
- Story 응답 성공과 request ID
- Extract 응답 성공·character ID·timing
- Commit 응답 성공·image ID·timing
- UI와 API의 최종 턴이 정확히 `+1`
- 서사·Extract·저장 실패 안내 없음
- 브라우저 page error 없음
- `[extract-timing]`, `[turn-timing]` 콘솔 기록

## 결과 확인

Actions 실행 화면의 Summary에 핵심 결과가 표시된다.

실행마다 7일간 다음 Artifact를 보관한다.

```text
playwright-report/
test-results/game-e2e/summary.md
test-results/game-e2e/summary.json
test-results/game-e2e/*-diagnostics.json
test-results/game-e2e/*.png
test-results/playwright-artifacts/
```

실패 시 Playwright trace, 스크린샷, 영상, 브라우저 콘솔 및 관찰된 API 응답을 확인한다.

## 로컬 실행

```bash
npm install --no-save @playwright/test@latest
npx playwright install chromium

# 읽기 전용
E2E_MODE=smoke npx playwright test test/e2e/game.spec.js

# 전용 게임 실제 1턴
E2E_MODE=one_turn \
E2E_TEST_GAME_ID=<전용_test_game_id> \
E2E_PLAYER_INPUT='현재 상황을 확인하고 차분하게 대화를 이어간다.' \
npx playwright test test/e2e/game.spec.js
```

## 비용과 데이터

- Smoke: DeepSeek 호출 없음, 세이브 변경 없음
- One-turn: Story·Extract DeepSeek 비용과 Supabase·Cloudflare 사용량 발생
- TTS: 자동 OFF이므로 호출하지 않음
- 표준 GitHub-hosted runner와 Artifact를 사용
