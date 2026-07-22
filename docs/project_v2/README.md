# 게임빌더_v2 — 설계 문서 중심

> Dify 기반 v1 → Cloudflare Workers + Pages + Supabase 기반 v2 재설계

---

## 📁 문서 목록 (전체)

### 설계 문서

| 문서 | 설명 | 상태 |
|---|---|---|
| [API_SPEC.md](./API_SPEC.md) | 8개 Worker 엔드포인트 명세 | ✅ 확정 |
| [SCHEMA.md](./SCHEMA.md) | Supabase v2 스키마 (4개 테이블 + RPC) | ⚠️ 일부 미완 (npc_stats 병합, emotion_id 제거) |
| [FRONTEND.md](./FRONTEND.md) | 프론트엔드 구조 (stream.js/ui.js/api.js/state.js) | ✅ 확정 |
| [EXTRACT_PROMPT.md](./EXTRACT_PROMPT.md) | `/api/extract` 프롬프트 (Dify c_llm_extract → Worker 이식) | ✅ 완성 |
| [WORKER_SUPABASE_SYNERGY.md](./WORKER_SUPABASE_SYNERGY.md) | Worker ↔ Supabase 연동 시너지/성능/보안 분석 | ✅ 완성 |
| [DEPLOY.md](./DEPLOY.md) | Worker 배포 절차 (wrangler + secrets + 연동) | ✅ 완성 |

### 코드

| 파일 | 경로 | 설명 | 상태 |
|---|---|---|---|
| **Worker 메인** | [worker/game-proxy-v2.js](../../worker/game-proxy-v2.js) | 8개 엔드포인트 + 동적 프롬프트 + SSE passthrough | ✅ 완성 |
| **Worker 설정** | [worker/wrangler.toml](../../worker/wrangler.toml) | name, main, compatibility_date | ✅ 완성 |
| **배포 스크립트** | [scripts/deploy_game_proxy.py](../../scripts/deploy_game_proxy.py) | 시크릿 확인 + `wrangler deploy` 자동화 | ✅ 완성 |
| **프론트 HTML** | [pages/index.html](../../pages/index.html) | 레이아웃 + CSS + 진입점 | ✅ 완성 |
| **프론트 상태** | [pages/state.js](../../pages/state.js) | 단순 상태 객체 | ✅ 완성 |
| **프론트 API** | [pages/api.js](../../pages/api.js) | 8개 API 호출 함수 | ✅ 완성 |
| **프론트 스트림** | [pages/stream.js](../../pages/stream.js) | SSE 파싱 (fetch + ReadableStream) | ✅ 완성 |
| **프론트 UI** | [pages/ui.js](../../pages/ui.js) | 렌더링 함수 (타이핑, 이미지, 오디오, 선택지) | ✅ 완성 |

---

## 🏗️ 전체 아키텍처

```
[브라우저 — Cloudflare Pages]
         ↕ POST /api/*
[Cloudflare Worker — game-proxy-v2]
         ↕
    ┌────┴────┬─────────────┐
    ↓         ↓             ↓
[Supabase] [DeepSeek]  [Fish Audio Worker]
(RPC/REST) (SSE 스트리밍)  (기존, 별개)
```

### 핵심 설계 결정

| 결정 | 내용 | 문서 |
|---|---|---|
| **플랫폼** | Cloudflare Workers + Pages + Supabase | [API_SPEC.md](./API_SPEC.md) |
| **스트리밍** | Worker가 DeepSeek SSE를 그대로 passthrough, 파싱은 브라우저 | [FRONTEND.md](./FRONTEND.md) |
| **이미지/오디오** | 서사 텍스트에 절대 포함 안 함 → 원천 차단 | [WORKER_SUPABASE_SYNERGY.md](./WORKER_SUPABASE_SYNERGY.md) |
| **turn_count** | 서버 응답값을 그대로 덮어쓰기 (프론트 임의 증가 금지) | [FRONTEND.md](./FRONTEND.md) |
| **동적 프롬프트** | 턴 수/상황에 따라 프롬프트 조립 (평소 72% 축소) | [worker/game-proxy-v2.js](../../worker/game-proxy-v2.js) |
| **보안** | 8개 엔드포인트만 노출, 임의 SQL 경로 없음, secrets로 Key 관리 | [DEPLOY.md](./DEPLOY.md) |

---

## 📊 현재 진행 상태

### ✅ 완료

- [x] API 명세 8개 엔드포인트
- [x] 프론트엔드 기본 UI (HTML/CSS/JS 5개 파일)
- [x] Worker 스켈레톤 + 동적 프롬프트
- [x] `/api/extract` 프롬프트 (Dify 이식)
- [x] Worker-Supabase 연동 분석
- [x] 배포 준비 (wrangler.toml + deploy 스크립트)

### ⚠️ 미완료 / 보류

- [ ] `game_master.data.npc_stats` → `characters.initial_stats` 병합
- [ ] `image_library.emotion_id` 컬럼 제거
- [ ] `game_master.data` 키 불일치 9개 통일
- [ ] RPC `save_turn`, `set_save` 생성 (v2 Supabase에 없음)
- [ ] Worker KV 기반 속도 제한
- [ ] `/api/extract` 프롬프트 실제 동작 검증
- [ ] TTS Worker CORS 헤더 확인
- [ ] 통합 테스트 (엔드투엔드)

### ❌ 의도적 미완료

- 빌드 모드 UI — DB에서 직접 수정
- `game_save`, `game_memories` 이전 — 새 플레이스루

---

## 🚀 다음 단계

| 순서 | 작업 | 산출물 |
|---|---|---|
| 1 | **Supabase 스키마 마무리** | `npc_stats` 병합 SQL, `emotion_id` DROP, RPC 생성 |
| 2 | **Worker 배포** | `wrangler deploy` → 실제 URL 생성 |
| 3 | **통합 테스트** | `/api/context` → `/api/story` → `/api/extract` → `/api/image` 검증 |
| 4 | **프론트엔드 배포** | Cloudflare Pages에 `pages/` 업로드 |
| 5 | **엔드투엔드 테스트** | 브라우저에서 실제 게임 플레이 |

---

## 🔗 관련 리소스

| 리소스 | 링크 |
|---|---|
| **GitHub 리포지토리** | https://github.com/zeroslove-ai/py-all |
| **Dify v1 대화** | https://udify.app/chat/XCBQyQ9sd4yko8ke |
| **v1 Supabase** | https://ckzwlmoojtmcpwlqsqzv.supabase.co |
| **v2 Supabase** | https://ovltkzwddxsekcfeskds.supabase.co |
| **TTS Worker** | https://fancy-dust-7f8c.zeroslove.workers.dev |

---

*마지막 업데이트: 2026-07-22*
