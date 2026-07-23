# GitHub Actions + Playwright E2E 테스트

## 구성

- Workflow: `.github/workflows/game-e2e.yml`
- Playwright 설정: `playwright.config.js`
- 테스트: `test/e2e/game.spec.js`

## 게임 ID

- 운영 smoke 전용: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- 실제 1턴 E2E 전용: `c792613f-dc27-4835-9403-dc87d51b9e91`

전용 게임은 운영 게임의 32턴 시점 상태·기억·이미지를 별도 행으로 복제한 독립 게임이다. 이후 전용 게임의 턴과 상태 변경은 운영 게임에 영향을 주지 않는다.

## 자동 실행

매일 09:00(KST)에 읽기 전용 `smoke`가 실행된다.

E2E 워크플로, Playwright 설정 또는 `test/e2e/**`가 변경된 push에서도 smoke가 실행된다. 일반 게임 코드 push에는 자동 실행하지 않는다.

Smoke 검사:

- `GET /api/version`
- 운영 게임 `POST /api/context`
- 실제 페이지 접속
- 게임 제목·턴 수 로드
- API와 UI 턴 수 일치
- 브라우저 page error 없음
- TTS OFF

Smoke는 Story·Extract·Commit을 호출하지 않으므로 세이브를 변경하지 않는다.

## 모바일 수동 실행

1. GitHub 저장소 `zeroslove-ai/py-all`을 연다.
2. `Actions` 탭을 연다.
3. `Game E2E`를 선택한다.
4. `Run workflow`를 누른다.
5. `mode`를 선택한다.

### smoke

기본값 그대로 실행한다. 운영 게임을 읽기만 한다.

### one_turn

`mode`만 `one_turn`으로 변경한다. 전용 `test_game_id`는 기본 입력돼 있다.

안전장치:

- 빈 test_game_id 차단
- 운영 game_id와 같은 ID 차단
- 자동 TTS OFF
- Commit 후 API와 UI 턴이 정확히 +1인지 검사
- Playwright 자동 재시도 0회

## 선택적 배포 대기

Cloudflare에서 확인한 Worker `version_id`를 `expected_worker_version_id`에 넣고 `version_wait_minutes`를 선택하면 `/api/version`이 일치할 때까지 30초 간격으로 기다린다.

ID를 비우면 현재 배포본의 version_id를 기록하고 즉시 테스트한다.

## 결과

Actions Summary에 핵심 결과가 표시된다.

실행마다 7일간 다음 Artifact를 보관한다.

```text
playwright-report/
test-results/game-e2e/summary.md
test-results/game-e2e/summary.json
test-results/game-e2e/*-diagnostics.json
test-results/game-e2e/*.png
test-results/playwright-artifacts/
```

실패 시 trace, 스크린샷, 영상, 브라우저 콘솔 및 API 응답 기록을 확인한다.

## 비용

- smoke: DeepSeek 호출 없음, 세이브 변경 없음
- one_turn: Story·Extract API 비용 발생
- TTS: 자동 OFF
- one_turn을 반복하면 전용 게임의 turn_count가 계속 증가한다
