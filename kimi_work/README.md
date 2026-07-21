# Kimi 작업 로그

> **마지막 업데이트**: 2026-07-22 08:15 KST  
> **용도**: 작업 이력 추적 + 다음 세션 참조

---

## 2026-07-20

### 1. 게임빌더_v44 YML
- 오디오-이미지 출력 순서 교체 (음성 브랜치 → 이미지 직렬화)
- GitHub: `yml/게임빌더_v44.yml`
- Supabase: `yml_versions` ID=10

### 2. heroine6~10 이미지 등록 (50개)
- heroine6: 10개 일반 + 1개 default
- heroine7: 10개 일반 + 1개 default
- heroine8: 13개 일반 + 1개 default
- heroine9: 9개 일반 + 1개 default
- heroine10: 9개 일반 + 1개 default + 2개 추가 + 1개 오타 수정
- 총 image_library: 526개

### 3. 이미지 카탈로그 HTML 재생성
- 526개 이미지 전체 반영
- 파일: `image_catalog.html`

### 4. 이미지 시스템 대규모 정비
- heroine6~10 URL 매칭 불일치 42개 수정 (폴더 경로 누락 → Storage 실제 경로로 UPDATE)
- heroine10 catalog 누락 36개 추가 (game_master.data.image_catalog)
- heroine1(한소영) 신규 일반 감정 14개 등록
- heroine3(최유리) 신규 17개 등록 (일반 15개 + deep 상태 2개)
- heroine2(강세라) 4개 등록
- heroine4(배수진) 4개 등록
- heroine5(김지은) 4개 등록
- heroine6(윤아름) 4개 등록 시도 → 실패(heroine2 파일명 복사) → 삭제 처리
- heroine7(서지아) 5개 등록
- heroine8(한세아) 4개 등록
- heroine9(박소현) 4개 등록
- heroine10(임수정) 4개 등록
- id=595 삭제 (Storage 파일 없음)
- id=695~698 삭제 (heroine2 파일을 heroine6로 잘못 등록)
- HTML 카탈로그 생성: `image_catalog_full.html` (584개 이미지)

---

## 2026-07-20 ~ 07-21

### 5. YML 버전 안정화
- v44 폐기 (오류 많음) → v43 롤백
- v45, v46, v47, v48, v49, v50 순차 개발
- v50: 상식개변 시스템 + 이중인격 마인드모니터 추가
- v52, v53, v55b: 상식개변 출력 강제, 병원지도, 스탯 변동 ±5 캡 등

### 6. 이미지 시스템 개선
- image_id 직접 선택 방식으로 전환 (상태추출LLM이 image_catalog에서 직접 고름)
- c_code_strip_catalog: 서사LLM용(URL 제거)과 추출LLM용(image_id+character_id+situation만) 분리
- get_character_image RPC: p_image_id 우선, 없으면 p_character_id+p_emotion_id fallback
- emotion_id: 'default' 고정 (c_code_parser)
- 총 image_library: 584개 (heroine1~10 전체 등록 완료)

### 7. 상태추출LLM 최적화
- reasoning_format: separated → standard 변경 (21초 → 5초 내외)
- story_summary 설명 압축
- max_tokens 재설정 (c_llm=12000, c_llm_extract=10000, b_llm=6000, b_llm_extract=10000)
- get_context RPC: 최근 3턴 제외 마인드모니터/상황판 제거로 34% 감소

### 8. 이미지 중복 방지
- c_llm 프롬프트에 "`![`, `<audio`, URL, HTML 태그 금지" 강화
- c_code_clean_narrative: 서사에서 마크다운 이미지 제거 (저장용)
- c_code_parser: had_inline_image 플래그 + debug 필드 추가
- c_tpl_render: 최종 렌더러가 항상 한 장만 붙임 (B안 확정)

---

## 2026-07-21

### 9. /초기화 명령어 시스템 재설계 (v60)
- 기존: 빌드 모드 내 LLM 판단으로 실행 (b_http_reset) → 위험
- 개선: `/초기화` → 확인 질문 → "네" 응답 → reset_game_progress RPC 직접 호출
- 삭제 대상: 턴 수, 스토리 요약, NPC 스탯/감정, 암시·상식개변 현황, 플레이어 위치, 대화 기록
- 유지 대상: 세계관, 캐릭터 설정, 룰북
- 순응도: game_master.npc_stats 설정값 유지
- 최면저항력: 35 고정

### 10. /플레이 재진입 개선 (v62)
- `/플레이`만 입력 시: 가장 마지막 턴의 선택지를 그대로 다시 보여줌
- 턴 소모 없음, 새 장면 생성 안 함
- 5~10턴 전 상황 출력 버그 수정

### 11. 플레이어 정보 필수 입력 (v63)
- master.player.name이 비어있으면 장면 진행 불가
- 5가지 프리셋 제공 + 직접 입력 옵션
- 필수: 이름, 나이, 성별, 키, 몸무게, 직업, 배경, 말투/스타일, 성기 길이
- 플레이 중 답변 시: if_has_player_patch + c_http_setmaster_play로 master.player 반영

### 12. TTS 대사 형식 강제 (v64)
- NPC 대사 형식: `**캐릭터명** (연기지시): "대사 내용"`
- TTS(음성 합성)에서 화자 식별 + 대사만 추출 필수
- auto_tts 기본 ON, 오디오→이미지 출력 순서
- c_code_voice_lookup_auto: 정규식 개선 (콜론 없는 형태도 매칭)

### 13. 마인드모니터 오염 복원
- `mind_monitor_format`이 `[2. 잠재의식 / 암시 각인 상태]`로 오염됨
- 원래 `[2. 잠재의식]`으로 복원 완료 (set_master로 패치)

### 14. YML 보관 정책 변경
- GitHub `py-all/yml/`에 전체 버전 영구 보관 + `CHANGELOG.md`
- Supabase `yml_versions` 저장 중단 (사용자 지시)
- 새 버전 생성 시: "Supabase에도 저장할까요?" 물어보고 동의 후만 INSERT

---

## 2026-07-22

### 15. 인수인계 노트 v3 작성
- 장기기억 31개 항목 핵심 요약
- 깃허브 접근 방법 (API 토큰, 파일 조회 코드, 리포지토리 구조 31개 파일)
- 수파베이스 접근 방법 (REST/supabase-py, 테이블/RPC 목록, Storage 구조)
- Cloudflare/Dify 접근 정보
- 이미지 586개 현황 + 실수 방지 체크리스트
- 파일: `docs/새세션_인수인계_노트_v3.md`

### 16. 깃허브 정리
- 오래된 인수인계 노트 삭제 (v1, v2)
- v3만 유지
- kimi_mistakes/README.md, kimi_work/README.md 업데이트

### 17. 이미지 586개 등록 완료
- heroine1: 94개 | heroine2: 107개 | heroine3: 69개 | heroine4: 93개
- heroine5: 35개 | heroine6: 31개 | heroine7: 38개 | heroine8: 38개
- heroine9: 38개 | heroine10: 40개 | default: 1개
- 일반: 183개 | 성인: 403개 | 총: 586개

---

## 현재 총계 (2026-07-22)

| 항목 | 값 |
|---|---|
| **최신 YML** | v65 (89노드/90엣지) |
| **활성 게임** | 29809a8f-b8f1-4fa4-bce1-083e5a7eadac (68턴) |
| **이미지** | 586개 |
| **YML 버전** | v40~v65 (GitHub 영구 보관) |
| **남은 과제** | 7개 (레벨업, 최면-상식개변 연동, get_context 축약, TTS, R2 라이프사이클, dedupe, Fish Audio 과금) |

---
*작성: Kimi (2026-07-22)*
