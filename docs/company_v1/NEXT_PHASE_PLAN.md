# 회사편 v1 다음 단계 계획

상태: active sequence plan  
기준일: 2026-08-03

## 현재 상태

- Phase 0 골격 PR: #10
- PR head: `company/phase-0-scaffold`
- PR commit: `59ad5a236159e88a1959048c03d4fd3dc21d9f4f`
- base: `feature/company-v1`
- Supabase·Cloudflare·외부 모델 호출 미실행

## 다음 순서

1. PR #10을 `feature/company-v1`에 merge
2. `GAMEPLAY_DESIGN_OPTIONS.md`의 사용자 선택 확정
3. Phase 0.5 gameplay contract 문서와 fixture 작성
4. 정적 계약 테스트 작성
5. Phase 0.5 PR 검토·merge
6. 확정 schema를 기준으로 Phase 1 DB migration 작성

DB migration을 Phase 0.5보다 먼저 만들지 않는다.

## Phase 0.5 산출물

- 관계 multi-axis schema
- global common-sense baseline + per-CSA attitude schema
- active rule slot/scene applicability contract
- rule conflict precedence
- activation/deactivation/aftereffect contract
- scene state
- NPC soft availability
- event ledger
- risk outcome contract
- player setup contract
- character behavior core schema
- fixture JSON
- 정적 계약 테스트

## Phase 0.5 금지

- Supabase project 생성
- migration apply
- Cloudflare 배포
- Story/Extract 실호출
- 병원편 변경
- 게임 reset

## 기준 문서

- `GAMEPLAY_DESIGN_OPTIONS.md`
- `GAME_SYSTEM_DESIGN.md`
- `DESIGN_REVIEW_BACKLOG.md`
- `NARRATIVE_OUTPUT_CONTRACT.md`
- `UI_UX_REDESIGN.md`
