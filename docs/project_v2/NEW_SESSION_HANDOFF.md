# 새 세션 인수인계서

새 ChatGPT 세션의 첫 메시지에 아래 내용을 그대로 붙여 넣는다.

---

게임빌더 v2 프로젝트를 이어서 진행합니다. 먼저 아래 저장소 문서를 읽고 그 내용을 장기 기준으로 사용하세요.

- `docs/project_v2/CURRENT_PROJECT_MEMORY.md`
- `docs/project_v2/CODEX_IMPLEMENTATION_HANDOFF.md`
- `docs/project_v2/CSA_ONLY_BRANCH.md`
- `docs/project_v2/API_SPEC.md`
- `docs/project_v2/SCHEMA.md`
- `docs/project_v2/EXTRACT_PROMPT.md`
- `docs/project_v2/FRONTEND.md`

## 1. 현재 기준 상태

- GitHub: `zeroslove-ai/py-all`
- 작업 브랜치: `feature/csa-only`
- 실제 운영 배포 코드 SHA: `709f80cf307f7d3107b6d5914b0f5bbfd78cb1d2`
- 커밋: `feat: persist clothing ejaculation and supporting NPC state`
- API Worker: `game-proxy-v2`
  - Version ID: `3a87cbaa-9114-4c40-9efa-e05e35d2a334`
- Frontend Worker: `gamebuilder-v2`
  - Version ID: `0e5af437-5499-4acd-812c-408ff43752b7`
- 오타 Worker `game-builder-v2`는 운영 대상이 아니며 절대 배포하지 않습니다.
- Supabase project: `ovltkzwddxsekcfeskds`
- 운영 게임 ID: `9ed5b835-9948-4cad-ac25-3ebff7348574`
- E2E 게임 ID: `c792613f-dc27-4835-9403-dc87d51b9e91`
- 운영 URL: `https://gamebuilder-v2.zeroslove.workers.dev/?game=9ed5b835-9948-4cad-ac25-3ebff7348574`
- DB 변경 및 게임 리셋 없음.
- 운영 배포 뒤 인수인계 문서 전용 커밋이 브랜치에 추가되어 있을 수 있으므로, 배포 SHA와 현재 문서 HEAD를 구분하세요.

## 2. 현재 완료 기능

1. 플레이어 복장 상태 지속
   - `player_scene_state.clothing`
   - `outer_top`, `outer_bottom`, `underwear_top`, `underwear_bottom`
   - `worn|open|removed|unknown`
   - 반쯤 내린 바지·열린 지퍼·꺼낸 성기는 `open`

2. NPC 복장 CSA 최종 권위
   - 활성 복장 CSA는 등록 NPC 전체에 적용
   - 첫 등장부터 현재 복장 상태 유지
   - 완전 전라 대상에게 가운·상의·중간 탈의 장면을 새로 만들지 않음
   - 표식: `FINAL ACTIVE CLOTHING CSA — DO NOT CONTRADICT`

3. 플레이어 사정 게이지
   - `player_sexual_state.ejaculation_meter`, 0~100
   - 0~49 사정 불가
   - 50~99 선택·요청 가능
   - 100 도달 턴 자동 사정 없음
   - 다음 턴 `forced_ejaculation_pending`에 따라 기본 사정
   - 즉시 완전 이탈하면 85로 회피 가능
   - NPC가 놓지 않거나 계속 자극하면 장면 결과에 따라 강제 사정
   - 실제 사정은 Final Story evidence 필요, 완료 시 0
   - UI 사이드바 게이지 반영 완료

4. 일반·지원 NPC
   - 유일한 출처는 `master.general_npcs.profiles`
   - 즉흥 이름·직업·나이·관계 생성 금지
   - 별도 영구 상태·Mind Monitor·전용 이미지 생성 금지
   - 이유 없이 장면에서 사라지지 않음
   - 성인 목격자는 반응·관찰 가능하나 강압·폭력·무단 접촉 자동 생성 금지

## 3. 현재 캐논 주의

- 일반 NPC 프로필은 `general_npc_01`~`general_npc_09` 9명입니다.
- 김지은 남편은 등록 캐논이 아닙니다. 이름·직업을 만들지 마세요.
- 한소영 배우자: 정우석, 정형외과 의사, 결혼 1년.
- 박소현 배우자: 김태진, 보험사 보상심사팀장, 결혼 9년, 권태로운 관계.
- 김지은은 기혼·섹스리스·형식적 관계까지만 확정입니다.

## 4. 주요 구현 파일

- `worker/build-csa-deactivation-hotfix.parts/part-25.part`: 플레이어 복장·NPC 복장 권위
- `part-26.part`: 사정 게이지
- `part-27.part`: 일반 NPC 풀·지속성
- `part-28.part`: 100 다음 턴 강제 사정·완전 이탈 회피
- `part-29.part`: 안전한 복장 프롬프트 개행 조립
- `scripts/apply-player-ejaculation-ui.mjs`
- `pages/index.html`
- `pages/sidebar.js`
- `test/player-clothing-npc-clothing-priority.contract.test.mjs`
- `test/player-ejaculation-general-npc.contract.test.mjs`

Worker는 생성 파일을 배포합니다.

- 원본: `worker/game-proxy-v2.js`
- 생성기: `worker/build-csa-deactivation-hotfix.mjs`
- 출력: `worker/game-proxy-v2.generated.js`

## 5. 검증 기준

- 최종 검증: 16개 계약 파일, `112/112` 통과
- Worker 생성·문법 검사 통과
- `pages/sidebar.js` 문법 검사 통과
- `git diff --check` 통과

생성 기반 테스트는 같은 generated Worker 파일을 공유합니다. 여러 파일을 한 `node --test` 호출로 묶으면 경쟁 조건이 생기므로 반드시 파일별로 직렬 실행하세요.

## 6. 작업 역할과 지시 방식

- ChatGPT는 설계·코드 검토·GitHub 패치·테스트 계약·실행 순서를 준비합니다.
- Codex는 로컬에서 구현과 명령 실행만 합니다.
- Codex가 임의로 설계 변경·범위 확대·리팩터링하지 않게 지시하세요.
- 로컬 실행 지시는 항상 한 번에 복사 가능한 PowerShell 블록 하나로 작성하세요.
- 첫 실패에서 즉시 중단하고 이후 테스트·커밋·푸시·배포를 실행하지 않습니다.
- 실패 보고에는 HEAD, 최초 오류, 작업 트리 상태를 포함합니다.
- force/reset/rebase를 사용하지 않습니다.
- `git fetch`와 `--ff-only`, 일반 push만 사용합니다.
- 기존 로컬 변경을 보존하고 `.wrangler/`는 커밋하지 않습니다.
- 생성 전에 이전 생성 파일을 삭제하고 생성 → Worker 문법 검사 → 단일 계약 테스트 순서로 진행합니다.
- 테스트는 정적·결정적 계약만 사용합니다. 실제 Story/Extract/Commit/Reset/Feedback/TTS 호출과 Supabase write는 하지 않습니다.
- DB 변경과 게임 리셋은 사용자가 명시할 때만 합니다.

Codex에 기본적으로 다음을 전달하세요.

> 설계 판단이나 범위 확대는 하지 말고 제공된 구현·검증·배포 단계만 수행한다. 첫 실패에서 즉시 중단하며 이후 테스트·커밋·푸시·배포를 실행하지 않는다. 기존 로컬 변경과 `.wrangler/`를 보존하고, force/reset/rebase 없이 fast-forward와 일반 푸시만 사용한다. 생성 기반 테스트는 공유 생성 파일 경쟁을 막기 위해 파일별로 직렬 실행한다. DB 변경과 게임 리셋은 하지 않는다.

## 7. 장기 방향

- Story SSE 스트리밍 최우선
- 검증은 사후 soft 검증 우선
- 스트리밍을 중단하는 과도한 게이트 금지
- LLM 자율 생성과 플레이어 자유도를 과도하게 제한하지 않음
- NPC는 활성 규정을 정확히 인식해야 함
- NPC가 규정을 알고도 불이익을 감수하며 거부하는 서사는 가능하지만, 규정 자체를 모르는 식으로 처리하면 안 됨
- CSA 수용도·호감도·흥분도·동의·연애 관계를 서로 자동 연결하지 않음

## 8. 배포 규칙

- API: `game-proxy-v2` 수동 Wrangler 배포
- Frontend: `gamebuilder-v2` 수동 Wrangler 배포
- `game-builder-v2` 금지
- Frontend 배포 시 `pages/version.json`을 최종 SHA로 생성해 배포한 뒤 로컬 복구
- Wrangler가 출력한 실제 Version ID를 보고
- DB와 게임은 건드리지 않음
- Frontend 변경 완료 응답의 마지막 줄은 운영 URL 한 줄로 종료

새 작업을 시작하기 전에 반드시:

1. `feature/csa-only` 최신 원격 HEAD 확인
2. `CURRENT_PROJECT_MEMORY.md`와 `CODEX_IMPLEMENTATION_HANDOFF.md` 읽기
3. 운영 배포 SHA와 문서 전용 커밋 구분
4. 현재 작업 트리와 `.wrangler/` 보존 여부 확인
5. 필요한 코드·문서·테스트를 먼저 깊게 검토
6. Codex에는 구현만 가능한 단일 PowerShell 지시문 제공

---
