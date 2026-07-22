# 게임빌더 v2 — 프로젝트 현황

**기준일**: 2026-07-22  
**구조**: Cloudflare Pages + Workers + Supabase PostgreSQL  
**저장소**: `zeroslove-ai/py-all`  
**운영 Worker**: `game-proxy-v2`

## 현재 상태

| 항목 | 상태 | 비고 |
|---|---|---|
| GitHub `main` | 완료 | PR #1 원자적 턴 저장 흐름 병합 |
| Supabase v2 스키마 | 완료 | 게임·세이브·메모리·이미지 구조 구성 |
| `commit_turn` RPC | 적용 완료 | 메모리·세이브·턴 수를 한 트랜잭션으로 처리 |
| Cloudflare Worker | 배포 완료 | `game-proxy-v2` |
| Worker 운영 API | 7개 | context, story, extract, image, tts, commit-turn, reset |
| Cloudflare Pages 연결 | 확인 필요 | `/api/*`가 Worker로 연결되는지 검증 필요 |
| 실제 1턴 통합 테스트 | 대기 | Pages 연결 후 수행 |

## 아키텍처

```text
[브라우저 / Cloudflare Pages]
        │  /api/*
        ▼
[Cloudflare Worker: game-proxy-v2]
        ├─ DeepSeek: 서사 생성·상태 추출
        ├─ TTS Worker: 음성 생성
        └─ Supabase v2: 컨텍스트·턴 저장·이미지 조회
```

- 기존 Dify v1은 v2와 분리해 계속 운영한다.
- 브라우저에는 Supabase Secret과 LLM API Key를 넣지 않는다.
- Worker Secret은 Cloudflare의 Variables and Secrets에서 관리한다.
- URL이나 Secret 값은 문서·Git 저장소에 평문으로 기록하지 않는다.

## Supabase 구성

| 항목 | 상태 |
|---|---|
| v2 프로젝트 | 별도 프로젝트 사용 |
| `image_library` | 586개 이관 완료 |
| 기존 세계관 데이터 | 필요 시 새 `game_master` 구조로 변환 이전 |
| 기존 플레이 기록 | 이전하지 않고 새 플레이스루 사용 |
| RLS | 현재 프로젝트 정책을 따름. 외부 공개 전 재검토 필요 |

프로젝트 식별자·공개키가 필요한 경우 배포 환경 설정에서 확인한다. Service/Secret Key는 이 문서에 기록하지 않는다. 과거 문서나 채팅에 노출된 Secret은 폐기 후 재발급한다.

## 핵심 설계 결정

| 항목 | 현재 결정 |
|---|---|
| 게임 선택 | URL의 `?game=<game_id>` 또는 저장된 최근 ID 사용 |
| 플레이어 정보 | `game_save.data.player`에 저장 |
| NPC 초기값 | `game_master.data.characters.*.initial_stats` |
| 현재 턴 | `game_save.turn_count` 컬럼만 단일 소스로 사용 |
| 턴 저장 | `/api/commit-turn` → `commit_turn` RPC 한 번으로 처리 |
| 이미지 | `image_id` 직접 선택, `emotion_id` 제거 |
| 로그 | Cloudflare Worker observability 사용 |
| 세션 추적 | IP/UA 기반 `game_sessions` 미사용 |

## 턴 처리 흐름

1. `/api/context`로 최신 게임 상태를 로드한다.
2. `/api/story`가 서사를 SSE로 스트리밍한다.
3. 재진입 모드가 아니면 `/api/extract`로 상태를 추출한다.
4. 이미지와 TTS는 선택 작업으로 병렬 실행한다.
5. `/api/commit-turn`이 서사·상태·턴 수를 원자적으로 저장한다.
6. 저장 성공 후에만 화면의 턴 수와 선택지를 갱신한다.
7. `409`이면 다른 창에서 진행된 것으로 보고 최신 컨텍스트를 다시 로드한다.

## 운영 API

| 엔드포인트 | 설명 |
|---|---|
| `/api/context` | 게임 컨텍스트 로드 |
| `/api/story` | 서사 생성, SSE 스트리밍 |
| `/api/extract` | 상태·선택지·이미지·대사 추출 |
| `/api/image` | 캐릭터 이미지 URL 조회 |
| `/api/tts` | TTS 생성 |
| `/api/commit-turn` | 한 턴 원자적 저장 |
| `/api/reset` | 진행 초기화 |

레거시 `/api/save-turn`, `/api/set-save`는 Worker에 하위 호환용으로 남아 있으나 신규 프론트에서는 호출하지 않는다.

## 배포 설정

`worker/wrangler.jsonc` 기준:

| 항목 | 값 |
|---|---|
| Worker name | `game-proxy-v2` |
| Entry point | `worker/game-proxy-v2.js` |
| Root directory | `worker` |
| Production branch | `main` |
| Deploy command | `npx wrangler deploy` |

필수 Worker Secret:

- `SUPABASE_SECRET_KEY`
- `DEEPSEEK_API_KEY`

선택 변수:

- `SUPABASE_URL`

## 배포 완료 조건

- Pages에서 `/api/context`가 `200`으로 응답한다.
- 서사가 끝까지 스트리밍된다.
- `/api/extract`가 유효한 JSON을 반환한다.
- `/api/commit-turn`이 `200`으로 완료되고 턴 수가 정확히 1 증가한다.
- 새로고침 후에도 저장된 서사와 턴 수가 유지된다.
- Worker 로그에 `409`, `500`, Supabase RPC 오류가 없다.

## 문서 목록

| 문서 | 설명 |
|---|---|
| `README.md` | 현재 상태와 운영 개요 |
| `API_SPEC.md` | Worker API 요청·응답 명세 |
| `SCHEMA.md` | Supabase 스키마와 원자적 저장 규칙 |
| `FRONTEND.md` | 현재 프론트 구조와 턴 처리 흐름 |
| `EXTRACT_PROMPT.md` | `/api/extract` 프롬프트 계약 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-22 | v2 초기 설계 및 스키마 재구성 |
| 2026-07-22 | PR #1: `/api/commit-turn`, 충돌 감지, 재시도 안전성 반영 |
| 2026-07-22 | `game-proxy-v2` 배포 완료 상태와 7개 운영 API 기준으로 문서 정합성 갱신 |
