# 상식개변 앱 — 회사편 v1 마스터 아키텍처

기준일: 2026-08-03

## 0. 문서 목적

병원편의 검증된 게임 루프를 보존하면서 회사편을 독립적으로 구축하기 위한 구현 기준이다. 병원편 코드를 직접 개조하거나 운영 Worker를 재사용하지 않는다. 회사편은 같은 GitHub 저장소 안에서 공통 엔진 개념을 공유하지만, 데이터베이스·Worker·프론트엔드·게임 ID·이미지 카탈로그·배포 이력을 별도로 가진다.

## 1. 최종 권고안

### GitHub

- 저장소: 기존 `zeroslove-ai/py-all` 유지
- 신규 브랜치: `feature/company-v1`
- 신규 경로: `apps/company-v1`, `packages/game-core`, `content/company-v1`, `docs/company_v1`
- 병원편 `feature/csa-only`와 운영 배포 SHA는 동결 기준점으로 취급
- 회사편을 병원편 브랜치에 직접 덧붙이지 않는다.

### Supabase

- 신규 프로젝트를 같은 조직에 생성한다.
- 권장 이름: `AI_웹개발_회사편`
- 권장 리전: `ap-northeast-2`
- 병원편 프로젝트 `ovltkzwddxsekcfeskds`의 운영 데이터는 복제하지 않는다.
- 스키마와 RPC는 GitHub 마이그레이션으로 재현하고 회사편 seed만 넣는다.

### Cloudflare

- API Worker: `game-proxy-company-v1`
- Frontend Worker: `gamebuilder-company-v1`
- TTS Worker는 기존 `fancy-dust-7f8c`를 Service Binding으로 공유 가능
- 병원편 Worker `game-proxy-v2`, `gamebuilder-v2`는 수정·재배포하지 않는다.
- 오타 Worker `game-builder-v2`는 계속 사용 금지

## 2. 왜 같은 Supabase가 아니라 새 프로젝트인가

현재 스키마는 `games`, `game_master`, `game_save`, `game_memories`, `image_library`, `game_master_history`가 `game_id`를 중심으로 분리되어 있어 단순히 새 게임 ID를 넣는 것은 기술적으로 가능하다. 그러나 회사편은 단순 콘텐츠 추가가 아니라 다음 변경을 포함한다.

- 병원 역할과 장소를 제거한 범용 역할 모델
- 프롬프트·상태 모델 경량화
- 생성기 파트 누적 구조 제거
- RPC 및 조회 계약의 버전 정리
- 회사편 전용 이미지 카탈로그 대량 추가
- 회사편 전용 테스트·배포·리셋 흐름

같은 DB를 쓰면 RPC 변경, RLS 실수, `game_id` 누락 쿼리, 이미지 fallback, reset 대상 오인, 운영 secret 혼동이 병원편에 영향을 줄 수 있다. 신규 프로젝트는 비용과 관리 대상이 하나 늘지만 운영 사고의 영향 범위를 가장 확실히 분리한다.

## 3. 제품 구조

### 3.1 공통 게임 루프

1. `/api/context`
2. `/api/story` — DeepSeek SSE 직접 중계
3. `/api/extract` — 구조화 상태 추출 1회
4. `/api/commit-turn` — Supabase RPC 1회 원자 저장
5. 이미지 선택
6. TTS 선택 실행

추가 LLM repair, Story 재작성, 동기식 검증 모델 호출은 넣지 않는다. 검증은 정적 구조 검증과 사후 warning을 우선한다.

### 3.2 공통 엔진과 에디션 분리

`packages/game-core`

- API 라우팅
- SSE 중계
- Context/Story/Extract/Commit 파이프라인
- 원자적 턴 저장 계약
- 게임 ID 검증
- 이미지 조회 공통 로직
- 선택지 표시·선택 메타 공통 구조
- 공통 상태 정규화
- 공통 테스트 도구

`content/company-v1`

- 회사 배경
- 조직도
- 장소
- 캐릭터
- 일반 NPC
- 회사편 CSA 프리셋
- 회사 호칭·보고 관계
- 오프닝
- 이미지 메타데이터
- 회사편 프롬프트 블록

`apps/company-v1/api`

- 공통 엔진 조립
- 회사편 edition adapter 주입
- Supabase·DeepSeek·TTS binding

`apps/company-v1/frontend`

- 회사편 UI
- 회사 전용 패널·명칭
- 공통 API client

## 4. 병원편에서 그대로 유지할 것

- URL의 `game` ID로 게임 선택
- `game_master` 읽기 전용 원칙
- `game_save` JSONB 상태
- `game_memories` 턴 기록
- `commit_turn` 원자 저장과 replay/conflict 처리
- Story SSE 우선
- 선택지 4개 기본
- 원문 전체 클릭·저장, 버튼만 짧게 표시
- NPC별 호감도·상식수용도·성적흥분도 분리
- 관계 단계와 현재 동의를 수치와 분리
- 플레이어 복장 상태
- NPC 복장 상태
- 사정 게이지 0~100
- 일반 NPC는 master 등록 프로필만 사용
- 이미지 ID 기반 선택
- Frontend/API 버전 SHA 표시

## 5. 병원편에서 제거하거나 경량화할 것

### 5.1 문자열 패치 생성기 제거

회사편은 `part-00.part`부터 누적 적용하는 문자열 치환 생성기를 사용하지 않는다. 병원편 생성 결과를 참고해 필요한 기능을 명시적 모듈로 다시 작성한다.

금지:

- 함수 원문 문자열을 marker로 찾아 교체
- 파트 적용 순서에 의존하는 프롬프트 조립
- escape 이중 해석에 의존하는 코드 생성
- 생성 파일을 여러 테스트가 동시에 삭제·생성

### 5.2 무거운 정합성 계층 축소

회사편 v1에는 다음 세 등급만 둔다.

- hard error: 입력 형식 오류, 게임 ID 없음, 턴 충돌, 허가되지 않은 저장 완료
- soft warning: Extract 누락, CSA runtime 불일치, 캐릭터 상태 일부 누락
- narrative freedom: 대사·감정·행동 표현 차이는 LLM 자율

soft warning은 Story를 다시 생성하거나 Commit을 막지 않는다.

### 5.3 프롬프트 경량화

매 턴 포함:

- 현재 장소와 시간
- 현재 등장 NPC 전원
- 각 NPC의 최신 핵심 상태
- 현재 활성 CSA 중 이번 장면 적용분
- 플레이어 최신 상태
- 최근 요약
- 출력 형식

필요할 때만 포함:

- 전체 조직도
- 전체 캐릭터 프로필
- 전체 CSA 카탈로그
- 과거 관계 기억
- 이미지 카탈로그

### 5.4 선택지 판정 단순화

- Story는 4개 선택지를 생성
- `normal`: 일반 행동
- `csa_direct`: 활성 CSA의 정확한 직접 범위
- `bold`: 실제 강압·급격한 성적 접촉·심각한 규정 위반
- `blocked`: 구조적으로 불가능한 행동만

단순 대화, 이동, 업무 요청, 가벼운 접촉은 과감으로 분류하지 않는다. 성공률 계산은 `bold`에만 적용한다. `csa_direct`는 확률이 없다.

## 6. 회사편 세계 모델

### 6.1 기본 회사

- 업종: 중견 소비재·브랜드 기업
- 규모: 본사 약 300명
- 건물: 도심 단독 사옥 12층
- 플레이 범위: 회사 전체
- 기본 시간: 평일 업무 시간과 야근 시간
- 외부 인물: 방문객, 거래처, 협력사, 배달·시설 인력

### 6.2 주요 공간

- 1층 로비·보안 게이트·카페
- 2층 대회의실·교육장
- 3층 인사팀·총무팀
- 4층 재무팀·법무 지원
- 5층 마케팅팀
- 6층 브랜드·디자인팀
- 7층 영업팀
- 8층 전략기획팀
- 9층 임원실·비서실
- 10층 대표이사실·VIP 회의실
- 11층 라운지·휴게 공간
- 12층 옥상 정원
- 지하 주차장·창고·설비 공간

공간은 성행위 허가 조건이 아니라 공개성, 목격자, 업무 방해, 직장 위험을 해석하는 장면 정보다.

### 6.3 조직 관계

회사편은 단순 직급 숫자가 아니라 다음 관계를 사용한다.

- `reports_to`: 직속 상사
- `manages`: 직속 부하
- `team_id`: 소속 팀
- `role_tier`: employee|senior|lead|manager|director|executive|ceo
- `employment_type`: permanent|contract|intern|vendor|visitor
- `work_relationships`: mentor, rival, former_team, project_partner

직급은 호감도·동의·상식수용도를 자동 결정하지 않는다.

## 7. 회사편 CSA 설계

### 7.1 핵심 원칙

- 활성 규정은 모든 관련 NPC가 정확히 알고 있다.
- NPC는 규정을 이해하면서도 개인적으로 불쾌하거나 난처할 수 있다.
- NPC는 징계·평가 불이익을 감수하고 거부할 수 있다.
- 거부는 규정을 몰라서가 아니라 성격·관계·위험 판단에 따른 선택이어야 한다.
- 규정 수용은 연애·동의·복종·호감 상승과 별개다.

### 7.2 회사편 actor group

- all_employees
- office_workers
- same_team_members
- managers
- executives
- assistants
- hr_staff
- sales_staff
- interns
- visitors
- conversation_partner
- selected_person
- player

### 7.3 trigger

- always_at_work
- entering_office
- meeting_start
- conversation_start
- receiving_instruction
- reporting_to_manager
- greeting
- performance_review
- business_trip
- overtime
- on_request

### 7.4 duration

- while_at_work
- while_in_meeting
- until_conversation_ends
- until_task_completed
- during_overtime
- current_encounter
- persistent_until_deactivated

### 7.5 초기 프리셋 카테고리

- 복장·외모 규정
- 호칭·보고 규정
- 회의·업무 자세
- 거리·접촉 관행
- 인사·접대 관행
- 휴게·야근 관행
- 평가·보상 관행
- 공개적 성적 규범

프리셋은 회사편 캐릭터와 장소에 맞게 새로 작성하며 병원 프리셋의 nurse/patient/doctor 표현을 단순 치환하지 않는다.

## 8. 상태 모델

### 8.1 player

- identity
- employment
- appearance
- clothing
- current_location
- current_task
- sexual_state

### 8.2 NPC

- stats: 호감도, 상식수용도, 성적흥분도
- emotion: surface, inner, physical_reaction
- relationship_state
- scene_state: location, posture, clothing, current_action
- work_state: current_task, availability, meeting_id

### 8.3 회사편 특화 상태

`work_state`는 최소한으로 유지한다.

```json
{
  "work_state": {
    "current_business_day": 1,
    "time_block": "afternoon",
    "active_meeting": null,
    "active_project": null
  },
  "npc_work_state": {
    "heroine1": {
      "current_task": "분기 캠페인 보고서 검토",
      "availability": "busy",
      "updated_turn": 12
    }
  }
}
```

일정 시뮬레이터나 초 단위 시간 시스템은 넣지 않는다. Story가 시간대를 이동시키고 Extract가 `time_block`만 갱신한다.

## 9. 캐릭터 구성

초기 메인 캐릭터 9명 권장:

1. 인사팀 사원 — 규정과 현실 사이에서 조심스러움
2. 마케팅팀 대리 — 빠르고 사교적, 경쟁심 있음
3. 디자인팀 선임 — 자유로운 성향, 관찰력이 높음
4. 재무팀 과장 — 냉정하고 숫자 중심
5. 영업팀 팀장 — 카리스마와 실적 압박
6. 비서실 대리 — 임원 정보와 조직 흐름에 밝음
7. 전략기획팀 차장 — 정치적 감각과 통제력
8. 젊은 임원 — 우아하고 공주 같은 이미지
9. 오너 일가 대표 또는 부회장 — 최종 보스형 여왕 캐릭터

구체 이름·외모·관계·목소리는 별도 캐릭터 바이블에서 확정한다.

일반 NPC는 부서별 최소 프로필을 master에 등록한다. 즉흥 생성은 금지한다.

## 10. 이미지 설계

- 회사편 `image_library`는 신규 Supabase 프로젝트에만 저장
- 모든 행에 `game_id` 필수
- `character_id`는 회사편 캐릭터 ID 체계 사용
- `image_pool`: general|sex
- `scene_role`: 회사편에서 필요한 역할만 별도 enum 또는 tags로 관리
- 기본 슬롯: 1인, 2인, 3인
- 일반 NPC는 전용 이미지 없이 공통 배경 또는 등록된 단역 이미지 사용

## 11. 보안과 운영

- 브라우저는 Supabase secret과 DeepSeek key를 모른다.
- 회사편 Worker에 회사편 Supabase URL·Secret만 설정
- 병원편 secret을 회사편 Worker에 복사하지 않는다.
- CORS는 회사편 Frontend origin으로 제한하는 방향을 우선 검토
- reset은 회사편 game ID allowlist를 통과해야 한다.
- 모든 API 로그에 `edition=company-v1`, `game_id`, `request_id`, `git_sha` 포함

## 12. 테스트 전략

### 정적 계약

- 회사편 소스에 hospital/nurse/doctor/patient 하드코딩이 없는지 검사
- API/Frontend Worker 이름 검사
- Supabase project ref 혼입 금지 검사
- game ID allowlist 검사
- 회사편 master와 image rows의 ID 일치 검사
- 4개 선택지 계약
- Story SSE 직접 반환 계약
- 일반 NPC 등록 풀 계약
- 복장·사정 게이지 계약
- 규정 인식과 개인 거부 분리 계약

### 실행 순서

- 생성 기반 공유 파일을 없애 테스트 경쟁 조건 자체를 제거
- 각 모듈 테스트는 독립 임시 디렉터리 또는 메모리 fixture 사용
- 실제 Story/Extract/Commit/Reset/TTS 호출은 자동 검증에서 금지
- 배포 전 정적 계약과 syntax만 실행
- 실제 플레이 검증은 별도 테스트 게임에서 사용자 수행

## 13. 단계별 구현

### Phase 0 — 동결과 골격

- 병원편 운영 SHA 기록
- `feature/company-v1` 생성
- 회사편 디렉터리와 Wrangler config 생성
- 신규 Supabase 프로젝트 생성
- 병원편 마이그레이션을 정리해 회사편에 적용

### Phase 1 — 공통 루프 이식

- context/story/extract/commit/image/tts/version
- Story SSE
- 원자 Commit
- 회사편 빈 master로 부팅

### Phase 2 — 회사 콘텐츠

- 조직도·장소·캐릭터·일반 NPC
- 오프닝
- 회사 전용 호칭
- 회사 CSA 프리셋

### Phase 3 — 상태와 UI

- NPC 상태
- 관계
- 복장
- 사정 게이지
- 회사 업무 상태
- 이미지·TTS

### Phase 4 — 경량화 검증

- 프롬프트 크기 측정
- Story/Extract 지연 측정
- soft warning 로그
- 병원 하드코딩 탐지

### Phase 5 — 테스트 게임 배포

- 회사편 테스트 game ID
- API/Frontend Worker 배포
- 사용자 플레이 검증
- 운영 game ID는 검증 후 별도 생성

## 14. 비목표

회사편 v1에서 하지 않는다.

- 병원편 운영 코드 리팩터링
- 두 게임의 세이브 공유
- 두 Supabase 프로젝트 간 실시간 동기화
- 실시간 다중 사용자
- 복잡한 사내 경제·급여·근태 시뮬레이션
- 모든 NPC의 분 단위 일정
- LLM repair 체인
- Story 스트리밍 후 재작성
- 자동 게임 리셋
