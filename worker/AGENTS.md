# Worker 전용 규칙

- Story가 스트리밍된 뒤에는 DB 저장 불가, turn conflict, 잘못된 structured app transaction, 권한 없는 실제 완료 상태 저장이 아니면 HTTP 200 fail-open으로 진행한다.
- 자유 입력 자연어를 키워드 정규식으로 앱 명령으로 가로채지 않는다. 앱 라우팅은 명시적 명령 또는 검증된 structured action만 허용한다.
- Extract 실패는 일반 턴·플레이어 설정 생성·수정·승인 모두 degraded Commit으로 이어진다.
- 미완료 시도·거절·중단·대화는 완료 상태 검증 422 사유가 아니다.
- 선택적 상태가 불명확하면 상태 patch를 버리고 Story를 저장한다.
- 추가 baseline/recovery LLM 호출이나 narrative replacement 경로를 만들지 않는다.
- `/api/commit-turn`의 순번·동일 턴 충돌·원자적 저장은 유지한다.
