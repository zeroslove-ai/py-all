# Kimi 실수 로그 — 2026-07-20 11:18 KST

## 발생한 실수

### 1. Storage 파일명 혼동 (심각)
- **원인**: 사용자가 준 `s-xxx.jpg`는 키값이었고, 실제 Storage 파일은 긴 원본 이름
- **결과**: DB에 잘못된 URL 등록 (49개 heroine6~10 이미지)
- **수정**: 실제 Storage 파일명으로 49개 URL 업데이트

### 2. heroine10/sex/ 폴더 조회 누락 (매우 심각)
- **원인**: Storage list API가 `heroine10/sex/` prefix를 파일명에 포함하지 않음
- **결과**: 성인 이미지 25개를 "Storage 없음"으로 오판, 사용자에게 잘못 보고
- **수정**: 하위 폴더 직접 조회 후 정정

### 3. URL 경로 비교 로직 버그
- **원인**: `db_urls - storage_files` 집합 연산 시 경로 형식 불일치
- **결과**: 471개 매칭 → 실제로는 526개 매칭 (55개 오차)
- **수정**: 파일명만 추출하여 비교

### 4. heroine10 오타 미발견
- **원인**: 사용자 키값 `s-6797035499` vs 실제 파일 `s-675935499` (9 하나 차이)
- **결과**: DB에 잘못된 URL 등록, 사용자 지적 후 수정

## 교훈
1. Storage 파일명은 반드시 직접 조회해서 확인할 것
2. 하위 폴더(sex/)는 별도 prefix로 조회할 것
3. URL 비교는 파일명만 추출하여 할 것
4. 사용자가 준 키값 ≠ 실제 파일명, 반드시 검증할 것


### 5. 커널 타임아웃 (2026-07-20)
- **원인**: heroine6~10 이미지 50개 URL 접근 테스트 시 `requests.head()` 50개 연속 호출
- **결과**: Python 커널 60초 타임아웃 → 강제 종료 → 이후 모든 코드 실행 불가
- **교훈**: 네트워크 요청은 배치당 5개 이하, timeout=5, HEAD 대신 빠른 GET 사용
- **영향**: heroine6~10 이미지 URL 정확성 최종 검증 실패, 사용자에게 직접 확인 요청


## 2026-07-20 실수 로그

### 실수 1: heroine6에 heroine2 파일명 복사 (695~698)
- **원인**: heroine6 이미지 등록 시 heroine2의 파일명을 그대로 복사해서 `heroine6/` 경로로 INSERT
- **결과**: 4개 이미지(id=695~698)가 Storage에 없어 로드 실패
- **발견**: HTML 카탈로그 미리보기에서 ❌ 로드 실패 확인
- **조치**: id=695~698 DELETE, game_master catalog에서도 제거
- **교훈**: INSERT 전 반드시 Storage 파일 존재 여부 + 캐릭터 폴더 경로 이중 확인

### 실수 2: id=595 confident 등록 (Storage 파일 없음)
- **원인**: heroine6/confident 이미지가 Storage에 존재하지 않음
- **결과**: HTML 카탈로그에서 ❌ 로드 실패
- **조치**: id=595 DELETE
- **교훈**: 등록 전 HEAD 요청으로 URL 검증 필수

### 실수 3: heroine10 catalog 누락 36개
- **원인**: get_context RPC가 heroine10 36개를 반환하지 않음
- **결과**: image_library에는 있으나 image_catalog에 없어 상태추출LLM이 선택 불가
- **조치**: game_master.data.image_catalog에 36개 수동 추가
- **교훈**: 등록 후 get_context 재호출로 catalog 동기화 확인 필수
