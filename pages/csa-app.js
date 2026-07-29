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

  // ─── 프리셋 카탈로그 헬퍼 — appState.csa_presets가 유일한 소스, 여기서 새
  // 목록을 하드코딩하지 않는다. ───
  const presetCatalogItem = templateId => (appState?.csa_presets?.items || []).find(entry => entry.id === templateId) || null;
  const presetOptionLabel = (kind, id) => (appState?.csa_presets?.[`${kind}_options`] || []).find(entry => entry.id === id)?.label || '';
  const STRENGTH_LABELS = { weak: '약함', medium: '중간', strong: '강함' };
  function hasKoreanBatchim(text) {
    const trimmed = String(text || '').trim();
    const code = trimmed.slice(-1).codePointAt(0) || 0;
    if (code < 0xAC00 || code > 0xD7A3) return false;
    return (code - 0xAC00) % 28 !== 0;
  }
  const withTopicParticle = word => `${word}${hasKoreanBatchim(word) ? '은' : '는'}`;
  const withConjParticle = word => `${word}${hasKoreanBatchim(word) ? '과' : '와'}`;
  // Cosmetic-only preview — the Worker always re-derives the canonical
  // content from the same content_template at apply time (never trusts
  // this string), so a mismatch here is never a correctness risk.
  function presetPreviewContent(item) {
    const catalogItem = presetCatalogItem(item.template_id);
    if (!catalogItem || !catalogItem.content_template) return '';
    const actorLabel = presetOptionLabel('actor', item.actor_group);
    const targetLabel = item.target_group ? presetOptionLabel('target', item.target_group) : '';
    const triggerLabel = presetOptionLabel('trigger', item.trigger);
    const durationLabel = presetOptionLabel('duration', item.duration);
    const modifier = normalize(item.modifier || '');
    const params = {
      actor_topic: actorLabel ? withTopicParticle(actorLabel) : '',
      target_conj: targetLabel ? withConjParticle(targetLabel) : '',
      target_possessive: targetLabel ? `${targetLabel}의` : '',
      trigger_text: triggerLabel,
      duration_text: durationLabel,
      modifier_clause: modifier ? `${modifier} ` : ''
    };
    return catalogItem.content_template.replace(/\{(\w+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(params, key) ? params[key] : '');
  }
  function firstAvailablePresetItem(category) {
    const items = appState?.csa_presets?.items || [];
    return items.find(entry => entry.available && entry.category === category) || items.find(entry => entry.available) || null;
  }
  function applyPresetDefaults(item, catalogItem) {
    if (!catalogItem) return;
    item.category = catalogItem.category;
    item.template_id = catalogItem.id;
    item.actor_group = catalogItem.default_actor;
    item.target_group = catalogItem.default_target || null;
    item.trigger = catalogItem.default_trigger;
    item.duration = catalogItem.default_duration;
    item.modifier = item.modifier || '';
    item.strength = catalogItem.minimum_strength;
  }
  function ensurePresetDefaults(item) {
    if (item.template_id && presetCatalogItem(item.template_id)?.available) return;
    applyPresetDefaults(item, firstAvailablePresetItem(item.category));
  }
  function hydrateDraftItem(item) {
    if (item.source_type === 'preset' && item.preset) {
      item.template_id = item.preset.template_id;
      item.category = presetCatalogItem(item.template_id)?.category || null;
      item.actor_group = item.preset.actor_group || null;
      item.target_group = item.preset.target_group || null;
      item.trigger = item.preset.trigger || null;
      item.duration = item.preset.duration || null;
      item.modifier = item.preset.modifier || '';
    } else {
      item.source_type = 'custom';
    }
    return item;
  }
  function isPresetPayloadComplete(preset) {
    if (!preset || !preset.template_id || !preset.actor_group || !preset.trigger || !preset.duration) return false;
    const catalogItem = presetCatalogItem(preset.template_id);
    if (!catalogItem) return false;
    if (!catalogItem.actor_options.includes(preset.actor_group)) return false;
    if (catalogItem.target_options.length) {
      if (!preset.target_group || !catalogItem.target_options.includes(preset.target_group)) return false;
    } else if (preset.target_group) return false;
    return true;
  }
  function payloadFields(item) {
    return item.source_type === 'preset'
      ? {
          source_type: 'preset', strength: item.strength, content: presetPreviewContent(item) || '',
          preset: {
            template_id: item.template_id || null, actor_group: item.actor_group || null, target_group: item.target_group || null,
            trigger: item.trigger || null, duration: item.duration || null, modifier: normalize(item.modifier || '')
          }
        }
      : { source_type: 'custom', strength: item.strength, content: normalize(item.content || '') };
  }
  function presetStructureEqual(item, beforePreset) {
    if (!beforePreset) return false;
    return item.template_id === beforePreset.template_id
      && (item.actor_group || null) === (beforePreset.actor_group || null)
      && (item.target_group || null) === (beforePreset.target_group || null)
      && item.trigger === beforePreset.trigger
      && item.duration === beforePreset.duration
      && normalize(item.modifier || '') === normalize(beforePreset.modifier || '');
  }
  const operations = () => {
    if (!draft) return [];
    const original = new Map((draft.original || []).map(item => [item.id, item]));
    return draft.csa.flatMap(item => {
      if (item._new) return [{ client_id: item.client_id, domain: 'csa', operation: 'activate', ...payloadFields(item) }];
      const before = original.get(item.id);
      if (!before) return [];
      if (item._deleted) return [{ client_id: `csa:${item.id}`, domain: 'csa', operation: 'deactivate', id: item.id }];
      const beforeIsPreset = before.source_type === 'preset';
      const unchanged = item.source_type === 'preset' && beforeIsPreset
        ? presetStructureEqual(item, before.preset)
        : (item.source_type !== 'preset' && !beforeIsPreset && normalize(item.content) === normalize(before.content) && item.strength === before.strength);
      return unchanged ? [] : [{ client_id: `csa:${item.id}`, domain: 'csa', operation: 'update', id: item.id, ...payloadFields(item) }];
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
  function renderPlayer(body) {
    const info = appState.player_info || {};
    const fields = [
      ['이름', info.name], ['나이', info.age], ['성별', info.gender], ['직업', info.job], ['전공', info.major], ['직급', info.rank],
      ['키', info.height_cm == null ? null : `${info.height_cm}cm`], ['몸무게', info.weight_kg == null ? null : `${info.weight_kg}kg`], ['성기 길이', info.penis_length_cm == null ? null : `${info.penis_length_cm}cm`], ['외형/스타일', info.style],
      ['성격', info.personality], ['말투', info.speech_style], ['배경', info.background], ['최초 시작 위치', info.starting_location], ['현재 위치', info.current_location], ['현재 게임 시간', info.time_label], ['현재 자세/상태', info.position_label],
      ['상식개변 레벨', `Lv.${info.level ?? 1}`], ['EXP', `${info.exp ?? 0} / ${info.next_level_exp ?? 0}`], ['활성 상식개변', `${info.active_csa_count ?? 0} / ${info.max_active_csa ?? 0}`]
    ];
    body.appendChild(el('h3', '', '플레이어 정보'));
    const grid = el('div', 'csa-app-status-grid');
    fields.forEach(([label, value]) => { const card = el('div', 'csa-app-card'); card.append(el('small', '', label), el('strong', '', value === null || value === undefined || value === '' ? '미설정' : String(value))); grid.appendChild(card); });
    body.appendChild(grid);
  }
  function selectField(label, value, options, onChange) {
    const wrap = el('label', 'csa-app-field');
    wrap.append(el('span', 'csa-app-field-label', label));
    const select = el('select', 'csa-app-select');
    options.forEach(option => {
      const node = el('option', '', option.label); node.value = option.id;
      node.disabled = option.disabled === true; node.selected = option.id === value;
      select.appendChild(node);
    });
    select.disabled = applying;
    select.onchange = () => onChange(select.value);
    wrap.appendChild(select);
    return wrap;
  }
  function renderPresetForm(item) {
    const wrap = el('div', 'csa-app-preset-form');
    const presets = appState?.csa_presets;
    if (!presets) { wrap.append(el('p', 'csa-app-error', '프리셋 정보를 불러오지 못했습니다.')); return wrap; }
    const categories = presets.categories.filter(cat => presets.items.some(entry => entry.category === cat.id));
    wrap.appendChild(selectField('분류', item.category, categories, value => {
      applyPresetDefaults(item, firstAvailablePresetItem(value)); renderTab('csa');
    }));
    const categoryItems = presets.items.filter(entry => entry.category === item.category);
    wrap.appendChild(selectField('프리셋', item.template_id, categoryItems.map(entry => ({ id: entry.id, label: entry.available ? entry.label : `${entry.label} · 잠김`, disabled: !entry.available })), value => {
      applyPresetDefaults(item, presetCatalogItem(value)); renderTab('csa');
    }));
    const catalogItem = presetCatalogItem(item.template_id);
    if (catalogItem) {
      wrap.appendChild(selectField('행동 주체', item.actor_group, catalogItem.actor_options.map(id => ({ id, label: presetOptionLabel('actor', id) })), value => {
        item.actor_group = value; syncDraftBar(); renderTab('csa');
      }));
      if (catalogItem.target_options.length) {
        wrap.appendChild(selectField('상대', item.target_group, catalogItem.target_options.map(id => ({ id, label: presetOptionLabel('target', id) })), value => {
          item.target_group = value; syncDraftBar(); renderTab('csa');
        }));
      } else {
        wrap.append(el('p', 'csa-app-scope-label', '이 프리셋은 상대를 지정하지 않습니다.'));
      }
      wrap.appendChild(selectField('발동 상황', item.trigger, catalogItem.allowed_triggers.map(id => ({ id, label: presetOptionLabel('trigger', id) })), value => {
        item.trigger = value; syncDraftBar(); renderTab('csa');
      }));
      wrap.appendChild(selectField('지속 조건', item.duration, catalogItem.allowed_durations.map(id => ({ id, label: presetOptionLabel('duration', id) })), value => {
        item.duration = value; syncDraftBar(); renderTab('csa');
      }));
      const modifierLabel = el('label', 'csa-app-field');
      modifierLabel.append(el('span', 'csa-app-field-label', '세부 수식어 (선택, 최대 60자)'));
      const modifierInput = el('input', 'csa-app-select');
      modifierInput.type = 'text'; modifierInput.maxLength = 60; modifierInput.value = item.modifier || ''; modifierInput.disabled = applying;
      modifierInput.oninput = () => { item.modifier = modifierInput.value; previewText.textContent = presetPreviewContent(item) || previewPlaceholder; syncDraftBar(); };
      modifierLabel.appendChild(modifierInput);
      wrap.appendChild(modifierLabel);
      const previewPlaceholder = '항목을 모두 선택하면 문장이 완성됩니다.';
      const previewBox = el('div', 'csa-app-preview');
      const previewText = el('p', '', presetPreviewContent(item) || previewPlaceholder);
      previewBox.append(el('small', '', '완성 문장 미리보기'), previewText);
      wrap.appendChild(previewBox);
      wrap.appendChild(el('p', 'csa-app-scope-label', `강도: ${STRENGTH_LABELS[catalogItem.minimum_strength] || catalogItem.minimum_strength}`));
      const synergyItems = (catalogItem.synergy_ids || []).map(presetCatalogItem).filter(entry => entry && entry.available);
      if (synergyItems.length) {
        const synergyBox = el('div', 'csa-app-synergy');
        synergyBox.append(el('small', '', '함께 쓰면 자연스러운 프리셋'));
        list(synergyBox, synergyItems.map(entry => entry.label));
        wrap.appendChild(synergyBox);
      }
    }
    return wrap;
  }
  function renderCustomForm(item) {
    const wrap = el('div', 'csa-app-custom-form');
    const strength = el('select', 'csa-app-select'), scope = el('p', 'csa-app-scope-label', '적용 범위: 병원 전체'), content = el('textarea', 'csa-app-textarea');
    (appState.strength_options || []).forEach(option => { const optionNode = el('option', '', option.available || item.strength === option.id ? option.label : `${option.label} · Lv.${option.unlock_level}`); optionNode.value = option.id; optionNode.disabled = !option.available && item.strength !== option.id; optionNode.selected = item.strength === option.id; strength.appendChild(optionNode); });
    content.value = item.content || ''; content.placeholder = '이 공간에서 적용할 사회적 상식을 입력하세요.';
    strength.disabled = applying; content.disabled = applying;
    strength.onchange = () => { item.strength = strength.value; syncDraftBar(); };
    content.oninput = () => { item.content = content.value; syncDraftBar(); };
    wrap.append(strength, scope, content);
    return wrap;
  }
  function renderCsaItem(item) {
    const card = el('article', `csa-app-effect-card${item._deleted ? ' pending-delete' : ''}`);
    const header = el('div', 'csa-app-effect-header');
    header.append(el('strong', '', item._new ? '신규 상식개변' : item.scope_label || '상식개변'));
    const toggle = el('button', 'choice-btn', item._deleted ? '해제 취소' : '해제'); toggle.disabled = applying;
    toggle.onclick = () => { if (item._new) draft.csa.splice(draft.csa.indexOf(item), 1); else item._deleted = !item._deleted; renderTab('csa'); };
    header.appendChild(toggle);
    card.appendChild(header);
    if (item._deleted) { card.append(el('p', 'csa-app-scope-label', '해제 예정입니다.')); return card; }
    const modeTabs = el('div', 'csa-app-mode-tabs');
    const presetTab = el('button', `choice-btn${item.source_type === 'preset' ? ' selected' : ''}`, '프리셋으로 만들기');
    const customTab = el('button', `choice-btn${item.source_type !== 'preset' ? ' selected' : ''}`, '직접 작성');
    presetTab.type = 'button'; customTab.type = 'button'; presetTab.disabled = applying; customTab.disabled = applying;
    presetTab.onclick = () => { if (item.source_type !== 'preset') { item.source_type = 'preset'; ensurePresetDefaults(item); renderTab('csa'); } };
    customTab.onclick = () => {
      if (item.source_type !== 'preset') return;
      const switchToCustom = () => { item.content = presetPreviewContent(item) || item.content || ''; item.source_type = 'custom'; renderTab('csa'); };
      if (item._new) switchToCustom();
      else dialog('직접 작성으로 전환', '직접 작성으로 전환하면 프리셋 실행 조건과 지속 정보가 제거됩니다.', [{ label: '취소' }, { label: '전환', run: switchToCustom }]);
    };
    modeTabs.append(presetTab, customTab);
    card.appendChild(modeTabs);
    card.appendChild(item.source_type === 'preset' ? renderPresetForm(item) : renderCustomForm(item));
    return card;
  }
  function renderCsa(body) {
    const max = Number(appState.home?.status?.csa_max), add = el('button', 'choice-btn', '+ 상식개변 추가');
    add.disabled = applying || (Number.isFinite(max) && active().length >= max);
    add.onclick = () => {
      const strength = (appState.strength_options || []).find(item => item.available)?.id || 'weak';
      const item = { _new: true, client_id: `draft_csa_${crypto.randomUUID()}`, source_type: 'preset', strength, scope_type: 'world', scope_label: '병원 전체', content: '', modifier: '' };
      ensurePresetDefaults(item);
      draft.csa.push(item); renderTab('csa');
    };
    body.appendChild(add); if (add.disabled && active().length >= max) body.appendChild(el('p', 'csa-app-error', '활성 슬롯이 가득 찼습니다. 기존 항목을 해제한 뒤 추가해 주세요.'));
    if (!active().length) body.appendChild(el('p', '', '현재 활성 상식개변이 없습니다.'));
    draft.csa.forEach(item => body.appendChild(renderCsaItem(item)));
  }
  function section(body, title, draw, open = false) { const details = el('details', 'app-manual-section'); details.open = open; details.appendChild(el('summary', '', title)); const inner = el('div', 'app-manual-section-body'); draw(inner); details.appendChild(inner); body.appendChild(details); }
  function list(root, items, ordered = false) { const node = el(ordered ? 'ol' : 'ul', 'app-manual-list'); (items || []).forEach(item => node.appendChild(el('li', '', typeof item === 'string' ? item : item?.text || ''))); root.appendChild(node); }
  function renderManual(body) {
    const manual = appState.manual || {}; body.append(el('h3', '', manual.title || '상식개변 앱 매뉴얼')); if (manual.subtitle) body.append(el('p', '', manual.subtitle));
    section(body, '현재 앱 상태', root => { const status = manual.status || {}; root.append(el('p', '', `Lv.${status.level || 1} · 경험치 ${status.exp || 0}/${status.next_level_exp || 0} · 활성 ${status.csa_active || 0}/${status.csa_max || 0} · 범위 ${status.csa_scope_label || '-'}`)); }, true);
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
    if (!overlay || !draft) return; draft.tab = ['home', 'player', 'npc', 'csa', 'manual'].includes(tab) ? tab : 'home'; const body = overlay.querySelector('.csa-app-body'); body.replaceChildren();
    (draft.issues || []).forEach(issue => body.appendChild(el('p', 'csa-app-error', issue.message || String(issue))));
    ({ home: renderHome, player: renderPlayer, npc: renderNpcs, csa: renderCsa, manual: renderManual })[draft.tab](body);
    if (draft.notice) { body.prepend(el('p', 'csa-app-diagnostic info', draft.notice)); draft.notice = ''; }
    overlay.querySelectorAll('[role="tab"]').forEach(node => node.setAttribute('aria-selected', String(node.dataset.tab === draft.tab))); syncDraftBar();
  }
  async function applyDraft() {
    const ops = operations(); if (!ops.length || applying) return;
    if (ops.some(item => item.operation !== 'deactivate' && item.source_type === 'custom' && !normalize(item.content))) {
      draft.issues = [{ message: '상식개변 내용을 입력해 주세요.' }]; return renderTab('csa');
    }
    if (ops.some(item => item.operation !== 'deactivate' && item.source_type === 'preset' && !isPresetPayloadComplete(item.preset))) {
      draft.issues = [{ message: '프리셋의 모든 항목을 선택해 주세요.' }]; return renderTab('csa');
    }
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
    if (/어플|앱/.test(text) && /사용법|매뉴얼|설명|정보/.test(text)) return { tab: 'manual', character_id: null, notice: '상식개변 앱 매뉴얼을 열었습니다.' };
    if (/어플|앱/.test(text)) return { tab: 'home', character_id: null, notice: '상식개변 앱을 열었습니다.' };
    return null;
  }
  async function open(initialTab = 'home', options = {}) {
    if (overlay) { draft.notice = options.notice || ''; renderTab(initialTab); return; }
    opener = document.activeElement; overlay = el('div', 'csa-app-overlay'); const modal = el('div', 'csa-app-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const header = el('header', 'csa-app-header'), close = el('button', 'app-manual-close', '닫기'); close.setAttribute('aria-label', '상식개변 앱 닫기'); close.onclick = () => requestClose(); header.append(el('h2', '', '📱 상식개변 앱'), close);
    const tabs = el('div', 'csa-app-tabs'); tabs.setAttribute('role', 'tablist'); [['home', '홈'], ['player', '플레이어 정보'], ['npc', 'NPC'], ['csa', '상식개변'], ['manual', '매뉴얼']].forEach(([id, label]) => { const button = el('button', 'csa-app-tab', label); button.dataset.tab = id; button.setAttribute('role', 'tab'); button.onclick = () => renderTab(id); tabs.appendChild(button); });
    modal.append(header, tabs, el('div', 'csa-app-body'), el('div', 'csa-app-draft-bar')); overlay.appendChild(modal); overlay.onclick = event => { if (event.target === overlay) requestClose(); };
    keydownHandler = event => { if (event.key === 'Escape') requestClose(); }; document.addEventListener('keydown', keydownHandler);
    historyToken = crypto.randomUUID(); history.pushState({ ...(history.state || {}), csaApp: historyToken }, '', location.href); historyPushed = true; popstateHandler = () => { historyPushed = false; requestClose('popstate'); }; window.addEventListener('popstate', popstateHandler);
    bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; document.body.appendChild(overlay);
    try {
      appState = (await api.appState(state.gameId)).app;
      draft = { tab: initialTab, notice: options.notice || '', original: clone(appState.common_sense), csa: clone(appState.common_sense).map(hydrateDraftItem), issues: [] };
      renderTab(initialTab);
    } catch (error) { overlay.querySelector('.csa-app-body').append(el('p', 'csa-app-error', '상식개변 앱 정보를 불러오지 못했습니다.')); }
  }
  return { init() {}, open, close: requestClose, isOpen: () => Boolean(overlay), onGameReset: destroy, resolveInputRoute };
})();
