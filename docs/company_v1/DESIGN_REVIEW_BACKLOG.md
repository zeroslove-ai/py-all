# 회사편 v1 사전 설계 검토 백로그

상태: active planning backlog  
기준일: 2026-08-03  
목적: 구현 전에 빠뜨리기 쉬운 UX·서사·상태·운영 항목을 우선순위별로 관리한다.

## 1. 우선순위 정의

- P0: 기본 플레이가 깨질 수 있어 구현 전에 계약 확정 필요
- P1: 초기 테스트 전에 설계·정적 테스트 필요
- P2: 운영 안정화 뒤 확장 가능

## 2. P0 — 구현 전에 확정할 것

### 2.1 Story 출력 parser 계약

- SCENE/DIALOGUE/PLAYER_STATUS/CHOICES marker
- streaming chunk가 marker 중간에서 나뉘는 경우
- malformed marker fallback
- 원문 보존
- dialogue TTS 분리

기준 문서: `NARRATIVE_OUTPUT_CONTRACT.md`

### 2.2 화면 정보 우선순위

- 항상 보이는 정보
- 상세 drawer 정보
- 별도 관리 화면 정보
- 모바일 navigation
- 선택지 최대 2줄 표시와 원문 보존

기준 문서: `UI_UX_REDESIGN.md`

### 2.3 저장 중복 방지

- 사용자가 선택지를 연속 클릭할 때 한 번만 처리
- Story가 끝났지만 Extract가 진행 중일 때 재입력 방지
- Commit replay/conflict 구분
- 저장 실패 후 동일 턴 재시도

### 2.4 턴 상태 머신

권장 상태:

```text
idle
→ story_streaming
→ extracting
→ committing
→ ready
```

오류 상태:

```text
story_failed
extract_failed
commit_failed
```

각 상태에서 허용되는 버튼과 재시도 동작을 명시한다.

### 2.5 페이지 새로고침 복구

다음 시점의 새로고침을 검토한다.

- Story 생성 전
- Story streaming 중
- Story 완료·Extract 전
- Extract 완료·Commit 전
- Commit 응답 유실

브라우저 임시 상태와 DB 저장 상태가 다를 때 복구 기준이 필요하다.

### 2.6 게임 ID·edition 검증

- URL game ID와 DB edition 일치
- 회사편 Worker가 병원편 game ID를 받으면 거부
- 잘못된 game ID 메시지
- game 없이 접속했을 때 진입 화면

### 2.7 선택지와 직접 입력의 동일 계약

- 선택지 클릭과 직접 입력이 같은 player_action 구조 사용
- 표시 축약문이 아니라 전체 선택지 원문 저장
- 선택지 분류는 선택 시 다시 계산
- 중복 클릭 방지

## 3. P1 — 첫 테스트 전 설계할 것

### 3.1 다중 NPC focal character

- 현재 이미지에 표시할 인물
- 마인드 모니터 대상
- TTS 발화자
- 상태 패널 대상

이 네 대상이 항상 같다고 가정하지 않는다.

권장 필드:

```json
{
  "focal_character_id": "heroine2",
  "last_speaker_id": "heroine3"
}
```

### 3.2 일반 NPC 장면 지속성

- 장면 진입·퇴장 근거
- 같은 턴에서 갑자기 사라지지 않음
- 전용 관계·마인드 모니터·이미지 없음
- 여러 일반 NPC가 동시에 필요할 때 최대 인원

### 3.3 관계 기록 노출 수준

관계 기록을 기본 화면에서 숨기되 다음을 결정한다.

- 관계 단계
- 최근 거절
- 현재 경계
- 핵심 과거 사건
- 상세 성적 기록

사용자가 다음 행동을 판단하는 데 필요한 정보와 단순 통계 기록을 분리한다.

### 3.4 상태 freshness

자세·복장·업무·위치는 영구 상태와 일시 상태가 섞인다.

검토 필드:

- `updated_turn`
- `source`
- `persistent`
- `expires_on_scene_change`

장소 이동만으로 모든 상태를 초기화하지 않고, 일시 상태만 명시적으로 종료한다.

### 3.5 CSA 현재 장면 요약

- 활성 규정 전체와 현재 적용 규정 분리
- 현재 장면에는 최대 2개 요약
- 3개 이상이면 `외 N개`
- mandatory/normative 표시
- 앱 상세에서 전체 계약 표시

### 3.6 업무 시스템 최소 범위

업무는 장면 동기만 제공한다.

검토:

- 현재 업무
- 참여자
- 상태
- deadline time block
- 완료 evidence

제외:

- 경영 수치
- 급여
- 실적 점수
- 세밀한 일정 시뮬레이션

### 3.7 이미지 선택 실패

- 이미지 없음
- 잘못된 image_id
- 늦게 로드됨
- 메인 화자 변경
- 성적/일반 이미지 pool 불일치

이미지 실패로 Story·Commit을 막지 않는다.

### 3.8 TTS queue

- 여러 NPC 대화 순서
- 사용자가 다음 턴을 시작할 때 이전 TTS 중단 여부
- 자동재생 설정
- 실패한 한 문장만 건너뛰기
- 일반 NPC voice 없음 처리

### 3.9 플레이 기록

기록 데이터:

- player action
- Story 원문
- parsed blocks
- turn summary
- Mind Monitor
- next choices

기록 모달은 현재 플레이 화면과 별도 렌더러를 공유할지 검토한다.

## 4. P1 — 프롬프트 품질 검토

### 4.1 캐릭터 말투 안정성

- 직급과 성격에 맞는 호칭
- 같은 인물의 말투가 턴마다 급변하지 않음
- 모든 대사가 설명체가 되지 않음
- 회사 업무 용어 과잉 사용 방지

### 4.2 서사와 상태 일치

- 서사에서 벗은 복장을 Extract가 worn으로 되돌리지 않음
- 말로만 제안한 행동을 완료 상태로 저장하지 않음
- 장면에 없는 NPC 상태를 갱신하지 않음
- 규정 인식과 규정 수용도를 혼동하지 않음

### 4.3 장면 진행 속도

- 한 턴에 너무 많은 장소 이동 금지
- NPC 대사 최소량과 서사 최소량 균형
- 매턴 장황한 회사 설명 반복 금지
- 업무 장면이 단순 배경으로 사라지지 않음

### 4.4 플레이어 자유도

- Story가 플레이어 행동·대사를 임의 확정하지 않음
- 선택지 외 직접 입력 항상 허용
- 규정 때문에 플레이어 이동을 과도하게 막지 않음
- 불가능하지 않은 행동을 blocked로 분류하지 않음

## 5. P1 — UI 세부 검토

### 5.1 스크롤 정책

- 스트리밍 중 강제 하단 이동 금지
- 최하단 근처일 때만 따라가기
- 새 선택지 도착 시 명확한 알림
- history 열고 닫아도 본문 스크롤 유지

### 5.2 입력 UX

- Enter 전송, Shift+Enter 줄바꿈
- 생성 중 입력 잠금 여부
- 입력문 임시 보존
- 모바일 키보드 대응
- 최대 길이와 오류 메시지

### 5.3 선택지 접근성

- 키보드 숫자 1~4 단축키 여부
- focus order
- blocked reason 읽기
- 확률과 위험 배지를 screen reader가 읽을 수 있게 제공

### 5.4 알림 체계

toast 남발 금지.

- 저장 완료는 조용한 상태 표시
- 사용자 조치가 필요한 오류만 toast/modal
- 이미지·TTS 실패는 비차단 inline warning

## 6. P2 — 안정화 뒤 검토

### 6.1 사용자 설정

- 글자 크기
- 대사 카드 밀도
- TTS 자동재생
- 애니메이션 감소
- 이미지 표시 여부

### 6.2 대화 중심 보기

- 대화만 모아보기
- 특정 인물 대사 필터
- TTS 다시 듣기

초기 필수 기능은 아니다.

### 6.3 조직도 인터랙션

- 팀별 인물 보기
- reports_to 관계
- 현재 만난 인물만 공개

게임 진행을 막는 핵심 기능으로 만들지 않는다.

### 6.4 상태 변화 타임라인

- 관계 변화
- CSA 생성·해제
- 주요 업무 사건

전체 수치 로그보다 주요 사건 중심으로 설계한다.

### 6.5 성능 측정

- 첫 SSE chunk 도착 시간
- Story 총 시간
- Extract 시간
- Commit 시간
- Frontend render time

개발 로그와 사용자 UI를 분리한다.

## 7. 운영·보안 검토

### 7.1 로그 최소화

- 비밀값 로그 금지
- 전체 prompt 상시 로그 금지
- 사용자의 전체 입력을 오류 로그에 중복 남기지 않음
- request ID 중심 추적

### 7.2 CORS와 game allowlist

- 회사편 Frontend origin 기준
- API를 공개 범용 proxy로 사용하지 못하게 제한
- edition/game allowlist 검토

### 7.3 리셋 보호

- 운영 game 리셋과 테스트 game 리셋 구분
- game title과 ID 재확인
- 확인문 입력 방식 검토
- reset RPC가 해당 game만 변경하는 계약 테스트

### 7.4 버전 표시

다음을 분리 표시한다.

- engine version
- edition version
- content version
- deployed Git SHA

사용자 기본 화면에는 숨기고 개발 정보 화면에 표시한다.

## 8. 테스트 전략

### 정적 테스트

- DOM selector contract
- responsive class contract
- Story marker parser
- 선택지 원문 보존
- 상태 머신
- edition isolation

### fixture 테스트

- 단일 NPC 대화
- 다중 NPC 대화
- 일반 NPC 포함
- malformed Story marker
- Commit replay
- 이미지 없음
- TTS 없음

### 실제 사용자 검증

- 데스크톱
- 모바일
- 긴 선택지
- 긴 대사
- 3명 이상 장면
- CSA 3개 이상 적용
- 저장 실패 재시도

실제 외부 Story 호출은 사용자가 승인한 별도 단계에서만 수행한다.

## 9. 구현 순서 반영

- Phase 0: 골격만. 본 문서 구현 금지.
- Story 단계: `NARRATIVE_OUTPUT_CONTRACT.md` parser와 prompt 계약 구현.
- State 단계: freshness와 focal character 구조 구현.
- Frontend 단계: `UI_UX_REDESIGN.md` 기준으로 UI 구현.
- 운영 전: P0와 P1 항목을 다시 검토.

## 10. 완료 정의

회사편 v1 최초 운영 전 최소 완료 조건:

- P0 전부 해결
- P1 중 다중 NPC, 상태 freshness, 저장 복구, 이미지/TTS 실패 처리 해결
- 데스크톱과 모바일 기본 플레이 통과
- Story/대화 구분 렌더링 통과
- 병원편 운영 자원 미변경 확인
