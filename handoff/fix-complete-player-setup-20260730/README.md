# 긴급 핫픽스 — 완전한 4후보 플레이어 설정 + 버튼 선택 메타데이터 연결

저장소: `zeroslove-ai/py-all`

운영 브랜치: `feature/csa-only`

반드시 사용할 기준 SHA:

`8ae37b3552170bcb8b44b109389f7f72ee16ce56`

이 SHA에는 P1 커밋 `refactor: remove auxiliary post-stream recovery calls`가 이미 적용·배포되어 있다. P1을 다시 적용하거나 되돌리지 않는다.

전달 브랜치:

`handoff/fix-complete-player-setup-20260730`

이 전달 브랜치는 병합하지 않는다. 정확한 운영 기준 SHA에서 새 로컬 브랜치를 만들고 아래 내용만 직접 구현한다.

## 1. 이번 핫픽스의 실제 목표

현재 테스트 세이브 복구는 하지 않는다. 사용자가 리셋 후 다시 테스트할 예정이다.

고쳐야 하는 것은 새 게임의 플레이어 설정 흐름이다.

1. 첫 응답에서 성인 남성 플레이어 후보 4명을 한 번에 완성형으로 보여준다.
2. 각 후보는 이름과 직업만 있는 축약 객체가 아니라 플레이어 정보 패널과 게임 진행에 필요한 값이 전부 있어야 한다.
3. 후보 버튼을 누르면 버튼의 `choice_index`를 Story, Extract, Save 모두가 같은 후보 선택으로 해석한다.
4. 텍스트 직접 입력도 계속 지원한다.
5. 선택과 수정이 한 입력에 함께 있으면 선택 후보를 base로 수정해 바로 오프닝을 시작한다.
6. 설정 완료 뒤 기존 마인드 모니터, 이미지, TTS, NPC 상태, 관계, 선택지 기능이 정상 입력을 받도록 한다.

## 2. main에서 참고할 부분 — 이 필드/카드 계약만 가져온다

`main`의 구형 최면/개인암시 런타임, 게이트, 범위 제한, repair 로직은 가져오지 않는다.

참고 대상은 `main:worker/game-proxy-v2.js`의 플레이어 후보 카드와 Extract 필드 계약뿐이다.

후보 4명 각각 반드시 생성·표시·추출할 필드:

- `id`: 현재 CSA-only 계약대로 `candidate_1`~`candidate_4`
- `name`
- `age` — 19세 이상
- `gender` — `남성`
- `job`
- `major` 또는 `rank` — 해당 후보에게 자연스러운 경우
- `height_cm`
- `weight_kg`
- `penis_length_cm`
- `style`
- `personality`
- `speech_style`
- `background`
- `starting_location`
- `short_feature` 또는 `play_hook`
- `choice_label`

카드 표시 형식은 다음 수준의 정보를 실제 값으로 포함한다.

```text
[후보 N · 역할]
이름 · 나이 · 남성
직업: 직업 / 전공·직급
신체: 키cm / 몸무게kg / 성기 크기cm
외형: ...
성격·말투: ... / ...
배경: 최대 2문장
특징: 1문장
```

4개 역할은 서로 겹치지 않게 유지한다.

1. 병원 직원
2. 입원 또는 외래 환자
3. 병원과 연관된 외부인
4. 자유 배경

선택지 버튼은 `이름 · 직업` 형태의 짧은 문구 4개다.

현재 코드의 다음 문구는 잘못된 허용 범위를 만든다.

- `가능한 범위에서 정한다`
- `일부 항목이 빠져도 ...`
- `Fewer than four candidates is acceptable`
- `missing field is not a failure`

플레이어 후보 생성 단계에서는 위 문구를 제거한다. Story와 setup 전용 Extract 프롬프트 모두 **4명 전원에 위 필드를 채우도록** 지시한다.

단, 형식 문자열 exact match 422나 `PLAYER_SETUP_CANDIDATES_INVALID` 같은 런타임 hard gate는 다시 만들지 않는다. Primary Extract가 일부 누락됐을 때 게임 전체를 422로 막지 않는다. 대신 불완전한 새 후보 배열로 기존 정상 후보를 덮어쓰지 않는다.

저장 규칙:

- 새 후보 세트가 4명이고 각 후보가 최소 필수 필드 세트를 모두 가질 때만 `player_setup.recommendations`를 새 세트로 교체한다.
- 불완전하면 이전 정상 후보가 있으면 그대로 보존한다.
- 이전 후보가 없으면 HTTP 200 fail-open은 유지하되 `player_setup.status`를 완료로 만들지 않고 다음 setup 응답에서 4후보를 다시 생성한다.
- 빈 문자열이나 0을 완성값처럼 저장하지 않는다.

최소 필수 필드 세트:

`name, age, gender, job, height_cm, weight_kg, penis_length_cm, style, personality, speech_style, background, starting_location, short_feature|play_hook, choice_label`

`major/rank`는 직업상 자연스러운 경우만 필수다.

## 3. 버튼 선택 메타데이터를 Story/Extract/Save 전체에 연결

현재 프론트는 버튼 클릭 시 다음 메타를 이미 만든다.

```js
{ source: 'choice_button', choice_index: index, choice_text: fullText }
```

그러나 현재 `/api/story`와 `/api/extract`에는 `player_action`이 전달되지 않는다. Commit에만 전달된다. 이를 고친다.

### frontend 변경

#### `pages/stream.js`

`stream.story(...)`에 `playerAction` 인자를 추가하고 `/api/story` body에 다음을 넣는다.

```js
player_action: playerAction
```

#### `pages/api.js`

`api.extract(...)`에 `playerAction` 인자를 추가하고 `/api/extract` body에 다음을 넣는다.

```js
player_action: playerAction
```

#### `pages/index.html`

`pending.playerAction`을 `stream.story(...)`와 `api.extract(...)`에 모두 전달한다.

Commit 전달은 이미 있으므로 유지한다.

### Worker 변경

`handleStory`, `handleExtract`, `runExtractPipeline`, `buildStoryPrompt`, `buildSavePatch`에 필요한 범위로 `player_action`을 전달한다.

공통 선택 해석 함수를 하나만 사용한다. Story mode 판정, Extract setup 판정, Save 확정이 서로 다른 함수를 쓰면 안 된다.

우선순위:

1. `player_action.source === 'choice_button'`이고 `choice_index`가 0~3 정수이면 저장된 후보 배열의 해당 인덱스를 선택한다.
2. `choice_text`가 저장 후보의 `choice_label` 또는 `name · job`과 일치하면 해당 후보를 선택한다.
3. 그 다음 현재 `parseSetupCandidateSelection()`의 자유 입력 번호 파서를 사용한다.
4. `4번으로 선택하되 배경만 의사로 바꿔줘`처럼 번호+수정 입력은 기존대로 지원한다.
5. 명시적 보류 문구가 있으면 완료하지 않는다.

버튼 선택 시 같은 턴의 일관성 조건:

- Story mode는 `opening`
- Extract는 setup-only 초기화 분기로 빠지지 않음
- `buildSavePatch`는 동일 후보를 선택해 `player_setup.status = 'complete'`
- `player`에 완전한 후보 프로필 저장
- `selected_id`, `selected_profile`, `opening_started = true`

## 4. 후보 수정 규칙

선택과 수정이 같은 입력에 있으면:

```text
4번으로 선택하되 배경만 의사로 바꿔줘
2번으로 하고 키는 185cm로
1번으로 시작하는데 이름만 김동훈으로
```

- 저장된 선택 후보 전체를 base로 사용한다.
- Primary Extract의 `player_patch` 또는 `player_recommendation`에서 실제 변경된 값만 merge한다.
- 수정되지 않은 신체·외형·성격·말투·배경·시작 장소·특징 값을 잃지 않는다.
- 결과 프로필은 위 필수 필드를 계속 보유해야 한다.

## 5. P1 및 기존 기능 보존

다음은 절대 되돌리거나 삭제하지 않는다.

- P1의 단일 Primary Extract 시도
- JSON/Mind Monitor/first encounter/CSA narrative auxiliary LLM repair 제거
- Story SSE `stream: true`
- direct `new Response(deepseekRes.body, ...)`
- `npc_emotion` 4필드와 deterministic fallback
- 이미지 shortlist, `image_id`, `/api/image`
- `dialogue_lines`, `/api/tts`, 재생·리플레이
- NPC 상태, 관계, 플레이어 정보, 플레이어 속마음, 사이드바
- 일반 선택지 4개와 bold/blocked 메타
- Commit 충돌 처리, 피드백 복구, CSA transaction 검증

## 6. 변경 파일

예상 변경:

- `worker/game-proxy-v2.js`
- `pages/stream.js`
- `pages/api.js`
- `pages/index.html`
- 필요 시 관련 문서 최소 갱신

`pages/sidebar.js`, `pages/tts.js`, `pages/ui.js`는 수정하지 않는다.

Supabase, RPC, migration, 게임 데이터는 변경하지 않는다.

## 7. 정적 검증

실제 게임 endpoint를 호출하지 않는다.

```powershell
node --check worker/game-proxy-v2.js
node --check pages/stream.js
node --check pages/api.js
node --check pages/sidebar.js
node --check pages/tts.js
node --check pages/ui.js
node -e "import('./worker/game-proxy-v2.js').then(()=>console.log('ESM_IMPORT_OK')).catch(e=>{console.error(e);process.exit(1)})"
git diff --check
```

필수 확인:

- `player_action`이 Story request body에 존재
- `player_action`이 Extract request body에 존재
- 버튼 `choice_index`가 공통 setup resolver에서 사용됨
- Story/Extract/Save가 같은 resolver 사용
- 후보 스키마에 모든 필수 필드 존재
- 후보 생성 Story 프롬프트가 4명 전원 전체 필드를 요구
- setup 전용 Extract 프롬프트가 4명 전원 전체 필드를 요구
- 불완전 후보 세트가 기존 정상 후보를 덮지 않음
- `PLAYER_SETUP_CANDIDATES_INVALID` 없음
- `stream: true` 존재
- `new Response(deepseekRes.body` 존재
- `/api/image`, `/api/tts`, `npc_emotion`, `dialogue_lines`, `image_id` 존재
- P1에서 제거된 auxiliary LLM runtime 호출이 다시 생기지 않음

## 8. Git/배포

1. `origin/feature/csa-only`가 정확히 `8ae37b3552170bcb8b44b109389f7f72ee16ce56`인지 확인한다.
2. 이 SHA에서 새 로컬 작업 브랜치를 만든다.
3. 전달 브랜치를 병합하지 않는다.
4. 구현·정적 검증 후 한 커밋:

`fix: complete player candidates and preserve choice identity`

5. 다시 fetch하고 운영 브랜치가 이동했으면 중단한다.
6. 일반 fast-forward push만 사용한다.
7. `game-proxy-v2`와 `gamebuilder-v2`를 배포한다.
8. Supabase와 게임 데이터는 건드리지 않는다.
9. 실제 기능 테스트는 사용자가 리셋 후 직접 수행한다.

완료 보고 마지막 문구:

`기능 검증 및 최종 테스트 미실행 — 사용자 직접 검증 예정`
