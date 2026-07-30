const sidebar = {
  stats: [
    { key: '호감도', label: '호감' },
    { key: '상식수용도', label: '수용' },
    { key: '성적흥분도', label: '흥분' }
  ],
  previousStats: {},

  init() {
    const panel = document.querySelector('.side-panel');
    panel.innerHTML = `
      <section class="panel-section player-card" id="player-info-section">
        <div class="player-card-name" id="player-info-identity">-</div>
        <div class="player-card-sub" id="player-info-status"></div>
        <div class="player-card-metrics" id="player-info-metrics"></div>
        <div class="player-card-world" id="player-info-world"></div>
      </section>
      <section class="panel-section"><img class="character-img hidden" id="character-img" alt="현재 캐릭터"></section>
      <section class="panel-section"><div class="panel-title" id="character-info-title">캐릭터 기본정보</div><div class="info-list" id="character-info"></div></section>
      <section class="panel-section"><div class="panel-title" id="npc-status-title">NPC 상태</div><div class="npc-status" id="npc-status"></div></section>
      <section class="panel-section"><div class="panel-title">마인드 모니터</div><div class="mind-monitor" id="mind-monitor"><div class="mind-item"><b>표면의식</b><blockquote id="mind-surface">-</blockquote></div><div class="mind-item"><b>잠재의식</b><blockquote id="mind-inner">-</blockquote></div><div class="mind-item"><b>신체적·행동적 반응</b><p id="mind-physical">-</p></div></div></section>`;
    ui.init();
    // H3-A item 8: the audio element lives outside .side-panel now, but
    // re-resolve/re-bind it here anyway after every panel re-render so
    // tts.audio (and ui.els.audioPlayer) never drift onto a stale reference.
    tts.rebindAudioElement?.();
    const relationship = document.createElement('section');
    relationship.className = 'panel-section';
    relationship.innerHTML = '<div class="panel-title" id="npc-relationship-title">관계 기록</div><div id="npc-relationship" class="relationship-inline"></div>';
    panel.appendChild(relationship);
    const innerThought = document.createElement('section');
    innerThought.className = 'panel-section';
    innerThought.id = 'player-inner-thought-section';
    innerThought.innerHTML = '<div class="panel-title">플레이어 속마음</div><div id="player-inner-thought" class="player-inner-thought">-</div>';
    panel.appendChild(innerThought);
    const actions = document.createElement('section');
    actions.className = 'side-panel-footer';
    actions.innerHTML = '<div class="side-action-row"><button id="app-info-side-button" class="side-action-btn" type="button">📱 상식개변 앱</button><button id="resume-game-button" class="side-action-btn" type="button">▶ 플레이 재개</button></div>'
      + '<div class="side-action-row"><button id="reset-side-button" class="side-action-btn" type="button">🔄 리셋</button><button id="feedback-side-button" class="side-action-btn" type="button">✏️ 피드백</button></div>';
    actions.querySelector('#app-info-side-button').addEventListener('click', () => window.csaApp?.open('home'));
    actions.querySelector('#resume-game-button').addEventListener('click', () => window.resumeGame?.());
    actions.querySelector('#reset-side-button').addEventListener('click', () => window.showResetModal?.());
    actions.querySelector('#feedback-side-button').addEventListener('click', () => window.showFeedbackModal?.());
    panel.appendChild(actions);
    this.renderStats({});
    this.setSetupVisibility(false);
  },

  updateContext(context) {
    const save = context?.save || {};
    const setupComplete = save?.player_setup?.status === 'complete';
    this.setSetupVisibility(setupComplete);
    if (!setupComplete) {
      this.activeCharacter = null;
      this.activeCharacterId = null;
      document.getElementById('character-img')?.classList.add('hidden');
      document.getElementById('character-info')?.replaceChildren();
      document.getElementById('npc-status')?.replaceChildren();
      document.getElementById('npc-relationship')?.replaceChildren();
      this.updateMind({});
      return;
    }
    const characterId = save.last_character_id;
    if (characterId) this.updateCharacter(characterId, context);
    this.updatePlayerInfo(save);
    this.updatePlayerInnerThought(save.player_inner_thought, save?.player?.name);
  },

  // Compact player card: name/age/profession line, a separate current-status
  // line (job's text after the first "/", e.g. "건축설계사 / 오른쪽 발목 인대
  // 파열로 3병동 입원 4일차" — the long background text never fills this
  // card), body metrics, then location/time. Each sub-line hides itself when
  // empty instead of leaving a blank row.
  updatePlayerInfo(save = {}) {
    const player = save?.player || {};
    const worldState = save?.world_state || {};

    const jobText = typeof player.job === 'string' ? player.job : '';
    const slashIndex = jobText.indexOf('/');
    const profession = (slashIndex >= 0 ? jobText.slice(0, slashIndex) : jobText).trim();
    const currentStatus = slashIndex >= 0 ? jobText.slice(slashIndex + 1).trim() : '';

    const identity = [player.name, this.withUnit(player.age, '세'), profession || player.background]
      .filter(value => typeof value === 'string' && value.trim())
      .join(' · ');
    const identityEl = document.getElementById('player-info-identity');
    if (identityEl) identityEl.textContent = identity || '-';

    const statusEl = document.getElementById('player-info-status');
    if (statusEl) {
      statusEl.textContent = currentStatus;
      statusEl.style.display = currentStatus ? '' : 'none';
    }

    const metrics = [
      this.withUnit(player.height_cm, 'cm'),
      this.withUnit(player.weight_kg, 'kg'),
      this.withUnit(player.penis_length_cm, 'cm')
    ].filter(Boolean).join(' · ');
    const metricsEl = document.getElementById('player-info-metrics');
    if (metricsEl) {
      metricsEl.textContent = metrics;
      metricsEl.style.display = metrics ? '' : 'none';
    }

    const location = worldState.location_label || player.location || save.player_location || '';
    const time = worldState.time_label || '';
    const worldParts = [location ? `📍 ${location}` : '', time ? `🕒 ${time}` : ''].filter(Boolean);
    const worldEl = document.getElementById('player-info-world');
    if (worldEl) {
      worldEl.textContent = worldParts.join('  ');
      worldEl.style.display = worldParts.length ? '' : 'none';
    }
  },

  updatePlayerInnerThought(text, playerName = '') {
    const section = document.getElementById('player-inner-thought-section');
    const root = document.getElementById('player-inner-thought');
    if (!root) return;
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value) {
      if (section) section.style.display = 'none';
      root.textContent = '-';
      return;
    }
    if (section) section.style.display = '';
    // Stored values are just the body after "속마음:" — the UI prefixes the
    // player's name unless the value already carries a "속마음:" prefix
    // (defends against a saved value that already includes it).
    const name = typeof playerName === 'string' ? playerName.trim() : '';
    const alreadyPrefixed = /속마음\s*:/.test(value.slice(0, 40));
    root.textContent = alreadyPrefixed || !name ? value : `${name} 속마음: ${value}`;
  },

  setSetupVisibility(visible) {
    document.querySelectorAll('.side-panel > .panel-section').forEach(section => {
      section.hidden = !visible;
    });
  },

  updateCharacter(characterId, context = state.context) {
    if (!characterId || characterId === 'narrator') return;
    const character = context?.master?.characters?.[characterId] || {};
    this.activeCharacter = character;
    this.activeCharacterId = characterId;
    document.getElementById('character-info-title').textContent = `${character.name || characterId} 기본정보`;
    document.getElementById('npc-status-title').textContent = `${character.name || characterId} 상태`;
    this.renderCharacterInfo(character);
    const relationship = context?.save?.npc_relationship_state?.[characterId] || {};
    const history = relationship?.sexual_history || {};
    const number = (key, fallback = 0) => Number.isFinite(Number(history[key])) ? Math.max(0, Number(history[key])) : fallback;
    const playerEjaculationCount = number('player_ejaculation_count', Math.max(0, Number(relationship.player_ejaculation_count) || 0));
    const npcOrgasmCount = number('npc_orgasm_count', Math.max(0, Number(relationship.npc_orgasm_count) || 0));
    document.getElementById('npc-relationship-title').textContent = `${character.name || characterId} 관계 기록`;
    const relationshipRoot = document.getElementById('npc-relationship');
    relationshipRoot.replaceChildren();
    const summaryRoot = document.createElement('div');
    summaryRoot.className = 'relationship-summary';
    const createItem = (label, value) => {
      const item = document.createElement('span');
      item.className = 'relationship-item';
      item.append(`${label} `);
      item.append(value > 0 ? this.emphasis(String(value)) : document.createTextNode(String(value)));
      return item;
    };
    const createTextItem = (label, value) => {
      const item = document.createElement('span');
      item.className = 'relationship-item';
      item.textContent = `${label} ${value}`;
      return item;
    };
    const createRow = (...items) => {
      const row = document.createElement('div');
      row.className = 'relationship-row';
      row.append(...items);
      return row;
    };
    summaryRoot.append(
      createRow(createItem('✨ 절정', npcOrgasmCount), createItem('💦 사정', playerEjaculationCount)),
      createRow(
        createItem('🌸 질', number('vaginal_sex_count')),
        createItem('🍑 애널', number('anal_sex_count')),
        createItem('👄 구강', number('oral_sex_count'))
      )
    );
    relationshipRoot.appendChild(summaryRoot);
    const details = document.createElement('details');
    details.className = 'relationship-details';
    const summary = document.createElement('summary'); summary.textContent = '상세 기록'; details.appendChild(summary);
    const vaginal = Number.isInteger(history.first_vaginal_turn) ? `${history.first_vaginal_turn}턴` : '미완';
    const anal = Number.isInteger(history.first_anal_turn) ? `${history.first_anal_turn}턴` : '미완';
    details.append(
      createRow(createTextItem('🌸 질 개통', vaginal)),
      createRow(createTextItem('🍑 애널 개통', anal)),
      createRow(
        createItem('💦 질내', number('vaginal_ejaculation_count')),
        createItem('🍑 애널내', number('anal_ejaculation_count'))
      ),
      createRow(
        createItem('👄 입안', number('oral_ejaculation_count')),
        createItem('😳 얼굴', number('facial_ejaculation_count'))
      ),
      createRow(
        createItem('🫧 몸', number('body_ejaculation_count')),
        createItem('❔ 미정', number('unspecified_ejaculation_count'))
      )
    );
    relationshipRoot.appendChild(details);
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
    const directResistance = Number(this.activeCharacter?.['상식저항력']);
    const legacyResistance = Number(this.activeCharacter?.['최면저항력초기']);
    const resistance = Number.isFinite(directResistance) ? directResistance : (Number.isFinite(legacyResistance) ? legacyResistance : 50);
    root.className = 'npc-status npc-status-inline';
    root.replaceChildren();
    this.stats.forEach((stat, index) => {
      if (index) root.append(document.createTextNode(' · '));
      let value = Number(stats[stat.key]);
      if (stat.key === '상식수용도' && !Number.isFinite(value)) value = Math.max(0, Math.min(100, 100 - resistance));
      if (stat.key === '성적흥분도' && !Number.isFinite(value)) value = 0;
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
    root.append(document.createTextNode(' · '));
    const resistanceNode = document.createElement('span');
    resistanceNode.className = 'stat-value';
    resistanceNode.textContent = `저항 ${Math.max(0, Math.min(100, resistance))}`;
    root.append(resistanceNode);
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
    // Public profile fields — each line appears only when at least one of
    // its fields is actually set on this character; nothing is filled with
    // a placeholder or derived guess for a missing value. The new
    // department/rank fields take priority over the older combined 소속
    // text when both happen to be present, to avoid showing the same fact
    // twice.
    const deptRank = [character.department, character.rank]
      .filter(value => typeof value === 'string' && value.trim())
      .join(' ');
    if (deptRank) {
      appendLine(deptRank, 'character-affiliation');
    } else {
      const affiliation = character.affiliation || character.organization || character['소속'];
      appendLine(affiliation, 'character-affiliation');
    }

    const experienceParts = [];
    if (character.career_years !== undefined && character.career_years !== null && character.career_years !== '') {
      experienceParts.push(`총경력 ${character.career_years}년`);
    }
    if (character.rank_years !== undefined && character.rank_years !== null && character.rank_years !== ''
      && typeof character.rank === 'string' && character.rank.trim()) {
      experienceParts.push(`${character.rank.trim()} ${character.rank_years}년차`);
    }
    appendLine(experienceParts.join(' · '));

    const addressParts = [character.formal_title, character.peer_address]
      .filter(value => typeof value === 'string' && value.trim())
      .map(value => value.trim());
    if (addressParts.length) appendLine(`공식 호칭: ${addressParts.join(' / ')}`);

    const age = this.withUnit(character.age || character['나이'], '세');
    const height = this.withUnit(character.height || character.height_cm || character['키'], 'cm');
    const weight = this.withUnit(character.weight || character.weight_kg || character['몸무게'], 'kg');
    const cup = character.cup || character.npc_컵 || character['컵'];
    const metrics = [['나이', age], ['키', height], ['몸무게', weight]].filter(([, value]) => value);
    appendLine(metrics.map(([label, value]) => `${label} ${value}`).join(' · '));
    appendLine(character.body_type || character['체형']);
    appendLine(cup ? `가슴 ${cup}` : '');
    const relationship = character.relationship || character.current_relationship || character['연인관계'];
    const publicBackground = character.public_background || character.current_status || character.public_summary;
    appendLine([relationship ? `관계 ${relationship}` : '', publicBackground].filter(Boolean).join(' · '));
  },

  withUnit(value, unit) {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    if (typeof value === 'number' && value <= 0) return '';
    const text = String(value).trim();
    if (/^0(?:\.0+)?$/.test(text)) return '';
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
