// Interactive hypnosis app shell. This is deliberately a local, read-only
// session: opening or switching tabs never changes game state.
window.hypnosisApp = (() => {
  let overlay = null;
  let opener = null;
  let appState = null;
  let draft = null;
  let isApplying = false;
  const selectedSuggestionIds = new Set();
  const selectedCsaIds = new Set();
  let keydownHandler = null;
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const nameFor = (id) => appState?.npcs?.find(npc => npc.character_id === id)?.name || id;
  const copy = value => JSON.parse(JSON.stringify(value || []));
  const normalizeDraftContent = value => String(value || '').trim().replace(/\s+/g, ' ');

  function operations() {
    if (!draft) return [];
    const result = [];
    const compare = (original, current, domain) => {
      const before = new Map((original || []).map(item => [item.id, item]));
      (current || []).forEach(item => {
        const content = normalizeDraftContent(item.content);
        if (item._new) { result.push({ client_id: item.client_id, domain, operation: 'activate', ...(domain === 'suggestion' ? { character_id: item.character_id } : { scope_type: item.scope_type }), strength: item.strength, content }); return; }
        const old = before.get(item.id);
        if (!old) return;
        if (item._deleted) { result.push({ client_id: `${domain}:${item.id}`, domain, operation: 'deactivate', ...(domain === 'suggestion' ? { character_id: item.character_id } : {}), id: item.id }); return; }
        const changed = content !== normalizeDraftContent(old.content) || item.strength !== old.strength || (domain === 'csa' && item.scope_type !== old.scope_type);
        if (changed) result.push({ client_id: `${domain}:${item.id}`, domain, operation: 'update', ...(domain === 'suggestion' ? { character_id: item.character_id } : {}), id: item.id, strength: item.strength, content, ...(domain === 'csa' ? { scope_type: item.scope_type } : {}) });
      });
    };
    compare(draft.originalSuggestions, draft.suggestions, 'suggestion'); compare(draft.originalCsa, draft.csa, 'csa');
    const order = { 'suggestion:deactivate':0, 'csa:deactivate':1, 'suggestion:update':2, 'csa:update':3, 'suggestion:activate':4, 'csa:activate':5 };
    return result.sort((a,b) => order[`${a.domain}:${a.operation}`] - order[`${b.domain}:${b.operation}`] || String(a.id || a.client_id).localeCompare(String(b.id || b.client_id)));
  }
  function refreshDraftBar() { const bar = overlay?.querySelector('.hypnosis-app-draft-bar'); if (!bar) return; const count = operations().length; bar.replaceChildren(el('span', '', count ? `미적용 변경 ${count}건` : '변경사항 없음')); const reset = el('button', 'choice-btn', '모두 되돌리기'); reset.disabled=!count; reset.onclick=()=>{ draft.suggestions=copy(draft.originalSuggestions); draft.csa=copy(draft.originalCsa); renderTab(draft.tab); }; const apply=el('button','choice-btn','적용'); apply.disabled=!count || state.isStreaming; apply.onclick=applyDraft; bar.append(reset,apply); }

  function showDialog(title, message, actions) { const shade=el('div','hypnosis-app-dialog-overlay'); const box=el('div','hypnosis-app-dialog'); box.setAttribute('role','alertdialog'); box.append(el('h3','',title),el('p','',message)); actions.forEach(action=>{const b=el('button','choice-btn',action.label);b.onclick=()=>{shade.remove();action.run();};box.appendChild(b);});shade.appendChild(box);overlay.appendChild(shade);box.querySelector('button')?.focus(); }
  function destroyApp() { if (!overlay) return; document.removeEventListener('keydown', keydownHandler); overlay.remove(); overlay=null; appState=null; draft=null; isApplying=false; selectedSuggestionIds.clear(); selectedCsaIds.clear(); opener?.focus?.(); opener=null; document.body.style.overflow=''; }
  function requestClose() { if (!overlay || isApplying) return; const count=operations().length; if (!count) return destroyApp(); showDialog('미적용 변경사항',`아직 적용하지 않은 변경사항이 ${count}건 있습니다. 적용하시겠습니까?`,[{label:'계속 편집',run:()=>{}},{label:'변경사항 버리기',run:destroyApp},{label:'적용하고 닫기',run:()=>applyDraft(true)}]); }
  function forceCloseAfterValidation() { destroyApp(); }

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
        if (isApplying) return;
        if (operations().length) return showDialog('미적용 변경사항이 있습니다','NPC를 찾아가기 전에 변경사항을 적용하거나 버려야 합니다.',[{label:'계속 편집',run:()=>{}},{label:'버리고 찾아가기',run:()=>{ draft.suggestions=copy(draft.originalSuggestions); draft.csa=copy(draft.originalCsa); find.click(); }},{label:'변경사항 적용',run:applyDraft}]);
        if (typeof window.runHypnosisStructuredAction !== 'function') return showDialog('오류','구조화 턴 실행 함수를 찾지 못했습니다.',[{label:'확인',run:()=>{}}]);
        isApplying=true; find.disabled=true; find.textContent='위치 확인 중…';
        try { const result = await api.validateAppAction(state.gameId, action); forceCloseAfterValidation(); window.runHypnosisStructuredAction(result.canonical_action, result.display_input); }
        catch (error) { isApplying=false; find.disabled=false; find.textContent='찾아가기'; showDialog('찾아갈 수 없습니다.',error.details?.error||error.message,[{label:'확인',run:()=>{}}]); }
      });
      card.appendChild(find); body.appendChild(card);
    });
  }

  function renderEffects(body, kind) {
    const domain = kind === 'suggestions' ? 'suggestion' : 'csa';
    const list = domain === 'suggestion' ? draft.suggestions : draft.csa;
    const add = el('button', 'choice-btn', domain === 'suggestion' ? '+ 새 개인 암시' : '+ 새 상식개변');
    if (domain === 'suggestion') {
      const current = appState.npcs?.find(npc => npc.can_add_suggestion);
      add.disabled = !current; add.onclick = () => { if (!current) return; draft.suggestions.push({ _new:true, client_id:`draft_suggestion_${crypto.randomUUID()}`, character_id:current.character_id, strength:'weak', content:'' }); renderTab(kind); };
    } else add.onclick = () => { draft.csa.push({ _new:true, client_id:`draft_csa_${crypto.randomUUID()}`, strength:'weak', scope_type:'ward', content:'' }); renderTab(kind); };
    body.appendChild(add);
    if (!list?.filter(item => !item._deleted).length) body.append(el('p', '', '현재 활성 항목이 없습니다.'));
    list.forEach(item => {
      if (item._deleted) return;
      const card = el('article', 'hypnosis-app-effect-card');
      const title = domain === 'suggestion' ? `${item.character_name || nameFor(item.character_id)} · ${item.strength_label || item.strength}` : `${item.scope_label || item.scope_type} · ${item.strength_label || item.strength}`;
      const strength = el('select'); ['weak','medium','strong'].forEach(value => { const option=el('option','',value === 'weak' ? '약함' : value === 'medium' ? '중간' : '강함'); option.value=value; option.selected=item.strength===value; strength.appendChild(option); });
      const content = el('textarea'); content.value=item.content || ''; content.rows=3;
      strength.onchange=()=>{ item.strength=strength.value; refreshDraftBar(); }; content.oninput=()=>{ item.content=content.value.trim().replace(/\s+/g,' '); refreshDraftBar(); };
      const remove=el('button','choice-btn',item._new?'취소':'해제'); remove.onclick=()=>{ if(item._new){ const target=domain==='suggestion'?draft.suggestions:draft.csa; target.splice(target.indexOf(item),1); } else item._deleted=true; renderTab(kind); };
      card.append(el('strong','',title),strength,content,remove); body.appendChild(card);
    });
  }

  async function applyDraft() {
    const requested = operations(); if (!requested.length) return;
    const action = { version:1, type:'app_transaction', base_turn_count:appState.turn_count, operations:requested };
    if (isApplying) return;
    const proceed = async () => { if (typeof window.runHypnosisStructuredAction !== 'function') return showDialog('오류','구조화 턴 실행 함수를 찾지 못했습니다.',[{label:'확인',run:()=>{}}]); isApplying=true; refreshDraftBar(); try { const result=await api.validateAppAction(state.gameId,action); if(!result?.canonical_action||!result?.display_input) throw new Error('검증 응답이 올바르지 않습니다.'); forceCloseAfterValidation(); window.runHypnosisStructuredAction(result.canonical_action,result.display_input); } catch(error) { isApplying=false; refreshDraftBar(); showDialog('변경사항을 적용할 수 없습니다.',error.details?.issues?.map(issue=>issue.message).join('\n')||error.details?.error||error.message,[{label:'계속 편집',run:()=>{}}]); } };
    showDialog('변경사항 적용',`전체 변경사항 ${requested.length}건을 게임 1턴으로 처리합니다.`,[{label:'계속 편집',run:()=>{}},{label:'적용',run:proceed}]);
  }

  function renderManual(body) {
    const manual = appState.manual || {};
    body.append(el('h3', '', manual.title || '최면 어플 사용자 매뉴얼'));
    (manual.quick_start || []).forEach(text => body.appendChild(el('p', '', text)));
    (manual.diagnostics || []).forEach(item => body.appendChild(el('p', `hypnosis-app-diagnostic ${item.type || ''}`, item.text)));
  }

  function renderTab(tab) {
    draft.tab = tab;
    const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren();
    if (tab === 'home') renderHome(body);
    else if (tab === 'npc') renderNpcs(body);
    else if (tab === 'suggestions') renderEffects(body, 'suggestions');
    else if (tab === 'csa') renderEffects(body, 'csa');
    else renderManual(body);
    overlay.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    refreshDraftBar();
  }

  async function open(initialTab = 'home') {
    if (overlay) return;
    opener = document.activeElement;
    overlay = el('div', 'hypnosis-app-overlay');
    const modal = el('div', 'hypnosis-app-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'hypnosis-app-header'); const title = el('h2', '', '📱 최면 어플'); const closeButton = el('button', 'app-manual-close', '닫기');
    closeButton.addEventListener('click', requestClose); header.append(title, closeButton);
    const tabs = el('div', 'hypnosis-app-tabs'); tabs.setAttribute('role', 'tablist');
    [['home','홈'],['npc','NPC'],['suggestions','개인 암시'],['csa','상식개변'],['manual','매뉴얼']].forEach(([id,label]) => { const button = el('button', 'hypnosis-app-tab', label); button.dataset.tab=id; button.setAttribute('role','tab'); button.addEventListener('click', () => renderTab(id)); tabs.appendChild(button); });
    const draftBar = el('div', 'hypnosis-app-draft-bar'); modal.append(header, tabs, el('div', 'hypnosis-app-body'), draftBar); overlay.appendChild(modal);
    overlay.addEventListener('click', event => { if (event.target === overlay) requestClose(); });
    keydownHandler = event => { if (event.key === 'Escape' && overlay && !overlay.querySelector('.hypnosis-app-dialog-overlay')) requestClose(); };
    document.addEventListener('keydown', keydownHandler);
    document.body.style.overflow='hidden';
    document.body.appendChild(overlay); closeButton.focus();
    try { appState = (await api.appState(state.gameId)).app; draft = { tab: initialTab, originalSuggestions: copy(appState.suggestions), originalCsa: copy(appState.common_sense), suggestions: copy(appState.suggestions), csa: copy(appState.common_sense) }; renderTab(initialTab); }
    catch (error) { const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren(el('p', 'hypnosis-app-error', '최면 어플 정보를 불러오지 못했습니다.')); }
  }
  return { init() {}, open, close: requestClose, isOpen: () => Boolean(overlay), onGameReset: destroyApp };
})();
