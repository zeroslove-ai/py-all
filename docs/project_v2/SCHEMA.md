# 게임빌더 v2 Supabase 스키마

**기준일**: 2026-07-22  
**핵심 변경**: PR #1 원자적 턴 저장 반영

## 설계 원칙

| 항목 | 결정 |
|---|---|
| 게임 선택 | URL의 게임 ID 사용, `games.is_active` 미사용 |
| 마스터 데이터 | `game_master`는 플레이 중 읽기 전용 |
| 플레이어 정보 | `game_save.data.player`에 저장 |
| NPC 초기값 | `game_master.data.characters.*.initial_stats` |
| 현재 턴 | `game_save.turn_count` 컬럼만 사용 |
| 턴 기록 | `game_memories`에 턴별 서사 저장 |
| 턴 커밋 | `commit_turn` RPC 한 트랜잭션으로 처리 |
| 이미지 선택 | `image_id` 직접 선택, `emotion_id` 미사용 |
| 디버그 정보 | DB의 `debug_*` 대신 Worker 로그 사용 |
| 방문자 세션 | IP/UA 기반 `game_sessions` 미사용 |

## 테이블

### `games`

```sql
create table games (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### `game_master`

```sql
create table game_master (
  game_id uuid primary key references games(id),
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

대표 `data` 구조:

```json
{
  "title": "게임 제목",
  "rulebook_game_system": "...",
  "rulebook_level_growth": "...",
  "rulebook_display_format": "...",
  "rulebook_narrative": "...",
  "rulebook_dev_only": "...",
  "rulebook_verification": "...",
  "rulebook_action_resolution": "...",
  "opening_scenario": "...",
  "background": "...",
  "map": "...",
  "characters": {
    "heroine1": {
      "name": "한소영",
      "age": 24,
      "description": "...",
      "voice_id": "...",
      "initial_stats": {
        "순응도": 25,
        "신뢰도": 0,
        "호감도": 0,
        "최면깊이": 0,
        "최면저항력": 30
      }
    }
  }
}
```

리셋과 턴 저장은 `game_master`를 수정하지 않는다.

### `game_save`

```sql
create table game_save (
  game_id uuid primary key references games(id),
  turn_count integer not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

대표 `data` 구조:

```json
{
  "player": {
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
  },
  "npc_stats": {},
  "npc_emotion": {},
  "last_character_id": null,
  "last_image_id": null,
  "story_summary_overall": "",
  "story_summary_recent100": "",
  "recent100_start_turn": 0,
  "opening_started": false,
  "csa_active": [],
  "csa_daily_used": 0,
  "player_location": "",
  "player_progress": { "level": 1, "exp": 0, "leveled_up": false, "next_level_exp": 10 },
  "active_suggestions": []
}
```

`turn_count`는 JSONB 안에 중복 저장하지 않는다.

### `game_memories`

```sql
create table game_memories (
  id serial primary key,
  game_id uuid references games(id),
  turn_number integer not null,
  content text not null,
  created_at timestamptz default now(),
  unique (game_id, turn_number)
);
```

동일 게임에 같은 턴이 중복 저장되지 않도록 `(game_id, turn_number)` 고유 제약을 유지한다.

### `image_library`

```sql
create table image_library (
  id serial primary key,
  image_id integer unique not null,
  character_id text not null,
  situation text,
  is_sexual boolean default false,
  image_url text not null,
  created_at timestamptz default now()
);
```

현재 런타임은 DB 레코드의 `id` 또는 `image_id`를 API의 `image_id`로 정규화할 수 있다. 장기적으로 실제 운영 스키마에서 어느 컬럼을 표준으로 쓸지 하나로 고정한다.

## `commit_turn` RPC

### 목적

이전의 `save_turn` 후 `set_save` 방식은 첫 호출만 성공하고 두 번째 호출이 실패할 경우 부분 저장이 생길 수 있었다. `commit_turn`은 다음 작업을 하나의 PostgreSQL 트랜잭션에서 처리한다.

1. 대상 게임 ID 확인
2. `game_save` 행 잠금
3. 턴 순서 검증
4. `game_memories` 삽입
5. 기존 `game_save.data`와 패치의 깊은 병합
6. `game_save.turn_count`와 `updated_at` 갱신

현재 마이그레이션 시그니처:

```sql
public.commit_turn(
  p_game_id text,
  p_turn_number integer,
  p_content text,
  p_patch jsonb
) returns jsonb
```

`p_game_id`는 `_resolve_game()`으로 실제 UUID에 해석한다. `jsonb_deep_merge()`와 `_resolve_game()` 함수가 선행되어 있어야 한다.

### 결과 상태

| 상태 | 조건 | 처리 |
|---|---|---|
| `committed` | 요청 턴 = 현재 턴 + 1 | 새 메모리와 세이브를 저장 |
| `replay` | 요청 턴 = 현재 턴, 기존 서사와 동일 | 네트워크 응답 유실 후 재시도로 보고 성공 응답 |
| `conflict` | 같은 턴에 다른 서사 또는 순서가 어긋남 | 저장하지 않고 예상 턴 반환 |

### 동시성 규칙

- `select ... for update`로 해당 `game_save` 행을 잠근다.
- 브라우저가 계산한 턴 수를 그대로 신뢰하지 않고 DB의 현재 턴과 비교한다.
- 중복 클릭·네트워크 재시도는 동일 내용이면 replay로 안전하게 처리한다.
- 여러 창에서 다른 내용이 같은 턴에 들어오면 conflict로 거부한다.
- Worker는 conflict를 HTTP `409`로 변환한다.

## 저장 패치 변환

Worker의 `buildSavePatch()`는 추출 결과를 DB 구조에 맞게 바꾼다.

| 추출 값 | 저장 위치 |
|---|---|
| `player_patch` | `data.player`에 깊은 병합 |
| `npc_stats` | `data.npc_stats.<character_id>` |
| `npc_emotion` | `data.npc_emotion.<character_id>` |
| `image_id` | `data.last_image_id` |
| `character_id` | `data.last_character_id` |
| `choices` | `data.active_suggestions` |
| 요약 필드 | 같은 이름의 `data` 필드 |
| 첫 오프닝 완료 | `data.opening_started=true` |

`dialogue_lines`는 렌더링 보조값이며 그대로 세이브 JSON에 넣지 않는다.

## `reset_game_progress` 규칙

- 사용자 확인은 프론트에서 먼저 받는다.
- `game_save.turn_count`를 `0`으로 되돌린다.
- 플레이어·NPC 상태·요약·선택지·오프닝 플래그를 초기 상태로 재구성한다.
- 해당 게임의 `game_memories`를 삭제한다.
- `game_master`는 절대 수정하지 않는다.

실제 RPC 정의가 변경될 때는 이 문서의 예시보다 Supabase에 적용된 마이그레이션 SQL을 우선한다.

## 배포 전 DB 검증

- `commit_turn`, `_resolve_game`, `jsonb_deep_merge`가 존재한다.
- `game_save`에 대상 게임 행이 존재한다.
- `(game_id, turn_number)` 중복 방지 제약이 존재한다.
- 정상 요청은 턴이 1 증가한다.
- 동일 내용 재요청은 `replay`다.
- 다른 내용의 같은 턴 요청은 `conflict`다.
- conflict 후 DB가 부분 변경되지 않는다.

## JSONB deep merge migration

`supabase/migrations/20260722095050_jsonb_deep_merge.sql` defines `public.jsonb_deep_merge(jsonb, jsonb)` before `commit_turn` is applied to a new database. When both values are JSON objects, it recursively merges their keys. Arrays, scalar values, and JSON `null` are replaced by the patch value. The migration uses `create or replace function` and `set search_path = public`, so it is idempotent.
