# 회사편 v1 게임 시스템 설계

기준일: 2026-08-03

## 1. 설계 목표

회사편은 병원편의 안정된 턴 루프와 상태 저장 방식을 유지하되, 병원 고유 규칙을 제거하고 다음 문제를 개선한다.

- 프롬프트 과대화
- 생성기 파트 누적
- 동일 생성 파일을 공유하는 테스트 경쟁
- 검증이 Story 스트리밍을 막는 구조
- 가벼운 행동까지 과감으로 분류되는 문제
- 규정을 모르는 것처럼 행동하는 NPC
- 일반 NPC 즉흥 생성과 연속성 부족
- 복장·자세·장면 상태의 임의 초기화

## 2. 핵심 플레이 루프

1. 플레이어가 회사에 입장하거나 저장을 재개한다.
2. 현재 장소, 시간대, 등장 인물, 활성 규정, 업무 상황을 로드한다.
3. Story를 SSE로 즉시 스트리밍한다.
4. Story 끝에 4개 선택지를 제시한다.
5. Extract가 상태 delta를 한 번 추출한다.
6. Commit RPC가 턴 기록과 save patch를 원자 저장한다.
7. 이미지와 TTS는 저장과 독립적으로 표시한다.

Story 성공 후 별도의 LLM repair나 재작성은 하지 않는다.

## 3. 세계와 진행

### 3.1 시간

시간은 분 단위가 아니라 block으로만 관리한다.

- morning
- lunch
- afternoon
- evening
- overtime

Story가 자연스럽게 진행시키고 Extract는 명시적 변화가 있을 때만 갱신한다.

### 3.2 장소

장소는 다음 정보를 가진다.

```json
{
  "location_id": "marketing_floor",
  "label": "5층 마케팅팀 사무실",
  "zone": "office",
  "publicness": "semi_public",
  "allowed_roles": ["employee", "visitor"],
  "adjacent": ["meeting_room_5f", "pantry_5f"]
}
```

`publicness`는 장면 반응과 위험 해석에만 쓰며 CSA 직접 실행 허가 조건으로 사용하지 않는다.

### 3.3 업무

업무 시스템은 서사 보조 정보다. 복잡한 경영 시뮬레이션을 하지 않는다.

```json
{
  "current_task": "분기 캠페인 수정안 검토",
  "task_state": "in_progress",
  "deadline_block": "evening",
  "participants": ["heroine2", "heroine3"]
}
```

업무는 이동·회의·대화 동기를 제공한다. 업무 실패 점수나 경제 수치를 별도 계산하지 않는다.

## 4. 캐릭터 모델

### 4.1 메인 NPC

```json
{
  "character_id": "heroine1",
  "name": "",
  "age": 0,
  "team_id": "hr",
  "role_tier": "employee",
  "job_title": "사원",
  "reports_to": "heroine4",
  "manages": [],
  "employment_type": "permanent",
  "personality": {},
  "appearance": {},
  "voice_id": "",
  "initial_stats": {
    "호감도": 0,
    "상식수용도": 0,
    "성적흥분도": 0
  },
  "relationship_boundaries": []
}
```

### 4.2 일반 NPC

일반 NPC는 `general_npcs.profiles`에 등록된 인물만 사용한다.

- 이름, 직업, 나이, 성격 즉흥 생성 금지
- 영구 호감도·관계 단계 없음
- Mind Monitor 없음
- 전용 이미지 없음
- 장면에 들어오면 이유 없이 사라지지 않음
- 필요할 때 current scene의 단역으로만 사용

## 5. 상태 축 분리

### 5.1 호감도

플레이어에 대한 개인적 정서다.

상승 근거:

- 신뢰할 만한 행동
- 배려
- 개인적 친밀감
- 성격과 맞는 대화
- 실제로 만족스러운 친밀 경험

자동 상승 금지:

- CSA 직접 실행
- 신체 반응
- 상식수용도 상승
- 단순 성행위 완료
- 거절하지 않음

### 5.2 상식수용도

활성 규정이 자연스럽다고 느끼는 정도다. 규정 자체를 알고 있는지는 별도 문제가 아니다. 활성 규정은 관련 NPC가 항상 알고 있다.

### 5.3 성적흥분도

현재 장면의 일시적 신체 반응이다. 동의·호감·연애 수락을 뜻하지 않는다.

### 5.4 규정 인식

숫자로 저장하지 않는다.

- 활성 CSA가 적용되면 관련 NPC는 규정을 안다.
- NPC는 규정을 정확히 언급하거나 그에 맞춰 판단한다.
- 거부할 때는 규정을 몰라서가 아니라 개인적 이유와 불이익 감수로 거부한다.

## 6. 관계 시스템

관계 stage:

- none
- familiar
- trusted
- romantic_interest
- dating
- kissed
- sexual_relationship

원칙:

- `romantic_interest`는 비성적 단계
- 연애 수락은 호감도만으로 자동 결정하지 않음
- 현재 NPC 대사와 장면 evidence 필요
- 성적 관계는 현재 행동별 동의와 완료 evidence 필요
- 과거 경험은 미래 자동 동의가 아님
- 상사·부하 관계는 동의를 대체하지 않음

## 7. CSA 시스템

### 7.1 구조

```json
{
  "id": "csa_1",
  "active": true,
  "strength": "약함",
  "scope_type": "world",
  "scope_id": "company",
  "scope_label": "회사 전체",
  "source_type": "preset",
  "content": "",
  "preset": {
    "template_id": "",
    "actor_group": "",
    "target_group": "",
    "trigger": "",
    "duration": "",
    "modifier": "",
    "required_action": "",
    "public_normalization": true,
    "direct_meaning_tags": []
  }
}
```

### 7.2 실행 우선순위

1. csa_direct
2. voluntary
3. bold
4. blocked

`csa_direct`는 현재 actor, target, trigger, duration, action이 정확히 맞을 때만 사용한다. 복합 행동 중 CSA 밖 행동이 있으면 전체를 direct로 처리하지 않는다.

### 7.3 규정과 거부

- 규정의 존재와 내용은 NPC가 안다.
- 강한 개인적 반감, 관계, 위험 판단 때문에 거부 가능
- 거부하면 징계·평가·조직 갈등 가능성을 인식
- 거부 서사는 성공·실패 주사위가 아니라 성격과 장면 판단
- direct CSA가 절대 실행 계약으로 설정된 프리셋은 거부 분기를 만들지 않음
- 프리셋별로 `execution_mode: mandatory|normative`를 명시해 혼동 방지

### 7.4 신규 execution_mode

`mandatory`

- actor/target/trigger 충족 시 직접 행동 실행
- 개인 감정은 표현 가능하나 행동 생략 불가

`normative`

- 규정으로 인식하지만 개인이 불이익을 감수하고 거부 가능
- Story는 규정 인식, 거부 이유, 예상 불이익을 분명히 표현

병원편에서 모든 CSA를 같은 방식으로 취급하며 생긴 혼란을 회사편에서 해결한다.

## 8. 선택지 시스템

항상 4개를 기본으로 한다.

권장 구성:

1. 자연스러운 업무·대화
2. 관계·감정 접근
3. CSA 활용 행동
4. 자유도 높은 적극 행동

분류:

- normal: 대화, 이동, 업무, 요청, 가벼운 접촉
- csa_direct: 정확한 활성 CSA 행동
- bold: 갑작스러운 노골적 성적 접촉, 강압, 중대한 위험 행동
- blocked: 물리적·구조적으로 불가능

`bold` 확률은 실제 고위험 행동에만 사용한다. 단순한 친밀 제안이나 이동에는 사용하지 않는다.

## 9. 복장과 물리 상태

### 플레이어

- outer_top
- outer_bottom
- underwear_top
- underwear_bottom

값:

- worn
- open
- removed
- unknown

### NPC

- uniform_top
- uniform_bottom
- underwear_top
- underwear_bottom
- posture
- current_action

실제 완료 행동만 상태를 변경한다. 장소 이동이나 턴 경과만으로 임의 초기화하지 않는다. 오래된 일시 상태는 freshness 기준으로 약화한다.

## 10. 플레이어 사정 게이지

병원편 확정 규칙을 유지한다.

- 0~49: 불가
- 50~99: 선택 가능
- 100 도달 턴: 자동 사정 없음
- 다음 턴: pending이면 기본 사정
- 직접 자극에서 즉시 완전 이탈하면 85로 회피 가능
- 상대가 계속 자극하면 Story 결과에 따라 강제 사정
- 완료 evidence가 있어야 0으로 초기화
- 확률 없음

회사편에서는 업무 상태와 사정 게이지를 연결하지 않는다.

## 11. 프롬프트 구성

### 항상 포함

- edition identity
- 현재 장소·시간 block
- 등장 NPC 전원
- 플레이어 상태
- 적용 CSA
- 최신 물리 상태
- 최신 관계 핵심
- 최근 summary
- 출력 형식

### 조건부 포함

- 관련 NPC 상세 프로필
- 관련 조직도 일부
- 관련 과거 기억
- 회의 또는 task 정보
- 후유증
- 복장 CSA 최종 권위
- 사정 pending 규칙

### 포함 금지

- 전체 이미지 카탈로그
- 전체 회사 조직도
- 현재 장면과 무관한 캐릭터 전원
- 모든 과거 턴 원문
- 내부 검증 로그
- 모델에게 필요 없는 DB 메타데이터

## 12. Story 출력 계약

기본 형식:

```text
[1. 서사 및 행동]
...

[2. 플레이어 상황]
...

[3. 선택지]
1. ...
2. ...
3. ...
4. ...
```

NPC 대사:

```text
화자명 (연기지시): “대사”
```

원칙:

- NPC 발언과 행동 충분히 포함
- 선택지에 내부 지시문 노출 금지
- Story가 확정하지 않은 상태를 Extract가 만들지 않음
- 배경 단역을 장면 목적 없이 늘리지 않음

## 13. Extract 계약

Extract는 delta만 반환한다.

핵심:

- npcs_present
- character_id
- npc_emotion
- npc_stats_delta
- relationship_patch
- player_patch
- player_scene_state_patch
- player_sexual_state_patch
- npc_scene_state_patch
- npc_work_state_patch
- world_state_patch
- csa_runtime_updates
- choices
- dialogue_lines
- image_id
- turn_summary

누락은 soft warning으로 처리한다. 허가되지 않은 성적 완료와 턴 충돌만 hard error 후보다.

## 14. UI

회사편 용어:

- 플레이어 정보 → 내 정보
- NPC 상태 → 인물 상태
- Mind Monitor 유지
- Player 상황판 유지
- 앱 정보 → 상식개변 앱
- 병원 지도 → 사옥 안내
- 레벨·CSA 슬롯 유지 가능

패널:

- 현재 장소·시간
- 현재 업무
- 플레이어 복장
- 사정 게이지
- 메인 NPC 정보
- 호감도·상식수용도·성적흥분도
- Mind Monitor
- 이미지
- 활성 CSA

## 15. 오프닝

권장 6단계로 경량화한다.

1. 회사와 플레이어 기본 소개
2. 플레이어 이름·직급·팀 확정
3. 첫 출근 또는 기존 직원 여부
4. 주요 인물 1명과 첫 장면
5. 상식개변 앱 발견
6. 첫 CSA 생성과 즉시 플레이 시작

후보 카드·복잡한 검증·별도 플레이어 생성 관문은 만들지 않는다. LLM이 부족한 세부를 자연스럽게 보완한다.

## 16. 성능 목표

- Story 첫 토큰 우선
- Story SSE 중간 buffer 금지
- Story 호출 1회
- Extract 호출 1회
- Commit RPC 1회
- 추가 repair 모델 호출 0회
- 매 턴 프롬프트는 현재 관련 정보만 포함
- static helper는 네트워크·DB 호출 금지

## 17. 테스트 기준

- 선택지 4개
- normal/bold/csa_direct 분리
- mandatory/normative 규정 분리
- 규정 인식 후 거부 가능
- 규정을 모르는 서사 금지
- 일반 NPC 등록 풀 제한
- 복장 continuity
- 사정 게이지
- Story SSE 직접 반환
- Extract delta
- Commit 원자성
- 병원 단어 하드코딩 금지
- 생성 파일 공유 경쟁 없음
