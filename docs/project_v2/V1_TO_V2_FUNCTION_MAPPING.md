# 게임빌더 v1 → v2 기능 매핑 및 복원 계획

## 목적

v1 Dify workflow의 기능을 프롬프트 문장 단위로 복제하지 않는다. 각 기능을 v2의 책임 경계(프론트, Worker, Supabase RPC/DB, LLM)로 옮겨 게임 규칙이 실제 상태와 화면에 일관되게 반영되도록 한다.

## 기준 자료

- v1: `게임빌더_v65.yml` — 89개 Dify 노드
- v2: `worker/game-proxy-v2.js`, `pages/`, `supabase/migrations/`

## 현재 v2에서 유지할 기반

| 기반 | 상태 | 이유 |
|---|---|---|
| `commit_turn` 원자 저장 | 유지 | 한 턴의 서사·상태·턴 증가를 하나의 트랜잭션으로 처리한다. |
| `get_context` 기반 재진입 | 유지·확장 | 프론트가 새로고침/재접속 후 상태를 복원하는 기준점이다. |
| Story / Extract 분리 | 유지 | 서사 생성과 상태 추출을 분리해 JSON 파싱 실패의 영향을 줄인다. |
| 이미지·TTS의 별도 호출 | 유지 | 서사 본문에 렌더 마크업을 섞지 않는다. |
| 우측 캐릭터 UI | 유지·확장 | 캐릭터 정보·마인드 모니터·NPC 상태의 전용 표시 영역으로 사용한다. |

## v1 → v2 매핑표

| v1 기능 | v1 구현 | v2 현황 | v2 목표 구현 | 우선순위 |
|---|---|---|---|---|
| 플레이/빌드/삭제 라우팅 | Dify 명령 파서와 분기 | 플레이 흐름 중심 | 웹 메뉴와 명시적 API로 분리: 게임 선택, 생성, 편집, 삭제 | P2 |
| 활성 게임 동기화 | 매 턴 `is_active` 조회 | URL `game` 파라미터 중심 | URL을 기준으로 하되 최근 게임 선택 UX 추가 | P2 |
| 플레이어 생성 | 프리셋·직접입력·필수값 보완 | 이름/직업 위주의 간략 흐름 | `player_setup` 상태 머신과 프리셋/폼 UI | P1 |
| 오프닝 | `opening_scenario` 1회 출력 | `opening_started` 플래그 있음 | 현재 구조 유지, 오프닝 완료 조건을 테스트로 고정 | P1 |
| 게임 난이도 | `game_difficulty` 기반 수치 공식 | 프롬프트에 안정적으로 적용되지 않음 | Worker의 결정적 규칙 함수로 이동 | P0 |
| 행동 결과 | 행동 난이도별 성공/의도외/실패 | LLM 서술에 의존 | `action_resolution` 결과를 추출·검증 후 Worker가 적용 | P0 |
| NPC 5개 상태 | 호감도·신뢰도·최면깊이·순응도·저항력 | 추출값 병합만 수행 | 범위, 변화량, 난이도 보정, 델타 기록을 Worker가 관리 | P0 |
| 마인드 모니터 | 본문 2항목 | 우측 3항목으로 이전됨 | `surface`, `inner`, `physical_reaction` 구조를 유지 | P1 |
| 플레이어 상황판 | 룰북 세부 항목을 매 턴 본문 출력 | LLM 출력 누락 가능 | `display_state`를 구조화해 프론트가 직접 렌더 | P0 |
| 앱 레벨/경험치 | 규칙·표시·레벨업 안내 | 정식 상태 전이 없음 | `app_state`와 레벨 계산 함수 추가 | P0 |
| 상식 개변 | 일일 횟수, 활성 목록, 범위, 지속 | 일부 JSON 필드만 존재 | `csa_state`를 정식 상태로 만들고 적용/해제 API 추가 | P0 |
| 암시 | 동시 대상, 1인당 중첩, 누적 기록 | 정식 상태 전이 없음 | `suggestion_state`와 제한 검증 추가 | P0 |
| 시간·일자 | 상황판에 매 턴 표시 | 정식 월드 시간 없음 | `world_state.datetime`과 턴당 시간 경과 규칙 추가 | P1 |
| 현재 심리·금회 변동 | 상황판 항목 | LLM 본문에만 의존 | `display_state.current_psychology`, `turn_delta`로 저장 | P1 |
| 선택지 | 4~6개, 마지막 앱 정보 보기 | 서사 본문 정규식 파싱 | `extract.choices`를 권위 있는 값으로 사용하고 앱 정보는 UI 버튼화 | P1 |
| 이미지 선택 | 캐릭터·상황·성인여부 교차검증 | 이미지 API는 있으나 추출 신뢰도 의존 | 이미지 선택 검증과 fallback을 Worker에서 표준화 | P1 |
| TTS | 음성 토글·화자 검증·실패 격리 | 자동 TTS 플래그만 존재 | 토글 UI, 화자별 대사 배열, 실패 비차단 정책 복원 | P2 |
| 기억 압축 | 최근 100턴/누적 요약의 명확한 갱신 | 프롬프트와 LLM 요약에 의존 | 요약 입력·길이·갱신 시점을 서버 계약으로 고정 | P1 |
| 초기화 | 확인 절차 후 진행 초기화 | Worker API만 존재 | 프론트 확인 모달 + 초기화 범위 테스트 | P2 |

## 목표 게임 상태 계약

`game_save.data`를 다음 최상위 그룹으로 정리한다. 기존 필드는 마이그레이션 단계에서 이 구조로 흡수한다.

```json
{
  "player": {},
  "world_state": {
    "datetime": "",
    "location": "",
    "status": ""
  },
  "app_state": {
    "level": 1,
    "xp": 0,
    "daily_limit": 0,
    "daily_used": 0,
    "max_concurrent_targets": 0
  },
  "csa_state": {
    "active": [],
    "applied_today": 0,
    "daily_limit": 0
  },
  "suggestion_state": {
    "active": [],
    "max_stacks_per_target": 0,
    "cumulative_records": {}
  },
  "npc_states": {
    "heroine1": {
      "stats": {},
      "emotion": {},
      "previous_stats": {},
      "last_delta": {}
    }
  },
  "display_state": {
    "current_psychology": "",
    "turn_delta": [],
    "player_board": {}
  },
  "memory_state": {
    "overall": "",
    "recent100": "",
    "recent100_start_turn": 0
  }
}
```

## 턴 처리 책임 분리

### 1. Story LLM

- 현재 상태와 허용된 규칙을 읽어 서사와 NPC 대사를 생성한다.
- 숫자 계산, 제한 판정, XP 반영을 최종 결정하지 않는다.
- 본문 출력 순서는 서사, 플레이어 상황판, 선택지로 고정한다.

### 2. Extract LLM

- 서사에서 행동 의도, 대상 NPC, 제안된 변화, 마인드 모니터, 선택지를 구조화한다.
- 출력 계약에는 다음을 포함한다.

```json
{
  "action": { "type": "", "target_id": "", "difficulty": "" },
  "npc_emotion": { "surface": "", "inner": "", "physical_reaction": "" },
  "requested_effects": [],
  "choices": []
}
```

### 3. Worker 규칙 엔진

- 현재 상태와 `action`을 입력으로 받아 결과를 계산한다.
- 난이도, 성공/의도외/실패, 수치 상한·하한, 일일 제한, 중첩 제한, XP, 시간 경과를 결정한다.
- `display_state`, `last_delta`, 다음 턴에 필요한 상태 patch를 만든다.
- LLM이 요청한 값이 규칙 밖이면 거절하거나 보정한다.

### 4. Supabase RPC

- `commit_turn` 안에서 최신 상태를 잠그고 Worker가 확정한 patch만 원자 저장한다.
- 저장 결과에는 `turn_count`, `display_state`, 현재 NPC 상태, 델타를 반환한다.

### 5. Frontend

- 서사는 텍스트로, 상황판·앱 정보·NPC 상태·마인드 모니터는 구조화된 응답으로 렌더한다.
- 본문 파싱에 의존하지 않는다.

## 구현 순서

### P0 — 규칙이 실제로 작동하도록 만들기

1. `app_state`, `csa_state`, `suggestion_state`, `world_state` 스키마와 기본값 정의
2. `resolve_turn` Worker 함수 작성: 행동 결과, 난이도, 수치 변화, XP, 시간, 제한 계산
3. `commit_turn` 입력을 `resolved_patch`와 `display_state` 중심으로 변경
4. NPC 5개 수치의 `previous_stats`와 `last_delta` 저장
5. 룰북의 `game_difficulty`, `action_resolution`, `game_system`, `level_growth`를 JSON 규칙 데이터 또는 명시적 함수로 변환

수용 기준:

- 같은 시작 상태와 같은 행동은 같은 수치 결과를 만든다.
- 일일 횟수와 중첩 제한을 초과하면 상태가 변하지 않는다.
- NPC 수치는 항상 정의된 범위를 벗어나지 않는다.

### P1 — 규칙과 화면을 일치시키기

1. `display_state.player_board` 정의 및 프론트 렌더러 작성
2. 상황판의 전체 항목: 플레이어, 턴/일자/시각, 위치/상태, 앱 레벨/XP, 제한, 암시, 누적 기록, 심리, 변동, 상식 개변
3. `extract.choices`를 UI 선택지의 단일 출처로 변경
4. 플레이어 생성 폼/프리셋과 오프닝 상태 머신 구현
5. 기억 요약의 입력 길이와 갱신 주기를 서버 계약으로 고정

수용 기준:

- 룰북 상황판의 모든 항목이 누락 없이 표시된다.
- 새로고침 후 NPC 델타·앱 상태·시간·선택지가 일관되게 복원된다.
- 본문에는 렌더 전용 UI 정보가 중복되지 않는다.

### P2 — 운영 UX 복원

1. 게임 생성/편집/삭제 화면
2. 초기화 확인 모달
3. 자동 TTS 토글과 대사 큐
4. 재진입 요약과 마지막 선택지 복원
5. 개발용 상태 검사 화면

## 필수 테스트 시나리오

1. 플레이어 생성 → 오프닝 → 첫 행동 → 저장 → 새로고침 → 동일 상태 복원
2. 쉬움/보통/어려움 행동 각각의 성공·의도외·실패 결과
3. 일일 상식 개변 제한과 해제
4. 동시 대상/중첩 암시 제한
5. 레벨업 직전·직후 XP 처리
6. NPC 5개 수치와 ▲/▼가 다음 턴에도 유지되는지
7. 100턴 기억 압축 전후의 문맥 유지
8. 재진입 시 새 턴을 만들지 않고 상태·선택지만 재표시하는지
9. 이미지/TTS 실패가 턴 저장을 막지 않는지
10. `commit_turn` 동시 요청이 중복 턴을 만들지 않는지

## 결정이 필요한 항목

- 게임 시간의 턴당 경과 규칙
- 성공/의도외/실패의 확률형 또는 완전 결정형 여부
- 앱 레벨/XP 표와 레벨업 보상
- 상식 개변·암시의 효과 목록과 스택 규칙
- 상태 수치별 최소/최대값과 신호등 경계
- 플레이어 상황판을 본문에도 유지할지, 별도 패널로 완전히 이전할지

이 문서는 v1 기능을 빠짐없이 옮기기 위한 기준 문서다. 구현은 P0부터 순서대로 진행하며, 각 단계는 수용 기준과 테스트 시나리오를 만족한 뒤 다음 단계로 넘어간다.
