# 게임빌더 v2 프론트엔드 구조

**기준일**: 2026-07-22  
**배포 대상**: Cloudflare Pages  
**기술**: HTML5, 인라인 CSS, Vanilla JavaScript

## 현재 파일 구조

```text
pages/
├── index.html   # 화면, 인라인 CSS, 앱 진입점과 턴 오케스트레이션
├── api.js       # JSON API 호출과 ApiError
├── stream.js    # `/api/story` SSE 스트림 파싱
├── state.js     # 게임·UI 상태 객체
└── ui.js        # DOM 렌더링, 선택지 파싱, 이미지·오디오 처리
```

기존 문서의 `css/`, `js/`, `tts.js`, `save.js`, `utils.js` 구조는 계획안이었고 현재 구현과 다르다. CSS와 앱 진입 로직은 `index.html` 안에 있다.

## 실행 주소

```text
https://<pages-domain>/?game=<game_id>
```

게임 ID 우선순위:

1. URL 쿼리의 `game`
2. `localStorage.gameId`

게임 ID가 없으면 안내 메시지를 표시하고 API 호출을 시작하지 않는다.

## Worker 연결

현재 `api.js`의 `API_BASE`는 빈 문자열이고 `stream.js`도 `/api/story` 상대경로를 직접 사용한다.

```javascript
const API_BASE = '';
```

따라서 운영 환경에서는 Pages 도메인의 `/api/*`가 `game-proxy-v2` Worker로 연결되어야 한다. Worker의 `workers.dev` 주소를 직접 사용하는 방식으로 바꾸려면 `api.js`뿐 아니라 `stream.js`도 같은 Base URL을 사용하도록 함께 수정해야 한다.

## 상태 구조

```javascript
const state = {
  gameId: null,
  turnCount: 0,
  imageCatalog: {},
  context: null,
  lastExtract: null,
  isStreaming: false,
  autoTts: true,
  pendingResetConfirm: false,
  narrativeText: '',
  imageUrl: '',
  audioUrl: '',
  npcStats: {},
  choices: []
};
```

서버 상태의 기준은 Supabase이며, 프론트 상태는 표시와 요청 제어용이다. 턴 수는 `/api/context` 또는 `/api/commit-turn`의 응답으로만 갱신한다.

## 한 턴 처리 순서

1. 입력을 잠그고 `state.isStreaming=true`로 설정한다.
2. `/api/story`를 호출해 SSE 서사를 화면에 순차 렌더링한다.
3. `X-Game-Mode=reentry`면 선택지만 다시 표시하고 저장하지 않는다.
4. 일반 턴이면 `/api/extract`로 상태를 추출한다.
5. 이미지와 TTS 요청을 선택 작업으로 병렬 시작한다.
6. `/api/commit-turn` 한 번으로 서사·상태·턴 수를 저장한다.
7. 저장 성공 후에만 턴 수, 마인드 모니터, 상황판, 선택지를 갱신한다.
8. 선택 이미지·TTS 작업은 실패해도 핵심 턴 저장을 실패시키지 않는다.

## 저장 안정성

- `/api/save-turn`과 `/api/set-save`는 신규 흐름에서 사용하지 않는다.
- `/api/commit-turn`은 최대 3회 재시도한다.
- HTTP `4xx`는 재시도하지 않는다.
- `5xx` 또는 네트워크 오류는 300ms, 600ms 간격으로 재시도한다.
- 동일한 내용의 재전송은 서버가 replay로 처리한다.
- `409 Conflict`이면 다른 창에서 턴이 진행된 것으로 보고 `/api/context`를 다시 호출한다.
- 저장 성공 전에는 새 선택지를 활성화하지 않는다.

## 주요 모듈

### `api.js`

운영 호출:

- `context()`
- `extract()`
- `image()`
- `tts()`
- `commitTurn()`
- `reset()`

`saveTurn()`과 `setSave()`는 레거시 호환 코드이며 신규 흐름에서 호출하지 않는다.

### `stream.js`

- DeepSeek OpenAI 호환 SSE의 `data:` 이벤트 파싱
- `[DONE]` 처리
- `choices[0].delta.content`를 누적
- 응답 헤더 `X-Game-Mode` 전달

### `ui.js`

- 스트리밍 서사와 입력 메시지 렌더링
- `①`~`⑥` 선택지 파싱 및 버튼 생성
- 캐릭터 이미지와 오디오 표시
- 표면의식·잠재의식과 플레이어 상태 갱신
- 로딩 중 입력 잠금

## 반응형 UI

| 환경 | 현재 동작 |
|---|---|
| 데스크톱·태블릿 | 좌측 서사, 우측 캐릭터·마인드 모니터·상황판 |
| 모바일 `≤768px` | 우측 패널 숨김, 선택지 버튼 한 줄 전체 폭 |

현재 모바일에서는 우측 캐릭터 이미지·마인드 모니터·상황판이 숨겨진다. 모바일에서도 해당 정보가 필요하면 후속 UI 개편이 필요하다.

## 배포 검증 체크리스트

- `?game=<id>`로 접속 시 컨텍스트와 턴 수가 로드된다.
- `/api/story`가 Pages 도메인에서 Worker로 정상 라우팅된다.
- 한글 SSE가 유실 없이 끝까지 출력된다.
- `reentry` 응답이 턴을 증가시키지 않는다.
- 정상 턴에서 `/api/commit-turn`이 한 번의 논리 요청으로 완료된다.
- 새로고침 후 턴 수와 저장 내용이 유지된다.
- 이미지·TTS 실패가 턴 저장을 막지 않는다.
- `409` 발생 시 최신 컨텍스트가 다시 로드된다.
