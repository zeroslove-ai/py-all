# 프론트엔드 구조

## 기술 스택

- **HTML5** + **CSS3** (Flexbox/Grid)
- **Vanilla JavaScript** (ES6+, 모듈화)
- **Cloudflare Pages** 배포

## 디렉토리 구조

```
pages/
├── index.html              # 메인 진입점
├── css/
│   ├── base.css            # 리셋, 변수, 폰트
│   ├── layout.css          # 레이아웃 (Grid/Flex)
│   ├── components.css      # UI 컴포넌트 (버튼, 패널)
│   └── animations.css      # 애니메이션 (타자기, 페이드)
├── js/
│   ├── main.js             # 진입점, 초기화
│   ├── api.js              # Worker API 호출
│   ├── stream.js           # SSE 스트리밍 처리
│   ├── ui.js               # UI 렌더링
│   ├── tts.js              # TTS 재생
│   ├── save.js             # 세이브/로드 (localStorage)
│   └── utils.js            # 유틸리티
└── assets/
    └── (로컬 에셋, 필요시)
```

## 레이아웃 구조

```
┌─────────────────────────────────────────┐
│  헤더 (게임 제목, 턴 수, 설정 버튼)       │
├──────────────────┬──────────────────────┤
│                  │                      │
│   스토리 영역     │   캐릭터 이미지       │
│   (스트리밍 텍스트)│   (상단)              │
│                  │                      │
│                  ├──────────────────────┤
│                  │   마인드 모니터       │
│                  │   (중간)              │
│                  │                      │
│                  ├──────────────────────┤
│                  │   플레이어 상황판     │
│                  │   (하단)              │
│                  │                      │
├──────────────────┴──────────────────────┤
│  선택지 영역 (①②③...)                   │
├─────────────────────────────────────────┤
│  입력 영역 (텍스트 입력 + 전송 버튼)      │
└─────────────────────────────────────────┘
```

## 핵심 모듈

### stream.js
```javascript
class StoryStreamer {
  async start(gameId, input, turnCount) {
    const response = await fetch('/api/story', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({game_id: gameId, input, turn_count: turnCount})
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const {done, value} = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      // SSE 파싱 → UI 갱신
      this.parseAndRender(chunk);
    }
  }
}
```

### ui.js
```javascript
function renderStory(text) {
  const el = document.getElementById('story-text');
  el.textContent = text;
  el.scrollTop = el.scrollHeight;
}

function renderImage(url, characterId) {
  const img = document.getElementById('character-image');
  img.src = url;
  img.alt = characterId;
  img.classList.remove('hidden');
}

function renderChoices(choices) {
  const container = document.getElementById('choices-container');
  container.innerHTML = choices.map((c, i) => 
    `<button class="choice-btn" data-index="${i}">${i+1}. ${c.text}</button>`
  ).join('');
}

function renderMindMonitor(surface, inner) {
  document.getElementById('mind-surface').textContent = surface;
  document.getElementById('mind-inner').textContent = inner;
}

function renderPlayerStatus(status) {
  // 순응도, 최면깊이, 상식개변 등
}
```

### tts.js
```javascript
async function playTTS(dialogueLines, characterId) {
  const lines = dialogueLines.filter(l => l.speaker === characterId);
  if (!lines.length) return;

  const text = lines.map(l => l.text).join(' ... ');
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text, character_id: characterId})
  });

  const {url} = await response.json();
  const audio = new Audio(url);
  audio.play();
}
```

## CSS 변수 (다크 테마)

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-panel: #0f3460;
  --text-primary: #e94560;
  --text-secondary: #eee;
  --accent: #e94560;
  --border: #533483;
  --font-main: 'Noto Sans KR', sans-serif;
}
```

## 반응형 브레이크포인트

| 디바이스 | 너비 | 레이아웃 |
|---|---|---|
| 데스크톱 | > 1024px | 좌측 스토리 / 우측 이미지+패널 |
| 태블릿 | 768-1024px | 상단 스토리 / 하단 이미지+패널 |
| 모바일 | < 768px | 단일 컬럼, 이미지 상단 |
