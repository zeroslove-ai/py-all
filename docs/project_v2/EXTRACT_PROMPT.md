# `/api/extract` 프롬프트 계약 v2

**기준일**: 2026-07-22  
**런타임 기준**: `worker/game-proxy-v2.js`의 `buildExtractPrompt()`  
**모델**: `deepseek-v4-flash`  
**최대 출력 토큰**: `10000`

## 역할

`/api/extract`는 방금 생성된 서사를 읽고 저장·이미지·TTS에 필요한 값만 JSON으로 추출한다. 새로운 사건을 만들거나 서사에 없는 수치를 임의로 계산하지 않는다.

Worker는 다음 값을 프롬프트에 직접 삽입한다.

| 값 | 출처 |
|---|---|
| 방금 생성된 서사 | 요청의 `narrative_text` |
| 이번 턴 플레이어 원본 입력 | 요청의 `player_input` |
| 게임 설정 | 최신 `get_context`의 `master` |
| 이전 저장값 | 최신 `get_context`의 `save` |
| 다음 턴 수 | DB의 현재 `turn_count + 1` |
| 이미지 후보 | 컨텍스트의 `image_catalog` 정규화 결과 |

따라서 문서용 `{{NARRATIVE_TEXT}}` 같은 치환 문자열을 런타임에서 별도로 관리하지 않는다.

## 추출 규칙

### 플레이어 정보

이번 턴의 `player_input`에 플레이어가 실제로 답한 항목을 우선 `player_patch`에 넣는다. 서사에 같은 값이 다시 서술되지 않아도 저장한다. 원본 입력에 없는 항목만 서사에서 실제로 답한 값으로 보완한다. 답하지 않은 키는 생략하고, 아무 답도 없으면 `{}`를 사용한다.

지원 키:

```json
{
  "name": "",
  "age": 0,
  "gender": "",
  "height_cm": 0,
  "weight_kg": 0,
  "job": "",
  "background": "",
  "location": "",
  "style": "",
  "penis_length_cm": 0
}
```

### 줄거리 요약

- `story_summary_recent100`: 최근 구간 요약. 출력 계약상 500자 이내.
- `story_summary_overall`: 전체 누적 요약. 1000자 이내.
- 현재 턴과 `recent100_start_turn`의 차이가 100 이상이면 최근 구간을 전체 요약에 압축하고 최근 구간을 새로 시작한다.
- 이때 `recent100_reset=true`, `new_recent100_start_turn=현재 턴`으로 반환한다.
- 평범한 턴은 `recent100_reset=false`, `new_recent100_start_turn=0`이다.
- 첫 100턴 동안 전체 요약이 비어 있지 않도록 필요한 경우 최근 요약을 전체 요약에도 반영한다.

### 캐릭터 ID

| 캐릭터 | ID |
|---|---|
| 한소영 | `heroine1` |
| 강세라 | `heroine2` |
| 최유리 | `heroine3` |
| 배수진 | `heroine4` |
| 김지은 | `heroine5` |
| 윤아름 | `heroine6` |
| 서지아 | `heroine7` |
| 한세아 | `heroine8` |
| 박소현 | `heroine9` |
| 임수정 | `heroine10` |

- `npcs_present`에는 실제 장면에 등장한 NPC의 ID를 전부 넣는다.
- `character_id`는 반드시 `npcs_present` 안에서 고른다.
- NPC가 전혀 없는 장면에서만 `narrator`를 사용한다.
- 여러 NPC가 있으면 플레이어와 가장 직접적으로 상호작용한 한 명을 고른다.

### 대사

서사의 다음 형식을 찾는다.

```text
**캐릭터명** (연기지시): "대사 내용"
```

선택된 `character_id`에 해당하는 캐릭터 대사만 `dialogue_lines`에 넣는다.

```json
{"speaker": "최유리", "text": "대사 내용", "direction": "연기지시"}
```

대사가 없으면 `[]`다.

### 이미지

1. 실제 성행위·삽입·성기 노출·오르가즘이 구체적으로 묘사된 경우만 `is_sexual=true`로 판단한다.
2. 키스·포옹·스킨십·야한 대화·분위기만으로는 `false`다.
3. 애매하면 반드시 `false`다.
4. 동일한 `character_id + is_sexual` 후보 중 현재 장면의 `situation`과 가장 가까운 `image_id`를 고른다.
5. 조건을 만족하는 후보가 없을 때만 `null`을 반환한다.

## 출력 JSON 계약

모델은 JSON 코드블록 하나만 출력해야 한다.

```json
{
  "npcs_present": ["heroine3"],
  "character_id": "heroine3",
  "npc_emotion": {
    "surface": "겉으로 드러난 감정",
    "inner": "속마음"
  },
  "npc_stats": {
    "호감도": 0,
    "신뢰도": 0,
    "최면깊이": 0,
    "순응도": 0,
    "최면저항력": 0
  },
  "player_patch": {},
  "story_summary_overall": "전체 누적 요약",
  "story_summary_recent100": "최근 100턴 구간 요약",
  "recent100_reset": false,
  "new_recent100_start_turn": 0,
  "choices": ["서사에 나온 선택지"],
  "dialogue_lines": [
    {"speaker": "최유리", "text": "대사", "direction": "연기지시"}
  ],
  "image_id": 123
}
```

## Worker 후처리

모델 응답은 그대로 저장하지 않는다.

- JSON 코드블록이 있으면 내부 JSON만 파싱한다.
- `image_id`를 정수로 변환하고 실패하면 `null`로 둔다.
- 배열 또는 객체 필드가 빠졌으면 안전한 기본값을 채운다.
- `buildSavePatch()`가 `character_id` 아래로 NPC 상태를 중첩한다.
- `dialogue_lines`, `player_patch` 같은 추출 전용 필드는 필요한 값만 변환해 저장 패치에 반영한다.
- 완성된 패치는 `/api/commit-turn`에서 원자적으로 커밋한다.

## 실패 처리

- DeepSeek 비정상 응답: `502`
- JSON 파싱 실패: `502`와 제한된 `raw` 미리보기 반환
- 프론트는 저장을 진행하지 않고 오류를 표시한다.
- 같은 입력의 커밋 재시도는 `commit_turn`의 replay 처리로 안전하게 응답한다.
