# Runtime hard gate allowlist

다음 항목만 전체 턴을 중단할 수 있다.

1. Supabase context/commit 자체가 불가능함
2. turn number가 현재 저장 상태와 불일치함
3. 같은 turn number에 다른 content가 들어오는 충돌
4. structured app transaction의 validation proof, 범위, 레벨, 슬롯, ID가 유효하지 않음
5. 존재하지 않거나 비활성화된 CSA를 실제 저장 상태에서 변경하려 함
6. 실제 완료된 성적 상태/event를 저장하려 하지만 CSA_DIRECT 또는 VOLUNTARY authorization이 없음
7. DB transaction 실패

아래 항목은 hard gate가 아니다.

- Story/Extract 형식 차이
- 선택지 누락·개수·문구 차이
- 플레이어 설정 필드 일부 누락
- 마인드 모니터 품질 문제
- first encounter 수치 누락
- CSA runtime 관찰·evidence·evaluation 누락
- 미완료 시도, 거절, 중단, 대화
- 이미지·TTS·상태 패널용 데이터 누락
