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
    // sidebar.init() calls ui.init() again on every side-panel re-render —
    // storyStream itself is never recreated, so guard against attaching a
    // second listener onto the same element.
  },

  // Nudges the view down by a small, fixed step — never jumps straight to
  // the bottom — and only while auto-follow is armed for this turn.

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
  },

  // ─── 사용자 메시지 ───
  addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = 'var(--accent)';
    div.style.fontWeight = 'bold';
    div.textContent = `> ${text}`;
    this.els.storyStream.appendChild(div);
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

      // Policy A (new turn start): reveal where this turn's output begins,
      // exactly once — never the page bottom. Policy B: gentle-follow for
      // the rest of this turn is armed only if the user was already near
      // the bottom when it started (typically true right after their own
      // just-sent message).
      // Instant, not smooth — a smooth scroll fires many 'scroll' events
      // over its animation and the guard flag above only suppresses one,
      // which would otherwise mis-detect the tail of that animation as a
      // user-driven scroll.
      div.scrollIntoView({ block: 'start' });
    }

    // 커서 앞에 텍스트 삽입
    const textNode = document.createTextNode(chunk);
    cursor.parentNode.insertBefore(textNode, cursor);

  },

  // ─── 서사 스트리밍 종료 ───
  finalizeNarrative() {
    const cursor = this.els.storyStream.querySelector('.typing-cursor');
    if (cursor) cursor.remove();

    const current = document.getElementById('current-narrative');
    if (current) {
      current.removeAttribute('id');
      // Display-time-only cleanup of any stray ** from a cached/legacy Story
      // response — names/dialogue/newlines are untouched.
      current.textContent = this.formatNarrativeForDisplay(current.textContent);
    }

    // 구분선 추가
    const hr = document.createElement('hr');
    hr.className = 'divider';
    this.els.storyStream.appendChild(hr);

    // Policy D: stream completion never forces a jump to the bottom — if
    // gentle-follow was already keeping up, the view is already close; if
    // the user had scrolled away to read, their position stays untouched.
    return current || null;
  },

  // ─── 시스템 메시지 ───
  showSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'narrative';
    div.style.color = 'var(--warning)';
    div.style.fontStyle = 'italic';
    div.textContent = `[시스템] ${text}`;
    this.els.storyStream.appendChild(div);
  },

  restoreNarrative(text) {
    this.els.storyStream.querySelectorAll('.narrative, .divider').forEach(node => node.remove());
    this.clearPendingTurnActions();
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'narrative';
    div.textContent = this.formatNarrativeForDisplay(text);
    this.els.storyStream.appendChild(div);
    const hr = document.createElement('hr'); hr.className = 'divider';
    this.els.storyStream.appendChild(hr);
    // Policy D: this runs after a commit/context reload (resume, discard,
    // feedback-regenerate) — no forced bottom jump, current scroll position
    // is left as-is.
  },

  arrangeMobileLayout() {
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const main = document.querySelector('.main');
    if (mobile && this.els.bottomBar.parentElement !== main) main.insertBefore(this.els.bottomBar, this.els.sidePanel);
    if (!mobile && this.els.bottomBar.parentElement === main) document.body.appendChild(this.els.bottomBar);
  },

  // Display-side normalization only — names/dialogue/newlines are preserved,
  // just the literal ** characters go. The Worker's Story prompt no longer
  // asks for ** at all, but a cached/legacy response could still include it,
  // so this is a defensive display-time cleanup, not a markdown renderer.
  stripBoldMarkers(text) {
    return typeof text === 'string' ? text.replace(/\*\*/g, '') : text;
  },

  // Display-only fallback: Story/Extract/Commit keep the original text.
  // Only the rendered [1] section gains defensive paragraph breaks.
  formatNarrativeForDisplay(text) {
    const source = this.stripBoldMarkers(text);
    if (typeof source !== 'string') return source;
    const statusMatch = /^\s*\[2\. 플레이어 상황판\]\s*$/m.exec(source);
    if (!statusMatch) return source;
    return this.formatNarrativeSectionForDisplay(source.slice(0, statusMatch.index))
      + source.slice(statusMatch.index);
  },

  formatNarrativeSectionForDisplay(text) {
    const dialogueLine = /^\s*[^\n]{1,60}\s+\([^\n)]{1,100}\):\s*“[^\n”]*”\s*$/;
    const addDialogueBreaks = paragraph => {
      const lines = paragraph.split('\n');
      const result = [];
      lines.forEach((line, index) => {
        const isDialogue = dialogueLine.test(line);
        if (isDialogue && result.length && result[result.length - 1] !== '') result.push('');
        result.push(line);
        if (isDialogue && index < lines.length - 1 && lines[index + 1].trim()) result.push('');
      });
      return result.join('\n');
    };
    const splitLongLine = line => {
      if (line.length <= 300 || dialogueLine.test(line)) return line;
      const sentences = [];
      let cursor = 0;
      const ending = /[.!?…。！？]+(?:[”’"')\]]+)?/g;
      let match;
      while ((match = ending.exec(line))) {
        sentences.push(line.slice(cursor, ending.lastIndex));
        cursor = ending.lastIndex;
      }
      if (cursor < line.length) sentences.push(line.slice(cursor));
      if (sentences.length < 2) return line;
      const groups = [];
      for (let index = 0; index < sentences.length;) {
        const remaining = sentences.length - index;
        const size = remaining <= 4 ? remaining : 3;
        groups.push(sentences.slice(index, index + size).join(''));
        index += size;
      }
      return groups.join('\n\n');
    };

    // Existing blank-line runs are preserved. The formatter only adds breaks.
    return text.split(/(\n{2,})/).map(part => {
      if (/^\n+$/.test(part)) return part;
      return addDialogueBreaks(part).split('\n').map(splitLongLine).join('\n');
    }).join('');
  },

  normalizeChoice(value) {
    return this.stripBoldMarkers(String(value || '')).replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)]|[-*•])\s*/, '').trim();
  },

  // 버튼 표시 전용 축약 — normalizeChoice 결과를 받아 30자 이내로 자른다.
  // 원문 의미를 새로 만들거나 바꾸지 않고, 실제 전달값은 항상 원문 전체다.
  summarizeChoiceLabel(text, maxLength = 30) {
    const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength - 1) + '…';
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
  },

  // A dedicated class (never .narrative) so this notice is never mistaken
  // for the actual story text by code that scans .narrative elements
  // (removeTrailingChoiceBlock, markLastNarrativeUncommitted, etc.) — and so
  // it has one obvious lifecycle: clearPendingTurnActions() removes exactly
  // this, nothing else. Used when the user must make a real choice (retry
  // vs. discard, or regenerate vs. discard) rather than acknowledge a single
  // retry (see showRetryNotice for that simpler case).
  showPendingTurnActions(text, actions, details = []) {
    this.clearPendingTurnActions();
    const div = document.createElement('div');
    div.className = 'pending-turn-action-notice';
    div.style.color = 'var(--warning)';
    div.textContent = text + ' ';
    const buttons = [];
    actions.forEach(({ label, onClick }) => {
      const button = document.createElement('button');
      button.className = 'choice-btn';
      button.style.marginRight = '8px';
      button.textContent = label;
      buttons.push(button);
      button.addEventListener('click', () => {
        // Disable both buttons the instant either is clicked — a slow async
        // action must not leave the other button clickable in the meantime.
        buttons.forEach(b => { b.disabled = true; });
        onClick();
      }, { once: true });
      div.appendChild(button);
    });
    // Collapsed by default — general users never need the raw internal
    // validation strings, but they stay available for anyone who wants them
    // instead of being either always shown or fully hidden.
    if (Array.isArray(details) && details.length) {
      const detailsEl = document.createElement('details');
      detailsEl.className = 'pending-turn-action-details';
      const summary = document.createElement('summary');
      summary.textContent = '개발자용 상세보기';
      detailsEl.appendChild(summary);
      const list = document.createElement('ul');
      details.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      detailsEl.appendChild(list);
      div.appendChild(detailsEl);
    }
    this.els.storyStream.appendChild(div);
  },

  clearPendingTurnActions() {
    this.els.storyStream.querySelectorAll('.pending-turn-action-notice').forEach(node => node.remove());
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

  // Removes one specific finalized narrative element (and its trailing
  // divider) by direct reference — used when a turn is thrown away for
  // regeneration, as the counterpart to finalizeNarrative()'s returned node.
  removeNarrativeElement(element) {
    if (!element || !element.parentNode) return;
    const divider = element.nextElementSibling;
    element.remove();
    if (divider && divider.classList.contains('divider')) divider.remove();
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
    this.clearPendingTurnActions();
    this.els.choiceButtons.replaceChildren();
    this.els.characterImg.removeAttribute('src');
    this.els.characterImg.classList.add('hidden');
    // audioPlayer can be null — sidebar.init() rebuilds .side-panel's
    // innerHTML (which the static <audio id="audio-player"> lives inside)
    // and re-runs ui.init() afterward, so this element is not guaranteed to
    // exist by the time this runs. Never let that abort the rest of the
    // view reset.
    this.els.audioPlayer?.pause();
    this.els.audioPlayer?.removeAttribute('src');
    this.els.audioPlayer?.classList.remove('active');
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
    if (stats['호감도'] !== undefined) {
      document.getElementById('stat-호감도').textContent = stats['호감도'];
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
      // 표시문(30자 축약)과 전달 원문을 분리한다 — 콜백/기록에는 항상 원문 전체.
      const fullText = text;
      const displayText = this.summarizeChoiceLabel(isExplicit ? fullText.slice(1).trim() : fullText, 30);
      const btn = document.createElement('button');
      btn.className = `choice-btn ${isExplicit ? 'explicit' : ''}`;
      const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = markers[index] || `${index + 1}.`;
      const label = document.createElement('span'); label.className = 'choice-label';
      label.textContent = isExplicit ? `❗ ${displayText}` : displayText;
      btn.append(marker, label);
      btn.title = fullText;
      btn.setAttribute('aria-label', `${index + 1}. ${fullText}`);
      btn.addEventListener('click', () => {
        this.els.choiceButtons.querySelectorAll('button').forEach(button => { button.disabled = true; button.classList.remove('selected'); });
        btn.classList.add('selected');
        onClick(fullText, { source: 'choice_button', choice_index: index, choice_text: fullText });
      }, { once: true });
      this.els.choiceButtons.appendChild(btn);
    }
  },

  // ─── 스크롤 ───
  renderGameplayChoices(choices, onClick, { setup = false, choiceMeta = [] } = {}) {
    this.els.choiceButtons.replaceChildren();
    const markers = ['①', '②', '③', '④', '⑤', '⑥'];
    const all = (choices || []).map(choice => this.normalizeChoice(typeof choice === 'string' ? choice : choice?.text)).filter(Boolean);
    const actions = setup ? all : all.filter(text => !/(?:어플|앱)\s*정보|📱/i.test(text)).slice(0, 4);
    actions.forEach((text, index) => {
      const meta = Array.isArray(choiceMeta) ? choiceMeta[index] : null;
      // Checked before bold — an exact active-CSA-covered choice is never a
      // probability roll, so it must never fall into the bold/blocked
      // branches below (README: csa_direct outranks bold).
      const csaDirect = meta?.kind === 'csa_direct';
      // A legacy/stale meta (no severity, or a stray bold with no success
      // rate) must never show the ⚡ badge or a success-rate figure the
      // Worker isn't actually honoring anymore.
      const validSeverity = ['mild', 'high', 'extreme'].includes(meta?.severity);
      const bold = !csaDirect && meta?.kind === 'bold' && validSeverity && Number.isFinite(Number(meta.success_rate));
      const blocked = !csaDirect && meta?.kind === 'blocked';
      const explicit = text.startsWith('❗');
      // 표시문(30자 축약)과 전달 원문을 분리한다 — 콜백/기록에는 항상 원문 전체.
      const fullText = text;
      const displayText = this.summarizeChoiceLabel(explicit ? fullText.slice(1).trim() : fullText, 30);
      const button = document.createElement('button');
      button.className = `choice-btn ${explicit ? 'explicit' : ''}${csaDirect ? ' csa-direct-choice' : ''}${bold ? ' bold-choice' : ''}${blocked ? ' blocked-choice' : ''}`;
      const marker = document.createElement('span'); marker.className = 'marker'; marker.textContent = markers[index] || `${index + 1}.`;
      const label = document.createElement('span'); label.className = 'choice-label';
      // Keep the direct-execution marker compact on mobile. The button color
      // and icon already distinguish the route; the full choice remains in
      // title/aria-label and the click payload.
      label.textContent = csaDirect
        ? `🌀 ${displayText}`
        : bold
          ? `⚡ 과감 · 성공률 ${meta.success_rate}% · ${displayText}`
          : blocked
            ? `⛔ 실행 불가 · ${displayText}`
            : (explicit ? `❗ ${displayText}` : displayText);
      button.append(marker, label);
      button.title = fullText;
      button.setAttribute('aria-label', `${index + 1}. ${fullText}`);
      button.addEventListener('click', () => {
        this.els.choiceButtons.querySelectorAll('button').forEach(item => { item.disabled = true; item.classList.remove('selected'); });
        button.classList.add('selected');
        onClick(fullText, { source: 'choice_button', choice_index: index, choice_text: fullText });
      }, { once: true });
      this.els.choiceButtons.appendChild(button);
    });
  },

};

// 초기화
ui.init();
