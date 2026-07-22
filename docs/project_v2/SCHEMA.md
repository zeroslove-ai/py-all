# 스키마 설계서 (v2)

## 1. 테이블 목록

| 테이블 | 설명 | 비고 |
|---|---|---|
| `games` | 게임 기본 정보 | |
| `game_master` | 세계관/룰북/캐릭터 설정 | 리셋 불가 |
| `game_save` | 진행 상태 | 리셋 대상 |
| `game_memories` | 턴별 서사 원문 | 리셋 시 삭제 |
| `image_library` | 이미지 카탈로그 | 기존 URL 참조 |

---

## 2. game_master.data 구조

```json
{
  "title": "게임 제목",
  "rules_full": "전체 룰북 텍스트",
  "rulebook_game_system": "게임 시스템 규칙",
  "rulebook_level_growth": "레벨업 규칙",
  "rulebook_display_format": "출력 형식 규칙",
  "rulebook_narrative": "서술 규칙",
  "rulebook_dev_only": "개발자용 규칙",
  "rulebook_verification": "체크리스트",
  "rulebook_action_resolution": "선택지 결과 판정",
  "display_format": "...",
  "narrative_rules": "...",
  "mind_monitor_format": "...",
  "opening_scenario": "프롤로그",
  "background": "세계관",
  "map": "병원 지도",
  "game_difficulty": 1.0,
  "characters": {
    "heroine1": {
      "name": "한소영",
      "age": 24,
      "description": "...",
      "voice_id": "...",
      "image_base": "heroine1"
    }
  },
  "npc_stats": {
    "heroine1": {"순응도": 25, "최면저항력": 30, "호감도": 0, "신뢰도": 0, "최면깊이": 0}
  },
  "player": {
    "name": "", "age": 0, "gender": "", "height_cm": 0,
    "weight_kg": 0, "job": "", "background": "",
    "location": "", "style": "", "penis_length_cm": 0
  },
  "csa_daily_limit": 3
}
```

**[핵심 규칙] npc_stats는 read-only**
- 초기값 저장소로만 사용
- 플레이 중 수정 금지
- reset_game_progress가 초기값 읽어오는 용도

---

## 3. game_save.data 구조

```json
{
  "turn_count": 0,
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
  "relationship_bars": {},
  "debug_image_id_raw": null,
  "debug_json_parse_ok": null,
  "debug_image_mismatch": null,
  "debug_stream_image_injected": null
}
```

**[핵심 규칙] turn_count 단일 소스**
- 컬럼 없음, data.turn_count만 사용
- 매 턴 DB에 즉시 반영

---

## 4. image_library 구조

```sql
CREATE TABLE image_library (
  id SERIAL PRIMARY KEY,
  image_id INTEGER UNIQUE NOT NULL,
  character_id TEXT NOT NULL,
  emotion_id TEXT DEFAULT 'default',
  situation TEXT,
  is_sexual BOOLEAN DEFAULT false,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**이미지 URL**: 기존 Supabase Storage URL 그대로 참조
- `https://ckzwlmoojtmcpwlqsqzv.supabase.co/storage/v1/object/public/...`

---

## 5. reset_game_progress RPC

```sql
CREATE OR REPLACE FUNCTION reset_game_progress(p_game_id UUID)
RETURNS VOID AS $$
DECLARE
  v_master_npc_stats JSONB;
  v_empty_player JSONB := '{"name":"","age":0,"gender":"","height_cm":0,"weight_kg":0,"job":"","background":"","location":"","style":"","penis_length_cm":0}'::JSONB;
BEGIN
  SELECT data->'npc_stats' INTO v_master_npc_stats FROM game_master WHERE game_id = p_game_id;
  IF v_master_npc_stats IS NULL THEN v_master_npc_stats := '{}'::JSONB; END IF;

  UPDATE game_save SET data = jsonb_build_object(
    'turn_count', 0, 'npc_stats', v_master_npc_stats, 'npc_emotion', '{}',
    'last_character_id', null, 'last_image_id', null,
    'story_summary_overall', '', 'story_summary_recent100', '', 'recent100_start_turn', 0,
    'csa_active', '[]', 'csa_daily_used', 0, 'player_location', '', 'relationship_bars', '{}',
    'debug_image_id_raw', null, 'debug_json_parse_ok', null,
    'debug_image_mismatch', null, 'debug_stream_image_injected', null
  ), updated_at = NOW() WHERE game_id = p_game_id;

  UPDATE game_master SET data = jsonb_set(
    jsonb_set(jsonb_set(data, '{player}', v_empty_player, true), '{npc_emotion}', '{}', true),
    '{recent_memories}', '[]', true
  ) WHERE game_id = p_game_id;

  DELETE FROM game_memories WHERE game_id = p_game_id;
END;
$$ LANGUAGE plpgsql;
```

**[핵심 규칙] 확인 절차는 프론트엔드/API에서**
- RPC 자체는 바로 실행
- 프론트엔드에서 "정말 초기화할까요?" UI 필수
