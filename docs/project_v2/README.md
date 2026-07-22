# 게임빌더_v2 설계 현황

**프로젝트명**: 게임빌더_v2 (Web/Cloudflare)
**결정일**: 2026-07-22
**재설계일**: 2026-07-22
**작성자**: Kimi

---

## 1. 방향 결정

| 항목 | 결정 내용 |
|---|---|
| **플랫폼** | Cloudflare Workers + Pages (Web) |
| **기존 Dify** | 완전 분리, 계속 운영 유지 |
| **기존 Supabase** | ckzwlmoojtmcpwlqsqzv (Dify용 유지) |
| **새 Supabase** | ovltkzwddxsekcfeskds (v2용) |
| **Ren'Py** | 백업안으로 보류 |

## 2. 새 Supabase 정보

| 항목 | 값 |
|---|---|
| URL | https://ovltkzwddxsekcfeskds.supabase.co |
| Publishable Key | sb_publishable_ltzbklyjxt5SNrvKMG6gbw_51ugNhZP |
| Service Key | sb_secret_9b37UcA8EsLrjKuhEQ9dTw_2YddI-T4 |
| RLS | 비활성화 (사용자 지시) |
| 현재 상태 | 테이블 생성 완료, image_library 586개 이관 완료 |

## 3. 재설계 핵심 (v2)

### 삭제/변경 8개 항목

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

### 마이그레이션

| 데이터 | 방법 | 상태 |
|---|---|---|
| `image_library` 586개 | 행만 복사, URL 기존 Storage 그대로 참조 | ✅ 완료 |
| `game_master` 세계관 | 새 스키마 형태로 변환 이전 | 필요 |
| `game_save`, `game_memories` | 이전 안 함 — 새 플레이스루 | ✅ |

## 4. 보안 구조

```
[브라우저] → [Cloudflare Pages] → [Cloudflare Worker (프록시)] → [Supabase v2]
```

- API 키는 Worker 환경변수에만 저장
- 프론트엔드에 키 노출 없음
- 기존 TTS Worker(fancy-dust-7f8c)와 신규 Worker 분리

## 5. API 인터페이스 (Worker 프록시)

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/context` | POST | get_context RPC |
| `/api/story` | POST | 서사 생성 (SSE 스트리밍) |
| `/api/extract` | POST | 상태 추출 (JSON) |
| `/api/save-turn` | POST | save_turn RPC |
| `/api/set-save` | POST | set_save RPC |
| `/api/reset` | POST | reset_game_progress |
| `/api/image` | POST | get_character_image |
| `/api/tts` | POST | Fish Audio TTS |

## 6. 대사 포맷 (구조화 JSON 확정)

```json
{
  "dialogue_lines": [
    {"speaker": "heroine3", "text": "대사 원문"},
    {"speaker": "player", "text": "플레이어 대사"}
  ]
}
```

## 7. Phase 1 개발 일정

| 단계 | 기간 | 산출물 |
|---|---|---|
| 1-1. Worker 프록시 구축 | 2일 | /api/context, /api/story (SSE) |
| 1-2. 프론트엔드 기본 UI | 2일 | 스트리밍 화면, 기본 레이아웃 |
| 1-3. 통합 테스트 | 1일 | 1턴 플레이 완료 |
| 1-4. 이미지/TTS 연동 | 2일 | /api/image, /api/tts |
| 1-5. 선택지/마인드모니터 | 2일 | UI 완성 |
| **총** | **9일** | **프로토타입** |

---

## 문서 목록

| 문서 | 설명 |
|---|---|
| [README.md](README.md) | 이 문서 — 설계 현황 전체 요약 |
| [API_SPEC.md](API_SPEC.md) | Worker 프록시 API 명세 |
| [SCHEMA.md](SCHEMA.md) | Supabase 스키마 설계 (재설계 v2) |
| [FRONTEND.md](FRONTEND.md) | 프론트엔드 구조 |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-22 | 초기 작성, URL 정정 |
| 2026-07-22 | 재설계 — 삭제/변경 8개 항목 반영 |
