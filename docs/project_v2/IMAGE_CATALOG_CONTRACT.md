# 이미지 카탈로그 메타데이터 계약 (2단계)

작성일: 2026-07-23

Worker(`worker/game-proxy-v2.js`)가 `image_library`/`get_context().image_catalog`에서
읽는 필드와 정규화 규칙을 정리한다. 실제 컬럼 추가·선별·태그 입력은 별도 DB 담당이 수행하며,
이 문서는 Worker가 그 결과를 어떻게 소비하는지에 대한 계약이다.

## DB가 각 이미지 항목에 채울 수 있는 필드

```json
{
  "image_id": 123,
  "character_id": "heroine9",
  "situation": "기존 원본 설명",
  "short_description": "면회실에서 긴장한 표정으로 앉아 있는 장면",
  "tags": ["긴장", "착석", "면회실", "상반신"],
  "image_pool": "general",
  "is_sexual": false,
  "curation_rank": 1
}
```

`short_description`/`tags`/`image_pool`/`curation_rank`는 선택 필드다. 레거시 행(2단계 이전)은
이 필드들이 없어도 그대로 동작한다.

## Worker 정규화 규칙 (`normalizeImageCatalog`)

- `image_pool`은 `"sex"` / `"general"`만 유효값으로 인정하고, 그 외 값은 `null`로 저장한다.
- `is_sexual`은 항상 `resolveIsSexual()`로 계산한다: `image_pool`이 있으면 그 값을 절대 기준으로
  쓰고(`sex`→true, `general`→false), `image_pool`이 없거나 무효할 때만 레거시 `is_sexual`
  불리언을 그대로 쓴다. 설명 문구 내용으로 다시 판정하지 않는다.
- `tags`는 배열이 아니면 `[]`, 배열이면 비어 있지 않은 문자열만 trim해서 유지한다.
- `short_description`과 `situation`은 서로 폴백한다: 한쪽만 있으면 둘 다 그 값을 쓰고, 둘 다
  없으면 빈 문자열이다.
- `curation_rank`는 유효한 정수만 그대로 쓰고, 그 외(문자열, 소수, null/undefined/빈 문자열 등)는
  `null`(=순위 없음, 정렬 시 최하위)로 저장한다.
- `character_id`는 DB 값을 절대 기준으로 신뢰한다. 파일명이나 설명에 다른 캐릭터 이름이
  섞여 있어도 Worker는 재판정하거나 제외하지 않는다.

## `selectImageId` 폴백 규칙

1. 요청된 `image_id`가 현재 캐릭터 소유이고 `resolveIsSexual()` 결과가 요청 풀과 일치하면 그대로 사용.
2. 아니면 같은 캐릭터의 `sex`가 아닌(안전한) 후보 중에서 `curation_rank`가 가장 낮은(우선순위가
   높은) 이미지를 선택. `curation_rank`가 없는 이미지는 항상 후순위로 밀린다.
3. 안전한 후보가 전혀 없으면 `last_image_id`가 안전한 이미지일 때만 그 값으로 폴백.
4. 그래도 없으면 `null`.

## Extract에 넘기는 이미지 카탈로그

`image_url`과 원본 파일명은 Extract 프롬프트에 절대 포함하지 않는다. Extract는 다음 형태만 받는다.

```json
{
  "image_id": 123,
  "character_id": "heroine9",
  "situation": "기존 또는 짧은 설명",
  "short_description": "면회실에서 긴장한 표정으로 앉아 있는 장면",
  "tags": ["긴장", "착석", "면회실", "상반신"],
  "image_pool": "general",
  "is_sexual": false,
  "curation_rank": 1
}
```

`short_description`/`tags`가 있으면 `situation`보다 우선 참고하도록 프롬프트에 명시돼 있다.
둘 다 없는 레거시 항목은 기존처럼 `situation`만으로 매칭한다.

## 3단계로 남겨둔 것

- 현재 NPC 이미지 후보를 8~12장으로 줄이는 최종 축소 (Extract 경량화 단계에서 처리)
- Story/Extract 토큰 상한 조정
