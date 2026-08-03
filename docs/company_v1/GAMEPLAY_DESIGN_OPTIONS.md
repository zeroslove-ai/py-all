# 회사편 v1 실제 게임플레이 취약점 및 선택안

상태: pending user decisions  
기준일: 2026-08-03  
적용 시점: Phase 0 merge 후, DB migration 이전의 Phase 0.5 설계 확정

## 0. 목적

Phase 0 골격은 코드와 에디션 경계를 만드는 단계다. 그러나 실제 플레이의 품질은 골격보다 다음 계약에 더 크게 좌우된다.

- 플레이어가 앱을 어떻게 사용하고 무엇을 기대하는가
- 여러 규정이 동시에 존재할 때 어떤 규정이 우선하는가
- NPC가 서로 다른 규정을 각각 어떻게 받아들이는가
- 관계와 성적 이력이 어떤 상태로 저장되는가
- 장면이 언제 진행되고 누가 어디에 있는가
- 과거 사건을 어느 정도 기억하는가
- 위험 행동이 어떤 방식으로 성공·거절·부분 성공하는가
- 규정 해제 뒤 무엇이 원상복구되고 무엇이 남는가

이 문서는 구현 전 선택해야 할 대안을 제시한다. 아직 확정 설계가 아니며 사용자의 선택 뒤 `GAME_SYSTEM_DESIGN.md`, `SCHEMA`, migration, prompt 계약에 반영한다.

## 1. 핵심 발견

### 1.1 NPC별 단일 상식수용도의 한계

현재 설계는 NPC마다 `상식수용도` 한 값을 둔다. 회사편에는 호칭, 거리, 복장, 접촉, 평가, 공개 성적 규범 등 서로 다른 규정이 존재한다. 단일 값이 높아지면 한 규정을 익숙하게 여긴 경험이 전혀 다른 강한 규정의 수용까지 높이는 문제가 생긴다.

선택안:

- A. 단일 숫자 유지: 가장 단순하지만 규정 간 오염이 큼
- B. 카테고리별 수용도: 복장/접촉/업무/성적 등으로 분리
- C. 전역 baseline + 규정별 familiarity/resistance: 전반적 적응 성향과 개별 규정 반응을 분리

권장: C. 내부 상태는 `common_sense_baseline`과 `csa_attitudes[csa_id]`를 분리하고, UI에는 현재 적용 규정 반응만 간단히 표시한다.

### 1.2 선형 관계 stage의 한계

현재 `none → familiar → trusted → romantic_interest → dating → kissed → sexual_relationship`는 실제 관계의 여러 축을 한 줄에 넣는다. 키스가 연애 전에 가능하고, 성적 관계가 연애와 무관할 수도 있으며, 신뢰와 친밀감도 별개다.

선택안:

- A. 기존 선형 stage 유지
- B. stage를 더 세분화
- C. 관계 축 분리

권장: C.

```json
{
  "closeness": "stranger|acquaintance|familiar|trusted|intimate",
  "romance_status": "none|interest|mutual_interest|dating|ended",
  "current_boundary": "open|cautious|refusing|hostile",
  "milestones": {
    "first_kiss_turn": null,
    "sexual_relationship_started_turn": null
  }
}
```

성적 행위별 이력은 milestone/ledger로 두고 관계 단계의 자동 승격 조건으로 사용하지 않는다.

## 2. 플레이 핵심 루프

### 선택안 A — 완전 샌드박스

- 강도와 범위를 처음부터 모두 사용
- 장기 목표나 해금 없음
- 즉시 자유도가 가장 높음
- 초반에 모든 기능을 써보고 반복감이 빨리 올 수 있음

### 선택안 B — 강한 진행형

- 앱 레벨, 슬롯, 강도, 대상 범위를 순차 해금
- 목표가 분명하지만 사용자가 원하는 행동을 막는 구간이 생김
- 병원편에서 문제가 된 과도한 진행 제한이 다시 생길 수 있음

### 선택안 C — 자유 샌드박스 + 가벼운 장기 진행

- 기본 규정 생성과 해제는 처음부터 가능
- 강한 규정도 원칙적으로 사용 가능
- 캐릭터 사건, 앱 미스터리, 조직 사건이 선택적으로 열림
- 해금은 기능 차단보다 새로운 프리셋·장면·정보 제공 중심

권장: C. 플레이 자유를 막지 않고 장기 플레이 동기만 추가한다.

## 3. 규정 작성 방식

### A. 프리셋 전용

안정적이지만 자유 입력의 장점이 사라진다.

### B. 자유문장 즉시 적용

가장 자유롭지만 actor/target/trigger/duration/action 해석이 흔들리고 direct 판정이 불안정하다.

### C. 하이브리드 canonical compile

- 프리셋과 자유문장 모두 허용
- 자유문장은 canonical contract로 변환
- 사용자에게 짧은 해석 요약을 표시
- 별도 검증 모델이나 반복 repair는 사용하지 않음

권장: C.

선택할 세부 방식:

- C1. 변환 즉시 활성화하고 앱 상세에서 수정
- C2. 한 번의 확인 화면 뒤 활성화

권장: C2. 단, 확인은 앱 내부 한 화면에서 끝내고 게임 턴을 추가로 소비하지 않는다.

## 4. 활성 규정 수와 강도

### A. 활성 규정 무제한

자유롭지만 prompt가 커지고 규정 충돌과 장면 과밀이 빠르게 증가한다.

### B. 강한 하드 슬롯

예: 처음 2개, 레벨업 뒤 4개. 관리가 쉽지만 자유도를 막는다.

### C. 활성 슬롯은 제한하되 교체·해제는 무료

- 기본 활성 슬롯 4개
- 저장된 규정 보관 수는 제한하지 않음
- 새 규정 적용 시 기존 규정을 즉시 교체 가능
- 슬롯 확장은 기능 해금이 아니라 편의 확장으로 취급

권장: C. 병원편의 과도한 게이트를 반복하지 않으면서 prompt와 충돌을 통제한다.

대체 권장안: 슬롯 자체를 원치 않으면 `현재 장면 적용 규정 최대 3개`만 두고 활성 규정 전체는 무제한으로 유지한다.

## 5. 규정 충돌 우선순위

### A. 최신 규정 우선

이해하기 쉽지만 개인 규정과 회사 전체 규정의 관계가 불안정하다.

### B. 강한 규정 우선

단순하지만 scope와 trigger가 무시될 수 있다.

### C. 결정적 우선순위

1. 현재 actor/target/trigger 적용 여부
2. 더 구체적인 scope
3. explicit override 여부
4. strength
5. 최신 생성 순서

같은 필수 행동이 동시에 불가능하면 앱 UI에 충돌을 표시하고, Story가 임의로 둘 다 수행하지 않는다.

권장: C.

## 6. 규정 활성화와 기억 변화

### A. 세계와 기억을 즉시 완전 재작성

강한 개변감은 있지만 과거 사건과 관계가 쉽게 무의미해진다.

### B. 규정만 생기고 모두 이상함을 느낌

상식개변 앱의 정체성이 약해진다.

### C. 현재 상식은 즉시 정상화하되 과거 기억을 재해석

- 관련 NPC는 규정을 자연스러운 현재 상식으로 안다.
- 과거 기억은 삭제하지 않고 현재 규정에 맞게 합리화한다.
- 감정, 당황, 원한, 신뢰는 그대로 남을 수 있다.
- 앱 의심은 지정 캐릭터·사건에서만 발생한다.

권장: C.

## 7. 규정 해제 후 효과

### A. 모든 상태 즉시 원상복구

이해는 쉽지만 관계·감정·사건의 무게가 사라진다.

### B. 모든 변화 영구 유지

규정을 해제해도 세계가 되돌아오지 않아 앱 조작 의미가 약해진다.

### C. 규범만 해제하고 사건 결과는 유지

- 해당 규정이 당연하다는 인식은 즉시 종료
- 완료된 행동, 감정, 관계 변화, 목격 기억은 유지
- 일시적 physical state는 장면 계약에 따라 종료
- 강한 후유증은 프리셋별 aftereffect로 명시

권장: C.

## 8. 장면 진행과 시간

### A. Story가 전부 자율 진행

자연스럽지만 같은 오후가 계속되거나 한 턴에 여러 장소·시간이 튈 수 있다.

### B. 플레이어가 시간 이동을 직접 선택할 때만 진행

일관되지만 장면이 경직된다.

### C. scene state 기반 사건 진행

```json
{
  "scene_id": "...",
  "location_id": "...",
  "participants": [],
  "focus_thread": "...",
  "scene_goal": "...",
  "beat": 2,
  "exit_conditions": []
}
```

- 시간 block은 명시적 이동, 업무 완료, 회의 종료 등의 evidence가 있을 때 변경
- 한 턴에 원칙적으로 장소 1회, 시간 block 1회 이하 변경
- 별도 director LLM은 사용하지 않음

권장: C.

## 9. NPC 존재와 접근 가능성

### A. 모든 NPC를 어디서나 호출 가능

자유롭지만 회사 세계의 현실감과 동선이 무너진다.

### B. 정교한 시간표

현실적이지만 시뮬레이션이 무겁고 원하는 캐릭터를 만나기 어렵다.

### C. soft availability

- NPC별 기본 zone과 time block 태그
- 현재 업무와 회의 상태
- 플레이어가 찾으면 완전 차단보다 이동·연락·대기 등의 서사로 연결
- CEO실·보안 구역처럼 물리적 제한이 있는 곳만 명확히 차단

권장: C. 접근 불가를 남발하지 않고 세계의 위치 일관성을 유지한다.

다중 NPC 장면 권장:

- speaking focus 최대 3명
- 그 외 인물은 witness/background reaction으로 묶음
- `focal_character_id`, `last_speaker_id`, `npcs_present` 분리

## 10. 장기 기억

### A. 최근 summary만 사용

가볍지만 약속, 거절, 비밀, 공개 망신 같은 사건이 사라진다.

### B. 전체 턴 원문 또는 vector memory

기억은 풍부하지만 비용, 검색, 오염, 운영 복잡도가 커진다.

### C. 최근 summary + 구조화 event ledger

NPC별 중요 사건만 저장한다.

```json
{
  "event_type": "promise|refusal|conflict|intimacy|csa_event|work_event|secret",
  "turn": 12,
  "summary": "...",
  "participants": [],
  "importance": 1,
  "active": true
}
```

- NPC별 활성 중요 기억 8~12개
- 오래된 저중요 사건은 relationship summary에 압축
- 전체 원문은 history에서만 조회

권장: C.

## 11. 캐릭터 고유성

현재 캐릭터 초안은 직급·성격·역할은 있지만 실제 플레이에서 말투와 선택이 반복되지 않게 만드는 동력이 부족하다.

### A. 현재 프로필 유지

구현은 빠르지만 아키타입 대사로 수렴할 가능성이 큼.

### B. 대형 캐릭터 바이블

풍부하지만 prompt가 무거워진다.

### C. 경량 행동 코어

메인 NPC마다 다음만 고정한다.

- public persona
- private want
- core fear
- pride trigger
- trust trigger
- hard boundary
- soft boundary
- speech rhythm
- work goal
- relationship hook
- CSA response tendency
- secret or unresolved issue

권장: C. 현재 장면에 필요한 필드만 prompt에 넣는다.

## 12. 관계 수치와 감정 변화

### A. 모든 수치를 계속 누적

장기 플레이에서 모두 100에 가까워지고 차이가 사라진다.

### B. 숫자를 제거하고 서술 상태만 사용

자연스럽지만 변화 추적과 UI가 어려워진다.

### C. 내부 숫자 + 의미 구간 + 축별 다른 지속성

- 호감도: 느리게 변하고 자동 감소 없음
- 신뢰/경계: 사건 기반 patch
- 성적흥분도: 장면 종료나 시간 경과에 따라 decay
- 규정별 familiarity/resistance: 해당 규정 경험에만 반응
- UI는 정확한 숫자보다 구간과 최근 변화 중심 표시 가능

권장: C.

## 13. 위험 행동 판정

### A. 모든 행동을 deterministic 판단

임의 주사위는 없지만 극단 행동의 긴장감이 약하다.

### B. 적극 행동 대부분 확률 사용

병원편에서 발생한 낮은 확률 남발을 반복한다.

### C. 극단적 bold만 확률 사용

- normal, voluntary, csa_direct는 확률 없음
- 갑작스러운 노골적 접촉, 강압, 심각한 보안·권력 위반만 확률
- 확률은 표시값과 실제 판정을 동일하게 사용
- 결과는 success/failure 2분법보다 success/partial/refused/interrupted로 표현
- 실패해도 턴 전체 서사 실패로 처리하지 않음

권장: C.

## 14. mandatory 규정의 자유도

### A. 행동·감정·후속 행동 전체 강제

캐릭터 차이가 사라지고 연쇄 강제가 발생한다.

### B. 모든 mandatory를 normative처럼 거부 가능

mandatory 의미가 사라진다.

### C. exact action만 필수, 반응은 자율

- actor/target/trigger에 해당하는 `required_action`만 반드시 수행
- 감정, 말투, 불만, 협상, 후속 행동은 캐릭터 자율
- direct scope 밖 추가 행동은 자동 허가하지 않음
- 플레이어의 중단·이동 요청은 물리적으로 가능하면 처리

권장: C.

## 15. 업무와 사건 구조

### A. 업무는 배경 텍스트만 제공

자유롭지만 회사편이 일반 실내 샌드박스로 보일 수 있다.

### B. 퀘스트·성과 점수 시스템

목표는 분명하지만 게임이 경영 시뮬레이션처럼 무거워진다.

### C. 경량 사건 hook

- 현재 업무 또는 조직 사건 1개
- 캐릭터별 episode hook
- 완료 점수 없이 `open|active|resolved|abandoned`만 저장
- 규정 사용 없이 해결하거나 규정을 이용할 수 있음
- 장면 진입 동기와 장기 변화만 제공

권장: C.

초기 권장 사건:

- 캠페인 마감
- 비용 승인 충돌
- 인사 평가 면담
- 거래처 방문
- 임원 보고
- 회식 또는 야근
- 내부 정보 유출 의심

## 16. 플레이어 설정

### A. LLM이 전부 자동 생성

빠르지만 플레이어가 원하지 않는 직급·부서가 정해질 수 있다.

### B. 상세 설문

정확하지만 오프닝이 길어진다.

### C. 간단 선택 + 자유 입력 + 자동 보완

- 부서/역할 후보 4개
- 직접 입력 허용
- 이름·나이 등 누락만 LLM 보완
- 최종 프로필 한 줄을 보여주고 수정 또는 시작
- 후보 카드 다단계 검증은 사용하지 않음

권장: C.

## 17. 구현 순서 변경안

PR #10 Phase 0 merge 후 바로 DB migration으로 가지 않는다.

### Phase 0.5 — gameplay contract

1. 본 문서의 사용자 선택 확정
2. 상태 schema 확정
3. 관계 multi-axis 확정
4. 규정별 attitude 확정
5. scene state와 event ledger 확정
6. conflict/activation/deactivation 계약 확정
7. fixture JSON과 정적 계약 테스트 작성

이 단계에서는 Supabase 생성, migration 적용, 외부 모델 호출, Cloudflare 배포를 하지 않는다.

그다음 Phase 1 DB migration이 확정된 상태 schema를 구현한다.

## 18. 권장 일괄안

사용자가 개별 선택을 생략할 경우 권장 기본안:

```text
2C  게임 루프: 자유 샌드박스 + 가벼운 장기 진행
3C2 규정 작성: canonical compile 후 한 화면 확인
4C  활성 슬롯 4개, 저장 규정 무제한, 무료 교체
5C  적용성 → 구체 scope → override → strength → 최신순
6C  현재 상식 즉시 정상화, 과거 기억 재해석
7C  규범 해제, 사건 결과와 감정은 유지
8C  scene state 기반 시간·장소 진행
9C  soft availability와 최대 3명 speaking focus
10C 최근 summary + 구조화 event ledger
11C 경량 캐릭터 행동 코어
12C 내부 숫자 + 의미 구간 + 축별 지속성
13C 극단 bold에만 표시 확률과 graded outcome
14C required_action만 mandatory, 반응과 후속 행동은 자율
15C 점수 없는 경량 사건 hook
16C 간단 선택 + 자유 입력 + 자동 보완
```

추가 필수 권장:

- 관계는 multi-axis
- 상식 반응은 global baseline + per-CSA attitude
