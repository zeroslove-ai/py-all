# 게임빌더 v2 — 외부 AI 인수인계서

작성일: 2026-07-23

## 1. 역할과 권한

사용자는 프로젝트 총괄 PM이자 코더다.
Supabase 변경은 사용자가 허용한 범위에서 직접 수행할 수 있다.
GitHub 코드는 사용자가 구현을 명시적으로 요청했을 때 수정한다.
변경 전 최신 파일 전체와 최신 main을 확인한다.
비밀키와 서비스 키는 문서·로그·응답에 노출하지 않는다.

## 2. 프로젝트 개요

게임빌더 v2는 웹 기반 텍스트 게임이다.

- Cloudflare Worker: API 프록시와 Story/Extract 호출, 저장 확정
- Cloudflare Pages 또는 Worker 정적 UI: 게임 화면
- Supabase: 마스터 설정, 세이브, 메모리, 이미지 카탈로그
- DeepSeek: Story와 Extract를 분리 호출
- TTS Worker: NPC 음성 생성

저장소: `zeroslove-ai/py-all`

주요 경로:

- `worker/game-proxy-v2.js`
- `pages/index.html`
- `pages/api.js`
- `pages/ui.js`
- `pages/sidebar.js`
- `pages/tts.js`
- `test/worker.test.js`
- `docs/project_v2/`

메인 게임 ID:

```text
9ed5b835-9948-4cad-ac25-3ebff7348574
```

공개 게임 URL:

```text
https://gamebuilder-v2.zeroslove.workers.dev/?game=9ed5b835-9948-4cad-ac25-3ebff7348574
```

## 3. 현재 배포 기준

- main 커밋: `3a9be40e512c8af2ef60f927e95bfdce7159c500`
- 기능 코드 커밋: `f812ac80030aa5db681f5b7e77260f3d104997b4`
- Worker version_id: `081d4316-9a98-49c6-b0ff-032ed8f41ae7`
- GitHub push 후 Cloudflare 자동 배포가 동작하는 것으로 확인됨
- `/api/version`의 `tag`는 자동 배포본에서 null일 수 있음

## 4. 지금까지 주요 개발 과정

### 4.1 저장 API 통합

기존 `/api/save-turn`, `/api/set-save` 사용을 중단했다.
두 엔드포인트는 410을 반환하며 `/api/commit-turn`만 사용한다.

Commit은 서사와 상태 패치를 한 턴 단위로 저장하고 충돌을 검사한다.

### 4.2 플레이어 설정과 오프닝 분리

리셋 후 첫 단계는 최면 어플 설명과 플레이어 추천 설정만 생성한다.
플레이어 승인 전에는 병원과 NPC를 등장시키지 않는다.
승인 후 플레이어를 저장하고 병원 첫 장면을 한 번 생성한다.

기존 세이브 호환을 위해 `withSetupCompatibility()`가 있다.
단, `opening_started`가 없는 기존 진행 세이브를 오프닝으로 잘못 판단할 수 있는 문제가 발견됐다.
메인 게임 DB에는 `player_setup.status=complete`, `opening_started=true`를 복구했다.
향후 코드에서도 turn_count가 1 이상인 레거시 세이브는 opening_started로 취급하는 보완이 필요하다.

### 4.3 Story와 Extract 프롬프트 분리 및 축소

Story는 다음에 집중한다.

- 서사
- 플레이어 상황판
- 선택지
- 현재 상태와 최근 기억
- 상식 개변 서사

Extract는 다음에 집중한다.

- 현재 메인 NPC 판정
- 마인드 모니터
- 선택지 추출
- 이미지와 TTS 대사
- 저장 패치
- NPC stat delta 판단

NPC 수치 규칙은 Story에 넣지 않고 Extract에만 둔다.
과도한 rulebook 반복 주입을 줄이고 최근 기억은 핵심 3개 정도만 사용한다.

### 4.4 NPC 수치 delta 시스템

과거에는 Story가 숫자를 쓰지 않고 Extract가 새로운 계산을 금지당해 수치가 거의 변하지 않았다.
이를 절대값 방식에서 delta 방식으로 변경했다.

Extract 결과:

```json
{
  "npc_stat_changes": {
    "heroine1": {
      "호감도": {"delta": 1, "reason": "..."}
    }
  }
}
```

Worker가 이전값 + delta를 계산하고 0~100으로 제한한다.
범위 초과 delta는 0 처리하고 로그를 남긴다.
최면저항력은 항상 기존값을 유지한다.
현재 메인 NPC만 갱신한다.
UI는 확정된 실제 delta로 상승·하락 표시를 한다.

판정 기준:

- 호의·편안함·자발적인 대화 지속: 호감도 +1~+2 검토
- 의심 완화·정직성 확인·도움 수용: 신뢰도 +1~+2 검토
- 부탁 수용·자기합리화·유도 수용: 순응도 +1~+3 검토
- 무례·불쾌감: 호감도 -1~-2
- 거짓말·모순·신분 의심: 신뢰도 -1~-3
- 명확한 거부·반발: 순응도 -1~-3
- 변화 없는 대화: 0
- 최면깊이: 실제 최면 시도·성공·실패·각성·활성 암시 작동 때만 변화

### 4.5 등록 히로인만 상호작용

최근 턴에서 Story가 송미영, 박지영 등 등록되지 않은 간호사를 생성해 대사시킨 문제가 있었다.

현재 Worker는 다음 시점에 등록 검증을 한다.

1. Extract 최초 결과
2. 마인드 모니터 재시도 결과
3. `/api/commit-turn` 직전

검증 내용:

- `character_id`는 master.characters key 또는 narrator만 허용
- 미등록 ID는 이전 등록 NPC 또는 narrator로 교체
- `npcs_present` 등록 ID만 유지하고 중복 제거
- 등록 캐릭터 이름이 아닌 dialogue line 제거
- narrator면 NPC 감정·수치·관계·이미지 저장 차단

Story 매 턴 핵심 규칙에도 신규 고유 NPC 생성 금지가 포함됐다.

장소별 연결:

- 3병동: heroine1, heroine2, heroine3, heroine4, heroine9, heroine10
- 6병동: heroine5, heroine6
- 의사 장면: heroine7, heroine8

### 4.6 마인드 모니터

- `surface`, `inner`: 따옴표로 감싼 1인칭 직접 머릿속 독백
- 실질 길이 최소 40자
- 해설문이나 분석문만 작성 금지
- `physical_reaction`: 외부에서 관찰 가능한 행동, 최소 2문장
- 본문에는 출력하지 않고 Extract와 우측 UI에서만 표시

### 4.7 플레이어 상황판

본문의 `[2. 플레이어 상황판]`은 단순 키·값 표가 아니라 최면 어플 화면처럼 작성한다.

가능한 정보:

- 플레이어 정보
- 위치와 시간
- 어플 레벨과 EXP
- 사용 가능한 최면 강도
- 활성 암시
- 상식 개변
- 현재 NPC 요약
- 현재 목표
- 이번 턴 실제 변화
- 따옴표로 감싼 1인칭 플레이어 상황 독백 40자 이상

일반 최면 하루 횟수, 동시 인원, 암시 중첩 제한과 NPC 5개 전체 수치표는 출력하지 않는다.

### 4.8 관계 기록 단순화

NPC별 누적 기록은 두 개만 사용한다.

- `player_ejaculation_count`
- `npc_orgasm_count`

실제 사건이 명확히 완료된 경우에만 증가한다.
우측 UI는 한 줄로 표시한다.

```text
💦 사정 n회 · ✨ 오르가즘 n회
```

### 4.9 이미지 카탈로그 분석

아직 코드와 DB에 최종 반영하지 않았다.

현재 이미지가 많은 캐릭터:

- heroine2: 107
- heroine1: 95
- heroine4: 93
- heroine3: 70

중복 정리 우선순위:

```text
heroine1 → heroine4 → heroine2 → heroine3
```

권장안:

- NPC당 최대 30장
- general 12 + sex 18
- 태그: 감정 / 행동·포즈 / 장소 / 구도
- situation은 15~30자 정도 유지
- `/sex/` 경로와 is_sexual은 현재 일치
- sex 경로에는 일반 친밀 장면도 섞여 있으므로 엄격한 성행위가 아니라 성적·친밀 후보 풀로 취급

데이터 이상 후보:

- heroine1의 `sujin_slender_malepov`가 배수진 설명을 포함함. 캐릭터 오배정 가능성 확인 필요

## 5. 현재 UI 구조

데스크톱:

- 좌측: 서사
- 우측: 캐릭터 이미지, 기본 정보, 마인드 모니터, NPC 상태, 관계 기록, 어플 정보/플레이 재개
- 하단: 선택지와 입력창

모바일:

- 서사
- 선택지와 입력
- 우측 패널이 아래로 이동

현재 남은 즉시 작업은 로딩 표시 위치 변경이다.

현재 로딩 요소는 `story-stream` 첫 자식이라 최상단에 표시된다.
목표는 현재 서사 최하단과 선택지 UI 사이에 표시하는 것이다.

## 6. 바로 다음 작업: 로딩 위치 변경

수정 대상은 주로 `pages/index.html`과 필요 시 `pages/ui.js`다.

요구사항:

- Story 서사 생성 중, Extract 상태 분석 중, Commit 저장 중 문구 유지
- 로딩 표시를 story-stream 최상단에서 제거
- 현재 서사 마지막 줄 아래에 표시
- 선택지 UI와 입력창보다 위에 표시
- 모바일과 데스크톱 모두 동일한 논리적 순서
- 새 로딩이 나타날 때 서사 영역을 최하단으로 스크롤
- 로딩 종료 시 레이아웃 점프 최소화
- 기존 `ui.setLoading(active, text)` API 가능하면 유지
- 리셋 기능은 변경하지 않음

## 7. 테스트와 배포 원칙

변경 전:

```bash
git pull
```

검증:

```bash
npm test
node --check worker/game-proxy-v2.js
```

프론트 변경은 모바일 폭과 데스크톱 폭에서 확인한다.
GitHub main push 후 Cloudflare 자동 배포 상태와 공개 URL을 확인한다.

## 8. 주의사항

- `scripts/make-game-proxy-v2-modified.js`는 참고용이며 배포 대상이 아니다.
- 과거 커밋 원본을 통째로 복원하거나 최신 파일을 덮어쓰지 않는다.
- DB 저장이 초기화된 것처럼 보여도 먼저 `game_save.turn_count`, 메모리 개수, player를 직접 조회한다. UI 분기 오류일 수 있다.
- 현재 reset RPC는 플레이어 정보까지 전체 초기화한다. 플레이어 유지 리셋은 보류 상태다.
- Worker와 프론트가 서로 다른 API 필드명을 사용하는지 항상 확인한다.
