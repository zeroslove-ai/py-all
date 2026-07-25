// history.js — 플레이 기록 모달 + MD/TXT보내기
// 구조화 이전 기록은 절대 추측해 채우지 않고, 있는 값만 표시/출력한다.

const playHistory = {
  // ─── 내부 캐시 ───
  cache: {
    gameId: null,
    records: new Map(),   // turn_number → record
    hasMore: false,
    nextBeforeTurn: null,
    loaded: false
  },

  // ─── 순수 함수: 플레이어 행동 한 줄 요약 ───
  formatPlayerAction(action, { markdown = true } = {}) {
    if (!action || typeof action !== 'object') return null;
    const index = Number.isInteger(action.choice_index) ? action.choice_index : null;
    const choiceText = typeof action.choice_text === 'string' && action.choice_text.trim() ? action.choice_text : null;
    if ((action.source === 'choice_button' || action.source === 'direct_marker') && index !== null && choiceText) {
      return `선택지 ${index + 1}:\n${choiceText}`;
    }
    const text = typeof action.resolved_input === 'string' && action.resolved_input.trim()
      ? action.resolved_input
      : (typeof action.raw_input === 'string' ? action.raw_input : '');
    if (!text.trim()) return null;
    return `직접 입력:\n${text}`;
  },

  // ─── 순수 함수: Markdown 생성 ───
  buildHistoryMarkdown(records, metadata = {}) {
    const list = Array.isArray(records) ? records : [];
    const turns = list.map(r => r?.turn_number).filter(Number.isInteger);
    const lines = [
      '# 게임빌더 v2 플레이 기록',
      '',
      `- 게임 제목: ${metadata.title || '(제목 없음)'}`,
      `- 게임 ID: ${metadata.gameId || ''}`,
      `- 기록 범위: ${turns.length ? `턴 ${Math.min(...turns)} ~ 턴 ${Math.max(...turns)}` : '기록 없음'}`,
      `-보낸 시각: ${metadata.exportedAt || new Date().toISOString()}`,
      `- 총 턴 수: ${list.length}`,
      ''
    ];
    const empty = '> 기록 없음';
    for (const record of list) {
      lines.push('---', '', `# 턴 ${record.turn_number}`, '');
      // 1. 플레이어 행동
      lines.push('## 플레이어 행동', '');
      lines.push(this.formatPlayerAction(record.player_action) || empty, '');
      // 2. 턴 요약
      lines.push('## 턴 요약', '');
      lines.push(typeof record.turn_summary === 'string' && record.turn_summary.trim() ? record.turn_summary : empty, '');
      // 3. 서사
      lines.push('## 서사', '');
      lines.push(typeof record.narrative_text === 'string' && record.narrative_text.trim() ? record.narrative_text : empty, '');
      // 4. 마인드 모니터
      const mind = record.mind_monitor;
      if (mind && typeof mind === 'object') {
        const name = mind.character_name || mind.character_id || '';
        lines.push(`## 마인드 모니터 — ${name}`, '');
        lines.push('### 표면의식', '', mind.surface || empty, '');
        lines.push('### 잠재의식', '', mind.inner || empty, '');
        lines.push('### 신체·행동 반응', '', mind.physical_reaction || empty, '');
      } else {
        lines.push('## 마인드 모니터', '', empty, '');
      }
      // 5. 플레이어 상황판
      lines.push('## 플레이어 상황판', '');
      lines.push(typeof record.player_status_text === 'string' && record.player_status_text.trim() ? record.player_status_text : empty, '');
      // 6. 다음 선택지
      lines.push('## 다음 선택지', '');
      const choices = Array.isArray(record.next_choices) ? record.next_choices.filter(c => typeof c === 'string' && c.trim()) : [];
      if (choices.length) {
        choices.forEach((choice, i) => lines.push(`${i + 1}. ${choice}`));
        lines.push('');
      } else {
        lines.push(empty, '');
      }
    }
    return lines.join('\n');
  },

  // ─── 순수 함수: TXT 생성 (같은 순서, 마크다운 기호 없이) ───
  buildHistoryText(records, metadata = {}) {
    const list = Array.isArray(records) ? records : [];
    const turns = list.map(r => r?.turn_number).filter(Number.isInteger);
    const empty = '(기록 없음)';
    const lines = [
      '게임빌더 v2 플레이 기록',
      '',
      `게임 제목: ${metadata.title || '(제목 없음)'}`,
      `게임 ID: ${metadata.gameId || ''}`,
      `기록 범위: ${turns.length ? `턴 ${Math.min(...turns)} ~ 턴 ${Math.max(...turns)}` : '기록 없음'}`,
      `보낸 시각: ${metadata.exportedAt || new Date().toISOString()}`,
      `총 턴 수: ${list.length}`,
      ''
    ];
    for (const record of list) {
      lines.push('========================================');
      lines.push(`턴 ${record.turn_number}`);
      lines.push('========================================', '');
      lines.push('[플레이어 행동]');
      lines.push(this.formatPlayerAction(record.player_action) || empty, '');
      lines.push('[턴 요약]');
      lines.push(typeof record.turn_summary === 'string' && record.turn_summary.trim() ? record.turn_summary : empty, '');
      lines.push('[서사]');
      lines.push(typeof record.narrative_text === 'string' && record.narrative_text.trim() ? record.narrative_text : empty, '');
      const mind = record.mind_monitor;
      if (mind && typeof mind === 'object') {
        const name = mind.character_name || mind.character_id || '';
        lines.push(`[마인드 모니터 - ${name}]`);
        lines.push('표면의식:', mind.surface || empty, '');
        lines.push('잠재의식:', mind.inner || empty, '');
        lines.push('신체·행동 반응:', mind.physical_reaction || empty, '');
      } else {
        lines.push('[마인드 모니터]', empty, '');
      }
      lines.push('[플레이어 상황판]');
      lines.push(typeof record.player_status_text === 'string' && record.player_status_text.trim() ? record.player_status_text : empty, '');
      lines.push('[다음 선택지]');
      const choices = Array.isArray(record.next_choices) ? record.next_choices.filter(c => typeof c === 'string' && c.trim()) : [];
      if (choices.length) {
        choices.forEach((choice, i) => lines.push(`${i + 1}. ${choice}`));
      } else {
        lines.push(empty);
      }
      lines.push('');
    }
    return lines.join('\n');
  },

  // ─── 캐시 관리 ───
  clearCache() {
    this.cache = { gameId: null, records: new Map(), hasMore: false, nextBeforeTurn: null, loaded: false };
  },

  onGameReset() {
    // 새 게임 초기화 후 이전 기록이 다시 나타나면 안 된다.
    this.clearCache();
    const overlay = document.getElementById('history-modal-overlay');
    if (overlay) this.renderRecords();
  },

  _ingest(records) {
    for (const record of Array.isArray(records) ? records : []) {
      if (!Number.isInteger(record?.turn_number)) continue;
      this.cache.records.set(record.turn_number, record); // turn_number 중복 제거
    }
  },

  sortedRecords() {
    return [...this.cache.records.values()].sort((a, b) => a.turn_number - b.turn_number);
  },

  // ─── API ───
  async loadPage(gameId, beforeTurn = null) {
    const result = await api.history(gameId, { limit: 20, beforeTurn });
    this._ingest(result.records);
    this.cache.hasMore = result.has_more === true;
    this.cache.nextBeforeTurn = result.next_before_turn ?? null;
    this.cache.loaded = true;
    this.cache.gameId = gameId;
    return result;
  },

  // 새 턴 Commit 뒤 다시 열 때 최신 페이지만 새로고침한다.
  async refreshLatest(gameId) {
    const result = await api.history(gameId, { limit: 20, beforeTurn: null });
    this._ingest(result.records);
    // 최신 페이지 기준으로만 더 보기 상태를 재계산한다.
    this.cache.hasMore = result.has_more === true;
    this.cache.nextBeforeTurn = result.next_before_turn ?? null;
  },

  // ─── 모달 ───
  ensureModal() {
    let overlay = document.getElementById('history-modal-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'history-modal-overlay';
    overlay.className = 'history-modal-overlay';
    overlay.innerHTML = `
      <div class="history-modal" role="dialog" aria-modal="true" aria-label="플레이 기록">
        <div class="history-modal-header">
          <h2>플레이 기록</h2>
          <button type="button" class="history-close" id="history-close" aria-label="닫기">✕ 닫기</button>
        </div>
        <div class="history-modal-actions">
          <button type="button" id="history-download-md">Markdown 다운로드</button>
          <button type="button" id="history-download-txt">TXT 다운로드</button>
        </div>
        <div class="history-error" id="history-error" role="alert" hidden></div>
        <div class="history-list" id="history-list"></div>
        <div class="history-loading" id="history-loading" role="status" hidden>기록을 불러오는 중…</div>
        <button type="button" class="history-more" id="history-more" hidden>이전 기록 더 보기</button>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => this.close();
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#history-close').addEventListener('click', close);
    overlay.querySelector('#history-more').addEventListener('click', () => this.loadMore());
    overlay.querySelector('#history-download-md').addEventListener('click', () => this.downloadAll('md'));
    overlay.querySelector('#history-download-txt').addEventListener('click', () => this.downloadAll('txt'));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('history-modal-overlay')) close();
    });
    return overlay;
  },

  open() {
    this.ensureModal();
    document.body.style.overflow = 'hidden'; // 배경 페이지 스크롤 잠금
    this.loadInitial().catch(error => this.showError(error));
  },

  close() {
    const overlay = document.getElementById('history-modal-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
  },

  toggle() {
    if (document.getElementById('history-modal-overlay')) this.close();
    else this.open();
  },

  setLoading(visible) {
    const el = document.getElementById('history-loading');
    if (el) el.hidden = !visible;
  },

  showError(error) {
    const el = document.getElementById('history-error');
    if (!el) return;
    const code = error?.status || error?.details?.error_code || 'UNKNOWN';
    el.textContent = `플레이 기록을 불러오지 못했습니다. [${code}]`;
    el.hidden = false;
    this.setLoading(false);
  },

  async loadInitial() {
    const gameId = this.cache.gameId || (typeof state !== 'undefined' ? state.gameId : null);
    if (!gameId) return;
    this.setLoading(true);
    try {
      if (!this.cache.loaded || this.cache.gameId !== gameId) {
        this.clearCache();
        await this.loadPage(gameId);
      } else {
        await this.refreshLatest(gameId);
      }
      this.renderRecords();
    } finally {
      this.setLoading(false);
    }
  },

  async loadMore() {
    const gameId = this.cache.gameId;
    if (!gameId || !this.cache.hasMore) return;
    this.setLoading(true);
    try {
      await this.loadPage(gameId, this.cache.nextBeforeTurn);
      this.renderRecords();
    } catch (error) {
      this.showError(error);
    } finally {
      this.setLoading(false);
    }
  },

  // ─── 렌더링 ───
  _section(title, bodyText) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'history-section-body';
    body.textContent = bodyText && String(bodyText).trim() ? String(bodyText) : '기록 없음';
    details.append(summary, body);
    return details;
  },

  renderRecords() {
    const listEl = document.getElementById('history-list');
    const moreEl = document.getElementById('history-more');
    if (!listEl) return;
    listEl.replaceChildren();
    const records = this.sortedRecords();
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = '저장된 플레이 기록이 없습니다.';
      listEl.appendChild(empty);
    }
    for (const record of records) {
      const card = document.createElement('div');
      card.className = 'history-turn';

      const title = document.createElement('div');
      title.className = 'history-turn-title';
      title.textContent = `턴 ${record.turn_number}`;
      card.appendChild(title);

      // 기본 표시: 플레이어 행동 + 턴 요약
      const action = document.createElement('div');
      action.className = 'history-turn-action';
      action.textContent = this.formatPlayerAction(record.player_action) || '플레이어 행동: 기록 없음';
      card.appendChild(action);

      const summary = document.createElement('div');
      summary.className = 'history-turn-summary';
      summary.textContent = record.turn_summary && record.turn_summary.trim() ? record.turn_summary : '턴 요약: 기록 없음';
      card.appendChild(summary);

      // 세부 내용은 접기 — 구조화 이전 기록은 추측 없이 원문만 표시
      const legacy = !record.narrative_text || record.narrative_text === record.content;
      card.appendChild(this._section(legacy ? '서사 (구조화 이전 기록)' : '서사', record.narrative_text));
      const mind = record.mind_monitor;
      if (mind && typeof mind === 'object') {
        const name = mind.character_name || mind.character_id || '';
        const mindDetails = document.createElement('details');
        const mindSummary = document.createElement('summary');
        mindSummary.textContent = `마인드 모니터 — ${name}`;
        const mindBody = document.createElement('div');
        mindBody.className = 'history-section-body';
        mindBody.textContent = `[${name}]\n\n표면의식\n${mind.surface || '기록 없음'}\n\n잠재의식\n${mind.inner || '기록 없음'}\n\n신체·행동 반응\n${mind.physical_reaction || '기록 없음'}`;
        const meta = document.createElement('div');
        meta.className = 'history-mind-meta';
        meta.textContent = `source: ${mind.source || 'generated'}`;
        mindDetails.append(mindSummary, mindBody, meta);
        card.appendChild(mindDetails);
      } else {
        card.appendChild(this._section('마인드 모니터', null));
      }
      card.appendChild(this._section('플레이어 상황판', record.player_status_text));
      const choices = Array.isArray(record.next_choices) ? record.next_choices.filter(c => typeof c === 'string' && c.trim()) : [];
      card.appendChild(this._section('다음 선택지', choices.length ? choices.map((c, i) => `${i + 1}. ${c}`).join('\n') : null));
      card.appendChild(this._section('원문', record.content));
      listEl.appendChild(card);
    }
    if (moreEl) moreEl.hidden = this.cache.hasMore !== true;
  },

  // ─── 전체 기록 다운로드 ───
  async fetchAllRecords(gameId) {
    const all = new Map();
    let beforeTurn = null;
    for (;;) {
      const result = await api.history(gameId, { limit: 100, beforeTurn });
      for (const record of Array.isArray(result.records) ? result.records : []) {
        if (Number.isInteger(record?.turn_number)) all.set(record.turn_number, record);
      }
      if (result.has_more !== true) break;
      beforeTurn = result.next_before_turn;
      if (!Number.isInteger(beforeTurn)) break;
    }
    return [...all.values()].sort((a, b) => a.turn_number - b.turn_number);
  },

  async downloadAll(format) {
    const gameId = this.cache.gameId || (typeof state !== 'undefined' ? state.gameId : null);
    if (!gameId) return;
    this.setLoading(true);
    try {
      const records = await this.fetchAllRecords(gameId);
      if (!records.length) {
        const el = document.getElementById('history-error');
        if (el) { el.textContent = '저장된 플레이 기록이 없습니다.'; el.hidden = false; }
        return;
      }
      const title = typeof state !== 'undefined' ? (document.getElementById('game-title')?.textContent || '') : '';
      const metadata = { title, gameId, exportedAt: new Date().toISOString() };
      const text = format === 'md' ? this.buildHistoryMarkdown(records, metadata) : this.buildHistoryText(records, metadata);
      const mime = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
      const first = records[0].turn_number;
      const last = records[records.length - 1].turn_number;
      const filename = `gamebuilder_${String(gameId).slice(0, 8)}_turns_${first}-${last}.${format}`;
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      // 다운로드 오류가 게임 입력/플레이를 막으면 안 된다 — 모달 안 오류로만 표시.
      this.showError(error);
    } finally {
      this.setLoading(false);
    }
  }
};
