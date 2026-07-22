# 게임빌더 v2 — 현재 상태와 결정사항

작성일: 2026-07-23

## 1. 운영 대상

- 저장소: `zeroslove-ai/py-all`
- 메인 Worker: `worker/game-proxy-v2.js`
- 프론트: `pages/`
- 게임 ID: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- 공개 URL: `https://gamebuilder-v2.zeroslove.workers.dev/?game=9ed5b835-9948-4cad-ac25-3ebff7348574`
- Supabase v2 프로젝트: `ovltkzwddxsekcfeskds`

## 2. 최신 확인 버전

- 최신 main 커밋: `3a9be40e512c8af2ef60f927e95bfdce7159c500`
- 기능 코드 커밋: `f812ac80030aa5db681f5b7e77260f3d104997b4`
- 확인된 Worker version_id: `081d4316-9a98-49c6-b0ff-032ed8f41ae7`
- 자동 배포가 연결되어 있으며 Worker는 태그를 노출하지 않는다.

## 3. 핵심 아키텍처

```text
브라우저
  → Cloudflare Worker
    → DeepSeek Story / Extract
    → Supabase RPC
    → 이미지 / TTS
```

주요 엔드포인트:

- `/api/context`
- `/api/story`
- `/api/extract`
- `/api/commit-turn`
- `/api/image`
- `/api/tts`
- `/api/reset`
- `/api/version`

레거시 `/api/save-turn`, `/api/set-save`는 410 처리된다.

## 4. 현재 확정된 UI 규칙

- 본문은 `[1. 서사 및 행동]`, `[2. 플레이어 상황판]`, `[3. 선택지]`만 포함한다.
- 마인드 모니터는 우측 UI 전용이다.
- 일반 플레이 선택지는 정확히 4개다.
- 어플 정보와 플레이 재개는 우측 버튼으로 분리한다.
- 모바일에서는 우측 패널이 서사 아래로 내려간다.
- TTS는 기본 ON이며 현재 메인 NPC 대사를 순차 재생한다.
- 우측 관계 기록은 `💦 사정 n회 · ✨ 오르가즘 n회`만 사용한다.

## 5. NPC 상태 저장 규칙

Extract는 절대값 대신 `npc_stat_changes`의 `delta + reason`을 반환한다.
Worker가 이전 저장값에 delta를 적용하고 0~100으로 제한한다.

- 호감도: -5~+5
- 신뢰도: -5~+5
- 최면깊이: -5~+5, 실제 최면 사건일 때만
- 순응도: 일반 -3~+3, 최면 관련 -5~+5
- 최면저항력: 항상 0, 기존값 유지

현재 메인 NPC만 갱신한다.
UI의 상승·하락 표시는 Worker가 확정한 실제 delta를 사용한다.

## 6. 등록 NPC 제한

상호작용 NPC는 `master.characters`에 등록된 히로인만 허용한다.

- 3병동: heroine1, heroine2, heroine3, heroine4, heroine9, heroine10
- 6병동: heroine5, heroine6
- 의사 중심 장면: heroine7, heroine8

미등록 의사·간호사·환자·보호자·직원은 이름 없는 배경 묘사만 가능하다.
Extract 최초 결과, 재시도 결과, Commit 직전 모두 Worker 하드 검증을 적용한다.

## 7. 레거시 세이브 호환 이슈

기존 진행 데이터에 `player_setup`, `opening_started`가 없으면 최신 Worker가 진행 중 게임을 오프닝으로 오인할 수 있다.

현재 메인 게임은 DB에 다음 호환값을 복구했다.

- `player_setup.status = complete`
- `opening_started = true`

실제 게임 데이터는 초기화되지 않았으며, 당시 확인값은 턴 23 / 메모리 23개였다.

재발 방지 권장 코드:

```js
opening_started:
  save.opening_started === true || Number(ctx?.turn_count) > 0
```

## 8. 리셋 기능 결정

플레이어 정보 유지 리셋은 검토했으나 현재는 구현하지 않는다.
기존 전체 초기화 동작을 유지한다.

## 9. 현재 남은 UI 작업

로딩 표시 위치만 변경한다.

현재:

```text
story-stream 최상단
```

목표:

```text
현재 서사 마지막 줄
로딩 표시
선택지 UI
입력창
```

로딩은 서사 본문 최하단, `bottom-bar` 바로 위에 표시한다.
서사 생성·상태 분석·턴 저장 단계 문구는 유지한다.

## 10. 이미지 카탈로그 향후 작업

아직 미반영 상태다.

- 우선 정리 순서: heroine1 → heroine4 → heroine2 → heroine3
- NPC당 최대 30장 권장
- general 12 + sex 18 권장
- 태그 4축: 감정 / 행동·포즈 / 장소 / 구도
- `sex` 경로는 엄격한 성행위 판정이 아니라 성적·친밀 후보 풀로 취급
- 런타임은 현재 캐릭터 필터 → pool 필터 → 태그 점수 → 상위 후보만 LLM 전달

## 11. 작업 원칙

- 최신 main을 먼저 pull한다.
- 현재 파일 전체를 읽은 뒤 수정한다.
- 과거 파일로 덮어쓰지 않는다.
- Worker, 프론트, DB가 연결된 변경은 한쪽만 수정하지 않는다.
- 테스트 통과 후 커밋한다.
- 배포 후 `/api/version`과 실제 공개 URL을 확인한다.
