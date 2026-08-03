# 회사편 v1 새 세션 인수인계서

새 ChatGPT 세션 첫 메시지에 아래 내용을 그대로 붙여 넣는다.

---

게임빌더 프로젝트의 신규 에디션인 `상식개변 앱 — 회사편 v1` 설계와 구현을 이어서 진행합니다.

먼저 아래 문서를 순서대로 읽고 이를 확정 설계로 사용하세요.

1. `docs/company_v1/MASTER_ARCHITECTURE.md`
2. `docs/company_v1/INFRASTRUCTURE_PLAN.md`
3. `docs/company_v1/GAME_SYSTEM_DESIGN.md`
4. `docs/company_v1/CONTENT_BLUEPRINT.md`
5. `docs/company_v1/CODEX_IMPLEMENTATION_PLAN.md`
6. 병원편 참고: `docs/project_v2/CURRENT_PROJECT_MEMORY.md`
7. 병원편 참고: `docs/project_v2/CODEX_IMPLEMENTATION_HANDOFF.md`

## 현재 기준

- GitHub: `zeroslove-ai/py-all`
- 회사편 브랜치: `feature/company-v1`
- 병원편 브랜치: `feature/csa-only`
- 병원편 운영 배포 코드 SHA: `709f80cf307f7d3107b6d5914b0f5bbfd78cb1d2`
- 병원편 API Worker: `game-proxy-v2`
- 병원편 Frontend Worker: `gamebuilder-v2`
- 회사편 예정 API Worker: `game-proxy-company-v1`
- 회사편 예정 Frontend Worker: `gamebuilder-company-v1`
- 사용 금지 Worker: `game-builder-v2`
- 회사편 Supabase project는 아직 생성하지 않음
- 회사편 game ID도 아직 생성하지 않음
- 회사편 Cloudflare Worker도 아직 배포하지 않음
- 병원편 DB·Worker·게임은 절대 변경하거나 reset하지 않음

## 확정 인프라 결정

- GitHub 저장소는 공유한다.
- 회사편은 별도 브랜치와 별도 디렉터리를 사용한다.
- Supabase는 같은 조직에 새 프로젝트를 생성하는 방향이 권장안이다.
- 회사편 API와 Frontend는 별도 Worker 이름을 사용한다.
- TTS Worker만 Service Binding으로 공유할 수 있다.
- 병원편 secrets와 회사편 secrets를 혼용하지 않는다.

## 설계 핵심

### 공통 엔진과 콘텐츠 분리

- `packages/game-core`
- `apps/company-v1/api`
- `apps/company-v1/frontend`
- `content/company-v1`

회사편은 병원편의 `part-*.part` 문자열 치환 생성기를 복제하지 않는다. 명시적 ES module과 JSON 콘텐츠 팩으로 작성한다.

### 게임 루프

1. context
2. Story SSE 1회
3. Extract 1회
4. atomic Commit RPC 1회
5. image
6. TTS

LLM repair, Story 재작성, 추가 검증 모델 호출은 넣지 않는다.

### 상태

- 호감도
- 상식수용도
- 성적흥분도
- 관계 stage
- 복장·자세
- 플레이어 사정 게이지
- 회사 업무 상태
- CSA runtime와 aftereffect

각 축을 자동 연결하지 않는다.

### CSA 개선

`execution_mode`를 도입한다.

- `mandatory`: 조건 충족 시 행동 실행 필수
- `normative`: NPC가 규정을 정확히 알지만 불이익을 감수하고 거부 가능

NPC가 규정을 몰라서 거부하는 서사는 금지한다.

### 선택지

- 기본 4개
- normal
- csa_direct
- bold
- blocked

가벼운 행동은 bold로 분류하지 않는다. 실제 고위험 행동에만 확률을 사용한다.

### 일반 NPC

- master의 등록 프로필만 사용
- 즉흥 이름·직업·나이 생성 금지
- 영구 관계·Mind Monitor·전용 이미지 없음
- 이유 없이 장면에서 사라지지 않음

## 콘텐츠 초안

- 회사: 루미너스 브랜드 그룹
- 본사 약 300명, 12층 사옥
- 9명의 메인 캐릭터
- 15명의 일반 NPC 권장
- 24개의 초기 CSA 프리셋 초안
- 6단계 경량 오프닝

구체 내용은 `CONTENT_BLUEPRINT.md`를 따른다.

## Supabase 판단

현재 병원편 DB는 game_id 격리가 되어 있어 같은 프로젝트에 회사 game을 추가하는 것이 기술적으로 가능하다. 하지만 회사편은 RPC·상태·이미지·배포 구조를 재설계하므로 병원편에 대한 영향 범위를 차단하기 위해 새 Supabase 프로젝트를 권장한다.

새 프로젝트 생성은 아직 하지 않았다. 사용자 승인 후 다음 순서로 수행한다.

1. 같은 조직에 서울 리전 신규 project 생성
2. Git migration 적용
3. 회사편 테스트 game seed
4. advisor 확인
5. 회사편 Worker 비밀값 등록

## Cloudflare 판단

회사편은 병원편의 environment가 아니라 별도 제품으로 취급한다.

- `game-proxy-company-v1`
- `gamebuilder-company-v1`

초기에는 별도 이름을 사용한다. 회사편 내부 staging이 필요해질 때만 `-staging` Worker를 추가한다.

## 다음 단계

첫 구현은 `CODEX_IMPLEMENTATION_PLAN.md`의 Phase 0만 수행한다.

Phase 0 허용:

- 디렉터리 골격
- 빈 module
- Wrangler config
- edition/content JSON skeleton
- static contract test

Phase 0 금지:

- Supabase project 생성 또는 변경
- Cloudflare deploy
- 외부 모델 호출
- 병원편 코드 수정
- game reset

## Codex 지시 방식

Codex에는 구현만 맡긴다. 모든 명령은 한 번에 복사 가능한 PowerShell 블록 하나로 제공한다.

반드시 포함:

- 예상 시작 SHA
- 허용 파일
- 단계 범위
- 첫 실패 즉시 중단
- 이후 테스트·커밋·배포 금지
- 로컬 변경 보존
- force/reset/rebase 금지
- 실행 결과 보고 형식

기본 지시:

> 설계 판단이나 범위 확대를 하지 말고 `docs/company_v1`의 확정 설계만 구현한다. 병원편 코드와 운영 인프라는 건드리지 않는다. 현재 단계만 수행하고 첫 실패에서 즉시 중단한다. force/reset/rebase를 사용하지 않고 fast-forward와 일반 push만 사용한다. 외부 Story/Extract/Commit/TTS 호출, Supabase 변경, Cloudflare 배포, 게임 reset은 명시 승인 전까지 금지한다. 회사편은 문자열 patch generator 없이 명시적 모듈과 독립 테스트로 작성한다.

## 새 세션 첫 행동

1. `feature/company-v1` 원격 HEAD 확인
2. 위 5개 회사편 문서 읽기
3. 현재 브랜치와 작업 트리 확인
4. 병원편 운영 자원 불변 확인
5. Phase 0 구현 범위를 검토
6. Codex용 단일 PowerShell 실행 지시 작성

---
