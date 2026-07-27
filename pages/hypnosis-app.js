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
  let popstateHandler = null;
  let historyToken = null;
  let historyPushed = false;
  let restoringHistory = false;
  let validationIssues = [];
  let originalBodyOverflow = '';
  let requestedCharacterId = null;
  let selectedSuggestionTargetId = null;
  let appNotice = '';
  const beforeUnloadHandler = event => { if (overlay && operations().length) { event.preventDefault(); event.returnValue = ''; } };
  const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const nameFor = (id) => appState?.npcs?.find(npc => npc.character_id === id)?.name || id;
  const copy = value => JSON.parse(JSON.stringify(value || []));
  const normalizeDraftContent = value => String(value || '').trim().replace(/\s+/g, ' ');
  const suggestionNeedsResolution = item => {
    if (item?._new) return true;
    const original = (draft?.originalSuggestions || []).find(row => row.id === item?.id);
    return Boolean(original) && (normalizeDraftContent(original.content) !== normalizeDraftContent(item.content) || original.strength !== item.strength);
  };
  const suggestionChance = item => {
    if (!suggestionNeedsResolution(item) || item?._deleted) return null;
    const npc = (appState?.npcs || []).find(row => row.character_id === item.character_id);
    const chance = npc?.suggestion_success_chance?.[item.strength];
    return Number.isInteger(chance) ? chance : null;
  };
  const currentSuggestionTargets = () => (appState?.npcs || []).filter(npc => npc?.present_now === true && npc?.can_add_suggestion === true && typeof npc.character_id === 'string');
  function resolveDefaultSuggestionTarget() {
    const candidates = currentSuggestionTargets();
    return candidates.find(npc => npc.character_id === requestedCharacterId)
      || candidates.find(npc => npc.character_id === selectedSuggestionTargetId)
      || (candidates.length === 1 ? candidates[0] : null);
  }
  function addSuggestionDraft(targetNpc) {
    if (!targetNpc?.can_add_suggestion) return;
    const defaultStrength = (appState.strength_options || []).find(option => option.available)?.id || 'weak';
    const clientId=`draft_suggestion_${crypto.randomUUID()}`;
    draft.suggestions.push({ _new:true, client_id:clientId, character_id:targetNpc.character_id, character_name:targetNpc.name || '', strength:defaultStrength, content:'' });
    selectedSuggestionTargetId=targetNpc.character_id;
    requestedCharacterId=targetNpc.character_id;
    validationIssues=[];
    renderTab('suggestions');
    requestAnimationFrame(() => {
      const card = [...overlay.querySelectorAll('[data-client-id]')].find(node => node.dataset.clientId === clientId);
      card?.scrollIntoView({ block:'center' });
      card?.querySelector('textarea')?.focus();
    });
  }

  function resolveInputRoute(input, characters = {}) {
    const text = String(input || '').trim(); if (!text) return null;
    const negative = /하지\s*않|하지\s*말|말라고|할까|고민|생각해\s*본다|떠올린다|과거|예전에|말했다|물었다|NPC에게\s*묻|뜻이\s*뭐|무엇인지/.test(text) && !/수정|변경|바꿔|교체|강화|약화/.test(text);
    const names = Object.entries(characters || {}).filter(([, value]) => typeof value?.name === 'string' && value.name.trim());
    const hit = names.find(([, value]) => text.includes(value.name.trim()));
    const character_id = hit?.[0] || null;
    const action = /추가|등록|생성|새로|걸어|건다|적용|수정|변경|바꿔|교체|강화|약화|삭제|제거|해제|취소|끄기|켜기|활성화|비활성화|전부\s*(?:지워|해제)|모두\s*(?:지워|해제)|목록|확인|관리|편집/;
    const hasSuggestion = /개인\s*암시|활성\s*암시|암시/.test(text);
    const hasCsa = /상식\s*개변|상식개변|상식\s*변경|개변된\s*상식/.test(text);
    if (!negative && hasSuggestion && action.test(text)) return { tab:'suggestions', character_id, notice: character_id ? `${names.find(([id])=>id===character_id)?.[1]?.name || ''}의 개인 암시 관리 화면을 열었습니다.` : '개인 암시는 최면 어플에서 관리합니다.' };
    if (!negative && hasCsa && action.test(text)) return { tab:'csa', character_id:null, notice:'상식개변은 최면 어플에서 관리합니다.' };
    if (/최면\s*(?:어플|앱)\s*(?:사용법|매뉴얼)|어플\s*설명|암시\s*단계\s*설명|상식개변\s*사용법/.test(text)) return { tab:'manual', character_id:null, notice:'최면 어플 매뉴얼을 열었습니다.' };
    if (/최면\s*(?:어플|앱)\s*열어|어플\s*열어|앱\s*상태\s*보여/.test(text)) return { tab:'home', character_id:null, notice:'최면 어플을 열었습니다.' };
    return null;
  }

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
  function refreshDraftBar() { const bar = overlay?.querySelector('.hypnosis-app-draft-bar'); if (!bar) return; const count = operations().length; window.removeEventListener('beforeunload', beforeUnloadHandler); if (count) window.addEventListener('beforeunload', beforeUnloadHandler); bar.replaceChildren(el('span', '', count ? `미적용 변경 ${count}건` : '변경사항 없음')); const reset = el('button', 'choice-btn', '모두 되돌리기'); reset.disabled=!count || isApplying; reset.onclick=()=>{ draft.suggestions=copy(draft.originalSuggestions); draft.csa=copy(draft.originalCsa); selectedSuggestionIds.clear(); selectedCsaIds.clear(); validationIssues=[]; renderTab(draft.tab); }; const apply=el('button','choice-btn',isApplying?'확인 중…':'적용'); apply.disabled=!count || state.isStreaming || isApplying; apply.onclick=applyDraft; bar.append(reset,apply); }

  function showDialog(title, message, actions) { const shade=el('div','hypnosis-app-dialog-overlay'); const box=el('div','hypnosis-app-dialog'); box.setAttribute('role','alertdialog'); const messageNode=el('p','',message); messageNode.style.whiteSpace='pre-line'; box.append(el('h3','',title),messageNode); actions.forEach(action=>{const b=el('button','choice-btn',action.label);b.onclick=()=>{shade.remove();action.run();};box.appendChild(b);});shade.appendChild(box);overlay.appendChild(shade);box.querySelector('button')?.focus(); }
  function restoreHistorySentinel() { if (!overlay || historyPushed) return; history.pushState({ ...(history.state||{}), hypnosisApp:historyToken },'',location.href); historyPushed=true; }
  function destroyApp() { if (!overlay) return; document.removeEventListener('keydown', keydownHandler); window.removeEventListener('popstate', popstateHandler); window.removeEventListener('beforeunload', beforeUnloadHandler); if (historyPushed && history.state?.hypnosisApp === historyToken) history.back(); overlay.remove(); overlay=null; appState=null; draft=null; isApplying=false; selectedSuggestionIds.clear(); selectedCsaIds.clear(); validationIssues=[]; selectedSuggestionTargetId=null; historyToken=null; historyPushed=false; opener?.focus?.(); opener=null; document.body.style.overflow=originalBodyOverflow; originalBodyOverflow=''; }
  function requestClose(reason='close_button') { if (!overlay) return; if (reason==='popstate') restoreHistorySentinel(); if (isApplying) return showDialog('확인 중','현재 변경사항을 확인하고 있습니다.',[{label:'확인',run:()=>{}}]); const count=operations().length; if (!count) return destroyApp(); showDialog('미적용 변경사항',`아직 적용하지 않은 변경사항이 ${count}건 있습니다. 적용하시겠습니까?`,[{label:'계속 편집',run:()=>{}},{label:'변경사항 버리기',run:destroyApp},{label:'적용하고 닫기',run:()=>applyDraft(true)}]); }
  function forceCloseAfterValidation() { destroyApp(); }

  function renderHome(body) {
    const home = appState.home || {};
    const grid = el('div', 'hypnosis-app-status-grid');
    const entries = [
      ['레벨', `Lv.${home.status?.level || 1}`], ['경험치', `${home.status?.exp || 0} / ${home.status?.next_level_exp || 0}`],
      ['개인 암시', `${home.status?.suggestion_active || 0} / ${home.status?.suggestion_max || 0}`, 'suggestions'],
      ['상식개변', `${home.status?.csa_active || 0} / ${home.status?.csa_max || 0}`, 'csa'],
      ['현재 위치', home.current_location || '미확인'], ['현재 NPC', (home.current_npc_ids || []).map(nameFor).join(', ') || '없음']
    ];
    entries.forEach(([label, value, tab]) => { const card = el(tab ? 'button' : 'div', `hypnosis-app-card${tab ? ' hypnosis-app-card-link' : ''}`); if (tab) { card.type='button'; card.setAttribute('aria-label', `${label} 관리하기`); card.addEventListener('click',()=>renderTab(tab)); } card.append(el('small', '', label), el('strong', '', value)); if (tab) card.append(el('span','hypnosis-app-card-link-label','관리하기 〉')); grid.appendChild(card); });
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
      const details = el('details','hypnosis-app-npc-details');
      details.appendChild(el('summary','', '상세정보'));
      const section = (title, rows, className='') => { const root=el('section',`hypnosis-app-detail-section ${className}`); root.appendChild(el('h4','',title)); rows.filter(([,value])=>value!==null&&value!==undefined&&value!=='').forEach(([label,value])=>root.appendChild(el('p','hypnosis-app-record-row',`${label}: ${value}`))); return root; };
      const withUnit=(value,unit)=> value===null||value===undefined||value==='' ? '' : (new RegExp(`${unit}$`,'i').test(String(value).trim()) ? String(value).trim() : `${value}${unit}`);
      const profile=npc.profile||{}, npcBody=npc.body||{}, record=npc.relationship_record||{}, privateInfo=npc.private_info||{unlocked:false};
      details.appendChild(section('인물정보',[['이름',npc.name],['나이',withUnit(profile.age,'세')],['소속',profile.affiliation],['직책',profile.role]]));
      details.appendChild(section('신체정보',[['키',withUnit(npcBody.height_cm,'cm')],['몸무게',withUnit(npcBody.weight_kg,'kg')],['체형',npcBody.body_type],['가슴',npcBody.cup]]));
      details.appendChild(section('현재 상태',[['마음상태',npc.mind?.state_label || '상태 미확인'],['위치',npc.location?.known ? npc.location.location_label : '위치 미확인'],['활성 개인 암시',`${npc.active_suggestion_count || 0}개`]]));
      details.appendChild(section('관계 기록',[['플레이어 사정 횟수',`${record.player_ejaculation_count || 0}회`],[`${npc.name || 'NPC'} 오르가즘 횟수`,`${record.npc_orgasm_count || 0}회`]]));
      if (!privateInfo.unlocked) details.appendChild(section('은밀정보', [['🔒', '해당 NPC와의 사정 또는 오르가즘 기록이 생기면 확인할 수 있습니다.']], 'hypnosis-app-private-locked'));
      else details.appendChild(section('은밀정보',[['유두',privateInfo.nipple],['유륜 크기',privateInfo.areola_size],['유륜 색',privateInfo.areola_color],['음모 상태',privateInfo.pubic_hair],['과거 남성 경험',privateInfo.past_partner_count === undefined ? '' : `${privateInfo.past_partner_count}명`],['과거 오르가즘 경험',privateInfo.past_orgasm_count === undefined ? '' : `${privateInfo.past_orgasm_count}회`],['연인 관계',privateInfo.relationship]],'hypnosis-app-private-unlocked'));
      const draftSuggestions=(draft?.suggestions||[]).filter(item=>item.character_id===npc.character_id&&!item._deleted);
      details.appendChild(section('활성 개인 암시',draftSuggestions.length ? draftSuggestions.map(item=>[`[${item.strength_label || item.strength}]`,item.content]) : [['', '활성 개인 암시 없음']], 'hypnosis-app-effect-list'));
      card.appendChild(details);
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
      const manage=el('button','choice-btn','암시 관리'); manage.addEventListener('click',()=>{ requestedCharacterId=npc.character_id; selectedSuggestionTargetId=npc.can_add_suggestion ? npc.character_id : null; renderTab('suggestions'); });
      card.append(find,manage); body.appendChild(card);
    });
  }

  function renderEffects(body, kind) {
    const domain = kind === 'suggestions' ? 'suggestion' : 'csa';
    const list = domain === 'suggestion' ? draft.suggestions : draft.csa;
    const add = el('button', 'choice-btn', domain === 'suggestion' ? '+ 새 개인 암시' : '+ 새 상식개변');
    if (domain === 'suggestion') {
      const candidates = currentSuggestionTargets();
      const selectedTarget = resolveDefaultSuggestionTarget();
      const slotMax = Number(appState.home?.status?.suggestion_max);
      const slotsFull = Number.isFinite(slotMax) && list.filter(item => !item._deleted).length >= slotMax;
      if (candidates.length > 1) {
        const targetWrap = el('div', 'hypnosis-app-suggestion-target');
        const label = el('label', 'hypnosis-app-suggestion-target-label', '신규 개인 암시 대상');
        const select = el('select', 'hypnosis-app-suggestion-target-select');
        const selectId = 'hypnosis-app-suggestion-target-select';
        label.htmlFor=selectId;
        select.id=selectId;
        const placeholder = el('option', '', '대상 NPC 선택');
        placeholder.value='';
        placeholder.disabled=true;
        placeholder.selected=!selectedTarget;
        select.appendChild(placeholder);
        candidates.forEach(npc => { const option=el('option','',npc.name || '이름 미확인'); option.value=npc.character_id; option.selected=npc.character_id===selectedTarget?.character_id; select.appendChild(option); });
        select.value=selectedTarget?.character_id || '';
        select.onchange=()=>{ selectedSuggestionTargetId=select.value || null; renderTab(kind); };
        targetWrap.append(label, select);
        body.appendChild(targetWrap);
      }
      add.textContent = selectedTarget ? `+ ${selectedTarget.name || '현재 NPC'}에게 새 개인 암시` : '+ 새 개인 암시';
      add.classList.add('hypnosis-app-suggestion-add');
      add.disabled = !selectedTarget || slotsFull || isApplying;
      add.onclick = () => { if (selectedTarget && !slotsFull && !isApplying) addSuggestionDraft(selectedTarget); };
      if (!candidates.length) body.appendChild(el('p', 'hypnosis-app-error', '현재 장면에 개인 암시를 등록할 대상 NPC가 없습니다.'));
      else if (slotsFull) body.appendChild(el('p', 'hypnosis-app-error', '개인 암시 슬롯이 가득 찼습니다. 기존 암시를 삭제 예정으로 바꾸면 같은 적용에서 새 암시를 추가할 수 있습니다.'));
    } else add.onclick = () => { draft.csa.push({ _new:true, client_id:`draft_csa_${crypto.randomUUID()}`, strength:'weak', scope_type:'ward', content:'' }); renderTab(kind); };
    body.appendChild(add);
    const selected = domain === 'suggestion' ? selectedSuggestionIds : selectedCsaIds;
    const bulk = el('div', 'hypnosis-app-bulk-actions');
    const selectedDelete = el('button', 'choice-btn', domain === 'suggestion' ? '선택 삭제' : '선택 해제');
    selectedDelete.disabled = !selected.size;
    selectedDelete.onclick = () => { const rows = domain === 'suggestion' ? draft.suggestions : draft.csa; rows.slice().forEach(item => { if (!selected.has(item.id || item.client_id)) return; if (item._new) rows.splice(rows.indexOf(item), 1); else item._deleted = true; }); selected.clear(); renderTab(kind); };
    const allDelete = el('button', 'choice-btn', domain === 'suggestion' ? '전체 삭제' : '전체 해제');
    allDelete.onclick = () => { const rows = domain === 'suggestion' ? draft.suggestions : draft.csa; rows.slice().forEach(item => { if (item._deleted) return; if (item._new) rows.splice(rows.indexOf(item), 1); else item._deleted = true; }); selected.clear(); renderTab(kind); };
    bulk.append(selectedDelete, allDelete); body.appendChild(bulk);
    if (!list?.filter(item => !item._deleted).length) body.append(el('p', '', '현재 활성 항목이 없습니다.'));
    list.forEach(item => {
      const card = el('article', `hypnosis-app-effect-card${item._deleted ? ' pending-delete' : ''}`); card.dataset.clientId=item._new?item.client_id:`${domain}:${item.id}`; if (item.character_id) card.dataset.characterId=item.character_id;
      const strengthLabel = (appState.strength_options || []).find(meta => meta.id === item.strength)?.label || item.strength_label || item.strength;
      const title = domain === 'suggestion' ? `${item.character_name || nameFor(item.character_id)} · ${strengthLabel}` : `${item.scope_label || item.scope_type} · ${strengthLabel}`;
      const strength = el('select'); (appState.strength_options || []).forEach(meta => { const option=el('option','',meta.label); option.value=meta.id; option.selected=item.strength===meta.id; option.disabled=!meta.available && !option.selected; strength.appendChild(option); });
      const content = el('textarea'); content.value=item.content || ''; content.rows=3; strength.disabled=item._deleted; content.disabled=item._deleted;
      strength.onchange=()=>{ item.strength=strength.value; renderTab(kind); }; content.oninput=()=>{ item.content=content.value; refreshDraftBar(); }; content.onchange=()=>renderTab(kind);
      const check=el('input'); check.type='checkbox'; check.checked=selected.has(item.id || item.client_id); check.disabled=item._deleted; check.onchange=()=>{ const key=item.id||item.client_id; check.checked?selected.add(key):selected.delete(key); renderTab(kind); };
      const remove=el('button','choice-btn',item._deleted?'복구':(item._new?'취소':'해제')); remove.onclick=()=>{ if(item._deleted) item._deleted=false; else if(item._new){ const target=domain==='suggestion'?draft.suggestions:draft.csa; target.splice(target.indexOf(item),1); } else item._deleted=true; selected.delete(item.id||item.client_id); renderTab(kind); };
      if (domain === 'csa') { const scope=el('select'); (appState.scope_options||[]).forEach(meta=>{const option=el('option','',meta.available?meta.label:`${meta.label} · Lv.${meta.unlock_level}`);option.value=meta.id;option.selected=item.scope_type===meta.id;option.disabled=!meta.available&&!option.selected;scope.appendChild(option);}); scope.disabled=item._deleted; scope.onchange=()=>{item.scope_type=scope.value;refreshDraftBar();}; card.appendChild(scope); }
      const issue=validationIssues.find(entry=>entry.client_id===card.dataset.clientId); if(issue) { card.appendChild(el('p','hypnosis-app-error',[issue.message, issue.reason].filter(Boolean).join(' '))); if(issue.suggested_strength && (appState.strength_options||[]).some(meta=>meta.id===issue.suggested_strength&&meta.available)) { const quick=el('button','choice-btn',`${(appState.strength_options||[]).find(meta=>meta.id===issue.suggested_strength)?.label || issue.suggested_strength}으로 변경`); quick.onclick=()=>{item.strength=issue.suggested_strength; validationIssues=validationIssues.filter(entry=>entry!==issue); renderTab(kind);}; card.appendChild(quick); } }
      card.append(check,el('strong','',title),item._deleted?el('span','pending-badge',domain==='suggestion'?'삭제 예정':'해제 예정'):document.createTextNode(''),strength,content);
      if (domain === 'suggestion') {
        const chance = suggestionChance(item);
        if (chance !== null) {
          card.appendChild(el('p', 'hypnosis-app-suggestion-chance', `예상 성공률 ${chance}% · ${item.character_name || nameFor(item.character_id)} · ${(appState.strength_options || []).find(meta => meta.id === item.strength)?.label || item.strength}`));
          card.appendChild(el('small', '', '성공률은 어플 레벨, 대상의 순응도·최면깊이·최면저항력에 따라 결정됩니다.'));
        }
      }
      card.append(remove); body.appendChild(card);
    });
  }

  async function applyDraft() {
    const requested = operations(); if (!requested.length) return;
    const action = { version:1, type:'app_transaction', base_turn_count:appState.turn_count, operations:requested };
    if (isApplying) return;
    const count=(domain, operation)=>requested.filter(item=>item.domain===domain&&item.operation===operation).length;
    const summary=[['개인 암시 신규',count('suggestion','activate')],['개인 암시 수정',count('suggestion','update')],['개인 암시 삭제',count('suggestion','deactivate')],['상식개변 신규',count('csa','activate')],['상식개변 수정',count('csa','update')],['상식개변 해제',count('csa','deactivate')]].filter(([,value])=>value).map(([label,value])=>`- ${label} ${value}개`);
    summary.push('전체 변경사항은 게임 1턴으로 처리됩니다.');
    const proceed = async () => {
      if (typeof window.runHypnosisStructuredAction !== 'function') return showDialog('오류','구조화 턴 실행 함수를 찾지 못했습니다.',[{label:'확인',run:()=>{}}]);
      if (state.isStreaming) return showDialog('적용할 수 없습니다.','현재 턴이 끝난 뒤 다시 적용해 주세요. 변경사항은 아직 저장되지 않았습니다.',[{label:'확인',run:()=>{}}]);
      isApplying=true;
      validationIssues=[];
      refreshDraftBar();
      try {
        const result=await api.validateAppAction(state.gameId,action);
        if(!result?.canonical_action||!result?.display_input) throw new Error('검증 응답이 올바르지 않습니다.');
        forceCloseAfterValidation();
        window.runHypnosisStructuredAction(result.canonical_action,result.display_input);
      } catch(error) {
        isApplying=false;
        validationIssues=Array.isArray(error.details?.issues)?error.details.issues:[{message:error.details?.error||error.message||'변경사항을 확인하지 못했습니다.'}];
        const first=validationIssues[0];
        const tab=first?.domain==='suggestion'?'suggestions':first?.domain==='csa'?'csa':draft.tab;
        renderTab(tab);
        const card=first?.client_id&&[...overlay.querySelectorAll('[data-client-id]')].find(node=>node.dataset.clientId===first.client_id);
        card?.scrollIntoView({block:'center'});
        showDialog('변경사항을 적용하지 못했습니다.',`${first?.message || '변경사항을 확인하지 못했습니다.'}\n변경사항은 저장되지 않았습니다. 내용을 확인한 뒤 다시 적용해 주세요.`,[{label:'확인',run:()=>{}}]);
      }
    };
    showDialog('변경사항 적용',summary.join('\n'),[{label:'계속 편집',run:()=>{}},{label:'적용',run:proceed}]);
  }

  function manualSection(title, options = {}) {
    const details = el('details', 'app-manual-section');
    details.open = options.open === true;
    details.appendChild(el('summary', '', title));
    const content = el('div', 'app-manual-section-body');
    details.appendChild(content);
    return { details, content };
  }

  function appendManualList(root, items, ordered = false) {
    const list = el(ordered ? 'ol' : 'ul', 'app-manual-list');
    (Array.isArray(items) ? items : []).forEach(item => list.appendChild(el('li', '', String(item))));
    root.appendChild(list);
  }

  function appendManualTiers(root, tiers, includeDescription = false) {
    (Array.isArray(tiers) ? tiers : []).forEach(tier => {
      const details = el('details', 'app-manual-tier');
      details.appendChild(el('summary', '', tier.available ? `${tier.label} · 사용 가능` : `${tier.label} · Lv.${tier.unlock_level} 해금 🔒`));
      const content = el('div');
      if (includeDescription && tier.description) content.appendChild(el('p', '', tier.description));
      if (tier.available) appendManualList(content, tier.examples || [], true);
      else content.appendChild(el('p', '', '현재 레벨에서는 이 단계의 상세 예시를 확인할 수 없습니다.'));
      details.appendChild(content);
      root.appendChild(details);
    });
  }

  function renderHospitalMap(root, map) {
    if (!map?.floors?.length) { root.appendChild(el('p', '', '현재 표시할 병원 지도 정보가 없습니다.')); return; }
    root.appendChild(el('h3', '', `🏥 ${map.building_name || '서울중앙병원'}`));
    const legend = el('p', 'app-manual-map-legend', '● 기본 시설 · ◇ 게임 중 발견한 장소 · 📍 현재 위치 · 👤 마지막 확인된 NPC 위치');
    root.appendChild(legend);
    const grid = el('div', 'app-manual-map');
    map.floors.forEach(floor => {
      const floorCard = el('article', 'app-manual-floor');
      floorCard.appendChild(el('h4', '', floor.label));
      (floor.locations || []).forEach(location => {
        const locationNode = el('div', `app-manual-location app-manual-location-${location.source || 'fixed'}${location.current ? ' app-manual-location-current' : ''}`);
        if (location.current) locationNode.setAttribute('aria-current', 'location');
        locationNode.appendChild(el('strong', '', `${location.source === 'discovered' ? '◇' : '●'} ${location.label}`));
        if (location.current) locationNode.appendChild(el('span', '', '📍 현재 위치'));
        (location.npcs || []).forEach(npc => locationNode.appendChild(el('span', 'app-manual-location-npcs', `${npc.current ? '👥' : '👤'} ${npc.name}`)));
        floorCard.appendChild(locationNode);
      });
      (floor.other_locations || []).forEach(other => {
        const otherNode = el('div', 'app-manual-location app-manual-location-other');
        otherNode.appendChild(el('strong', '', other.current ? '📍 현재 위치' : '기타 확인 위치'));
        otherNode.appendChild(el('span', '', other.label));
        (other.npcs || []).forEach(npc => otherNode.appendChild(el('span', 'app-manual-location-npcs', `${npc.current ? '👥' : '👤'} ${npc.name}`)));
        floorCard.appendChild(otherNode);
      });
      grid.appendChild(floorCard);
    });
    root.appendChild(grid);
  }

  function renderManual(body) {
    const manual = appState.manual || {};
    body.append(el('h3', '', manual.title || '최면 어플 사용자 매뉴얼'));
    if (manual.subtitle) body.appendChild(el('p', '', manual.subtitle));
    const status = manual.status || {};
    const statusSection = manualSection('현재 어플 상태', { open:true });
    const statusGrid = el('div', 'app-manual-status-grid');
    const addStatus = (label, value, detail = '') => { const card=el('div','app-manual-status-card'); card.append(el('small','',label),el('strong','',value)); if(detail) card.appendChild(el('small','',detail)); statusGrid.appendChild(card); };
    addStatus('레벨', `Lv.${status.level || 1}`);
    addStatus('경험치', `${status.exp || 0} / ${status.next_level_exp || 0}`, `${status.exp_percent || 0}%`);
    addStatus('사용 가능 강도', status.available_strength || '약함');
    addStatus('개인 암시', `${status.suggestion_active || 0} / ${status.suggestion_max || 0}`, `남은 슬롯 ${status.suggestion_remaining || 0}`);
    addStatus('상식개변', `${status.csa_active || 0} / ${status.csa_max || 0}`, `현재 범위: ${status.csa_scope_label || '-'}`);
    if (status.next_unlock) addStatus('다음 해금', `Lv.${status.next_unlock.level}`, status.next_unlock.text || '');
    statusSection.content.appendChild(statusGrid);
    (manual.diagnostics || []).forEach(item => statusSection.content.appendChild(el('p', `hypnosis-app-diagnostic ${item.type || ''}`, item.text)));
    body.appendChild(statusSection.details);

    const quick = manualSection('빠른 사용법', { open:true }); appendManualList(quick.content, manual.quick_start, true); body.appendChild(quick.details);
    const map = manualSection('병원 지도', { open:true }); renderHospitalMap(map.content, manual.hospital_map); body.appendChild(map.details);

    const suggestions = manualSection('개인 암시');
    if (manual.suggestions?.description) suggestions.content.appendChild(el('p','',manual.suggestions.description));
    suggestions.content.appendChild(el('h4','', '규칙')); appendManualList(suggestions.content, manual.suggestions?.rules); appendManualTiers(suggestions.content, manual.suggestions?.tiers, true); body.appendChild(suggestions.details);

    const csa = manualSection('상식개변');
    if (manual.common_sense?.description) csa.content.appendChild(el('p','',manual.common_sense.description));
    csa.content.appendChild(el('p','',`현재 사용 가능 범위: ${manual.common_sense?.current_scope?.label || '-'}`));
    appendManualList(csa.content, manual.common_sense?.rules);
    const scopeList = el('div','app-manual-unlock-list'); (manual.common_sense?.scope_unlocks || []).forEach(item => scopeList.appendChild(el('p','',`${item.level_range} · ${item.scope_label} · 활성 ${item.max_active}개${item.available ? ' · 사용 가능' : ' · 잠금'}`))); csa.content.appendChild(scopeList);
    appendManualTiers(csa.content, manual.common_sense?.tiers, true); body.appendChild(csa.details);

    const strength = manualSection('최면 강도'); strength.content.appendChild(el('h4','', '개인 암시')); appendManualTiers(strength.content, manual.suggestions?.tiers, true); strength.content.appendChild(el('h4','', '상식개변')); appendManualTiers(strength.content, manual.common_sense?.tiers, true); body.appendChild(strength.details);
    const depth = manualSection('최면깊이'); if(manual.hypnosis_depth?.description) depth.content.appendChild(el('p','',manual.hypnosis_depth.description)); appendManualList(depth.content, manual.hypnosis_depth?.rules); body.appendChild(depth.details);

    const stats = manualSection('NPC 상태 수치'); const statGrid=el('div','app-manual-stat-grid'); (manual.stats||[]).forEach(stat=>{const item=el('article','app-manual-active-item'); item.append(el('strong','',`${stat.label} (${stat.range})`),el('p','',stat.description||''),el('small','',stat.change_rule||'')); statGrid.appendChild(item);}); stats.content.appendChild(statGrid); body.appendChild(stats.details);
    const unlocks = manualSection('레벨별 해금'); (manual.unlocks||[]).forEach(unlock=>{const item=el('div','app-manual-active-item'); item.appendChild(el('strong','',`Lv.${unlock.level}`)); appendManualList(item, unlock.items); unlocks.content.appendChild(item);}); body.appendChild(unlocks.details);

    const effects = manualSection('현재 활성 효과'); const active=manual.active_effects||{};
    if (!(active.suggestions||[]).length && !(active.common_sense||[]).length) effects.content.appendChild(el('p','', '현재 활성 효과가 없습니다.'));
    else { const groups=new Map(); (active.suggestions||[]).forEach(item=>groups.set(item.character_name,[...(groups.get(item.character_name)||[]),item])); groups.forEach((items,name)=>{effects.content.appendChild(el('h4','',name)); items.forEach(item=>effects.content.appendChild(el('div','app-manual-active-item',`[${item.strength}] ${item.content}`)));}); (active.common_sense||[]).forEach(item=>effects.content.appendChild(el('div','app-manual-active-item',`[${item.scope_label} · ${item.strength}] ${item.content}`))); } body.appendChild(effects.details);
    const failures = manualSection('자주 실패하는 이유'); (manual.common_failures||[]).forEach(item=>{const card=el('details','app-manual-failure'); card.appendChild(el('summary','',item.title)); const content=el('div'); appendManualList(content,item.reasons); card.appendChild(content); failures.content.appendChild(card);}); body.appendChild(failures.details);
  }

  function renderTab(tab) {
    draft.tab = tab;
    const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren();
    if (validationIssues.length) { const alert=el('div','hypnosis-app-error'); alert.setAttribute('role','alert'); alert.appendChild(el('strong','','변경사항을 적용할 수 없습니다.')); validationIssues.forEach(issue=>alert.appendChild(el('p','',issue.message||String(issue)))); body.appendChild(alert); }
    if (tab === 'home') renderHome(body);
    else if (tab === 'npc') renderNpcs(body);
    else if (tab === 'suggestions') renderEffects(body, 'suggestions');
    else if (tab === 'csa') renderEffects(body, 'csa');
    else renderManual(body);
    if (appNotice) { body.prepend(el('p','hypnosis-app-diagnostic info',appNotice)); appNotice=''; }
    if (requestedCharacterId) body.querySelector(`[data-character-id="${requestedCharacterId}"]`)?.scrollIntoView({ block:'center' });
    overlay.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
    refreshDraftBar();
  }

  async function open(initialTab = 'home', options = {}) {
    requestedCharacterId=options.characterId || null; appNotice=options.notice || '';
    if (overlay) { if (options.characterId) selectedSuggestionTargetId=options.characterId; if (draft) renderTab(initialTab); return; }
    selectedSuggestionTargetId=options.characterId || null;
    opener = document.activeElement;
    overlay = el('div', 'hypnosis-app-overlay');
    const modal = el('div', 'hypnosis-app-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'hypnosis-app-header'); const title = el('h2', '', '📱 최면 어플'); const closeButton = el('button', 'app-manual-close', '닫기');
    closeButton.addEventListener('click', requestClose); header.append(title, closeButton);
    const tabs = el('div', 'hypnosis-app-tabs'); tabs.setAttribute('role', 'tablist');
    [['home','홈'],['npc','NPC'],['suggestions','개인 암시'],['csa','상식개변'],['manual','매뉴얼']].forEach(([id,label]) => { const button = el('button', 'hypnosis-app-tab', label); button.dataset.tab=id; button.setAttribute('role','tab'); button.addEventListener('click', () => renderTab(id)); tabs.appendChild(button); });
    const draftBar = el('div', 'hypnosis-app-draft-bar'); modal.append(header, tabs, el('div', 'hypnosis-app-body'), draftBar); overlay.appendChild(modal);
    overlay.addEventListener('click', event => { if (event.target === overlay) requestClose(); });
    keydownHandler = event => { if (event.key !== 'Escape' || !overlay) return; const dialog=overlay.querySelector('.hypnosis-app-dialog-overlay'); if (dialog) { dialog.remove(); restoreHistorySentinel(); return; } requestClose('escape'); };
    document.addEventListener('keydown', keydownHandler);
    historyToken=crypto.randomUUID(); history.pushState({ ...(history.state||{}), hypnosisApp:historyToken },'',location.href); historyPushed=true;
    popstateHandler=()=>{ if(restoringHistory){ restoringHistory=false; return; } if(overlay){ historyPushed=false; requestClose('popstate'); } };
    window.addEventListener('popstate',popstateHandler);
    originalBodyOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
    document.body.appendChild(overlay); closeButton.focus();
    try { appState = (await api.appState(state.gameId)).app; draft = { tab: initialTab, originalSuggestions: copy(appState.suggestions), originalCsa: copy(appState.common_sense), suggestions: copy(appState.suggestions), csa: copy(appState.common_sense) }; renderTab(initialTab); }
    catch (error) { const body = overlay.querySelector('.hypnosis-app-body'); body.replaceChildren(el('p', 'hypnosis-app-error', '최면 어플 정보를 불러오지 못했습니다.')); }
  }
  return { init() {}, open, close: requestClose, isOpen: () => Boolean(overlay), onGameReset: destroyApp, resolveInputRoute };
})();
