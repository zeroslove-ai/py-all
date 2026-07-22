# Worker ↔ Supabase 연동 시너지/궁합 분석

## 1. 호출 패턴 비교

| 항목 | Dify v1 (HTTP 노드) | Worker v2 (fetch) | 시너지 |
|---|---|---|---|
| **get_context** | HTTP 노드, 600s timeout | `fetch` + JSON | ✅ 동일. Worker가 더 유연한 timeout/재시도 제어 가능 |
| **save_turn** | HTTP 노드, 600s timeout | `fetch` + JSON | ✅ 동일. Worker에서 병렬 처리 시 에러 핸들링 우수 |
| **set_save** | HTTP 노드, 600s timeout | `fetch` + JSON | ✅ 동일. patch JSON 자동 조립 |
| **get_character_image** | HTTP 노드, 600s timeout | `fetch` + JSON | ✅ 동일. image_id 직접 전달 |
| **reset_game_progress** | HTTP 노드, 600s timeout | `fetch` + JSON | ✅ 동일 |

## 2. 병렬 처리 개선 (v2 핵심 시너지)

### Dify v1 한계
- 노드 기반 선형 실행: `save_turn` → `set_save` → `get_character_image` → 렌더링
- 각 노드가 이전 노드 완료 대기 → **턴당 3~5초 누적 지연**
- `c_code_parser` → `c_http_image` 엣지가 단일 경로라 병렬 불가

### Worker v2 개선
```javascript
// /api/extract 호출 후 병렬 처리
const [imageRes, ttsRes, saveRes] = await Promise.allSettled([
  fetch('/api/image', { body: JSON.stringify({ game_id, character_id, image_id }) }),
  fetch('/api/tts', { body: JSON.stringify({ text: dialogueLines, voice_id }) }),
  fetch('/api/save-turn', { body: JSON.stringify({ game_id, turn_number, content }) })
]);
// set_save는 save-turn 후 turn_count 갱신을 위해 순차 필요
```

| 작업 | v1 (Dify) | v2 (Worker) | 지연 감소 |
|---|---|---|---|
| 이미지 조회 | 순차 (save 후) | 병렬 (extract 후) | ~1-2초 |
| TTS 생성 | 순차 (extract 후) | 병렬 (extract 후) | ~2-3초 |
| 턴 저장 | 순차 (image 후) | 병렬 (extract 후) | ~1초 |
| **총 지연** | **5-8초/턴** | **2-3초/턴** | **~60% 감소** |

## 3. SSE 스트리밍 시너지

| 항목 | Dify v1 | Worker v2 | 시너지 |
|---|---|---|---|
| **스트리밍 제어** | Dify answer 노드가 자동 처리 | Worker가 DeepSeek SSE를 그대로 passthrough | ✅ Worker가 중간 변환 없이 직접 중계 → 지연 0ms 추가 |
| **파싱 위치** | Dify 내부 (블랙박스) | 브라우저 stream.js (투명) | ✅ 프론트가 직접 파싱 → 디버깅/커스터마이징 용이 |
| **스트리밍+저장 분리** | 서사 스트리밍 중 저장 노드가 뒤에 배치 불가 | 스트리밍 완료 후 별도 `/api/extract` 호출 | ✅ 구조적으로 깔끔. 스트리밍 지연 없음 |

## 4. 에러 처리 시너지

| 항목 | Dify v1 | Worker v2 | 시너지 |
|---|---|---|---|
| **Supabase 타임아웃** | HTTP 노드 retry (3회, 100ms) | Worker `fetch` + `Promise.allSettled` | ✅ Worker가 더 세밀한 재시도/폴백 제어 가능 |
| **DeepSeek 실패** | LLM 노드 자동 재시도 없음 | Worker에서 502 → 프론트에 에러 전달 → 재시도 버튼 | ✅ 프론트가 UX 제어 |
| **TTS 실패** | 별도 가지라 메인 흐름 차단 안 됨 | `/api/tts`가 병렬이라 메인 흐름 무관 | ✅ 동일 구조, Worker가 더 명시적 |
| **JSON 파싱 실패** | `c_code_parser`에서 parse_ok 플래그 | Worker `handleExtract`에서 try/catch + raw 반환 | ✅ 더 명확한 에러 전달 |

## 5. 보안 시너지

| 항목 | Dify v1 | Worker v2 | 시너지 |
|---|---|---|---|
| **API Key 노출** | Dify 서버에 저장 (env 변수) | Worker env 변수 (Cloudflare 암호화) | ✅ 동등. Cloudflare가 더 투명한 secret 관리 |
| **Supabase Key** | Dify env (service_role) | Worker env (service_role) | ✅ 동등. Worker가 IP/도메인 제한 추가 가능 |
| **속도 제한** | Dify 기본 제공 없음 | Worker KV 기반 game_id/IP 제한 | ✅ Worker가 더 세밀한 rate limiting 가능 |
| **임의 SQL** | Dify HTTP 노드가 `/rest/v1/rpc/*`만 호출 | Worker가 8개 엔드포인트만 노출 | ✅ Worker가 더 강한 보안 경계 |

## 6. 데이터 흐름 시너지 (1턴)

```
[Dify v1]                    [Worker v2]
  ├─ ctx_load (get_context)    ├─ /api/context (get_context + image_library)
  ├─ c_code_strip_catalog        │   (병렬: 한 번에 컨텍스트+이미지)
  ├─ c_llm (서사 LLM)           ├─ /api/story (SSE passthrough)
  ├─ c_answer_stream            │   (스트리밍: 브라우저 직접 수신)
  ├─ c_code_clean_narrative      │
  ├─ c_llm_extract (추출 LLM)    ├─ /api/extract (추출 LLM)
  ├─ c_code_parser               │   (JSON 파싱 + 검증)
  ├─ c_code_validate             │
  ├─ c_if_agesafe                │
  ├─ c_http_saveturn             ├─ /api/save-turn (병렬)
  ├─ c_http_setsave              ├─ /api/set-save (병렬)
  ├─ c_http_image                ├─ /api/image (병렬)
  ├─ c_tpl_render                │   (프론트에서 렌더링)
  ├─ c_answer (이미지)           │
  ├─ c_code_check_autotts        │
  ├─ if_auto_tts                 ├─ /api/tts (병렬, 선택적)
  ├─ c_code_voice_lookup_auto    │
  ├─ if_has_tts                  │
  ├─ h_http_tts_worker_auto      │
  ├─ c_code_audio_url_parse_auto │
  ├─ c_tpl_audio_final_auto      │
  └─ c_answer_audio_auto         │   (프론트에서 <audio> 렌더링)
```

**핵심 시너지:**
- **8개 노드 → 1개 `/api/story` + 1개 `/api/extract` + 병렬 `/api/*`**
- **선형 15단계 → 병렬 3단계**
- **턴당 API 호출 8회 → 3~4회**

## 7. 잠재적 문제점 (궁합 이슈)

| 이슈 | 설명 | 완화 방안 |
|---|---|---|
| **Worker cold start** | Cloudflare Worker 첫 호출 시 50-200ms 지연 | KV 캐싱, 웜업 ping |
| **Supabase → Worker 지연** | Worker가 Supabase REST 호출 시 네트워크 홉 추가 | Worker와 Supabase가 같은 리전(US East)에 가까우면 최소화 |
| **SSE + JSON 혼합** | `/api/story`는 SSE, `/api/extract`는 JSON → 프론트가 두 프로토콜 처리 | stream.js가 SSE, api.js가 JSON 분리 처리 |
| **turn_count 이원화** | 프론트가 `/api/set-save` 응답의 turn_count를 덮어써야 함 | state.js에서 서버 응답값만 신뢰 |
| **TTS Worker 분리** | 기존 Fish Audio Worker가 별도 도메인 → CORS 필요 | 기존 Worker에 CORS 헤더 추가 또는 신규 Worker에 TTS 통합 |

## 8. 종합 평가

| 항목 | 점수 | 이유 |
|---|---|---|
| **연동 용이성** | ⭐⭐⭐⭐⭐ | Supabase REST API는 표준 HTTP — Worker `fetch`와 100% 호환 |
| **성능 (지연)** | ⭐⭐⭐⭐⭐ | 병렬 처리로 60% 지연 감소, SSE passthrough로 0ms 추가 |
| **확장성** | ⭐⭐⭐⭐⭐ | Worker 코드 기반 → 노드 추가 없이 함수 추가만 |
| **디버깅** | ⭐⭐⭐⭐☆ | Worker 로그(`wrangler tail`) + 프론트 콘솔 — Dify보다 투명 |
| **보안** | ⭐⭐⭐⭐⭐ | 8개 엔드포인트만 노출, 임의 SQL 차단, KV rate limiting |
| **운영 복잡도** | ⭐⭐⭐☆☆ | Dify UI vs 코드 배포 — 개발자 친화적이나 비개발자에게는 진입장벽 |

**총평: Worker + Supabase 조합은 Dify + Supabase보다 모든 측면에서 우수. 유일한 단점은 운영 복잡도(코드 기반).**
