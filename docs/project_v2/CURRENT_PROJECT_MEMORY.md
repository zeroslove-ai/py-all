# 게임빌더 v2 현재 상태 및 장기 프로젝트 기억

기준일: 2026-08-03

이 문서는 게임빌더 v2 프로젝트를 새 세션·새 작업자·Codex 환경에서 이어가기 위한 장기 상태 기록이다. 대화 기억보다 이 문서를 우선하며, 사실이 변경되면 같은 파일을 갱신한다.

## 1. 저장소와 운영 인프라

- GitHub: `zeroslove-ai/py-all`
- 작업 브랜치: `feature/csa-only`
- 실제 운영 배포 코드 SHA: `709f80cf307f7d3107b6d5914b0f5bbfd78cb1d2`
- 운영 배포 커밋: `feat: persist clothing ejaculation and supporting NPC state`
- API Worker: `game-proxy-v2`
- API Version ID: `3a87cbaa-9114-4c40-9efa-e05e35d2a334`
- Frontend Worker: `gamebuilder-v2`
- Frontend Version ID: `0e5af437-5499-4acd-812c-408ff43752b7`
- 사용 금지 Worker: `game-builder-v2` — 오타 이름이며 절대 배포하지 않는다.
- Supabase project: `ovltkzwddxsekcfeskds`
- 운영 게임 ID: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- E2E 게임 ID: `c792613f-dc27-4835-9403-dc87d51b9e91`
- 운영 URL: `https://gamebuilder-v2.zeroslove.workers.dev/?game=9ed5b835-9948-4cad-ac25-3ebff7348574`
- 이번 작업에서 DB 변경·게임 리셋 없음.

문서 전용 커밋이 위 배포 SHA 뒤에 추가될 수 있다. 운영 코드 기준점은 위 SHA이며, 문서만 바뀐 SHA를 자동으로 재배포하지 않는다.

## 2. 로컬 작업 환경

- 사용자 로컬 경로: `C:\Users\JAEWAN\projects\py-all-deploy`
- 셸: Windows PowerShell
- Git 작성자 설정은 저장소 로컬 범위로 사용한다.
  - `user.name= zeroslove-ai`
  - `user.email= 302747532+zeroslove-ai@users.noreply.github.com`
- 정상 배포 종료 후 작업 트리에는 `?? .wrangler/`만 남았다.
- `.wrangler/`는 커밋하지 않는다.
- 공개 배포용 `pages/version.json`은 최종 SHA로 생성해 Frontend 배포에 포함한 뒤 로컬 파일을 원래 상태로 복구한다.

## 3. 이번 완료 기능

### 3.1 플레이어 복장 상태 지속

- `player_scene_state.clothing`에 플레이어 복장 상태를 저장한다.
- 필드:
  - `outer_top`
  - `outer_bottom`
  - `underwear_top`
  - `underwear_bottom`
- 값: `worn|open|removed|unknown`
- 반쯤 내린 바지, 열린 지퍼, 꺼낸 성기처럼 부분 노출은 `open`이며 `removed`와 구분한다.
- 기본 외형·복장 종류와 색상을 Story가 임의로 바꾸지 않는다.
- 실제 완료된 입기·벗기·열기·잠그기·내리기 행동만 Extract가 상태를 바꾼다.

### 3.2 NPC 복장 CSA 최종 권위

- 활성 복장 CSA는 등록 NPC 전체를 기준으로 판정한다.
- 첫 등장·NPC 전환 시에도 이미 적용된 복장 상태로 바로 등장한다.
- 완전 전라 대상에게 가운·상의·중간 탈의 단계를 새로 만들지 않는다.
- Story 최종 우선순위 표식: `FINAL ACTIVE CLOTHING CSA — DO NOT CONTRADICT`
- 저장·Extract 충돌은 정규화하되 턴과 저장을 실패시키지 않는다.

### 3.3 플레이어 사정 게이지

- 저장 위치: `player_sexual_state.ejaculation_meter`
- 범위: `0~100`
- Frontend 사이드바에 게이지와 `0/100` 상태를 표시한다.
- `0~49`: 사정 불가.
- `50~99`: Story에서 플레이어가 사정을 선택·요청할 수 있다.
- `100`에 도달한 그 턴: 자동 사정하지 않는다.
- 다음 턴: `forced_ejaculation_pending`에 따라 기본 결과는 사정이다.
- 회피는 즉시 성기를 빼고 삽입·손·구강 등 직접 자극에서 완전히 벗어나야 한다.
- 성공적으로 회피하면 게이지는 `85`, pending은 해제된다.
- NPC가 놓지 않거나 계속 자극하면 Story 장면 결과에 따라 강제 사정한다.
- 실제 사정 완료는 Final Story evidence가 있어야 하며 게이지를 `0`으로 초기화한다.
- `100`의 양은 `extreme`이다.
- 확률 주사위는 사용하지 않는다.

### 3.4 일반·지원 NPC

- 일반 NPC의 유일한 출처는 `master.general_npcs.profiles`다.
- 새 이름·직업·나이·외형·관계 설정을 즉흥 생성하지 않는다.
- 일반 NPC에게 새 `character_id`, 전용 `npc_stats`, Mind Monitor, 전용 이미지, 영구 관계 수치를 만들지 않는다.
- 장면에 들어온 일반 NPC는 이유 없이 사라지거나 반복 퇴장·복귀하지 않는다.
- 성인 지원 NPC는 성적 장면을 목격하고 성격에 맞춰 반응·관찰할 수 있지만 강압·폭력·무단 신체접촉을 자동 생성하지 않는다.

### 3.5 일반 NPC 캐논 주의

- `general_npcs.profiles`에는 9개 프로필이 있으며 ID는 `general_npc_01`~`general_npc_09`다.
- 김지은의 남편은 등록 캐논이 아니다. 이름·직업·성격을 임의로 만들지 않는다.
- 등록 배우자 캐논:
  - 한소영: 정우석, 정형외과 의사, 결혼 1년.
  - 박소현: 김태진, 보험사 보상심사팀장, 결혼 9년, 권태로운 관계.
- 김지은은 기혼·섹스리스·형식적 관계 수준만 확정돼 있다.

## 4. 구현 파일 구조

주요 생성기 파트:

- `worker/build-csa-deactivation-hotfix.parts/part-25.part`
  - 플레이어 복장 상태
  - NPC 복장 최종 권위
- `part-26.part`
  - 사정 게이지 백엔드와 Story/Extract 계약
- `part-27.part`
  - 일반 NPC 풀과 장면 지속성
- `part-28.part`
  - 100 도달 다음 턴 강제 사정·완전 이탈 회피 규칙
- `part-29.part`
  - 복장 프롬프트 안전한 개행 조립
- `scripts/apply-player-ejaculation-ui.mjs`
  - Frontend 사정 게이지 적용 스크립트
- `pages/index.html`, `pages/sidebar.js`
  - 실제 UI 반영
- `test/player-clothing-npc-clothing-priority.contract.test.mjs`
- `test/player-ejaculation-general-npc.contract.test.mjs`

Worker 진입점은 생성 파일이다.

- 원본: `worker/game-proxy-v2.js`
- 생성기: `worker/build-csa-deactivation-hotfix.mjs`
- 생성 결과: `worker/game-proxy-v2.generated.js`
- Wrangler main: `./game-proxy-v2.generated.js`

## 5. 검증 상태

최종 직렬 검증:

- 계약 테스트 파일: 16개
- 총 결과: `112/112` 통과
- Worker 재생성 성공
- `node --check worker/game-proxy-v2.generated.js` 통과
- `node --check pages/sidebar.js` 통과
- `git diff --check` 통과

중요: 생성 기반 테스트는 동일한 `worker/game-proxy-v2.generated.js`를 생성·삭제·읽기 때문에 여러 파일을 한 `node --test` 호출로 묶으면 경쟁 조건이 생길 수 있다. 반드시 파일별로 직렬 실행한다.

## 6. 장기 운영 원칙

- 스트리밍 SSE가 최우선이다.
- 검증은 사후 soft 검증을 기본으로 하며 Story 스트리밍을 막는 게이트를 늘리지 않는다.
- LLM 자율 생성과 플레이어 자유도를 과도하게 제한하지 않는다.
- CSA 규정은 NPC가 알고 있어야 한다. NPC는 규정을 알고도 징계·감점 등을 감수하며 거부할 수 있지만, 규정 자체를 모르는 식으로 처리하면 안 된다.
- 기능 추가 시 새 모델 호출·DB 호출·타이머·랜덤·Frontend 의존성을 Worker 생성 파트에 넣지 않는다.
- DB 작업·게임 리셋은 사용자가 명시적으로 요구할 때만 수행한다.
- 공개 운영 게임은 임의 리셋하지 않는다.
- Frontend가 바뀐 완료 응답의 최하단에는 운영 게임 URL을 한 줄로 표시한다.

## 7. 배포 기준

- API는 `game-proxy-v2`에 수동 Wrangler 배포한다.
- Frontend는 `gamebuilder-v2`에 수동 Wrangler 배포한다.
- `game-builder-v2`는 절대 배포하지 않는다.
- API tag/message는 최종 Git SHA에 연결한다.
- 배포 전 원격 브랜치와 로컬 HEAD가 정확히 일치해야 한다.
- DB 변경·리셋 없이 코드만 배포할 수 있다.
