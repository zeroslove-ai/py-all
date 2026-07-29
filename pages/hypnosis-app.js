// CSA-only app shell. The historical global name is retained for integration.
window.hypnosisApp = (() => {
  let overlay = null;
  let opener = null;
  let appState = null;
  let draft = null;
  let isApplying = false;
  let validationIssues = [];
  let originalBodyOverflow = '';
  let keydownHandler = null;
  let popstateHandler = null;
  let historyToken = null;
  let historyPushed = false;

  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const copy = value => JSON.parse(JSON.stringify(value || []));
  const normalizeContent = value => String(value || '').trim().replace(/\s+/g, ' ');
  const nameFor = id => appState?.npcs?.find(npc => npc.character_id === id)?.name || id;
  const beforeUnloadHandler = event => {
    if (overlay && operations().length) {
      event.preventDefault();
      event.returnValue = '';
    }
  };

  function resolveInputRoute(input) {
    const text = String(input || '').trim();
    if (!text) return null;
    const management = /추가|등록|생성|새로|적용|수정|변경|바꿔|교체|강화|약화|삭제|제거|해제|취소|끄기|켜기|활성화|비활성화|목록|확인|관리|편집/;
    if (/상식\s*개변|상식개변|상식\s*변경|개변된\s*상식/.test(text) && management.test(text)) {
      return { tab: 'csa', character_id: null, notice: '상식개변 어플을 열었습니다.' };
    }
    if (/개인\s*암시|활성\s*암시|최면/.test(text) && management.test(text)) {
      return { tab: 'csa', character_id: null, notice: 'CSA-only 버전에서는 개인 암시와 최면을 지원하지 않습니다.' };
    }
    if (/(?:상식개변|어플|앱).*(?:사용법|매뉴얼|설명|정보)|(?:사용법|매뉴얼|설명|정보).*(?:상식개변|어플|앱)/.test(text)) {
      return { tab: 'manual', character_id: null, notice: '상식개변 어플 매뉴얼을 열었습니다.' };
    }
    if (/(?:상식개변\s*)?(?:어플|앱)\s*열어|앱\s*상태\s*보여/.test(text)) {
      return { tab: 'home', character_id: null, notice: '상식개변 어플을 열었습니다.' };
    }
    return null;
  }

  function operations() {
    if (!draft) return [];
    const before = new Map((draft.originalCsa || []).map(item => [item.id, item]));
    const result = [];
    (draft.csa || []).forEach(item => {
      const content = normalizeContent(item.content);
      if (item._new) {
        result.push({ client_id: item.client_id, domain: 'csa', operation: 'activate', scope_type: item.scope_type, strength: item.strength, content });
        return;
      }
      const old = before.get(item.id);
      if (!old) return;
      if (item._deleted) {
        result.push({ client_id: `csa:${item.id}`, domain: 'csa', operation: 'deactivate', id: item.id });
        return;
      }
      const changed = content !== normalizeContent(old.content)
        || item.strength !== old.strength
        || item.scope_type !== old.scope_type;
      if (changed) result.push({ client_id: `csa:${item.id}`, domain: 'csa', operation: 'update', id: item.id, scope_type: item.scope_type, strength: item.strength, content });
    });
    return result.sort((a, b) => String(a.id || a.client_id).localeCompare(String(b.id || b.client_id)));
  }

  function showDialog(title, message, actions) {
    const shade = el('div', 'hypnosis-app-dialog-overlay');
    const box = el('div', 'hypnosis-app-dialog');
    box.setAttribute('role', 'alertdialog');
    const messageNode = el('p', '', message);
    messageNode.style.whiteSpace = 'pre-line';
    box.append(el('h3', '', title), messageNode);
    actions.forEach(action => {
      const button = el('button', 'choice-btn', action.label);
      button.onclick = () => { shade.remove(); action.run(); };
      box.appendChild(button);
    });
    shade.appendChild(box);
    overlay.appendChild(shade);
    box.querySelector('button')?.focus();
  }

  function refreshDraftBar() {
    const bar = overlay?.querySelector('.hypnosis-app-draft-bar');
    if (!bar) return;
    const count = operations().length;
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    if (count) window.addEventListener('beforeunload', beforeUnloadHandler);
    bar.replaceChildren(el('span', '', count ? `미적용 변경 ${count}건` : '변경사항 없음'));
    const reset = el('button', 'choice-btn', '모두 되돌리기');
    reset.disabled = !count || isApplying;
    reset.onclick = () => {
      draft.csa = copy(draft.originalCsa);
      validationIssues = [];
      renderTab(draft.tab);
    };
    const apply = el('button', 'choice-btn', isApplying ? '확인 중…' : '적용');
    apply.disabled = !count || state.isStreaming || isApplying;
    apply.onclick = () => applyDraft(false);
    bar.append(reset, apply);
  }

  function destroyApp() {
    if (!overlay) return;
    document.removeEventListener('keydown', keydownHandler);
    window.removeEventListener('popstate', popstateHandler);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    if (historyPushed && history.state?.hypnosisApp === historyToken) history.back();
    overlay.remove();
    overlay = null;
    appState = null;
    draft = null;
    isApplying = false;
    validationIssues = [];
    historyToken = null;
    historyPushed = false;
    document.body.style.overflow = originalBodyOverflow;
    opener?.focus?.();
    opener = null;
  }

  function requestClose() {
    if (!overlay) return;
    if (isApplying) return;
    const count = operations().length;
    if (!count) return destroyApp();
    showDialog('미적용 변경사항', `아직 적용하지 않은 변경사항이 ${count}건 있습니다.`, [
      { label: '계속 편집', run: () => {} },
      { label: '변경사항 버리기', run: destroyApp },
      { label: '적용하고 닫기', run: () => applyDraft(true) }
    ]);
  }

  function renderHome(body) {
    const home = appState.home || {};
    const grid = el('div', 'hypnosis-app-status-grid');
    const entries = [
      ['레벨', `Lv.${home.status?.level || 1}`],
      ['경험치', `${home.status?.exp || 0} / ${home.status?.next_level_exp || 0}`],
      ['상식개변', `${home.status?.csa_active || 0} / ${home.status?.csa_max || 0}`, 'csa'],
      ['현재 위치', home.current_location || '미확인'],
      ['현재 NPC', (home.current_npc_ids || []).map(nameFor).join(', ') || '없음']
    ];
    entries.forEach(([label, value, tab]) => {
      const card = el(tab ? 'button' : 'div', `hypnosis-app-card${tab ? ' hypnosis-app-card-link' : ''}`);
      if (tab) {
        card.type = 'button';
        card.onclick = () => renderTab(tab);
      }
      card.append(el('small', '', label), el('strong', '', value));
      if (tab) card.append(el('span', 'hypnosis-app-card-link-label', '관리하기 〉'));
      grid.appendChild(card);
    });
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
      card.append(el('p', '', `호감 ${stats.호감도 ?? '-'} · 신뢰 ${stats.신뢰도 ?? '-'}`));
      const find = el('button', 'choice-btn', npc.present_now ? '현재 함께 있음' : '찾아가기');
      find.disabled = npc.present_now || !npc.location?.known;
      find.onclick = async () => {
        if (operations().length) return showDialog('미적용 변경사항이 있습니다', 'NPC를 찾아가기 전에 변경사항을 적용하거나 버려야 합니다.', [{ label: '확인', run: () => {} }]);
        const action = { version: 1, type: 'find_npc', base_turn_count: appState.turn_count, character_id: npc.character_id };
        try {
          const result = await api.validateAppAction(state.gameId, action);
          destroyApp();
          window.runHypnosisStructuredAction(result.canonical_action, result.display_input);
        } catch (error) {
          showDialog('찾아갈 수 없습니다.', error.details?.error || error.message, [{ label: '확인', run: () => {} }]);
        }
      };
      card.appendChild(find);
      body.appendChild(card);
    });
  }

  function renderCsa(body) {
    const add = el('button', 'choice-btn', '+ 새 상식개변');
    const max = Number(appState.home?.status?.csa_max);
    const activeCount = (draft.csa || []).filter(item => !item._deleted).length;
    add.disabled = Number.isFinite(max) && activeCount >= max;
    add.onclick = () => {
      const defaultStrength = (appState.strength_options || []).find(option => option.available)?.id || 'weak';
      const defaultScope = (appState.scope_options || []).find(option => option.available)?.id || 'ward';
      draft.csa.push({ _new: true, client_id: `draft_csa_${crypto.randomUUID()}`, strength: defaultStrength, scope_type: defaultScope, content: '' });
      renderTab('csa');
    };
    body.appendChild(add);
    if (add.disabled) body.appendChild(el('p', 'hypnosis-app-error', '상식개변 활성 슬롯이 가득 찼습니다.'));
    if (!(draft.csa || []).filter(item => !item._deleted).length) body.appendChild(el('p', '', '현재 활성 상식개변이 없습니다.'));

    (draft.csa || []).forEach(item => {
      const card = el('article', `hypnosis-app-effect-card${item._deleted ? ' pending-delete' : ''}`);
      const header = el('div', 'hypnosis-app-effect-header');
      header.appendChild(el('strong', '', item._new ? '새 상식개변' : (item.scope_label || '상식개변')));
      const remove = el('button', 'choice-btn', item._deleted ? '해제 취소' : '해제');
      remove.onclick = () => {
        if (item._new) draft.csa.splice(draft.csa.indexOf(item), 1);
        else item._deleted = !item._deleted;
        renderTab('csa');
      };
      header.appendChild(remove);
      const strength = el('select', 'hypnosis-app-select');
      (appState.strength_options || []).forEach(option => {
        const node = el('option', '', option.available ? option.label : `${option.label} · Lv.${option.unlock_level} 잠금`);
        node.value = option.id;
        node.disabled = !option.available;
        node.selected = item.strength === option.id;
        strength.appendChild(node);
      });
      strength.onchange = () => { item.strength = strength.value; refreshDraftBar(); };
      const scope = el('select', 'hypnosis-app-select');
      (appState.scope_options || []).forEach(option => {
        const node = el('option', '', option.available ? option.label : `${option.label} · Lv.${option.unlock_level} 잠금`);
        node.value = option.id;
        node.disabled = !option.available;
        node.selected = item.scope_type === option.id;
        scope.appendChild(node);
      });
      scope.onchange = () => { item.scope_type = scope.value; refreshDraftBar(); };
      const content = el('textarea', 'hypnosis-app-textarea');
      content.value = item.content || '';
      content.disabled = item._deleted;
      content.placeholder = '이 공간에서 당연한 사회적 상식을 입력하세요.';
      content.oninput = () => { item.content = content.value; refreshDraftBar(); };
      card.append(header, strength, scope, content);
      body.appendChild(card);
    });
  }

  function appendList(root, items, ordered = false) {
    const list = el(ordered ? 'ol' : 'ul', 'app-manual-list');
    (Array.isArray(items) ? items : []).forEach(item => list.appendChild(el('li', '', String(item))));
    root.appendChild(list);
  }

  function renderManual(body) {
    const manual = appState.manual || {};
    body.append(el('h3', '', manual.title || '상식개변 어플 사용자 매뉴얼'));
    if (manual.subtitle) body.appendChild(el('p', '', manual.subtitle));
    const status = manual.status || {};
    body.appendChild(el('p', '', `Lv.${status.level || 1} · 경험치 ${status.exp || 0}/${status.next_level_exp || 0} · 강도 ${status.available_strength || '약함'} · 활성 ${status.csa_active || 0}/${status.csa_max || 0} · 범위 ${status.csa_scope_label || '-'}`));
    const quick = el('section', 'app-manual-section-body');
    quick.appendChild(el('h4', '', '빠른 사용법'));
    appendList(quick, manual.quick_start, true);
    body.appendChild(quick);
    const rules = el('section', 'app-manual-section-body');
    rules.appendChild(el('h4', '', '상식개변 규칙'));
    if (manual.common_sense?.description) rules.appendChild(el('p', '', manual.common_sense.description));
    appendList(rules, manual.common_sense?.rules);
    body.appendChild(rules);
    const effects = el('section', 'app-manual-section-body');
    effects.appendChild(el('h4', '', '현재 활성 상식개변'));
    const active = manual.active_effects?.common_sense || [];
    if (!active.length) effects.appendChild(el('p', '', '현재 활성 항목이 없습니다.'));
    active.forEach(item => effects.appendChild(el('div', 'app-manual-active-item', `[${item.scope_label} · ${item.strength}] ${item.content}`)));
    body.appendChild(effects);
  }

  function renderTab(tab) {
    if (!draft || !overlay) return;
    const safeTab = ['home', 'npc', 'csa', 'manual'].includes(tab) ? tab : 'csa';
    draft.tab = safeTab;
    const body = overlay.querySelector('.hypnosis-app-body');
    body.replaceChildren();
    if (validationIssues.length) {
      const alert = el('div', 'hypnosis-app-error');
      validationIssues.forEach(issue => alert.appendChild(el('p', '', issue.message || String(issue))));
      body.appendChild(alert);
    }
    if (safeTab === 'home') renderHome(body);
    else if (safeTab === 'npc') renderNpcs(body);
    else if (safeTab === 'csa') renderCsa(body);
    else renderManual(body);
    if (draft.notice) {
      body.prepend(el('p', 'hypnosis-app-diagnostic info', draft.notice));
      draft.notice = '';
    }
    overlay.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === safeTab)));
    refreshDraftBar();
  }

  async function applyDraft(closeAfter = false) {
    const ops = operations();
    if (!ops.length || isApplying) return;
    if (ops.some(operation => operation.operation !== 'deactivate' && !normalizeContent(operation.content))) {
      validationIssues = [{ message: '상식개변 내용을 입력해 주세요.' }];
      renderTab('csa');
      return;
    }
    isApplying = true;
    refreshDraftBar();
    const action = { version: 1, type: 'app_transaction', base_turn_count: appState.turn_count, operations: ops };
    try {
      const result = await api.validateAppAction(state.gameId, action);
      destroyApp();
      window.runHypnosisStructuredAction(result.canonical_action, result.display_input);
    } catch (error) {
      isApplying = false;
      validationIssues = error.details?.issues || [{ message: error.details?.error || error.message }];
      renderTab('csa');
    }
  }

  async function open(initialTab = 'home', options = {}) {
    const safeInitialTab = initialTab === 'suggestions' ? 'csa' : initialTab;
    if (overlay) {
      if (draft) {
        draft.notice = options.notice || '';
        renderTab(safeInitialTab);
      }
      return;
    }
    opener = document.activeElement;
    overlay = el('div', 'hypnosis-app-overlay');
    const modal = el('div', 'hypnosis-app-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'hypnosis-app-header');
    const closeButton = el('button', 'app-manual-close', '닫기');
    closeButton.onclick = requestClose;
    header.append(el('h2', '', '📱 상식개변 어플'), closeButton);
    const tabs = el('div', 'hypnosis-app-tabs');
    tabs.setAttribute('role', 'tablist');
    [['home', '홈'], ['npc', 'NPC'], ['csa', '상식개변'], ['manual', '매뉴얼']].forEach(([id, label]) => {
      const button = el('button', 'hypnosis-app-tab', label);
      button.dataset.tab = id;
      button.setAttribute('role', 'tab');
      button.onclick = () => renderTab(id);
      tabs.appendChild(button);
    });
    modal.append(header, tabs, el('div', 'hypnosis-app-body'), el('div', 'hypnosis-app-draft-bar'));
    overlay.appendChild(modal);
    overlay.onclick = event => { if (event.target === overlay) requestClose(); };
    keydownHandler = event => { if (event.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', keydownHandler);
    historyToken = crypto.randomUUID();
    history.pushState({ ...(history.state || {}), hypnosisApp: historyToken }, '', location.href);
    historyPushed = true;
    popstateHandler = () => { historyPushed = false; requestClose(); };
    window.addEventListener('popstate', popstateHandler);
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    try {
      appState = (await api.appState(state.gameId)).app;
      draft = { tab: safeInitialTab, notice: options.notice || '', originalCsa: copy(appState.common_sense), csa: copy(appState.common_sense) };
      renderTab(safeInitialTab);
    } catch (error) {
      overlay.querySelector('.hypnosis-app-body').replaceChildren(el('p', 'hypnosis-app-error', '상식개변 어플 정보를 불러오지 못했습니다.'));
    }
  }

  return { init() {}, open, close: requestClose, isOpen: () => Boolean(overlay), onGameReset: destroyApp, resolveInputRoute };
})();
