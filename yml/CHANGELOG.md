
## v50 (2026-07-20)
- **상식 개변(常識改変) 시스템 추가**
  - 지속: 영구 / 동시 적용: Lv1:1개 → Lv10:4개
  - 1일 사용 횟수: 2레벨당 1회 (최대 5회)
  - 광역 범위: Lv1 병동1개 → Lv4 층전체 → Lv7 건물전체 → Lv10 전세계
  - 동화 메커니즘: 단계적 동화형 (B→A 점진적 이행)
  - 예시: 약한 12개 / 중간 7개 / 강한 5개
- **마인드 모니터 포맷 변경**
  - [1. 표면의식] — 머리속 "당연한" 생각 (자기합리화)
  - [2. 잠재의식] — 깊은 속마음 (원래 상식 잔재 + 의심)
  - [3. 신체적/행동적 반응] — 100~200자
- **플레이어 상황판 확장**
  - 현재 위치(player_location) 표시
  - 상식 개변 적용 상태 / 금일 사용 가능 횟수 표시
- **병원 지도(hospital_map) 추가**
  - 1F~6F 층 구조, 캐릭터 배치 정보
- **c_llm 프롬프트 보강**
  - rulebook_game_system 상식 개변 규칙 참고 지시 추가
  - 자기검증 필수 섹션에 마인드 모니터/상황판 상세 지시 추가
- **DB 구조**
  - game_master.data.hospital_map: 병원 구조 (정적)
  - game_save.data.csa_active: 상식 개변 적용 상태 (동적)
  - game_save.data.csa_daily_used/limit: 금일 사용 횟수
  - game_save.data.player_location: 플레이어 현재 위치

# 게임빌더_v1 — YML 버전 변경 로그

> 저장 정책: GitHub = 전체 버전 영구 보관 + 변경 이력. Supabase yml_versions = 최신 5개만 유지.

---

## v44 (2026-07-20 10:18 KST)

**사용자 지시**: 마이너 수정 — 오디오-이미지 출력 순서 교체 (음성 먼저, 이미지 나중)

**주요 변경**:
- `c_code_parser → c_http_image` 직접 엣지 제거
- `if_auto_tts false → c_http_image`, `if_has_tts false → c_http_image`, `c_answer_audio_auto → c_http_image` 엣지 추가
- 음성 브랜치 완료 후 이미지 브랜치로 직렬화 — 출력 순서 보장: 서사 → 오디오 → 이미지
- 노드 72개 / 엣지 75개 (v43에서 +0노드 +2엣지)

---

## v43 (2026-07-20 10:10 KST)

**사용자 지시**: v40 기반 Claude rebuild. auto_tts 기본 ON, 서사 스트리밍 직후 자동 음성 생성, 코드파서 뒤에 음성 브랜치 배치.

**주요 변경**:
- `/음성자동 켜기`/`끄기` 명령어 — `va_turn` 직후 바로 분기, 턴 소모 절대 없음
- `auto_tts: true` 기본 ON (conversation variable + game_save.data fallback)
- 음성 브랜치: `c_code_parser` → `c_code_check_autotts` → `if_auto_tts` → `c_code_voice_lookup_auto` → `if_has_tts` → TTS Worker
- 화자: `c_code_parser.character_id` 사용 — npcs_present 검증 + 서사 실명 매칭 완료된 값
- Worker 실패 시 저장/이미지 흐름과 완전 분리 (병렬, 서로 영향 없음)
- 노드 72개 / 엣지 73개 (v40 기반 + 11개 신규)
- Dangling edges: 0 / 중복 edges: 0

**사용자 피드백**: "코드파서 뒤에 두는 거 염두하라고 했잖아. 쓸데없는 기능 쳐넣으니..ㅉㅉ" → v41/v42 폐기, v40에서 처음부터 rebuild

---

## v41 (2026-07-20 08:55 KST)

**사용자 지시**: auto_tts 기본 ON, 서사 스트리밍 직후 자동 음성 생성, 마인드모니터 위 출력

**주요 변경**:
- `cmd_parse`에 `/음성자동 켜기`/`끄기` 명령어 추가
- `game_save.data.auto_tts` 기본값 `true`
- `c_answer_stream` 직후 병렬 분기: `c_code_check_autotts` → `if_auto_tts`
- `c_code_voice_lookup_auto` 신규: 방금 스트리밍된 서사에서 현재 캐릭터 대사만 추출
- `if_has_tts` 신규: 대사 없으면 음성 경로 스킵
- TTS 노드 4개 복제 (`h_http_tts_worker_auto`, `c_code_audio_url_parse_auto`, `c_tpl_audio_final_auto`, `c_answer_audio_auto`)
- 음성 출력 위치: 서사 스트리밍 직후 (마인드모니터/상황판 위, 이미지 출력 전)
- 노드 70개 / 엣지 75개 (기존 61/62에서 +9노드 +13엣지)

**사용자 피드백**: "매 턴 음성 생성 지연 + 불필요한 턴 음성 생성" → 서사 스트리밍 완료 시점 병렬 실행 + 대사 유무 판정으로 해결

---

## v40 (2026-07-19)

**사용자 지시**: TTS 인라인 재생 완성, 이중 이미지 방지 강화, 구조 축소

**주요 변경**:
- `/음성` 입력 시 TTS 파이프라인 분기 (`if_tts` → `c_code_voice_lookup` → `h_http_tts_worker` → ...)
- `turn_count` 조건 변경: `/플레이` 단독 입력 시 턴 소모 안 함 (`rest.trim().length > 0`)
- `c_code_strip_catalog`에서 `image_catalog` 완전 제거 → 서사LLM에 이미지 정보 미전달
- `c_code_parser`에 `image_id` 교차검증 추가 (`catalog` 파라미터, `character_id` 일치 여부 확인)
- `c_code_parser` 디버그 필드 추가: `debug_image_mismatch`, `debug_stream_image_injected`
- `c_llm` 이중 이미지 방지 프롬프트 강화 (`![`, 이미지 URL, `http` 금지)
- `b_llm_extract`, `c_llm_extract` thinking 비활성화 (`thinking: false`)
- `FISH_API_KEY` 환경변수 추가 (`c9d1c2d7cf1e4e78891ac5f07bf80e18`)
- TTS 파이프라인 7개 노드 추가
- `opening_statement` 비움 (`''`), `file_upload` 비활성화
- 노드 61개 / 엣지 62개 (구조 축소 완료)

**사용자 피드백**: "이미지가 상황별로 안 뜨고 캐릭터 디폴트만 뜬다", "코드 노드 추가 싫어 (서사-답변 사이 금지)"

**해결**: image_id 직접 선택 방식으로 전환, catalog에서 URL 제거 후 추출LLM용 stripped_extract 분리

---

## v39 (2026-07-19)

**사용자 지시**: 디버그 로그에 TTS 텍스트 추가, YML 버전 DB 적재 자동화

**주요 변경**:
- `debug_tts_text` 필드 추가 (game_save.data)
- `yml_versions` 테이블에 v35~v39 백필 완료 (md5 검증 통과)
- `extensions.http_get` 활성화 → 공개 paste 호스트에서 YML 원문 페치 후 DB INSERT

**사용자 피드백**: "Supabase 용량 너무 잡아먹는 거 아님?"

**해결**: GitHub 위주 보관 + Supabase 최신 5개 정책 수립 (v40 이후 적용)

---

## v38 (2026-07-19)

**사용자 지시**: 연기 지시 `[대괄호]` 태그 변환, 마인드모니터 차단, JSON 안전처리

**주요 변경**:
- `c_code_voice_lookup` 개선: 지문 `(소괄호)` → `[대괄호]` 연기태그 변환
- 마인드모니터/상황판을 TTS 대상에서 제외 (`---` 구분선 이후 무시)
- JSON body 깨짐 방지: 따옴표/역슬래시/줄바꿈 제거
- `get_context` 최근 3턴 제외 + 마인드모니터/상황판 제거 → 컨텍스트 34% 감소

**사용자 피드백**: "상태추출LLM이 21초나 걸려, 뭘 그렇게 생각하는 거야?"

**해결**: `reasoning_format: standard`로 변경, `story_summary` 설명 압축, `max_tokens` 해제

---

## v37_최종 (2026-07-19)

**사용자 지시**: 음성 인라인 재생 최초 확정

**주요 변경**:
- `<audio controls>` 태그 인라인 재생 확정 (base64 실패 → R2 presigned URL 방향 확정)
- Dify media-src 화이트리스트 확인: `*.r2.cloudflarestorage.com` 허용
- Cloudflare Worker `fancy-dust-7f8c` 연동 완료
- `s2.1-pro-free` 모델 헤더 지정 (S2계열 필수)

**사용자 피드백**: "base64는 재생바 자체가 안 뜨네, presigned URL로 가자"

---

## v36 (2026-07-19)

**사용자 지시**: `<audio>` 인라인 실험 (base64 vs 파일 업로드 vs R2)

**주요 변경**:
- base64 data URL 실험 (실패: Dify CSP 차단)
- Dify 파일 업로드 API 실험 (성공했으나 R2 방향으로 전환)
- R2 presigned URL 실험 시작

**사용자 피드백**: "base64는 안 되고, 파일 업로드는 복잡하니 R2로 통일하자"

---

## v35 (2026-07-19)

**사용자 지시**: YML 버전 관리 시작, Supabase에 원문 백업

**주요 변경**:
- `yml_versions` 테이블 신설 (스키마: id/app/version/filename/content/note/created_at)
- `UNIQUE(app, version)` 제약, RLS 활성 (service key만 접근)
- v35 원문 최초 적재

**사용자 피드백**: "앞으로 YML 버전은 TXT 말고 반드시 YML로, Supabase에도 자동 적재해"

---

## 구버전 요약 (v22~v34)

| 버전 | 핵심 내용 | 사용자 지시/피드백 |
|---|---|---|
| v22~v23 | 컨텍스트 슬림화 | "응답 속도 너무 느려" |
| v25 | 억제 가드 (폐기) | "이미지 출력이 안 나와, 가드 빼" |
| v26 | 메모리 압축 (폐기) | "압축 풀 때 오류 발생" |
| v27 | 이미지 B안 확정 (최종 렌더러가 항상 붙임) | "코드 노드 추가 금지, 스트리밍 최우선" |
| v28~v33 | TTS 도입, Worker 분리, 경로 확정 | "Fish Audio 무료 기간 언제까지?" |
| v34 | 인라인 실험 준비 | "presigned URL 1시간만 유효? 늘려" |

---

## 보관 정책 (v40 이후 적용)

| 저장소 | 보관 범위 | 삭제/정리 규칙 |
|---|---|---|
| **GitHub** `yml/` | 전체 버전 영구 + CHANGELOG.md | 무제한, Git history로 롤백 가능 |
| **Supabase** `yml_versions` | 최신 5개만 | 6개째 INSERT 시 가장 오래된 버전 자동 삭제 |

**이유**: Supabase Free Tier 500MB 제한 존재. GitHub는 저장 용량 사실상 무제한. 빠른 복원은 Supabase(최신), 장기 백업은 GitHub(전체) 분리.

---

*마지막 업데이트: 2026-07-20 08:55 KST*
