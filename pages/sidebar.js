const sidebar = {
  stats: [
    { key: '호감도', label: '호감' },
    { key: '신뢰도', label: '신뢰' },
    { key: '최면깊이', label: '최면' },
    { key: '순응도', label: '순응' },
    { key: '최면저항력', label: '저항' }
  ],
  previousStats: {},

  init() {
    const panel = document.querySelector('.side-panel');
    panel.innerHTML = `
      <section class="panel-section"><img class="character-img hidden" id="character-img" alt="현재 캐릭터"></section>
      <section class="panel-section"><div class="panel-title" id="character-info-title">캐릭터 기본정보</div><div class="info-list" id="character-info"></div></section>
      <section class="panel-section"><div class="panel-title">마인드 모니터</div><div class="mind-monitor" id="mind-monitor"><div class="mind-item"><b>표면의식</b><blockquote id="mind-surface">-</blockquote></div><div class="mind-item"><b>잠재의식</b><blockquote id="mind-inner">-</blockquote></div><div class="mind-item"><b>신체적·행동적 반응</b><p id="mind-physical">-</p></div></div></section>
      <section class="panel-section"><div class="panel-title" id="npc-status-title">NPC 상태</div><div class="npc-status" id="npc-status"></div></section>`;
    ui.init();
    const relationship = document.createElement('section');
    relationship.className = 'panel-section';
    relationship.innerHTML = '<div class="panel-title" id="npc-relationship-title">관계 기록</div><div id="npc-relationship" class="relationship-inline"></div>';
    panel.appendChild(relationship);
    const actions = document.createElement('section');
    actions.className = 'side-panel-footer';
    actions.innerHTML = '<div class="side-action-row"><button id="app-info-side-button" class="side-action-btn" type="button">📱 어플 정보</button><button id="resume-game-button" class="side-action-btn" type="button">▶ 플레이 재개</button></div>';
    actions.querySelector('#app-info-side-button').addEventListener('click', () => window.showAppInfo?.());
    actions.querySelector('#resume-game-button').addEventListener('click', () => window.resumeGame?.());
    panel.appendChild(actions);
    this.renderStats({});
  },

  updateContext(context) {
    const save = context?.save || {};
    const characterId = save.last_character_id;
    if (characterId) this.updateCharacter(characterId, context);
  },

  updateCharacter(characterId, context = state.context) {
    if (!characterId || characterId === 'narrator') return;
    const character = context?.master?.characters?.[characterId] || {};
    this.activeCharacterId = characterId;
    document.getElementById('character-info-title').textContent = `${character.name || characterId} 기본정보`;
    document.getElementById('npc-status-title').textContent = `${character.name || characterId} 상태`;
    this.renderCharacterInfo(character);
    const relationship = context?.save?.npc_relationship_state?.[characterId] || {};
    const playerEjaculationCount = Number.isInteger(relationship.player_ejaculation_count)
      ? Math.max(0, relationship.player_ejaculation_count)
      : 0;
    const npcOrgasmCount = Number.isInteger(relationship.npc_orgasm_count)
      ? Math.max(0, relationship.npc_orgasm_count)
      : 0;
    document.getElementById('npc-relationship-title').textContent = `${character.name || characterId} 관계 기록`;
    const relationshipRoot = document.getElementById('npc-relationship');
    relationshipRoot.replaceChildren();
    relationshipRoot.append('💦 사정 ', this.emphasis(`${playerEjaculationCount}회`), ' · ✨ 오르가즘 ', this.emphasis(`${npcOrgasmCount}회`));
    this.renderStats(context?.save?.npc_stats?.[characterId] || {}, characterId, context?.save?.npc_stat_changes?.[characterId]);
  },

  updateMind(emotion = {}) {
    document.getElementById('mind-surface').textContent = emotion.surface || '-';
    document.getElementById('mind-inner').textContent = emotion.inner || '-';
    document.getElementById('mind-physical').textContent = emotion.physical_reaction || '-';
  },

  renderStats(stats = {}, characterId = this.activeCharacterId, storedChanges = null) {
    const root = document.getElementById('npc-status');
    const previous = this.previousStats[characterId] || {};
    const next = {};
    root.className = 'npc-status npc-status-inline';
    root.replaceChildren();
    this.stats.forEach((stat, index) => {
      if (index) root.append(document.createTextNode(' · '));
      const value = Number(stats[stat.key]);
      const valueNode = document.createElement('span');
      valueNode.className = 'stat-value';
      valueNode.textContent = `${stat.label} ${Number.isFinite(value) ? value : '-'}`;
      if (Number.isFinite(value)) {
        valueNode.classList.add(this.signal(value));
        const storedDelta = Number(storedChanges?.[stat.key]?.delta);
        const previousValue = Number(previous[stat.key]);
        const delta = Number.isFinite(storedDelta) ? storedDelta : (Number.isFinite(previousValue) ? value - previousValue : null);
        if (delta) {
          const change = document.createElement('small');
          change.className = delta > 0 ? 'delta-up' : 'delta-down';
          change.textContent = `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`;
          valueNode.appendChild(change);
        }
        next[stat.key] = value;
      }
      root.append(valueNode);
    });
    if (characterId) this.previousStats[characterId] = next;
  },

  renderCharacterInfo(character = {}) {
    const root = document.getElementById('character-info');
    root.className = 'character-info-compact';
    root.replaceChildren();
    const appendLine = (text, className = '') => {
      if (!text) return;
      const line = document.createElement('div');
      if (className) line.className = className;
      line.textContent = text;
      root.appendChild(line);
    };
    const affiliation = character.affiliation || character.organization || character['소속'];
    appendLine(affiliation, 'character-affiliation');
    const age = this.withUnit(character.age || character['나이'], '세');
    const height = this.withUnit(character.height || character.height_cm || character['키'], 'cm');
    const weight = this.withUnit(character.weight || character.weight_kg || character['몸무게'], 'kg');
    const metrics = [['나이', age], ['키', height], ['몸무게', weight]].filter(([, value]) => value);
    appendLine(metrics.map(([label, value]) => `${label} ${value}`).join(' · '));
    appendLine(character.body_type || character['체형']);
    const relationship = character.relationship || character.current_relationship || character['연인관계'];
    const publicBackground = character.public_background || character.current_status || character.public_summary;
    appendLine([relationship ? `관계 ${relationship}` : '', publicBackground].filter(Boolean).join(' · '));
  },

  withUnit(value, unit) {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    const text = String(value).trim();
    return new RegExp(`${unit}$`, 'i').test(text) ? text : `${text}${unit}`;
  },

  emphasis(text) {
    const value = document.createElement('strong');
    value.textContent = text;
    return value;
  },

  signal(value) { return value >= 70 ? 'signal-green' : value >= 35 ? 'signal-yellow' : 'signal-red'; }
};

document.addEventListener('DOMContentLoaded', () => sidebar.init());
