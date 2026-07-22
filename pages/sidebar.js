const sidebar = {
  stats: ['호감도', '신뢰도', '최면깊이', '순응도', '최면저항력'],
  previousStats: {},

  init() {
    const panel = document.querySelector('.side-panel');
    panel.innerHTML = `
      <section class="panel-section"><img class="character-img hidden" id="character-img" alt="현재 캐릭터"></section>
      <section class="panel-section"><div class="panel-title" id="character-info-title">캐릭터 기본정보</div><div class="info-list" id="character-info"></div></section>
      <section class="panel-section"><div class="panel-title">마인드 모니터</div><div class="mind-monitor" id="mind-monitor"><div><b>표면의식</b><span>-</span></div><div><b>잠재의식</b><span>-</span></div><div><b>신체적·행동적 반응</b><span>-</span></div></div></section>
      <section class="panel-section"><div class="panel-title" id="npc-status-title">NPC 상태</div><div class="npc-status" id="npc-status"></div></section>`;
    ui.init();
    const relationship = document.createElement('section');
    relationship.className = 'panel-section';
    relationship.innerHTML = '<div class="panel-title" id="npc-relationship-title">관계 기록</div><div class="info-list" id="npc-relationship"></div>';
    panel.appendChild(relationship);
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
    const info = [
      ['캐릭터명', character.name || character['이름']],
      ['소속', character.affiliation || character.organization || character['소속']],
      ['나이', character.age || character['나이']],
      ['키·몸무게·체형', [character.height || character.height_cm || character['키'], character.weight || character.weight_kg || character['몸무게'], character.body_type || character['체형']].filter(Boolean).join(' / ')],
      ['현재 관계', character.relationship || character.current_relationship || character['연인관계']],
      ['공개 배경/상태', character.public_background || character.current_status || character.public_summary]
    ];
    document.getElementById('character-info-title').textContent = `${character.name || characterId} 기본정보`;
    document.getElementById('npc-status-title').textContent = `${character.name || characterId} 상태`;
    document.getElementById('character-info').replaceChildren(...info.map(([label, value]) => this.row(label, value || '-')));
    const relationship = context?.save?.npc_relationship_state?.[characterId] || {};
    const relationRows = [
      ['플레이어와의 경험', relationship.sexual_experience_with_player === true ? '있음' : '없음'],
      ['누적 기록', Number.isFinite(Number(relationship.orgasm_count_with_player)) ? `${relationship.orgasm_count_with_player}회` : '0회'],
      ['상태', relationship.virgin_status === 'yes' ? 'yes' : relationship.virgin_status === 'no' ? 'no' : 'unknown']
    ];
    document.getElementById('npc-relationship-title').textContent = `${character.name || characterId} 관계 기록`;
    document.getElementById('npc-relationship').replaceChildren(...relationRows.map(([label, value]) => this.row(label, value)));
  },

  updateMind(emotion = {}) {
    const values = [emotion.surface, emotion.inner, emotion.physical_reaction];
    document.querySelectorAll('#mind-monitor span').forEach((node, index) => { node.textContent = values[index] || '-'; });
  },

  renderStats(stats = {}) {
    const root = document.getElementById('npc-status');
    root.replaceChildren(...this.stats.map(label => {
      const value = Number(stats[label]);
      const previous = this.previousStats[label];
      const delta = Number.isFinite(value) && Number.isFinite(previous) ? value - previous : null;
      const row = this.row(label, Number.isFinite(value) ? value : '-');
      const valueNode = row.querySelector('.stat-value');
      if (Number.isFinite(value)) valueNode.classList.add(this.signal(value));
      if (delta) {
        const change = document.createElement('small');
        change.className = delta > 0 ? 'delta-up' : 'delta-down';
        change.textContent = ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`;
        valueNode.appendChild(change);
      }
      if (Number.isFinite(value)) this.previousStats[label] = value;
      return row;
    }));
  },

  signal(value) { return value >= 70 ? 'signal-green' : value >= 35 ? 'signal-yellow' : 'signal-red'; },
  row(label, value) {
    const row = document.createElement('div'); row.className = 'stat-row';
    const name = document.createElement('span'); name.className = 'stat-label'; name.textContent = label;
    const current = document.createElement('span'); current.className = 'stat-value'; current.textContent = value;
    row.append(name, current); return row;
  }
};

document.addEventListener('DOMContentLoaded', () => sidebar.init());
