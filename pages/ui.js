// ui.js — UI 렌더링 함수들

const ui = {
  // ─── DOM 참조 (캐싱) ───
  els: {},
  init() {
    this.els = {
      storyStream: document.getElementById('story-stream'),
      characterImg: document.getElementById('character-img'),
      mindMonitor: document.getElementById('mind-monitor'),
      playerStatus: document.getElementById('player-status'),
      audioPlayer: document.getElementById('audio-player'),
      choiceButtons: document.getElementById('choice-buttons'),
      bottomBar: document.querySelector('.bottom-bar'),
      sidePanel: document.querySelector('.side-panel'),
      chatInput: document.getElementById('chat-input'),
      chatSend: document.getElementById('chat-send'),
      loading: document.getElementById('loading'),
      gameTitle: document.getElementById('game-title'),
      turnCount: document.getElementById('turn-count')
    };
    this.arrangeMobileLayout();
    window.addEventListener('resize', () => this.arrangeMobileLayout());
  },

  // ─── 메타 정보 ───
  updateMeta(title, turnCount) {
    if (title !== null && title !== undefined) {
      this.els.gameTitle.textContent = title;
    }
    if (turnCount !== null && turnCount !== undefined) {
      this.els.turnCount.textContent = `턴: ${turnCount}`;
    }
  },

  // ─── 로딩 ───
  setLoading(active, label = '처리 중') {
    this.els.loading.classList.toggle('active', active);
    this.els.loading.textContent = label;
    // An outer caller's own loading spinner clearing (e.g. retryStory's
    // finally running after retryExtract already returned) must not
    // silently re-enable input while a failed-turn retry/discard lock
    // (state.inputLocked) is in effect.
    const locked = typeof state !== 'undefined' && state.inputLocked;
    this.els.chatSend.disabled = active || locked;
    this.els.chatInput.disabled = active || locked;
    if (active) {
      requestAnimationFrame(() => {
        this.scrollToBottom();
        if (window.matchMedia('(max-width: 768px)').matches) {
          this.els.loading.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  },

  // ─── 사용자 메시지 ───
  addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = 'var(--accent)';
    div.style.fontWeight = 'bold';
    div.textContent = `> ${text}`;
    this.els.storyStream.appendChild(div);
    this.scrollToBottom();
  },

  // ─── 서사 스트리밍 (한 글자씩) ───
  appendNarrative(chunk) {
    let cursor = this.els.storyStream.querySelector('.typing-cursor');

    if (!cursor) {
      // 새 narrative 컨테이너 생성
      const div = document.createElement('div');
      div.className = 'narrative';
      div.id = 'current-narrative';
      this.els.storyStream.appendChild(div);

      cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      div.appendChild(cursor);
    }

    // 커서 앞에 텍스트 삽입
    const textNode = document.createTextNode(chunk);
    cursor.parentNode.insertBefore(textNode, cursor);

    this.scrollToBottom();
  },

  // ─── 서사 스트리밍 종료 ───
  finalizeNarrative() {
    const cursor = this.els.storyStream.querySelector('.typing-cursor');
    if (cursor) cursor.remove();

    const current = document.getElementById('current-narrative');
    if (current) current.removeAttribute('id');

    // 구분선 추가
    const hr = document.createElement('hr');
    hr.className = 'divider';
    this.els.storyStream.appendChild(hr);

    this.scrollToBottom();
  },

  // ─── 시스템 메시지 ───
  showSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = 'var(--warning)';
    div.style.fontStyle = 'italic';
    div.textContent = `[시스템] ${text}`;
    this.els.storyStream.appendChild(div);
    this.scrollToBottom();
  },

  restoreNarrative(text) {
    this.els.storyStream.querySelectorAll('.narrative, .divider').forEach(node => node.remove());
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'narrative';
    div.textContent = text;
    this.els.storyStream.appendChild(div);
    const hr = document.createElement('hr'); hr.className = 'divider';
    this.els.storyStream.appendChild(hr);
    this.scrollToBottom();
  },

  arrangeMobileLayout() {
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const main = document.querySelector('.main');
    if (mobile && this.els.bottomBar.parentElement !== main) main.insertBefore(this.els.bottomBar, this.els.sidePanel);
    if (!mobile && this.els.bottomBar.parentElement === main) document.body.appendChild(this.els.bottomBar);
  },

  normalizeChoice(value) {
    return String(value || '').replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]|[-*•])\s*/, '').trim();
  },

  removeTrailingChoiceBlock(choices) {
    const normalized = (Array.isArray(choices) ? choices : []).map(choice => this.normalizeChoice(choice)).filter(Boolean);
    if (!normalized.length) return false;
    const narratives = [...this.els.storyStream.querySelectorAll('.narrative')];
    const target = narratives[narratives.length - 1];
    if (!target) return false;
    const lines = target.textContent.split('\n');
    const nonEmpty = [];
    for (let index = lines.length - 1; index >= 0 && nonEmpty.length < normalized.length; index--) {
      if (lines[index].trim()) nonEmpty.unshift({ index, value: this.normalizeChoice(lines[index]) });
    }
    if (nonEmpty.length !== normalized.length || nonEmpty.some((line, index) => line.value !== normalized[index])) return false;
    let start = nonEmpty[0].index;
    if (start > 0 && /선택지|choices/i.test(lines[start - 1])) start--;
    target.textContent = lines.slice(0, start).join('\n').trimEnd();
    const divider = target.nextElementSibling;
    if (!target.textContent && divider?.classList.contains('divider')) { target.remove(); divider.remove(); }
    return true;
  },

  setChoicesEnabled(enabled) {
    this.els.choiceButtons.querySelectorAll('button').forEach(button => {
      button.disabled = !enabled;
      if (enabled) button.classList.remove('selected');
    });
  },

  setChatInputEnabled(enabled) {
    this.els.chatInput.disabled = !enabled;
    this.els.chatSend.disabled = !enabled;
  },

  showRetryNotice(text, actionLabel, onRetry, blocking = true) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = blocking ? 'var(--warning)' : 'var(--muted)';
    div.textContent = text + ' ';
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.textContent = actionLabel;
    button.addEventListener('click', onRetry, { once: true });
    div.appendChild(button);
    this.els.storyStream.appendChild(div);
    this.scrollToBottom();
  },

  // Same shape as showRetryNotice but supports more than one action button —
  // used when the user must make a real choice (retry vs. discard) rather
  // than just acknowledging a single retry.
  showActionNotice(text, actions) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = 'var(--warning)';
    div.textContent = text + ' ';
    actions.forEach(({ label, onClick }) => {
      const button = document.createElement('button');
      button.className = 'choice-btn';
      button.style.marginRight = '8px';
      button.textContent = label;
      button.addEventListener('click', onClick, { once: true });
      div.appendChild(button);
    });
    this.els.storyStream.appendChild(div);
    this.scrollToBottom();
  },

  // Flags the most recently finalized narrative as not yet committed —
  // called only after a downstream step (Extract) fails, never eagerly,
  // so a normal successful turn never shows this badge even briefly.
  markLastNarrativeUncommitted() {
    const narratives = [...this.els.storyStream.querySelectorAll('.narrative')];
    const target = narratives[narratives.length - 1];
    if (!target || target.querySelector('.uncommitted-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'uncommitted-badge';
    badge.style.color = 'var(--warning)';
    badge.style.fontWeight = 'bold';
    badge.style.marginBottom = '4px';
    badge.textContent = '⚠️ 이 서사는 아직 저장(Commit)되지 않았습니다';
    target.insertBefore(badge, target.firstChild);
  },

  clearUncommittedNarrativeBadges() {
    this.els.storyStream.querySelectorAll('.uncommitted-badge').forEach(node => node.remove());
  },

  // Appends a short repair addition (e.g. a missed forced CSA action) to the
  // already-finalized narrative div, rather than starting a new block —
  // this text becomes part of the same committed turn.
  appendToLastNarrative(text) {
    if (!text) return;
    const narratives = [...this.els.storyStream.querySelectorAll('.narrative')];
    const target = narratives[narratives.length - 1];
    if (!target) return;
    target.textContent = `${target.textContent}\n\n${text}`;
    this.scrollToBottom();
  },

  failCurrentNarrative() {
    const current = document.getElementById('current-narrative');
    if (current) current.remove();
    const cursor = this.els.storyStream.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
  },

  // ─── 이미지 ───
  showImage(url) {
    this.els.characterImg.src = url;
    this.els.characterImg.classList.remove('hidden');
  },

  clearGameView() {
    this.els.storyStream.querySelectorAll('.narrative, .divider').forEach(node => node.remove());
    this.els.choiceButtons.replaceChildren();
    this.els.characterImg.removeAttribute('src');
    this.els.characterImg.classList.add('hidden');
    this.els.audioPlayer.pause();
    this.els.audioPlayer.removeAttribute('src');
    this.els.audioPlayer.classList.remove('active');
  },

  // ─── 오디오 ───
  playAudio(url) {
    this.els.audioPlayer.src = url;
    this.els.audioPlayer.classList.add('active');
    this.els.audioPlayer.play().catch(() => {
      // 자동 재생 차단 — 사용자가 수동 클릭 필요
    });
  },

  // ─── 마인드 모니터 ───
  updateMindMonitor(surface, inner) {
    let text = '';
    if (surface) text += `[표면의식]\n${surface}\n\n`;
    if (inner) text += `[잠재의식]\n${inner}`;
    this.els.mindMonitor.textContent = text || '(대기 중)';
  },

  // ─── 플레이어 상황 ───
  updatePlayerStatus(stats) {
    if (stats.location !== undefined) {
      document.getElementById('stat-location').textContent = stats.location || '-';
    }
    if (stats['순응도'] !== undefined) {
      document.getElementById('stat-순응도').textContent = stats['순응도'];
    }
    if (stats['호감도'] !== undefined) {
      document.getElementById('stat-호감도').textContent = stats['호감도'];
    }
    if (stats['최면깊이'] !== undefined) {
      document.getElementById('stat-최면깊이').textContent = stats['최면깊이'];
    }
    if (stats.csa_active !== undefined) {
      const csa = stats.csa_active;
      document.getElementById('stat-csa').textContent = 
        Array.isArray(csa) && csa.length > 0 ? csa.join(', ') : '없음';
    }
  },

  // ─── 선택지 파싱 ───
  parseChoices(text) {
    // ①②③④⑤⑥ 패턴 매칭
    const matches = text.match(/^[①②③④⑤⑥]\s*.+$/gm) || [];
    return matches.map(line => {
      const marker = line[0];
      const rest = line.slice(1).trim();
      const isExplicit = rest.includes('❗');
      return { marker, text: rest, isExplicit };
    });
  },

  // ─── 선택지 렌더링 ───
  renderChoices(choices, onClick) {
    this.els.choiceButtons.innerHTML = '';
    const markers = ['①', '②', '③', '④', '⑤', '⑥'];
    for (const [index, rawChoice] of (choices || []).entries()) {
      const text = this.normalizeChoice(typeof rawChoice === 'string' ? rawChoice : rawChoice?.text);
      if (!text) continue;
      const isExplicit = text.startsWith('❗');
      const btn = document.createElement('button');
      btn.className = `choice-btn ${isExplicit ? 'explicit' : ''}`;
      const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = markers[index] || `${index + 1}.`;
      btn.append(marker, document.createTextNode(isExplicit ? ` ❗ ${text.slice(1).trim()}` : ` ${text}`));
      btn.addEventListener('click', () => {
        this.els.choiceButtons.querySelectorAll('button').forEach(button => { button.disabled = true; button.classList.remove('selected'); });
        btn.classList.add('selected');
        onClick(text);
      }, { once: true });
      this.els.choiceButtons.appendChild(btn);
    }
  },

  // ─── 스크롤 ───
  renderGameplayChoices(choices, onClick, { setup = false } = {}) {
    this.els.choiceButtons.replaceChildren();
    const markers = ['①', '②', '③', '④', '⑤', '⑥'];
    const all = (choices || []).map(choice => this.normalizeChoice(typeof choice === 'string' ? choice : choice?.text)).filter(Boolean);
    const actions = setup ? all : all.filter(text => !/(?:어플|앱)\s*정보|📱/i.test(text)).slice(0, 4);
    actions.forEach((text, index) => {
      const explicit = text.startsWith('❗');
      const button = document.createElement('button');
      button.className = `choice-btn ${explicit ? 'explicit' : ''}`;
      const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = markers[index] || `${index + 1}.`;
      button.append(marker, document.createTextNode(explicit ? ` ❗ ${text.slice(1).trim()}` : ` ${text}`));
      button.addEventListener('click', () => {
        this.els.choiceButtons.querySelectorAll('button').forEach(item => { item.disabled = true; item.classList.remove('selected'); });
        button.classList.add('selected');
        onClick(text);
      }, { once: true });
      this.els.choiceButtons.appendChild(button);
    });
  },

  scrollToBottom() {
    this.els.storyStream.scrollTop = this.els.storyStream.scrollHeight;
  }
};

// 초기화
ui.init();
