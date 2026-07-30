# 긴급 핫픽스: 플레이어 4후보 복구 + 사이드바/이미지/TTS 정상화

## 기준

- 저장소: `zeroslove-ai/py-all`
- 대상 브랜치: `feature/csa-only`
- 시작 SHA: `453aa935501f7798b38bd373669826af34584c7b`
- API Worker: `game-proxy-v2`
- Frontend Worker: `gamebuilder-v2`
- 이 전달 브랜치는 병합하지 않는다. 아래 내용을 대상 브랜치에 직접 구현한다.

## 장애 원인

1. `5c18e161...`에서 기존 4개 후보를 단일 추천으로 바꿨다.
2. `pages/sidebar.js`는 setup 미완료 상태에서 `.side-panel > .panel-section` 전체를 숨기고 즉시 return한다.
3. 단일 추천 setup이 완료되지 않으면서 마인드 모니터 항목, NPC 이미지 영역, 플레이어/NPC 상태 영역이 모두 사라진 것처럼 보였다.
4. TTS와 이미지 기능 코드가 삭제된 것은 아니다. setup이 `narrator` 상태로 고정되어 메인 NPC가 없어 호출 대상이 사라진 것이다.
5. Supabase의 운영/외부/E2E `opening_scenario`는 이미 4후보 + 번호 선택 + 같은 입력 수정 방식으로 복구했다. DB를 다시 수정하지 않는다.

## 목표 사용자 흐름

### 최초 setup

LLM이 성인 남성 플레이어 후보 4명을 한 번에 만든다.

- 서로 다른 직업·배경·성격·시작 위치
- 병원 직원 / 환자 / 병원 연관 외부인 / 자유 배경처럼 겹치지 않게 구성
- 이름, 나이, 성별, 직업, 전공/직급, 키, 몸무게, 성기 크기, 외형, 성격, 말투, 배경, 시작 장소, 플레이 특징을 가능한 범위에서 작성

`[3. 선택지]`는 실제 후보 이름과 직업을 사용한 4줄이다.

```text
1. 김민수 · 원무과 직원
2. 박준호 · 입원 환자
3. 이도현 · 의료기기 영업사원
4. 최태성 · 프리랜서 사진작가
```

### 선택과 수정

아래 입력을 모두 지원한다.

```text
4번
4번으로 선택하되 배경만 의사로 바꿔줘
2번을 고르고 이름은 김동훈으로
1번으로 시작하는데 키만 185로
```

번호 선택과 변경 요청이 같은 입력에 있으면:

1. 저장된 해당 후보를 base로 선택한다.
2. 같은 입력의 변경 요청을 Story/Extract가 반영한다.
3. 최종 player profile을 확정한다.
4. 같은 턴에 병원 오프닝과 첫 NPC 조우를 시작한다.
5. 다음 context부터 이미지, 마인드 모니터, NPC 상태, 관계, TTS가 정상 동작해야 한다.

사용자가 `아직 시작하지 말고`, `다시 보여줘`처럼 명시적으로 보류한 경우에만 setup 상태를 유지한다.

## Worker 구현

대상: `worker/game-proxy-v2.js`

### 1. 4후보 구조 복구

과거 기능 기준 `829fdb1a55ae09d13bb146133322ddb7d3beea69` 또는 그 직전의 4후보 helper를 참고하되, hard gate는 복구하지 않는다.

필요 개념:

- `player_setup.recommendations`: 최대 4개 후보 배열
- 후보별 안정 ID: `candidate_1` ~ `candidate_4`
- `selected_id`
- `selected_profile`
- 번호 선택 파서

새 setup은 `recommendation` 단일 객체가 아니라 `recommendations[]`를 기본 저장 형태로 사용한다.
기존 단일 추천 save는 읽기 호환만 유지한다.

### 2. 번호 선택 파서

입력 전체에서 1~4번 선택을 찾는다. exact string만 허용하지 않는다.

지원 예:

- `1`, `①`, `1번`, `1번으로`, `후보 1`, `첫 번째`
- `4번으로 선택하되 배경만 의사로 바꿔줘`

반환 구조 예:

```js
{
  index: 3,
  candidate: recommendations[3],
  raw_input: playerInput,
  hold_setup: /아직\s*시작.*말|시작하지\s*말|다시\s*보여|후보.*다시/.test(playerInput)
}
```

번호가 있고 `hold_setup !== true`면 selection + opening turn으로 취급한다.

### 3. Story prompt

최초 setup Story는 4후보를 모두 출력한다.

선택 turn에서는 Story prompt에 다음을 함께 넣는다.

- 선택된 후보 전체 JSON
- 사용자 원문 입력
- 같은 입력에서 요청한 수정사항을 반영한 최종 프로필을 Story의 확정 정보로 출력
- 설정 질문을 다시 하지 않음
- 병원 오프닝과 첫 등록 NPC 조우를 즉시 시작

`4번으로 선택하되 배경만 의사로 바꿔줘`를 단순 수정 turn으로 다시 되돌리지 않는다.

### 4. Extract prompt

최초 setup Extract schema:

```json
{
  "character_id": "narrator",
  "player_recommendations": [
    {
      "id": "candidate_1",
      "name": "",
      "age": 0,
      "gender": "남성",
      "job": "",
      "major": "",
      "rank": "",
      "height_cm": 0,
      "weight_kg": 0,
      "penis_length_cm": 0,
      "style": "",
      "personality": "",
      "speech_style": "",
      "background": "",
      "starting_location": "",
      "short_feature": "",
      "play_hook": "",
      "choice_label": ""
    }
  ],
  "choices": [],
  "turn_summary": ""
}
```

선택/opening turn Extract는:

- 선택된 저장 후보를 base로 사용
- 사용자 원문과 Story에서 바뀐 값만 `player_patch` 또는 최종 `player_recommendation`에 담음
- 첫 NPC의 `character_id`, `npcs_present`, `npc_emotion`, 이미지, 상태 필드를 일반 opening turn과 동일하게 추출

### 5. 저장

최초 후보 생성 turn:

```js
player_setup: {
  status: 'recommended',
  source: 'llm_four_candidates',
  recommendations: [...]
}
```

선택/opening turn:

```js
const finalProfile = mergePlayerProfile(selectedCandidate, extract.player_patch || extract.player_recommendation || {});

player_setup: {
  status: 'complete',
  source: 'llm_four_candidates',
  recommendations: previousRecommendations,
  selected_id: selectedCandidate.id,
  selected_profile: finalProfile
}
player = toPlayerSave(finalProfile)
opening_started = true
```

같은 입력의 수정값이 선택 후보보다 우선해야 한다.

### 6. setup hard gate 금지

절대 복구하지 말 것:

- `PLAYER_SETUP_CANDIDATES_INVALID`
- Story 카드 문구 exact match
- choice label exact match
- 카드 4개의 모든 필드 존재 여부를 이유로 422
- 후보 제목/순서/문장부호 차이로 422

정규화 원칙:

- 유효한 후보를 index 순서로 최대 4개 보존
- 누락 필드는 빈 값으로 두거나 생략
- `choice_label`이 없으면 `${index + 1}. ${name || '후보'} · ${job || '배경 미정'}` 생성
- 일부 후보가 불완전해도 Story를 폐기하지 않음
- Extract 실패는 P0의 HTTP 200 degraded 원칙 유지

최초 setup Extract가 완전히 실패한 경우에도 Story를 보존한다. setup은 미완료로 남겨 다시 생성/선택할 수 있게 하며 일반 422로 막지 않는다.

### 7. P0 유지

반드시 유지:

- 명시적 앱 명령만 UI route
- 일반 Extract 실패 HTTP 200 degraded
- validated `app_transaction`만 fail-closed
- 실제 completed sexual state/event만 sexual hard gate
- `stream: true`
- `new Response(deepseekRes.body, ...)`
- DB/turn conflict hard gate

## Frontend 구현

대상: `pages/sidebar.js`

현재 setup 미완료 시 전체 panel section을 숨기는 코드를 제거한다.

삭제 대상 개념:

```js
this.setSetupVisibility(false);
this.setSetupVisibility(setupComplete);
if (!setupComplete) {
  ...
  this.updateMind({});
  return;
}
```

그리고 `.side-panel > .panel-section` 전체를 hidden 처리하는 `setSetupVisibility()` helper를 제거한다.

원칙:

- setup 중에도 플레이어 정보, NPC 이미지 자리, NPC 상태, 마인드 모니터, 관계 기록의 패널 제목/영역은 유지한다.
- 데이터가 없으면 내부 내용만 비우거나 placeholder 상태로 둔다.
- setup 완료 후 `last_character_id`가 생기면 기존 `updateCharacter`, `updateMind`, stats, relationship 흐름이 그대로 실행된다.
- `pages/tts.js`, 이미지 API, 이미지 렌더러는 삭제하거나 비활성화하지 않는다.

Frontend가 변경되므로 `pages/version.json`을 최종 기능 SHA 기준으로 갱신한다.

## 문서 정합성

다음 문서에서 `single recommendation`을 현재 구현으로 서술한 부분을 4후보 + 자유 입력 수정 방식으로 고친다.

- `docs/project_v2/CSA_ONLY_BRANCH.md`
- `docs/project_v2/README.md`
- `docs/project_v2/STREAM_FIRST_ARCHITECTURE.md`
- 필요 시 `worker/AGENTS.md`

`선택지 exact match는 hard gate가 아니다` 원칙은 유지한다.

## 금지

- Supabase write: 이미 opening_scenario 복구 완료, 다시 쓰지 않는다.
- reset, Story, Extract, Commit, choice click 실제 호출 테스트
- 게임 데이터/턴 수정
- TTS 삭제
- 이미지 호출 삭제
- 마인드 모니터 필드 삭제
- P1 repair 제거 작업을 이번 핫픽스에 섞지 않는다.
- 전체 롤백

## 정적 검증

반드시 실행:

```powershell
node --check worker/game-proxy-v2.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node --check pages/stream.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

검색 검증:

```text
필수 존재:
player_recommendations
recommendations
selected_id
selected_profile
stream: true
new Response(deepseekRes.body

금지 존재:
PLAYER_SETUP_CANDIDATES_INVALID
```

변경 파일 외 다른 runtime 파일을 수정하지 않는다.

## 커밋/배포

권장 커밋:

```text
fix: restore four-player setup and gameplay panels
```

- `feature/csa-only`에 일반 fast-forward push
- API Worker `game-proxy-v2` 수동 배포
- Frontend Worker `gamebuilder-v2` 배포 또는 연결된 GitHub 자동배포 성공 확인
- 삭제된 `game-builder-v2`는 생성/배포 금지
- `/api/version`과 frontend `version.json` 확인

완료 보고 마지막 줄:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
