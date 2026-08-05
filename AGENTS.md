# 게임빌더 v2 개발 원칙

1. 이 프로젝트는 규칙 엔진 중심 게임이 아니라 LLM 인터랙티브 서사 게임이다.
2. `/api/story` SSE 스트리밍과 사용자가 이미 본 Story 보존이 최우선이다.
3. 자연어 형식, 선택지 개수·문구, 카드 표현, 마인드 모니터 품질, 선택적 Extract 필드 누락은 runtime hard failure가 아니다.
4. Extract는 Story에서 저장 가능한 값을 best-effort로 옮긴다. 없는 값은 patch에서 생략하거나 이전 값을 유지한다.
5. 추가 LLM repair 호출, post-stream Story 재작성, 새 integrity gateway를 임의로 추가하지 않는다.
6. 전체 턴을 막을 수 있는 조건은 `docs/project_v2/HARD_GATE_ALLOWLIST.md`에 명시된 항목뿐이다.
7. `stream:true`와 `new Response(deepseekRes.body, ...)` SSE passthrough를 유지한다.
8. 사용자 명시 없이 Story/Extract/Commit/Reset을 호출해 기능 테스트하거나 게임 데이터를 변경하지 않는다.
9. Codex/Claude Code는 제공된 패치를 적용·정적 검사·커밋·푸시·배포만 하며 설계를 확장하지 않는다.
