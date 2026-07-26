// Interactive hypnosis app shell. This is deliberately a local, read-only
// session: opening or switching tabs never changes game state.
window.hypnosisApp = (() => {
  let overlay = null;
  let opener = null;
  let appState = null;
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const nameFor = (id) => appState?.npcs?.find(npc => npc.character_id === id)?.name || id;

  function close() {
    if (!overlay) return;
    overlay.remove(); overlay = null; appState = null;
    opener?.focus?.(); opener = null;
  }

  function renderHome(body) {
    const home = appState.home || {};
    const grid = el('div', 'hypnosis-app-status-grid');
    const entries = [
      ['레벨', `Lv.${home.status?.level || 1}`], ['경험치', `${home.status?.exp || 0} / ${home.status?.next_level_exp || 0}`],
      ['개인 암시', `${home.status?.suggestion_active || 0} / ${home.status?.suggestion_max || 0}`],
      ['상식개변', `${home.status?.csa_active || 0} / ${home.status?.csa_max || 0}`],
      ['현재 위치', home.current_location || '미확인'], ['현재 NPC', (home.current_npc_ids || []).map(nameFor).join(', ') || '없음']
    ];
    entries.forEach(([label, value]) => { const card = el('div', 'hypnosis-app-card'); card.append(el('small', '', label), el('strong', '', value)); grid.appendChild(card); });
    body.appendChild(grid);
    (home.diagnostics || []).forEach(item => body.appendChild(el('p', `hypnosis-app-diagnostic ${item.type || ''}`, item.text)));
  }

  function renderNpcs(body) {
    (appState.npcs || []).forEach(npc => {
      const card = el('article', 'hypnosis-app-npc-card');
      card.append(el('h3', '', npc.name || npc.character_id), el('p', '', npc.role || '역할 미확인'));
      card.append(el('p', '', `마음상태: ${npc.mind?.state_label || '상태 미확인'}`));
      if (npc.mind?.surface) card.append(el('blockquote', '', npc.mind.surface));
      card.append(el('p', '', `위치: ${npc.location?.known ? npc.location.location_label : '위치 미확인'}`));
      const stats = npc.stats || {};
      card.append(el('p', '', `호감 ${stats.호감도 ?? 0} · 신뢰 ${stats.신뢰도 ?? 0} · 최면 ${stats.최면깊이 ?? 0} · 순응 ${stats.순응도 ?? 0} · 저항 ${stats.최면저항력 ?? 0}`));
      const find = el('button', 'choice-btn', npc.present_now ? '현재 함께 있음' : '찾아가기');
      find.disabled = npc.present_now || !npc.location?.known;
      find.addEventListener('click', async () => {
        const action = { version: 1, type: 'find_npc', base_turn_count: appState.turn_count, character_id: npc.character_id };
        try { const result = await api.validateAppAction(state.gameId, action); close(); window.runHypnosisStructuredAction?.(result.canonical_action, result.display_input); }
        catch (error) { window.alert(error.details?.error || error.message); }
      });
      card.appendChild(find); body.appendChild(card);
    });
  }

  function renderEffects(body, kind) {
    const list = kind === 'suggestions' ? appState.suggestions : appState.common_sense;
    if (!list?.length) { body.append(el('p', '', '현재 활성 항목이 없습니다.')); return; }
    list.forEach(item => {
      const card = el('article', 'hypnosis-app-effect-card');
      const title = kind === 'suggestions' ? `${item.character_name || nameFor(item.character_id)} · ${item.strength_label}` : `${item.scope_label} · ${item.strength_label}`;
      card.append(el('strong', '', title), el('p', '', item.content)); body.appendChild(card);
    });
  }

  function renderManual(body) {
    const manual = appState.manual || {};
    body.append(el('h3', '', manual.title || '최면 어플 사용자 매뉴얼'));
    (manual.quick_start || []).forEach(text => body.appendChild(el('p', '', text)));
    (manual.diagnostics || []).forEach(item => body.appendChild(el('p', `hypnosis-app-diagnostic ${item.type || ''}`, item.text)));
  }

  function renderTab(tab) {
    const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren();
    if (tab === 'home') renderHome(body);
    else if (tab === 'npc') renderNpcs(body);
    else if (tab === 'suggestions') renderEffects(body, 'suggestions');
    else if (tab === 'csa') renderEffects(body, 'csa');
    else renderManual(body);
    overlay.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  }

  async function open(initialTab = 'home') {
    if (overlay) return;
    opener = document.activeElement;
    overlay = el('div', 'hypnosis-app-overlay');
    const modal = el('div', 'hypnosis-app-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'hypnosis-app-header'); const title = el('h2', '', '📱 최면 어플'); const closeButton = el('button', 'app-manual-close', '닫기');
    closeButton.addEventListener('click', close); header.append(title, closeButton);
    const tabs = el('div', 'hypnosis-app-tabs'); tabs.setAttribute('role', 'tablist');
    [['home','홈'],['npc','NPC'],['suggestions','개인 암시'],['csa','상식개변'],['manual','매뉴얼']].forEach(([id,label]) => { const button = el('button', 'hypnosis-app-tab', label); button.dataset.tab=id; button.setAttribute('role','tab'); button.addEventListener('click', () => renderTab(id)); tabs.appendChild(button); });
    modal.append(header, tabs, el('div', 'hypnosis-app-body')); overlay.appendChild(modal);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', function escape(event) { if (event.key === 'Escape' && overlay) { document.removeEventListener('keydown', escape); close(); } });
    document.body.appendChild(overlay); closeButton.focus();
    try { appState = (await api.appState(state.gameId)).app; renderTab(initialTab); }
    catch (error) { const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren(el('p', 'hypnosis-app-error', '최면 어플 정보를 불러오지 못했습니다.')); }
  }
  return { init() {}, open, close, isOpen: () => Boolean(overlay), onGameReset: close };
})();
