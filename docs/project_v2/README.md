# 게임빌더_v2 설계 현황

**프로젝트명**: 게임빌더_v2 (Web/Cloudflare)
**결정일**: 2026-07-22
**작성자**: Kimi

---

## 1. 방향 결정

| 항목 | 결정 내용 |
|---|---|
| **플랫폼** | Cloudflare Workers + Pages (Web) |
| **기존 Dify** | 완전 분리, 계속 운영 유지 |
| **기존 Supabase** | ckzwlmoojtmcpwlqsqzv (Dify용 유지) |
| **새 Supabase** | rlyjxt5snrvkmg6gbw (v2용) |
| **Ren'Py** | 백업안으로 보류 |

## 2. 새 Supabase 정보

| 항목 | 값 |
|---|---|
| URL | https://rlyjxt5snrvkmg6gbw.supabase.co |
| Publishable Key | sb_publishable_ltzbklyjxt5SNrvKMG6gbw_51ugNhZP |
| Service Key | sb_secret_9b37UcA8EsLrjKuhEQ9dTw_2YddI-T4 |
| RLS | 비활성화 (사용자 지시) |

## 3. 보안 구조

```
[브라우저] → [Cloudflare Pages] → [Cloudflare Worker (프록시)] → [Supabase v2]
```

- API 키는 Worker 환경변수에만 저장
- 프론트엔드에 키 노출 없음
- 기존 TTS Worker(fancy-dust-7f8c)와 신규 Worker 분리

## 4. 스키마 개선 (v2에서 적용)

### 4-1. turn_count 단일 소스
- `game_save.turn_count` 컬럼 제거
- `game_save.data.turn_count`만 사용

### 4-2. npc_stats read-only 규칙
- `game_master.npc_stats` = 초기값 저장소 (절대 수정 금지)
- 플레이 중 변동은 `game_save.npc_stats`에만 기록

### 4-3. 필드 초기화 통일
- 키 삭제(`-`) 금지
- 빈 값(`{}`, `""`)으로 명시적 초기화

### 4-4. reset_game_progress 개선
- `player` 필드 빈 객체로 초기화 (삭제 아님)
- `npc_emotion` 빈 객체로 초기화
- `recent_memories` 빈 배열로 초기화

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

## 7. 이미지 이전

- 이미지 파일(Storage) 이전: 불필요 (기존 URL 그대로 참조)
- `image_library` 테이블 데이터만 이전 필요

## 8. Phase 1 개발 일정

| 단계 | 기간 | 산출물 |
|---|---|---|
| 1-1. Worker 프록시 구축 | 2일 | /api/context, /api/story (SSE) |
| 1-2. 프론트엔드 기본 UI | 2일 | 스트리밍 화면, 기본 레이아웃 |
| 1-3. 통합 테스트 | 1일 | 1턴 플레이 완료 |
| 1-4. 이미지/TTS 연동 | 2일 | /api/image, /api/tts |
| 1-5. 선택지/마인드모니터 | 2일 | UI 완성 |
| **총** | **9일** | **프로토타입** |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-22 | 초기 작성 |
