# Streaming-first architecture

## 우선순위
1. Story SSE 스트리밍
2. 이미 표시된 Story 보존과 다음 턴 진행
3. Extract 기반 부가 상태 저장
4. 출력 형식과 품질 검증

## 처리 원칙
- Story는 사용자에게 표시되는 게임 본체다. Extract는 저장 보조 계층이다.
- Extract가 실패하면 일반 턴은 narrative-only degraded Commit을 수행한다. NPC 수치, 관계, 이미지, CSA runtime 등 선택 상태는 이전 값을 유지한다.
- 플레이어 설정은 LLM이 만든 4개 후보(`player_setup.recommendations[]`)와 번호 선택+자유 입력 수정으로 끝나는 준비 단계다. 선택지 문구·개수는 hard gate가 아니다.
- Worker는 자연어의 표현 차이를 다시 판정하거나 Story를 사후 교체하지 않는다.
- 앱 상태 변경은 검증된 structured action으로만 수행한다. 자유 입력은 Story로 전달한다.
- Primary Extract는 정상 턴에서 항상 DeepSeek 호출 1회다. 첫 호출이 업스트림 타임아웃/429/5xx/빈 응답/`finish_reason=length`/JSON 파싱 실패로 완전히 실패했을 때만 동일 prompt로 1회 재시도한다(최대 2회). 응답 필드 일부가 검증에 실패했다는 이유로는 재시도하지 않으며, 그런 필드는 결정론적 fallback으로만 대체한다 — repair LLM을 다시 호출하지 않는다. 두 시도가 모두 실패하면 일반 턴은 fail-open degraded commit, validated app_transaction은 fail-closed(미적용)로 끝난다. Extract 응답은 `extract_attempts`/`upstream_status`/`finish_reason`/`raw_length`를 진단용으로 반환하지만, 원본 모델 텍스트(raw)는 절대 반환하거나 저장하지 않는다.
- `extract.choices`는 Extract LLM이 JSON으로 다시 작성한 값이 아니라 Story의 `[3. 선택지]`에서 Worker가 직접 추출한 값이 authoritative source다. Story에 정확히 4개가 있으면 그대로 쓰고, 없거나 형식이 깨졌을 때만 기존 결정론적 fallback을 쓴다.

## 금지 구조
- 카드/선택지 exact match 422
- 선택 필드 누락 422
- 일반 Extract 실패 422
- 첫 만남 수치 누락 때문에 Story 폐기
- 미완료 행동 때문에 완료 상태 검증 422
- 자연어 키워드 조합만으로 APP_UI_REQUIRED 반환
- 근거(evidence) 없는 npc_scene_state 변경 때문에 턴 422/500 실패 — 필드 단위로 이전 저장값과 비교해 실제로 바뀐 필드만, 그것도 필드 각각 독립적으로 검증하고, 거부된 필드만 버리고 정상 형제 필드는 유지
- NPC CSA 메타 인식(상식개변/앱/시스템 인식) 필터링 때문에 턴 422/500 실패 — npc_emotion은 위반 필드만 결정론적 fallback으로 교체, dialogue_lines/relationship_memory_patch/turn_summary는 위반 항목·문장만 제거
