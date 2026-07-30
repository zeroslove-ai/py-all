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

## 금지 구조
- 카드/선택지 exact match 422
- 선택 필드 누락 422
- 일반 Extract 실패 422
- 첫 만남 수치 누락 때문에 Story 폐기
- 미완료 행동 때문에 완료 상태 검증 422
- 자연어 키워드 조합만으로 APP_UI_REQUIRED 반환
- 근거(evidence) 없는 npc_scene_state 변경 때문에 턴 422/500 실패 — 해당 캐릭터 필드만 버리고 이전 상태 유지
