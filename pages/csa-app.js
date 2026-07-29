window.csaApp = (() => {
  let overlay, appState, draft, opener, applying = false, bodyOverflow = '';
  let keydownHandler, popstateHandler, historyToken, historyPushed = false;
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
  const active = () => (draft?.csa || []).filter(item => !item._deleted);
  const operations = () => {
    if (!draft) return [];
    const original = new Map((draft.original || []).map(item => [item.id, item]));
    return draft.csa.flatMap(item => {
      const content = normalize(item.content);
      if (item._new) return [{ client_id: item.client_id, domain: 'csa', operation: 'activate', scope_type: item.scope_type, strength: item.strength, content }];
      const before = original.get(item.id);
      if (!before) return [];
      if (item._deleted) return [{ client_id: `csa:${item.id}`, domain: 'csa', operation: 'deactivate', id: item.id }];
      return content === normalize(before.content) && item.strength === before.strength && item.scope_type === before.scope_type
        ? [] : [{ client_id: `csa:${item.id}`, domain: 'csa', operation: 'update', id: item.id, scope_type: item.scope_type, strength: item.strength, content }];
    }).sort((a, b) => `${a.operation}:${a.id || a.client_id}`.localeCompare(`${b.operation}:${b.id || b.client_id}`));
  };
  const dirty = () => operations().length > 0;
  function dialog(title, message, actions) {
    const shade = el('div', 'csa-app-dialog-overlay');
    const box = el('div', 'csa-app-dialog');
    box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true');
    box.append(el('h3', '', title), el('p', '', message));
    actions.forEach(action => {
      const button = el('button', 'choice-btn', action.label);
      button.onclick = () => { shade.remove(); action.run?.(); };
      box.appendChild(button);
    });
    shade.appendChild(box); overlay.appendChild(shade); box.querySelector('button')?.focus();
  }
  function syncDraftBar() {
    const bar = overlay?.querySelector('.csa-app-draft-bar'); if (!bar) return;
    window.removeEventListener('beforeunload', beforeUnload);
    if (dirty()) window.addEventListener('beforeunload', beforeUnload);
    bar.replaceChildren(el('span', '', dirty() ? `미적용 변경 ${operations().length}건` : '변경사항 없음'));
    const undo = el('button', 'choice-btn', '모두 되돌리기');
    undo.disabled = !dirty() || applying;
    undo.onclick = () => { draft.csa = clone(draft.original); draft.issues = []; renderTab(draft.tab); };
    const apply = el('button', 'choice-btn', applying ? '확인 중…' : '적용');
    apply.disabled = !dirty() || applying || state.isStreaming;
    apply.onclick = applyDraft;
    bar.append(undo, apply);
  }
  function beforeUnload(event) { if (overlay && dirty()) { event.preventDefault(); event.returnValue = ''; } }
  function destroy() {
    if (!overlay) return;
    document.removeEventListener('keydown', keydownHandler); window.removeEventListener('popstate', popstateHandler); window.removeEventListener('beforeunload', beforeUnload);
    if (historyPushed && history.state?.csaApp === historyToken) history.back();
    overlay.remove(); overlay = appState = draft = null; applying = false; historyPushed = false; historyToken = null;
    document.body.style.overflow = bodyOverflow; opener?.focus?.(); opener = null;
  }
  function requestClose(reason = 'close') {
    if (!overlay || applying) return;
    if (reason === 'popstate' && !historyPushed) restoreSentinel();
    if (!dirty()) return destroy();
    dialog('미적용 변경사항', `아직 적용하지 않은 변경사항이 ${operations().length}건 있습니다.`, [
      { label: '계속 편집' }, { label: '변경사항 버리기', run: destroy }, { label: '적용하고 닫기', run: applyDraft }
    ]);
  }
  function restoreSentinel() {
    if (!overlay || historyPushed) return;
    historyToken = crypto.randomUUID(); history.pushState({ ...(history.state || {}), csaApp: historyToken }, '', location.href); historyPushed = true;
  }
  function renderHome(body) {
    const home = appState.home || {}, status = home.status || {}, grid = el('div', 'csa-app-status-grid');
    [['레벨', `Lv.${status.level || 1}`], ['경험치', `${status.exp || 0}/${status.next_level_exp || 0}`], ['상식개변', `${status.csa_active || 0}/${status.csa_max || 0}`, 'csa'], ['현재 위치', home.current_location || '미확인']].forEach(([label, value, tab]) => {
      const card = el(tab ? 'button' : 'div', `csa-app-card${tab ? ' csa-app-card-link' : ''}`);
      if (tab) { card.type = 'button'; card.onclick = () => renderTab(tab); card.setAttribute('aria-label', '상식개변 관리하기'); }
      card.append(el('small', '', label), el('strong', '', value)); if (tab) card.append(el('span', 'csa-app-card-link-label', '관리하기 〉')); grid.appendChild(card);
    });
    body.appendChild(grid); (home.diagnostics || []).forEach(item => body.appendChild(el('p', `csa-app-diagnostic ${item.type || ''}`, item.text)));
  }
  function renderNpcs(body) {
    (appState.npcs || []).forEach(npc => {
      const card = el('article', 'csa-app-npc-card'); card.append(el('h3', '', npc.name || 'NPC'), el('p', '', npc.role || '역할 미확인'));
      card.append(el('p', '', `마음상태: ${npc.mind?.state_label || '상태 미확인'}`));
      if (npc.mind?.surface) card.append(el('blockquote', '', npc.mind.surface));
      card.append(el('p', '', `위치: ${npc.location?.known ? npc.location.location_label : '위치 미확인'}`));
      const find = el('button', 'choice-btn', npc.present_now ? '현재 함께 있음' : '찾아가기');
      find.disabled = applying || npc.present_now || !npc.location?.known;
      find.onclick = async () => {
        if (dirty()) return dialog('미적용 변경사항이 있습니다', 'NPC를 찾아가기 전에 변경사항을 적용하거나 버려야 합니다.', [{ label: '계속 편집' }]);
        applying = true; renderTab('npc');
        try { const result = await api.validateAppAction(state.gameId, { version: 1, type: 'find_npc', base_turn_count: appState.turn_count, character_id: npc.character_id });
          if (typeof window.runCsaStructuredAction !== 'function') throw new Error('구조화된 행동 실행 기능을 찾을 수 없습니다.');
          destroy(); window.runCsaStructuredAction(result.canonical_action, result.display_input);
        } catch (error) { applying = false; draft.issues = error.details?.issues || [{ message: error.details?.error || error.message }]; renderTab('npc'); }
      };
      card.appendChild(find); body.appendChild(card);
    });
  }
  function renderCsa(body) {
    const max = Number(appState.home?.status?.csa_max), add = el('button', 'choice-btn', '+ 상식개변 추가');
    add.disabled = applying || (Number.isFinite(max) && active().length >= max);
    add.onclick = () => { const strength = (appState.strength_options || []).find(item => item.available)?.id; const scope = (appState.scope_options || []).find(item => item.available)?.id;
      if (!strength || !scope) return; draft.csa.push({ _new: true, client_id: `draft_csa_${crypto.randomUUID()}`, strength, scope_type: scope, content: '' }); renderTab('csa'); };
    body.appendChild(add); if (add.disabled && active().length >= max) body.appendChild(el('p', 'csa-app-error', '활성 슬롯이 가득 찼습니다. 기존 항목을 해제한 뒤 추가해 주세요.'));
    if (!active().length) body.appendChild(el('p', '', '현재 활성 상식개변이 없습니다.'));
    draft.csa.forEach(item => {
      const card = el('article', `csa-app-effect-card${item._deleted ? ' pending-delete' : ''}`), header = el('div', 'csa-app-effect-header');
      header.append(el('strong', '', item._new ? '신규 상식개변' : item.scope_label || '상식개변'));
      const toggle = el('button', 'choice-btn', item._deleted ? '해제 취소' : '해제'); toggle.disabled = applying;
      toggle.onclick = () => { if (item._new) draft.csa.splice(draft.csa.indexOf(item), 1); else item._deleted = !item._deleted; renderTab('csa'); };
      header.appendChild(toggle);
      const strength = el('select', 'csa-app-select'), scope = el('select', 'csa-app-select'), content = el('textarea', 'csa-app-textarea');
      (appState.strength_options || []).forEach(option => { const optionNode = el('option', '', option.available || item.strength === option.id ? option.label : `${option.label} · Lv.${option.unlock_level}`); optionNode.value = option.id; optionNode.disabled = !option.available && item.strength !== option.id; optionNode.selected = item.strength === option.id; strength.appendChild(optionNode); });
      (appState.scope_options || []).forEach(option => { const optionNode = el('option', '', option.available || item.scope_type === option.id ? option.label : `${option.label} · Lv.${option.unlock_level}`); optionNode.value = option.id; optionNode.disabled = !option.available && item.scope_type !== option.id; optionNode.selected = item.scope_type === option.id; scope.appendChild(optionNode); });
      content.value = item.content || ''; content.placeholder = '이 공간에서 적용할 사회적 상식을 입력하세요.';
      [strength, scope, content].forEach(node => node.disabled = item._deleted || applying);
      strength.onchange = () => { item.strength = strength.value; syncDraftBar(); }; scope.onchange = () => { item.scope_type = scope.value; syncDraftBar(); }; content.oninput = () => { item.content = content.value; syncDraftBar(); };
      card.append(header, strength, scope, content); body.appendChild(card);
    });
  }
  function section(body, title, draw, open = false) { const details = el('details', 'app-manual-section'); details.open = open; details.appendChild(el('summary', '', title)); const inner = el('div', 'app-manual-section-body'); draw(inner); details.appendChild(inner); body.appendChild(details); }
  function list(root, items, ordered = false) { const node = el(ordered ? 'ol' : 'ul', 'app-manual-list'); (items || []).forEach(item => node.appendChild(el('li', '', typeof item === 'string' ? item : item?.text || ''))); root.appendChild(node); }
  function renderManual(body) {
    const manual = appState.manual || {}; body.append(el('h3', '', manual.title || '상식개변 어플 매뉴얼')); if (manual.subtitle) body.append(el('p', '', manual.subtitle));
    section(body, '현재 어플 상태', root => { const status = manual.status || {}; root.append(el('p', '', `Lv.${status.level || 1} · 경험치 ${status.exp || 0}/${status.next_level_exp || 0} · 활성 ${status.csa_active || 0}/${status.csa_max || 0} · 범위 ${status.csa_scope_label || '-'}`)); }, true);
    section(body, '현재 상태 진단', root => (manual.diagnostics || []).forEach(item => root.append(el('p', `csa-app-diagnostic ${item.type || ''}`, item.text))), true);
    section(body, '빠른 사용법', root => list(root, manual.quick_start, true), true);
    section(body, '상식개변 규칙', root => { if (manual.common_sense?.description) root.append(el('p', '', manual.common_sense.description)); list(root, manual.common_sense?.rules); root.append(el('p', '', `현재 범위: ${manual.common_sense?.current_scope?.label || '-'}`)); });
    section(body, '상식개변 강도별 예시', root => (manual.common_sense?.tiers || []).forEach(tier => { root.append(el('h4', '', `${tier.label}${tier.available ? '' : ` · Lv.${tier.unlock_level} 잠금`}`)); if (tier.description) root.append(el('p', '', tier.description)); list(root, tier.examples, true); }));
    section(body, 'NPC 수치 설명', root => (manual.stats || []).forEach(stat => root.append(el('p', '', `${stat.label} (${stat.range}) · ${stat.description}`))));
    section(body, '레벨·해금 기능', root => (manual.unlocks || []).forEach(unlock => { root.append(el('h4', '', `Lv.${unlock.level}`)); list(root, unlock.items); }));
    section(body, '현재 활성 상식개변', root => { const effects = manual.active_effects?.common_sense || []; if (!effects.length) root.append(el('p', '', '현재 활성 상식개변이 없습니다.')); effects.forEach(item => root.append(el('p', 'app-manual-active-item', `[${item.scope_label} · ${item.strength}] ${item.content}`))); });
    section(body, '자주 발생하는 실패 원인', root => (manual.common_failures || []).forEach(item => { root.append(el('h4', '', item.title)); list(root, item.reasons); }));
  }
  function renderTab(tab) {
    if (!overlay || !draft) return; draft.tab = ['home', 'npc', 'csa', 'manual'].includes(tab) ? tab : 'home'; const body = overlay.querySelector('.csa-app-body'); body.replaceChildren();
    (draft.issues || []).forEach(issue => body.appendChild(el('p', 'csa-app-error', issue.message || String(issue))));
    ({ home: renderHome, npc: renderNpcs, csa: renderCsa, manual: renderManual })[draft.tab](body);
    if (draft.notice) { body.prepend(el('p', 'csa-app-diagnostic info', draft.notice)); draft.notice = ''; }
    overlay.querySelectorAll('[role="tab"]').forEach(node => node.setAttribute('aria-selected', String(node.dataset.tab === draft.tab))); syncDraftBar();
  }
  async function applyDraft() {
    const ops = operations(); if (!ops.length || applying) return;
    if (ops.some(item => item.operation !== 'deactivate' && !normalize(item.content))) { draft.issues = [{ message: '상식개변 내용을 입력해 주세요.' }]; return renderTab('csa'); }
    applying = true; renderTab(draft.tab);
    try { const result = await api.validateAppAction(state.gameId, { version: 1, type: 'app_transaction', base_turn_count: appState.turn_count, operations: ops });
      if (typeof window.runCsaStructuredAction !== 'function') throw new Error('구조화된 행동 실행 기능을 찾을 수 없습니다.');
      destroy(); window.runCsaStructuredAction(result.canonical_action, result.display_input);
    } catch (error) { applying = false; draft.issues = error.details?.issues || [{ message: error.details?.error || error.message }]; renderTab('csa'); }
  }
  function resolveInputRoute(input) {
    const text = String(input || '').trim(); if (!text) return null;
    if (/개인\s*암시|최면/.test(text)) return { tab: 'csa', character_id: null, notice: '이 버전에서는 상식개변만 관리할 수 있습니다.' };
    if (/상식\s*개변|상식\s*변경/.test(text) && /추가|등록|생성|수정|변경|삭제|해제|목록|확인|관리|편집/.test(text)) return { tab: 'csa', character_id: null, notice: '상식개변 관리 화면을 열었습니다.' };
    if (/어플|앱/.test(text) && /사용법|매뉴얼|설명|정보/.test(text)) return { tab: 'manual', character_id: null, notice: '상식개변 어플 매뉴얼을 열었습니다.' };
    if (/어플|앱/.test(text)) return { tab: 'home', character_id: null, notice: '상식개변 어플을 열었습니다.' };
    return null;
  }
  async function open(initialTab = 'home', options = {}) {
    if (overlay) { draft.notice = options.notice || ''; renderTab(initialTab); return; }
    opener = document.activeElement; overlay = el('div', 'csa-app-overlay'); const modal = el('div', 'csa-app-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'csa-app-header'), close = el('button', 'app-manual-close', '닫기'); close.setAttribute('aria-label', '상식개변 어플 닫기'); close.onclick = () => requestClose(); header.append(el('h2', '', '📱 상식개변 어플'), close);
    const tabs = el('div', 'csa-app-tabs'); tabs.setAttribute('role', 'tablist'); [['home', '홈'], ['npc', 'NPC'], ['csa', '상식개변'], ['manual', '매뉴얼']].forEach(([id, label]) => { const button = el('button', 'csa-app-tab', label); button.dataset.tab = id; button.setAttribute('role', 'tab'); button.onclick = () => renderTab(id); tabs.appendChild(button); });
    modal.append(header, tabs, el('div', 'csa-app-body'), el('div', 'csa-app-draft-bar')); overlay.appendChild(modal); overlay.onclick = event => { if (event.target === overlay) requestClose(); };
    keydownHandler = event => { if (event.key === 'Escape') requestClose(); }; document.addEventListener('keydown', keydownHandler);
    historyToken = crypto.randomUUID(); history.pushState({ ...(history.state || {}), csaApp: historyToken }, '', location.href); historyPushed = true; popstateHandler = () => { historyPushed = false; requestClose('popstate'); }; window.addEventListener('popstate', popstateHandler);
    bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.appendChild(overlay);
    try { appState = (await api.appState(state.gameId)).app; draft = { tab: initialTab, notice: options.notice || '', original: clone(appState.common_sense), csa: clone(appState.common_sense), issues: [] }; renderTab(initialTab); } catch (error) { overlay.querySelector('.csa-app-body').append(el('p', 'csa-app-error', '상식개변 어플 정보를 불러오지 못했습니다.')); }
  }
  return { init() {}, open, close: requestClose, isOpen: () => Boolean(overlay), onGameReset: destroy, resolveInputRoute };
})();
