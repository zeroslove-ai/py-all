# 회사편 v1 Codex 구현 전용 계획서

기준일: 2026-08-03

## 0. 역할

Codex는 설계자가 아니다. 이 문서와 단계별 전달문에 정의된 구현·정적 검증·커밋만 수행한다.

Codex가 하지 않는 것:

- 임의 설계 변경
- 병원편 코드 리팩터링
- 기능 범위 확대
- 자동 DB 생성 또는 reset
- 실제 Story/Extract/Commit/TTS 호출
- 사용자의 운영 게임 변경
- force push, reset, rebase
- 실패 뒤 다음 단계 진행

## 1. 고정 기준

- 저장소: `zeroslove-ai/py-all`
- 회사편 브랜치: `feature/company-v1`
- 병원편 브랜치: `feature/csa-only`
- 병원편 운영 코드 SHA: `709f80cf307f7d3107b6d5914b0f5bbfd78cb1d2`
- 회사편 API Worker 예정명: `game-proxy-company-v1`
- 회사편 Frontend Worker 예정명: `gamebuilder-company-v1`
- 금지 Worker: `game-builder-v2`
- 병원편 Supabase project는 회사편에서 사용 금지

## 2. Codex 공통 실행 규칙

1. 시작 시 `git fetch origin`
2. `git pull --ff-only origin feature/company-v1`
3. HEAD와 작업 트리 보고
4. 기존 로컬 변경 보존
5. 한 단계만 수행
6. 첫 오류에서 즉시 중단
7. 오류 뒤 테스트·커밋·푸시·배포 금지
8. 완료 시 수정 파일·검사 결과·SHA 보고
9. 실행 명령은 PowerShell 단일 블록으로 제공
10. `.wrangler/`와 로컬 환경 파일 커밋 금지
11. 단계별 작업 브랜치와 PR을 사용하고 PR을 자동 merge하지 않음
12. 단계 시작 전에 열린 PR과 원격 기준 SHA를 확인

## 3. 구현 원칙

### 3.1 코드 구조

회사편에서는 문자열 patch generator를 만들지 않는다.

금지 예시:

- `replaceOnce(oldFunctionText, newFunctionText)`
- balanced statement text replacement
- part 파일 정렬에 따른 코드 생성
- generated Worker를 Git에 저장

권장:

- 명시적 ES module
- 작은 pure helper
- edition adapter
- JSON content pack
- fixture 기반 테스트

### 3.2 성능

- Story 모델 호출 1회
- SSE body 직접 반환
- Extract 모델 호출 1회
- Commit RPC 1회
- LLM repair 0회
- helper 내부 fetch/DB/timer/random 금지

### 3.3 검증

hard:

- malformed input
- unknown game
- edition mismatch
- turn conflict
- unauthorized completed sexual state

soft:

- optional Extract omission
- runtime mismatch
- missing noncritical NPC state
- meta-awareness
- Story marker 일부 형식 오류

soft 문제로 Story 재작성 또는 Commit 차단 금지.

### 3.4 필수 설계 문서

해당 기능을 구현하기 전에 반드시 읽는다.

- 전체 구조: `MASTER_ARCHITECTURE.md`
- 게임 규칙: `GAME_SYSTEM_DESIGN.md`
- UI/UX: `UI_UX_REDESIGN.md`
- Story 형식과 renderer: `NARRATIVE_OUTPUT_CONTRACT.md`
- 누락 검토: `DESIGN_REVIEW_BACKLOG.md`

Phase 0에서는 UI/UX와 Story marker를 실제 구현하지 않는다. 문서 계약만 보존한다.

## 4. 단계별 구현

## Phase 0 — 골격만 생성

목표:

- 회사편 디렉터리
- package scripts
- Wrangler configs
- 빈 API/Frontend entry
- 공통 edition type

생성 파일:

```text
apps/company-v1/api/src/index.js
apps/company-v1/api/src/edition.js
apps/company-v1/api/wrangler.jsonc
apps/company-v1/frontend/pages/index.html
apps/company-v1/frontend/pages/app.js
apps/company-v1/frontend/wrangler.jsonc
packages/game-core/src/index.js
content/company-v1/edition.json
content/company-v1/organization.json
content/company-v1/map.json
content/company-v1/characters.json
content/company-v1/general_npcs.json
content/company-v1/csa_presets.json
```

정적 계약:

- Worker 이름 정확
- `GAME_EDITION=company-v1`
- 병원 Worker 이름 미사용
- 병원 Supabase ref 문자열 없음
- `hospital|nurse|doctor|patient|병원|간호사|의사|환자` 하드코딩 없음

Phase 0에서는 다음 구현 금지:

- DB·모델 호출
- Story marker parser
- 실제 game UI
- sidebar 복사
- 상태 패널
- 선택지 기능

## Phase 1 — DB 마이그레이션 패키지

목표:

- 신규 Supabase 프로젝트에 적용 가능한 재현 가능한 SQL

작업:

- 병원편 migration을 검토해 필요한 것만 새 migration 계열로 정리
- 6개 core table
- JSONB deep merge
- game resolver
- context RPC
- atomic commit RPC
- history RPC
- reset RPC
- image lookup RPC

원칙:

- 기존 프로젝트 직접 변경 금지
- SQL 파일만 작성
- apply는 사용자 승인 후 별도 단계
- seed와 migration 분리

테스트:

- SQL 파일 존재
- 레거시 API RPC 제외
- 모든 game table에 game_id FK
- image_library game_id 필수 설계
- commit replay/conflict 계약 포함
- reset이 대상 game 외 데이터를 변경하지 않는 계약

## Phase 2 — 공통 API 루프

구현 route:

- `/api/version`
- `/api/context`
- `/api/story`
- `/api/extract`
- `/api/commit-turn`
- `/api/image`
- `/api/tts`
- `/api/history`
- `/api/reset`

순서:

1. request validation
2. game allowlist
3. edition check
4. context load
5. route operation
6. structured log

Story:

- 성공 upstream body 직접 반환
- 전체 body buffer 금지
- Story 후 검증 모델 호출 금지
- `NARRATIVE_OUTPUT_CONTRACT.md`의 marker 계약을 prompt에 포함
- marker 일부 오류는 warning이며 Story 실패가 아님

Extract:

- object만 허용
- delta schema
- warning array 지원
- `dialogue_lines`와 Story 원문을 구분

Commit:

- atomic RPC
- replay 200
- conflict 409
- Story 원문 보존
- parsed block을 저장하더라도 원문을 대체하지 않음

## Phase 3 — 회사 콘텐츠 adapter

구현:

- organization resolver
- role tier
- report line
- current relevant NPC selection
- current scene address
- location/publicness
- work state
- general NPC pool
- focal character와 last speaker 분리

병원 role helper 복사 금지. 회사 role group을 새로 정의.

## Phase 4 — CSA v1

구현 순서:

1. preset catalog schema
2. canonical content builder
3. participant resolver
4. applicability
5. execution mode
6. Story block
7. runtime delta
8. deactivate/aftereffect

신규 필드:

```json
{"execution_mode":"mandatory|normative"}
```

테스트:

- mandatory direct execution
- normative regulation awareness
- normative refusal with consequence awareness
- unknown regulation narration prohibited
- direct action exact scope
- mixed uncovered action not direct
- publicness not authorization
- 현재 장면 적용 규정과 전체 활성 규정 분리

## Phase 5 — 선택지

- 항상 4개
- normal/csa_direct/bold/blocked
- bold only real high-risk
- csa_direct no rate
- button display can shorten, stored text full
- selected choice decision recalculated
- 직접 입력과 선택지 클릭은 같은 player_action 계약 사용
- 연속 클릭과 중복 전송 방지
- blocked는 현재 불가능한 경우에만 사용

## Phase 6 — state

- player
- player_scene_state
- player_sexual_state
- npc_stats
- npc_emotion
- npc_relationship_state
- npc_scene_state
- npc_work_state
- world_state
- turn processing state

병원편 확정 복장·사정 규칙을 모듈로 이식한다. marker patch 금지.

추가 검토:

- `updated_turn`
- persistent/temporary 상태 구분
- scene change 시 종료되는 상태
- 새로고침 복구
- Story/Extract/Commit 실패별 재시도

## Phase 6.5 — Story block parser와 renderer model

기준 문서: `NARRATIVE_OUTPUT_CONTRACT.md`

구현:

- SCENE parser
- DIALOGUE speaker/direction parser
- PLAYER_STATUS parser
- CHOICES parser
- streaming chunk buffer
- malformed marker fallback
- 원문 보존
- dialogue-only TTS queue 입력

내부 구조 예시:

```json
{
  "blocks": [
    {"type":"scene","text":"..."},
    {"type":"dialogue","speaker":"...","direction":"...","text":"..."}
  ],
  "player_status": "...",
  "choices": []
}
```

테스트:

- marker 중간 chunk 분할
- 따옴표 중간 chunk 분할
- SCENE/DIALOGUE 순서 유지
- 다중 NPC
- malformed marker fallback
- 원문 손실 없음

## Phase 7 — Frontend

기준 문서: `UI_UX_REDESIGN.md`

기본 구조:

- 서사/대화 스트림이 가장 큰 영역
- current location/time/task compact header
- current character compact panel
- 현재 장면 적용 CSA 요약
- 4 choices
- 직접 입력
- detail drawer
- mobile navigation
- feedback
- version identity

기본 화면에 상시 쌓지 않는 정보:

- 전체 관계 기록
- 세부 성적 횟수
- 전체 마인드 모니터
- 전체 활성 CSA
- 조직도·지도
- reset·version 관리 기능

필수 UX:

- SCENE은 소설 본문
- DIALOGUE는 화자·연기 지시·대사가 분리된 speech block
- 선택지 버튼 최대 2줄, 저장은 전체 원문
- mobile에서 데스크톱 우측 패널을 그대로 아래에 붙이지 않음
- Story streaming 중 강제 하단 이동 금지
- 이미지/TTS 실패는 비차단
- Story/Extract/Commit 상태를 구분해 표시

Frontend는 API contract 외에 Supabase를 직접 호출하지 않는다.

## Phase 8 — content seed

- company master
- 9 main characters
- 15 general NPCs
- map
- opening
- 24 initial presets
- test game

이미지는 별도 작업. URL을 가짜로 만들지 않는다.

콘텐츠는 한 번에 모두 넣지 않고 최소 수직 슬라이스 후 2명 → 5명 → 9명 순으로 확장 가능하다.

## Phase 9 — static verification

각 테스트 파일을 독립 실행한다.

필수:

- syntax
- API routes
- SSE direct
- atomic commit request mapping
- edition isolation
- forbidden hospital words
- Worker names
- preset canonicalization
- mandatory/normative
- choices
- general NPC
- clothing
- ejaculation
- turn state machine
- Story block parser
- malformed marker fallback
- dialogue-only TTS
- frontend selectors
- responsive/mobile contract
- selection full-text preservation
- `git diff --check`

실제 외부 호출 금지.

## Phase 10 — 사용자가 승인한 뒤만 인프라 작업

Codex가 자동으로 수행하지 않는다.

- Supabase project 생성
- migration apply
- seed apply
- Worker secret 설정
- Cloudflare deploy
- game reset

각 항목은 별도 명시 승인이 있어야 한다.

## 5. 보고 형식

성공:

```text
- 시작 SHA
- 최종 SHA
- 수정 파일
- 수행 단계
- 정적 검사 결과
- 미수행 항목
- 작업 트리
- 작업 브랜치
- PR 번호와 URL
```

실패:

```text
- HEAD
- 실패 단계
- 최초 오류 전문
- 이후 미실행 항목
- 작업 트리
```

## 6. 첫 구현 지시 예정 범위

새 세션의 첫 Codex 작업은 Phase 0만 수행한다.

허용:

- 디렉터리와 빈 모듈
- Wrangler 이름
- content JSON schema skeleton
- static contract tests

금지:

- UI/UX 실제 구현
- Story parser 구현
- Supabase 생성·변경
- Cloudflare 배포
- DeepSeek 호출
- 병원편 코드 수정
- 실제 캐릭터 전체 데이터 확정

Phase 0 시작 전에 `feature/company-v1`을 최신 fast-forward하고 그 최신 SHA를 지시서에 사용한다. 과거 SHA를 고정해 재사용하지 않는다.

## 7. Codex 기본 문장

> 설계 판단이나 범위 확대를 하지 말고 `docs/company_v1`의 확정 설계만 구현한다. 병원편 코드와 운영 인프라는 건드리지 않는다. 현재 단계만 수행하고 첫 실패에서 즉시 중단한다. force/reset/rebase를 사용하지 않고 fast-forward와 일반 push만 사용한다. 외부 Story/Extract/Commit/TTS 호출, Supabase 변경, Cloudflare 배포, 게임 reset은 명시 승인 전까지 금지한다. 회사편은 문자열 patch generator 없이 명시적 모듈과 독립 테스트로 작성한다. UI는 `UI_UX_REDESIGN.md`, Story 형식은 `NARRATIVE_OUTPUT_CONTRACT.md`, 누락 검토는 `DESIGN_REVIEW_BACKLOG.md`를 따른다.
