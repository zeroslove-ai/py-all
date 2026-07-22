# 스키마 설계서 (v2 재설계)

**재설계일**: 2026-07-22
**변경사항**: 삭제/변경 8개 항목 반영

---

## 삭제/변경 요약

| 항목 | 처리 | 이유 |
|---|---|---|
| `games.is_active` | **삭제** | URL 라우팅(`/play/{game_id}`)으로 명확화 |
| `game_master.player` | **`game_save`로 이동** | "이번 플레이스루가 누구인지" |
| `game_master.npc_stats` (최상위) | **`characters.initial_stats` 병합** | 중복 제거 |
| `game_save.turn_count` (jsonb) | **컬럼 단일화** | 이원화 버그 원천 차단 |
| `relationship_bars` | **삭제 → `player_progress` + `active_suggestions`** | 죽은 필드 교체 |
| `debug_*` 필드들 | **전부 삭제** | Cloudflare Worker 로그로 대체 |
| `emotion_id` 기반 폴백 | **제거** | `image_id` 직접 선택 방식으로 대체됨 |
| `game_sessions` (IP/UA) | **미생성** | 개인정보 이슈 + 필요성 불명확 |

---

## 테이블 구조

### games
```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### game_master
```sql
CREATE TABLE game_master (
  game_id UUID PRIMARY KEY REFERENCES games(id),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**game_master.data 구조:**
```json
{
  "title": "게임 제목",
  "rules_full": "...",
  "rulebook_game_system": "...",
  "rulebook_level_growth": "...",
  "rulebook_display_format": "...",
  "rulebook_narrative": "...",
  "rulebook_dev_only": "...",
  "rulebook_verification": "...",
  "rulebook_action_resolution": "...",
  "display_format": "...",
  "narrative_rules": "...",
  "mind_monitor_format": "...",
  "opening_scenario": "...",
  "background": "...",
  "map": "...",
  "game_difficulty": 1.0,
  "characters": {
    "heroine1": {
      "name": "한소영",
      "age": 24,
      "description": "...",
      "voice_id": "...",
      "image_base": "heroine1",
      "initial_stats": {
        "순응도": 25,
        "신뢰도": 0,
        "호감도": 0,
        "최면깊이": 0,
        "최면저항력": 30
      }
    }
  },
  "csa_daily_limit": 3
}
```

**[핵심 규칙] game_master는 리셋 시 절대 수정 안 함**
- `player` → game_save로 이동
- `npc_stats` 최상위 → characters.initial_stats로 병합

### game_save
```sql
CREATE TABLE game_save (
  game_id UUID PRIMARY KEY REFERENCES games(id),
  turn_count INTEGER DEFAULT 0,  -- 컬럼 단일화
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**game_save.data 구조:**
```json
{
  "player": {
    "name": "", "age": 0, "gender": "", "height_cm": 0,
    "weight_kg": 0, "job": "", "background": "",
    "location": "", "style": "", "penis_length_cm": 0
  },
  "npc_stats": {"heroine1": {"순응도": 25, ...}},
  "npc_emotion": {"heroine1": {"surface": "...", "inner": "..."}},
  "last_character_id": null,
  "last_image_id": null,
  "story_summary_overall": "",
  "story_summary_recent100": "",
  "recent100_start_turn": 0,
  "csa_active": [],
  "csa_daily_used": 0,
  "player_location": "",
  "player_progress": {},
  "active_suggestions": []
}
```

**[핵심 규칙] turn_count 단일 소스**
- 컬럼만 사용, jsonb 필드 없음
- 매 턴 DB에 즉시 반영

### game_memories
```sql
CREATE TABLE game_memories (
  id SERIAL PRIMARY KEY,
  game_id UUID REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### image_library
```sql
CREATE TABLE image_library (
  id SERIAL PRIMARY KEY,
  image_id INTEGER UNIQUE NOT NULL,
  character_id TEXT NOT NULL,
  situation TEXT,
  is_sexual BOOLEAN DEFAULT false,
  image_url TEXT NOT NULL,  -- 기존 Storage URL 그대로 참조
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**[핵심 규칙] emotion_id 제거**
- `image_id` 직접 선택 방식만 사용
- `get_character_image` RPC: image_id 우선, 없으면 character_id 폴백

---

## reset_game_progress RPC (개선)

```sql
CREATE OR REPLACE FUNCTION reset_game_progress(p_game_id UUID)
RETURNS VOID AS $$
DECLARE
  v_master_npc_stats JSONB;
  v_empty_player JSONB := '{"name":"","age":0,"gender":"","height_cm":0,"weight_kg":0,"job":"","background":"","location":"","style":"","penis_length_cm":0}'::JSONB;
BEGIN
  -- 1. game_master에서 초기값 읽기 (read-only)
  SELECT data->'characters' INTO v_master_npc_stats
  FROM game_master WHERE game_id = p_game_id;

  -- 2. game_save 통째로 초기화 (game_master는 절대 안 건드림)
  UPDATE game_save SET
    turn_count = 0,
    data = jsonb_build_object(
      'player', v_empty_player,
      'npc_stats', COALESCE(v_master_npc_stats, '{}'),
      'npc_emotion', '{}',
      'last_character_id', null,
      'last_image_id', null,
      'story_summary_overall', '',
      'story_summary_recent100', '',
      'recent100_start_turn', 0,
      'csa_active', '[]',
      'csa_daily_used', 0,
      'player_location', '',
      'player_progress', '{}',
      'active_suggestions', '[]'
    ),
    updated_at = NOW()
  WHERE game_id = p_game_id;

  -- 3. game_memories 삭제
  DELETE FROM game_memories WHERE game_id = p_game_id;

END;
$$ LANGUAGE plpgsql;
```

**[핵심 규칙] 확인 절차는 프론트엔드/API에서**
- RPC 자체는 바로 실행
- 프론트엔드에서 "정말 초기화할까요?" UI 필수
