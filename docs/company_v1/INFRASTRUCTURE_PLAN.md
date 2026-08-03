# 회사편 v1 인프라 계획

기준일: 2026-08-03

## 1. 기준 결정

회사편은 병원편과 같은 GitHub 저장소를 사용하지만 다음 자원은 독립한다.

- Git branch
- Supabase project
- Cloudflare API Worker
- Cloudflare Frontend Worker
- game IDs
- Worker 비밀값
- image catalog
- deploy history

공유 가능 자원은 TTS Worker와 공통 소스 코드뿐이다.

## 2. GitHub

### 브랜치

- 병원편: `feature/csa-only`
- 회사편: `feature/company-v1`
- 병원편 운영 코드 SHA `709f80cf307f7d3107b6d5914b0f5bbfd78cb1d2`는 참조 전용
- 회사편을 병원편 브랜치에서 직접 개발하지 않는다.

### 권장 디렉터리

```text
apps/company-v1/api/src
apps/company-v1/frontend/pages
packages/game-core/src
content/company-v1
docs/company_v1
supabase/migrations
supabase/seed-company-v1.sql
```

### Git 원칙

- 문서 → 골격 → DB → API → 콘텐츠 → Frontend 순서
- 각 단계 독립 커밋
- force push, reset, rebase 금지
- fetch와 fast-forward only 사용
- `.wrangler/`, 로컬 환경 파일, Worker 비밀값 커밋 금지

## 3. Supabase

### 신규 프로젝트

- 권장 이름: `AI_웹개발_회사편`
- 권장 리전: `ap-northeast-2`
- 기존 조직 사용
- 회사편 Worker만 신규 프로젝트에 접근
- 병원편 운영 데이터 복제 금지

### 별도 프로젝트를 권장하는 이유

기존 병원편 DB는 `game_id` 중심으로 격리되어 있어 기술적으로 공유 가능하다. 그러나 회사편은 RPC, 프롬프트, 상태 모델, 이미지 카탈로그, 배포 흐름을 재구성한다. 같은 프로젝트를 사용하면 다음 사고의 영향이 병원편까지 번질 수 있다.

- RPC 변경
- reset 대상 오인
- image query의 game_id 누락
- RLS 변경
- seed 오적용
- Worker 대상 혼동

별도 프로젝트는 관리 대상이 늘지만 운영 사고의 영향 범위를 가장 명확히 분리한다.

### 초기 스키마

병원편의 검증된 테이블 구조만 이식한다.

- `games`
- `game_master`
- `game_save`
- `game_memories`
- `image_library`
- `game_master_history`

필수 공통 기능:

- game ID 해석
- JSONB deep merge
- game 생성
- context 조회
- story context 조회
- UI context 조회
- image 조회
- 원자적 turn commit
- reset
- play history

레거시 분리 저장 API는 이식하지 않거나 처음부터 410으로 종료한다.

### 데이터 격리

- 모든 master/save/memory/image row에 game_id 필수
- 회사편 image_library는 game_id null 금지
- Worker는 allowlist 밖의 game ID 거부
- 테스트 game과 운영 game 분리
- 일반 reset은 테스트 game에만 허용

### 마이그레이션

- Dashboard 수동 DDL 금지
- 모든 DDL/RPC는 Git migration으로 기록
- migration과 seed 분리
- 운영 데이터는 migration에 포함하지 않음
- 적용 후 security/performance advisor 확인

### 권장 master

```json
{
  "edition": "company-v1",
  "title": "상식개변 앱 — 회사편",
  "background": {},
  "organization": {},
  "map": {},
  "characters": {},
  "general_npcs": {"profiles": {}},
  "csa_catalog_version": 1,
  "opening": {},
  "ui": {}
}
```

### 권장 save

```json
{
  "edition": "company-v1",
  "player": {},
  "player_scene_state": {},
  "player_sexual_state": {},
  "world_state": {},
  "npc_stats": {},
  "npc_emotion": {},
  "npc_relationship_state": {},
  "npc_scene_state": {},
  "npc_work_state": {},
  "csa_active": [],
  "csa_runtime_state": {},
  "csa_aftereffect_state": {},
  "story_summary_overall": "",
  "story_summary_recent": "",
  "last_character_id": null,
  "last_npcs_present": [],
  "last_image_id": null,
  "last_choices": [],
  "last_choice_meta": []
}
```

## 4. Cloudflare

### Worker 이름

- API: `game-proxy-company-v1`
- Frontend: `gamebuilder-company-v1`
- TTS target: `fancy-dust-7f8c`

병원편 Worker 이름을 재사용하지 않는다.

### Wrangler

- API: `apps/company-v1/api/wrangler.jsonc`
- Frontend: `apps/company-v1/frontend/wrangler.jsonc`
- Wrangler config를 배포 설정의 단일 기준으로 사용
- API에는 `GAME_EDITION=company-v1` 설정
- TTS는 Service Binding으로 연결
- 회사편 Worker 비밀값은 병원편과 분리 등록

### 배포 순서

1. Supabase migration
2. 회사편 테스트 game seed
3. API Worker 배포
4. API version 확인
5. Frontend version.json 생성
6. Frontend Worker 배포
7. 테스트 game URL 확인
8. 사용자 플레이 검증
9. 운영 game은 별도 승인 후 생성

### 환경 전략

회사편은 병원편의 staging 환경이 아니라 별도 제품이므로 초기에는 Cloudflare environment보다 별도 Worker 이름을 쓴다. 회사편 내부 staging이 필요할 때만 `-staging` Worker와 별도 DB 환경을 추가한다.

## 5. 로그와 보호

모든 로그에 다음을 포함한다.

- edition
- request_id
- game_id
- route
- git SHA
- Worker version ID

보호 원칙:

- 브라우저는 DB 관리자 권한과 모델 키를 알지 못함
- CORS는 회사편 Frontend와 개발 origin만 허용
- 운영 reset은 별도 관리자 절차
- 병원편 project ref가 회사편 소스에 포함되면 정적 테스트 실패

## 6. 비용과 대안

### 권장

별도 Supabase project + 별도 Workers.

장점:

- 사고 영향 범위 최소
- 독립 migration·rollback
- 독립 image catalog
- 명확한 로그·배포

단점:

- 프로젝트 하나 추가 관리
- 사용량 비용 별도 발생 가능
- migration 두 계열 유지

### 같은 Supabase 대안

DB schema/RPC를 전혀 바꾸지 않는 단기 프로토타입에는 가능하다. 모든 query에 game_id 필수, image fallback 제거, reset allowlist가 전제다. 장기 운영에는 권장하지 않는다.

### Supabase branch 대안

개발·QA에는 유용하지만 장기 독립 게임 운영은 별도 project가 더 명확하다. branch는 별도 instance와 credential을 가지며 seed와 비용도 별도 관리한다.

## 7. 생성 후 기록할 값

```text
회사편 Supabase project ref
회사편 테스트 game ID
회사편 운영 game ID
회사편 API Worker Version ID
회사편 Frontend Worker Version ID
회사편 API URL
회사편 공개 URL
회사편 Git SHA
```
