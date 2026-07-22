# 게임빌더 v2 Worker API 명세

**기준일**: 2026-07-22  
**Worker**: `game-proxy-v2`  
**배포 상태**: 배포 완료  
**기준 구현**: `worker/game-proxy-v2.js`

## 기본 정보

- Base URL: 배포된 Worker URL 또는 동일 출처로 연결된 Pages의 `/api/*`
- 요청 형식: `POST`, `Content-Type: application/json`
- CORS: 현재 구현은 `Access-Control-Allow-Origin: *`
- 필수 Secret: `SUPABASE_SECRET_KEY`, `DEEPSEEK_API_KEY`
- 선택 변수: `SUPABASE_URL` — 없으면 v2 프로젝트 URL 기본값 사용
- 속도 제한: 함수 자리는 있으나 현재 `checkRateLimit()`이 항상 허용하므로 실질적으로 미적용

> 브라우저가 직접 Supabase Secret이나 DeepSeek 키를 사용하지 않는다. Secret은 Cloudflare Worker 환경변수에만 둔다.

## 운영 엔드포인트

현재 프론트가 사용하는 운영 API는 7개다.

| 경로 | 역할 |
|---|---|
| `/api/context` | 게임 컨텍스트 로드 |
| `/api/story` | 서사 생성 및 SSE 스트리밍 |
| `/api/extract` | 생성 서사에서 저장 상태 추출 |
| `/api/image` | 선택한 캐릭터 이미지 URL 조회 |
| `/api/tts` | 외부 TTS Worker 호출 |
| `/api/commit-turn` | 서사·상태·턴 수 원자적 저장 |
| `/api/reset` | 게임 진행 초기화 |

`/api/save-turn`, `/api/set-save`는 현재 Worker 라우터에 하위 호환용으로 남아 있지만 신규 프론트 흐름에서는 사용하지 않는 레거시 API다. 제거 전까지 직접 호출하지 않는다.

## 1. `POST /api/context`

Supabase `get_context` RPC를 호출하고 이미지 카탈로그를 캐릭터별로 정규화한다.

```json
{
  "game_id": "uuid-or-supported-game-id"
}
```

성공 응답:

```json
{
  "context": {
    "master": {},
    "save": {},
    "recent_memories": [],
    "turn_count": 68
  },
  "image_catalog": {
    "heroine3": [
      {
        "image_id": 123,
        "situation": "장면 설명",
        "is_sexual": false,
        "image_url": "https://..."
      }
    ]
  },
  "turn_count": 68
}
```

## 2. `POST /api/story`

Worker가 최신 컨텍스트를 다시 읽어 동적 프롬프트를 만들고 DeepSeek의 SSE 응답을 그대로 중계한다.

```json
{
  "game_id": "uuid-or-supported-game-id",
  "player_input": "주변을 천천히 살펴본다."
}
```

응답 헤더 `X-Game-Mode`는 `reentry`, `player_setup`, `opening`, `normal` 중 하나다. `reentry` 응답은 안내용이므로 턴으로 저장하지 않는다.

```text
data: {"choices":[{"delta":{"content":"첫"}}]}

data: {"choices":[{"delta":{"content":" 문장"}}]}

data: [DONE]
```

## 3. `POST /api/extract`

완성된 서사, 플레이어가 이번 턴에 실제로 보낸 원본 입력, 최신 컨텍스트를 바탕으로 저장·이미지·TTS에 필요한 구조화 값을 추출한다. 다음 턴 번호는 Worker가 DB의 현재 턴 수에서 계산한다. `player_input`은 이름·직업처럼 서사에 다시 쓰이지 않을 수 있는 플레이어 설정값을 확실히 저장하기 위한 필드다.

```json
{
  "game_id": "uuid-or-supported-game-id",
  "narrative_text": "완성된 서사 전체",
  "player_input": "민준 / 의사"
}
```

```json
{
  "extract": {
    "npcs_present": ["heroine3"],
    "character_id": "heroine3",
    "npc_emotion": {"surface": "침착", "inner": "긴장"},
    "npc_stats": {"호감도": 20, "신뢰도": 10},
    "player_patch": {},
    "story_summary_overall": "...",
    "story_summary_recent100": "...",
    "recent100_reset": false,
    "new_recent100_start_turn": 0,
    "choices": ["계속 대화한다"],
    "dialogue_lines": [
      {"speaker": "최유리", "text": "대사", "direction": "작게 웃으며"}
    ],
    "image_reasoning": "...",
    "image_id": 123
  },
  "raw": "모델 원문 앞부분"
}
```

## 4. `POST /api/image`

```json
{
  "game_id": "uuid-or-supported-game-id",
  "character_id": "heroine3",
  "image_id": 123
}
```

```json
{"image_url": "https://.../image.png"}
```

## 5. `POST /api/tts`

캐릭터의 `voice_id`는 프론트가 로드한 `game_master.characters`에서 가져온다.

```json
{
  "text": "대사 내용",
  "voice_id": "configured-voice-id"
}
```

```json
{"url": "https://.../audio.mp3"}
```

## 6. `POST /api/commit-turn`

한 턴의 서사 저장, 상태 병합, `turn_count` 증가를 Supabase `commit_turn` RPC 한 번으로 처리한다. 브라우저는 `/api/save-turn`과 `/api/set-save`를 따로 호출하지 않는다.

```json
{
  "game_id": "uuid-or-supported-game-id",
  "turn_number": 69,
  "content": "완성된 서사 전체",
  "extract": {
    "character_id": "heroine3",
    "npc_stats": {"호감도": 20},
    "npc_emotion": {"surface": "침착", "inner": "긴장"},
    "player_patch": {},
    "story_summary_overall": "...",
    "story_summary_recent100": "...",
    "choices": ["계속 대화한다"],
    "image_id": 123
  },
  "engine_patch": {
    "opening_started": true
  }
}
```

신규 저장 성공:

```json
{"ok": true, "turn_count": 69, "replay": false}
```

동일한 턴과 동일한 서사를 재전송한 경우에도 성공으로 처리한다.

```json
{"ok": true, "turn_count": 69, "replay": true}
```

턴 순서가 맞지 않거나 같은 턴에 다른 내용이 들어오면 `409 Conflict`를 반환한다.

```json
{
  "error": "turn conflict",
  "expected_turn": 70,
  "received_turn": 69,
  "reason": "same_turn_different_content"
}
```

## 7. `POST /api/reset`

프론트에서 사용자 확인을 받은 뒤 호출한다.

```json
{"game_id": "uuid-or-supported-game-id"}
```

```json
{"ok": true}
```

## 공통 오류

| HTTP | 의미 |
|---|---|
| `400` | 필수 입력 누락 또는 형식 오류 |
| `404` | 등록되지 않은 경로 |
| `409` | 턴 충돌 |
| `429` | 속도 제한 초과 — 제한 활성화 후 사용 |
| `500` | Worker 또는 Supabase 처리 오류 |
| `502` | DeepSeek 또는 TTS upstream 오류 |
