# API 명세서 (Worker 프록시)

## 기본 정보

- **Base URL**: `https://[worker-subdomain].workers.dev`
- **인증**: Origin 헤더 검증 (Cloudflare Pages 도메인만 허용)
- **속도 제한**: IP당 분당 100req (Cloudflare Rate Limiting)

---

## 1. POST /api/context

게임 컨텍스트 로드 (get_context RPC 래퍼)

### Request
```json
{
  "game_id": "uuid-string",
  "recent_count": 15
}
```

### Response
```json
{
  "game_id": "...",
  "has_game": true,
  "title": "게임 제목",
  "turn_count": 68,
  "master": {...},
  "save": {...},
  "recent_memories": [...],
  "image_catalog": [...]
}
```

---

## 2. POST /api/story

서사 생성 (SSE 스트리밍)

### Request
```json
{
  "game_id": "uuid-string",
  "input": "플레이어 입력 텍스트",
  "turn_count": 69
}
```

### Response (SSE)
```
data: {"choices":[{"delta":{"content":"첫"}}]}

data: {"choices":[{"delta":{"content":" 문장"}}]}

data: [DONE]
```

---

## 3. POST /api/extract

상태 추출 (JSON)

### Request
```json
{
  "game_id": "uuid-string",
  "story_text": "완성된 서사 전체",
  "turn_count": 69
}
```

### Response
```json
{
  "character_id": "heroine3",
  "npcs_present": ["heroine3"],
  "npc_stats": {"순응도": 35, ...},
  "npc_emotion": {"surface": "...", "inner": "..."},
  "image_id": 123,
  "image_reasoning": "...",
  "dialogue_lines": [
    {"speaker": "heroine3", "text": "대사"}
  ],
  "choices": [...],
  "player_patch": {...}
}
```

---

## 4. POST /api/save-turn

턴 서사 저장

### Request
```json
{
  "game_id": "uuid-string",
  "turn_number": 69,
  "content": "서사 원문"
}
```

### Response
```json
{"success": true}
```

---

## 5. POST /api/set-save

세이브 데이터 갱신

### Request
```json
{
  "game_id": "uuid-string",
  "patch": {
    "npc_stats": {...},
    "turn_count": 69
  }
}
```

### Response
```json
{"success": true}
```

---

## 6. POST /api/reset

진행 초기화 (확인 후 호출)

### Request
```json
{"game_id": "uuid-string"}
```

### Response
```json
{"success": true, "message": "초기화 완료"}
```

---

## 7. POST /api/image

이미지 URL 조회

### Request
```json
{
  "game_id": "uuid-string",
  "character_id": "heroine3",
  "emotion_id": "default",
  "image_id": 123
}
```

### Response
```json
{"url": "https://.../image.png"}
```

---

## 8. POST /api/tts

TTS 생성

### Request
```json
{
  "text": "대사 내용",
  "character_id": "heroine3"
}
```

### Response
```json
{"url": "https://r2/.../audio.mp3"}
```
