from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return updated


worker_path = ROOT / 'worker/game-proxy-v2.js'
worker = worker_path.read_text(encoding='utf-8')

worker = replace_once(
    worker,
    "const DEFAULT_SUPABASE_URL = 'https://ovltkzwddxsekcfeskds.supabase.co';",
    "const DEFAULT_SUPABASE_URL = 'https://ovltkzwddxsekcfeskds.supabase.co';\nconst GAMEPLAY_MODE = 'csa_only';",
    'mode constant'
)

helper_anchor = """function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
"""
helper_block = helper_anchor + """

const CSA_ONLY_HIDDEN_NPC_STAT_KEYS = new Set([
  '최면깊이', '순응도', '최면저항력',
  'hypnosis_depth', 'compliance', 'resistance'
]);

function csaOnlyNpcStats(stats = {}) {
  if (!isPlainObject(stats)) return {};
  return Object.fromEntries(Object.entries(stats)
    .filter(([key]) => !CSA_ONLY_HIDDEN_NPC_STAT_KEYS.has(key)));
}

function csaOnlyNpcStatChanges(changes = {}) {
  if (!isPlainObject(changes)) return {};
  return Object.fromEntries(Object.entries(changes)
    .filter(([key]) => !CSA_ONLY_HIDDEN_NPC_STAT_KEYS.has(key)));
}

function buildCsaOnlySaveView(save = {}) {
  const source = isPlainObject(save) ? save : {};
  const view = { ...source };
  delete view.active_suggestions;
  if (isPlainObject(source.npc_stats)) {
    view.npc_stats = Object.fromEntries(Object.entries(source.npc_stats)
      .map(([characterId, stats]) => [characterId, csaOnlyNpcStats(stats)]));
  }
  if (isPlainObject(source.npc_stat_changes)) {
    view.npc_stat_changes = Object.fromEntries(Object.entries(source.npc_stat_changes)
      .map(([characterId, changes]) => [characterId, csaOnlyNpcStatChanges(changes)]));
  }
  return view;
}

function buildCsaOnlyPublicContext(ctx = {}) {
  if (!isPlainObject(ctx)) return ctx;
  return { ...ctx, save: buildCsaOnlySaveView(ctx.save) };
}
"""
worker = replace_once(worker, helper_anchor, helper_block, 'CSA-only helpers')
worker = replace_once(worker, '    context: ctx,', '    context: buildCsaOnlyPublicContext(ctx),', 'public context sanitizer')

worker = sub_once(
    worker,
    r"function buildAppStrengthExampleSection\(system\) \{.*?\n\}\n\nfunction buildAppStrengthValidationPrompt\(candidates, master\) \{.*?\n\}",
    """function buildAppStrengthExampleSection(system) {
  const tiers = ['weak', 'medium', 'strong'];
  const csaSection = tiers
    .map(tier => formatAppStrengthExampleTier(tier, readAppStrengthExamples(system, 'csa_examples', tier)))
    .join('\\n\\n');
  return `[상식개변 룰북 예시]\\n\\n${csaSection}`;
}

function buildAppStrengthValidationPrompt(candidates, master) {
  const system = isPlainObject(master?.rulebook_game_system) ? master.rulebook_game_system : {};
  const exampleSection = buildAppStrengthExampleSection(system);
  return `너는 상식개변 어플에 입력된 사회 규범의 최소 필요 강도를 판정한다.

각 입력마다 weak, medium, strong, unsupported 중 하나를 반환한다.
- weak: 분위기·대화·가벼운 접촉·부끄러움 완화 수준
- medium: 특정 공간의 제한적 행동·노출·접촉을 정상 절차로 재해석
- strong: 공간 전체의 업무·절차·예절·핵심 금기를 직접 재작성
- unsupported: 물리적으로 불가능하거나 세계 규칙을 무시하거나 즉각적인 자기파괴를 요구

강도는 확신과 사회적 압력만 바꾸며 문장의 의미 범위를 확대하지 않는다.
selected_strength에 맞춰 required_strength를 낮추지 않는다.
모든 후보에 정확히 하나의 결과를 반환하고 client_id를 그대로 복사한다.
reason은 80자 이하 한국어 문장으로 작성하고 JSON 이외의 텍스트를 출력하지 않는다.

${exampleSection}

[판정 대상]
${JSON.stringify(candidates)}

[요구 JSON]
{"results":[{"client_id":"입력값 그대로","required_strength":"weak|medium|strong|unsupported","reason":"80자 이하 이유"}]}`;
}""",
    'CSA-only strength prompt'
)

validation_anchor = """  if (!ctx?.master || !ctx?.save || !Number.isInteger(ctx?.turn_count)) return jsonResponse({ error: 'game context not found' }, 404);
  const result = planStructuredAction(ctx.save, ctx.master, structured_action, {
"""
validation_replacement = """  if (!ctx?.master || !ctx?.save || !Number.isInteger(ctx?.turn_count)) return jsonResponse({ error: 'game context not found' }, 404);
  if (structured_action?.type === 'app_transaction'
    && (!Array.isArray(structured_action.operations)
      || structured_action.operations.some(operation => operation?.domain !== 'csa'))) {
    return jsonResponse({
      error: '이 버전은 상식개변만 지원합니다.',
      error_code: 'CSA_ONLY_MODE',
      issues: [{ code: 'CSA_ONLY_MODE', message: '개인 암시와 최면 기능은 비활성화되어 있습니다.' }]
    }, 422);
  }
  const result = planStructuredAction(ctx.save, ctx.master, structured_action, {
"""
worker = replace_once(worker, validation_anchor, validation_replacement, 'app validation guard')

worker = sub_once(
    worker,
    r"function buildAppManualPayload\(master, save, turnCount = 0\) \{.*?\n\}\n\nconst NPC_MIND_STATES",
    """function buildAppManualPayload(master, save, turnCount = 0) {
  const capability = calculateHypnosisCapability(save, master);
  const level = capability.current_level;
  const limits = getCsaLimits(level);
  const progress = level >= 10
    ? 100
    : Math.max(0, Math.min(100, Math.round(capability.exp / capability.next_level_exp * 100)));
  const tierRank = hypnosisStrengthRank(capability.available_strength);
  const csaTiers = MANUAL_TIER_META.map(([id, label, unlockLevel]) => ({
    id,
    label,
    unlock_level: unlockLevel,
    available: level >= unlockLevel,
    description: MANUAL_CSA_TIER_DESCRIPTIONS[id],
    examples: normalizeManualExamples(MANUAL_CSA_EXAMPLES[id], tierRank >= hypnosisStrengthRank(label))
  }));
  const remainingCsaSlots = Math.max(0, capability.csa_max_active - capability.csa_active_count);
  const diagnostics = [remainingCsaSlots > 0
    ? { type: 'success', text: `새 상식개변을 등록할 수 있습니다. 남은 슬롯 ${remainingCsaSlots}개.` }
    : { type: 'warning', text: `활성 슬롯이 ${capability.csa_active_count}/${capability.csa_max_active}로 가득 찼습니다. 기존 개변을 수정하거나 해제할 수 있습니다.` }];
  const activeCommonSense = (Array.isArray(save?.csa_active) ? save.csa_active : [])
    .filter(item => item?.active === true)
    .map(item => ({ strength: item.strength || '약함', scope_label: item.scope_label || '현재 범위', content: typeof item.content === 'string' ? item.content : '' }));
  return {
    version: 2,
    mode: GAMEPLAY_MODE,
    title: '상식개변 어플 사용자 매뉴얼',
    subtitle: '이 버전은 개인 암시와 최면 기능 없이 공간의 사회적 상식만 변경합니다.',
    status: {
      level,
      exp: capability.exp,
      next_level_exp: capability.next_level_exp,
      exp_percent: progress,
      available_strength: capability.available_strength,
      csa_active: capability.csa_active_count,
      csa_max: capability.csa_max_active,
      csa_scope_type: limits.scope_type,
      csa_scope_label: MANUAL_SCOPE_LABELS[limits.scope_type]
    },
    diagnostics,
    quick_start: [
      '상식개변은 지정 공간 안의 사회적 상식만 변경합니다.',
      '변경은 반드시 상식개변 어플 UI에서 생성·수정·해제합니다.',
      '강도는 직접 의미 범위 안의 확신과 사회적 압력만 바꾸며 의미 범위를 넓히지 않습니다.',
      '범위를 벗어나면 현재 적용은 멈추지만 이미 벌어진 사건의 기억은 유지됩니다.',
      '매뉴얼 열람과 탭 이동은 턴을 소비하지 않습니다.'
    ],
    common_sense: {
      title: '상식개변',
      description: '특정 개인이 아니라 지정 공간의 사회적 규범을 변경합니다. 범위 안의 인물은 각자의 성격을 유지한 채 그 규범을 당연한 전제로 받아들입니다.',
      rules: [
        'activate는 새 항목과 활성 슬롯을 만듭니다.',
        'update는 같은 슬롯에서 내용·강도·범위를 변경합니다.',
        'deactivate는 효과만 해제하며 기억과 현재 물리 상태는 유지합니다.',
        '여러 항목을 합쳐 어느 항목에도 없는 더 강한 규칙을 만들지 않습니다.',
        '직접 의미 범위 밖 행동은 NPC의 성격·관계·상황과 자발적 선택으로 별도 판정합니다.',
        '현재 강도·공간 범위·활성 슬롯을 넘는 요청은 저장되지 않습니다.'
      ],
      current_scope: { type: limits.scope_type, label: MANUAL_SCOPE_LABELS[limits.scope_type] },
      scope_unlocks: [[1, 'Lv.1~3'], [4, 'Lv.4~6'], [7, 'Lv.7~9'], [10, 'Lv.10']]
        .map(([unlockLevel, levelRange]) => {
          const item = getCsaLimits(unlockLevel);
          return { level_range: levelRange, scope_type: item.scope_type, scope_label: MANUAL_SCOPE_LABELS[item.scope_type], max_active: item.max_active, available: level >= unlockLevel };
        }),
      tiers: csaTiers
    },
    hospital_map: buildHospitalMapPayload(master, save),
    stats: [
      { id: 'affinity', label: '호감도', range: '0~100', description: 'NPC가 플레이어에게 느끼는 감정적 호의입니다.', change_rule: '턴당 최대 -5~+5' },
      { id: 'trust', label: '신뢰도', range: '0~100', description: 'NPC가 플레이어의 말과 행동, 신분과 의도를 믿는 정도입니다.', change_rule: '턴당 최대 -5~+5' }
    ],
    unlocks: [
      { level: 1, items: ['약함 강도', '병동 범위', '활성 1개'] },
      { level: 3, items: ['중간 강도'] },
      { level: 4, items: ['층 범위', '활성 2개'] },
      { level: 5, items: ['강함 강도'] },
      { level: 7, items: ['건물 범위', '활성 3개'] },
      { level: 10, items: ['전 세계 범위', '활성 4개'] }
    ],
    active_effects: { common_sense: activeCommonSense },
    common_failures: [
      { title: '새 상식개변을 만들 수 없음', reasons: ['활성 슬롯이 가득 찼습니다.', '요청 범위나 강도가 현재 레벨 한도를 넘었습니다.', '내용이 어플 지원 범위를 벗어났습니다.'] },
      { title: '수정·해제가 적용되지 않음', reasons: ['대상 항목을 찾지 못했습니다.', '실제로 변경되는 값이 없습니다.', '이미 비활성 상태입니다.'] }
    ]
  };
}

const NPC_MIND_STATES""",
    'CSA-only manual payload'
)

worker = sub_once(
    worker,
    r"function buildAppStatePayload\(master, save, turnCount = 0\) \{.*?\n\}\n\n// ─+\n// 2\. /api/story",
    """function buildAppStatePayload(master, save, turnCount = 0) {
  const manual = buildAppManualPayload(master, save, turnCount);
  const characters = isPlainObject(master?.characters) ? master.characters : {};
  const currentIds = getCurrentPresentNpcIds(save, characters);
  const currentWorld = isPlainObject(save?.world_state) ? save.world_state : {};
  const locations = isPlainObject(save?.npc_locations) ? save.npc_locations : {};
  const npcs = Object.entries(characters).map(([character_id, character]) => {
    const emotion = isPlainObject(save?.npc_emotion?.[character_id]) ? save.npc_emotion[character_id] : {};
    const savedLocation = isPlainObject(locations?.[character_id]) ? locations[character_id] : null;
    const fallbackLocation = !savedLocation && character_id === save?.last_character_id && currentWorld.location_label
      ? { ...currentWorld, updated_turn: null }
      : null;
    const location = savedLocation || fallbackLocation;
    const relationship = isPlainObject(save?.npc_relationship_state?.[character_id]) ? save.npc_relationship_state[character_id] : {};
    return {
      character_id,
      name: character?.name || character?.['이름'] || '',
      role: character?.직책 || character?.job || character?.role || character?.소속 || character?.affiliation || '',
      present_now: currentIds.includes(character_id),
      can_find: Boolean(location?.location_label) && !currentIds.includes(character_id),
      mind: {
        state: normalizeNpcMindState(emotion.state, emotion),
        state_label: NPC_MIND_STATE_LABELS[normalizeNpcMindState(emotion.state, emotion)] || '상태 미확인',
        surface: typeof emotion.surface === 'string' ? emotion.surface : '',
        inner: typeof emotion.inner === 'string' ? emotion.inner : '',
        physical_reaction: typeof emotion.physical_reaction === 'string' ? emotion.physical_reaction : '',
        updated_turn: Number.isInteger(emotion.updated_turn) ? emotion.updated_turn : null
      },
      location: {
        known: Boolean(location?.location_label),
        location_label: location?.location_label || '',
        ward: location?.ward || '',
        floor: location?.floor || '',
        building: location?.building || '',
        updated_turn: Number.isInteger(location?.updated_turn) ? location.updated_turn : null
      },
      stats: csaOnlyNpcStats(save?.npc_stats?.[character_id]),
      profile: buildPublicNpcProfile(character),
      body: buildPublicNpcBody(character),
      relationship_record: buildNpcRelationshipRecord(save, character_id),
      private_info: buildNpcPrivateInfo(character, relationship)
    };
  });
  const strength_options = [['weak', '약함', 1], ['medium', '중간', 3], ['strong', '강함', 5]]
    .map(([id, label, unlock_level]) => ({ id, label, available: manual.status.level >= unlock_level, unlock_level }));
  const scope_options = [['ward', '병동', 1], ['floor', '해당 층 전체', 4], ['building', '건물 전체', 7], ['world', '전 세계', 10]]
    .map(([id, label, unlock_level]) => ({ id, label, available: manual.status.level >= unlock_level, unlock_level }));
  const common_sense = (Array.isArray(save?.csa_active) ? save.csa_active : [])
    .filter(item => item?.active === true)
    .map(item => ({ id: item.id, strength: appStrengthId(item.strength), strength_label: item.strength || '약함', content: item.content || '', scope_type: item.scope_type || '', scope_label: item.scope_label || '', created_turn: item.created_turn ?? null }));
  return {
    version: 2,
    mode: GAMEPLAY_MODE,
    title: '상식개변 어플',
    turn_count: Number.isInteger(turnCount) ? turnCount : 0,
    home: { status: manual.status, diagnostics: manual.diagnostics, current_location: currentWorld.location_label || save?.player_location || '', current_npc_ids: currentIds },
    strength_options,
    scope_options,
    npcs,
    common_sense,
    manual
  };
}

// ─────────────────────────────────────────────
// 2. /api/story""",
    'CSA-only app state payload'
)

worker = sub_once(
    worker,
    r"function resolveHypnosisAppUiRoute\(input, characters = \{\}\) \{.*?\n\}",
    """function resolveHypnosisAppUiRoute(input, characters = {}) {
  const text = String(input || '').trim();
  if (!text) return null;
  const excluded = /하지\\s*않|하지\\s*말|말라고|할까|고민|생각해\\s*본다|떠올린다|과거|예전에|말했다|물었다|뜻이\\s*뭐|무엇인지/.test(text)
    && !/수정|변경|바꿔|교체|강화|약화/.test(text);
  const management = /추가|등록|생성|새로|적용|수정|변경|바꿔|교체|강화|약화|삭제|제거|해제|취소|끄기|켜기|활성화|비활성화|목록|확인|관리|편집/;
  if (!excluded && /상식\\s*개변|상식개변|상식\\s*변경|개변된\\s*상식/.test(text) && management.test(text)) {
    return { tab: 'csa', character_id: null, notice: '상식개변 어플을 엽니다.' };
  }
  if (!excluded && /개인\\s*암시|활성\\s*암시|최면/.test(text) && management.test(text)) {
    return { tab: 'csa', character_id: null, notice: 'CSA-only 버전에서는 개인 암시와 최면을 지원하지 않습니다. 상식개변만 사용할 수 있습니다.' };
  }
  if (/(?:상식개변|어플|앱).*(?:사용법|매뉴얼|설명|정보)|(?:사용법|매뉴얼|설명|정보).*(?:상식개변|어플|앱)/.test(text)) {
    return { tab: 'manual', character_id: null, notice: '상식개변 어플 매뉴얼을 엽니다.' };
  }
  if (/(?:상식개변\\s*)?(?:어플|앱)\\s*열어|앱\\s*상태\\s*보여/.test(text)) {
    return { tab: 'home', character_id: null, notice: '상식개변 어플을 엽니다.' };
  }
  return null;
}""",
    'CSA-only input route'
)

plan_anchor = """  if (!action) return { ok: false, status: 422, error_code: 'INVALID_ACTION', issues: [appIssue(rawAction, 'INVALID_ACTION', '잘못된 최면 어플 작업입니다.')] };
  if (action.base_turn_count !== context.turnCount)"""
plan_replacement = """  if (!action) return { ok: false, status: 422, error_code: 'INVALID_ACTION', issues: [appIssue(rawAction, 'INVALID_ACTION', '잘못된 상식개변 어플 작업입니다.')] };
  if (action.type === 'app_transaction' && action.operations.some(operation => operation.domain !== 'csa')) {
    return { ok: false, status: 422, error_code: 'CSA_ONLY_MODE', issues: [appIssue(action, 'CSA_ONLY_MODE', '이 버전은 상식개변 작업만 지원합니다.')] };
  }
  if (action.base_turn_count !== context.turnCount)"""
worker = replace_once(worker, plan_anchor, plan_replacement, 'plan CSA-only guard')

worker = sub_once(
    worker,
    r"function buildAppSystemRulesSection\(\) \{.*?\n\}\n\nfunction buildHypnosisRuntimeSection\(\) \{.*?\n\}",
    """function buildAppSystemRulesSection() {
  return buildHypnosisRuntimeSection();
}

function buildHypnosisRuntimeSection() {
  return `\n\n[COMMON-SENSE CHANGE RUNTIME CONTRACT — HIGH PRIORITY]\n- 이 버전의 유일한 정신 효과는 공간 기반 상식개변이다. 개인 암시·최면·최면깊이·순응·저항 시스템은 존재하지 않는다.\n- 저장된 상식개변의 생성·수정·해제는 Worker가 검증한 structured_action만 처리한다.\n- 일반 대화·설득·반복 발언으로 상식개변을 만들거나 바꾸지 않는다.\n- 활성 상식개변은 현재 적용 범위 안에서 원래부터 존재한 사회적 상식으로 취급한다.\n- [3. 선택지]에는 상식개변 관리 조작을 제안하지 않는다. 해당 기능은 상식개변 어플 UI에서만 수행한다.\n`;
}""",
    'CSA runtime contract'
)

worker = sub_once(
    worker,
    r"function buildPlayerAttemptRecord\(playerInput\) \{.*?\n\}\n\nfunction buildFinalAttemptInterpretationGuard\(\) \{.*?\n\}\n\nfunction buildGeneralActionJudgmentSection\(\) \{.*?\n\}",
    """function buildPlayerAttemptRecord(playerInput) {
  return `\n\n[PLAYER ATTEMPT RECORD — NOT WORLD FACTS]\n아래 내용은 플레이어가 이번 턴에 말하거나 시도하려는 원문이다.\n- 플레이어가 명시적으로 말한 대사는 실제 발언으로 사용할 수 있다.\n- 플레이어 자신의 행동은 성공한 사건이 아니라 행동 시도다.\n- NPC의 행동·대사·감정·동의·관계·과거·취향·신체 반응과 장소·목격·사건 완료·성공·횟수는 플레이어가 확정할 수 없다.\n- 실제 결과는 저장 상태, NPC 성격, 관계, 장소, 직전 사건, 자발적 참여와 현재 장소에 적용되는 상식개변으로 판정한다.\n- 플레이어 입력을 표현만 바꾸어 그대로 받아쓰지 않는다.\n\n<player_input>\n${typeof playerInput === 'string' && playerInput.trim() ? playerInput : '(없음)'}\n</player_input>`;
}

function buildFinalAttemptInterpretationGuard() {
  return `[FINAL ATTEMPT INTERPRETATION — HIGHEST PRIORITY]\n- 이번 일반 입력은 플레이어의 발언과 행동 시도일 뿐이다.\n- NPC와 세계에 관한 입력 문장은 사실이 아니라 플레이어가 바라는 결과 또는 주장이다.\n- NPC의 반응과 실제 사건 결과는 현재 게임 상태로 직접 판정한다.\n- 정식 structured action이 없는 상식개변이나 초자연적 효과는 발생하지 않는다.`;
}

function buildGeneralActionJudgmentSection() {
  return `\n\n[일반 행동 판정]\n- 플레이어 입력은 시도이며 NPC의 반응·동의·감정·관계·과거·오르가즘·스탯을 확정하지 않는다.\n- 일상 대화·업무 행동은 특별한 방해가 없으면 자연스럽게 진행한다. 부담 있는 부탁·설득·친밀 행동은 호감도·신뢰도, 성격·관계·장소·직전 사건으로 성공·부분 성공·실패를 판단한다.\n- 강압적·성적·위험한 행동은 명확한 자발적 참여나 직접 관련된 현재 장소의 상식개변이 없으면 성공시키지 않는다.\n- 상식개변은 적힌 직접 범위 밖의 복종·성적 행동·관계·기억 효과로 확장하지 않는다.`;
}""",
    'CSA-only general action rules'
)

worker = worker.replace(
    '[모니터] 매턴 [1.표면의식]/[2.잠재의식] 각 100~200자, 대화체로 작성.',
    '[모니터] 마인드 모니터는 Story 본문에 출력하지 않는다. 등록 NPC가 등장한 턴의 표면의식·잠재의식·신체 반응은 Extract의 npc_emotion으로만 생성한다.'
)
worker = worker.replace('C: 이동, 새 NPC 합류, 최면/암시/상식 개변, 관계의 결정적 변화, 중요한 성공·실패·폭로가 있는 턴', 'C: 이동, 새 NPC 합류, 상식개변, 관계의 결정적 변화, 중요한 성공·실패·폭로가 있는 턴')
worker = worker.replace("- '암시가 작동 중이다'를 해설로 반복하지 말고, 선택·행동·말투·자기합리화로 보여준다.", "- '상식개변이 작동 중이다'를 해설로 반복하지 말고, 범위 안 인물의 자연스러운 판단·행동·말투로 보여준다.")
worker = worker.replace('직전 턴에서 이미 끝난 손 내밀기, 자리 이동, 입장, 암시 성공을 다시 실행하지 않는다.', '직전 턴에서 이미 끝난 손 내밀기, 자리 이동, 입장, 상식개변 적용을 다시 실행하지 않는다.')

worker = sub_once(
    worker,
    r"function buildCurrentHypnosisStatusSnapshot\(save = \{\}, master = \{\}, activeCsa = getActiveCsaEntries\(save\)\) \{.*?\n\}\n\nfunction buildCurrentHypnosisStatusPanelText\(save = \{\}, master = \{\}, activeCsa = getActiveCsaEntries\(save\)\) \{.*?\n\}",
    """function buildCurrentHypnosisStatusSnapshot(save = {}, master = {}, activeCsa = getActiveCsaEntries(save)) {
  const capability = calculateHypnosisCapability(save, master, activeCsa);
  const applicableCsa = getApplicableCsaEntries(save, activeCsa)
    .map(item => ({ strength: item.strength || '약함', scope_label: item.scope_label || '', content: typeof item.content === 'string' ? item.content.trim() : '' }))
    .filter(item => item.content);
  return { csaCount: activeCsa.length, csaMax: capability.csa_max_active, applicableCsa };
}

function buildCurrentHypnosisStatusPanelText(save = {}, master = {}, activeCsa = getActiveCsaEntries(save)) {
  const snapshot = buildCurrentHypnosisStatusSnapshot(save, master, activeCsa);
  const csaLines = snapshot.applicableCsa.length
    ? snapshot.applicableCsa.map(item => `- [${item.scope_label || '현재 범위'} · ${item.strength}] ${item.content}`).join('\\n')
    : '- 없음';
  return `📱 상식개변 어플: 활성 ${snapshot.csaCount}/${snapshot.csaMax}\\n\\n🌐 현재 위치 적용 상식\\n${csaLines}`;
}""",
    'CSA-only status snapshot'
)

worker = sub_once(
    worker,
    r"const MIND_EFFECT_BOUNDARY_BASE = `.*?function buildMindEffectBoundarySection\(\{ hasApplicableCsa = false, hasActiveSuggestion = false \} = \{\}\) \{.*?\n\}",
    """const MIND_EFFECT_BOUNDARY_BASE = `
[COMMON-SENSE CHANGE BOUNDARY — HIGHEST PRIORITY]
- 각 개변은 문장의 직접 의미와 필연적 즉시 결과에만 적용한다.
- 강도·반복 수용·이전 결과는 범위, 대상, 행동 종류, 지속성 또는 반복성을 넓히지 않는다.
- 여러 개변을 합쳐 어느 개변에도 없는 더 강한 규칙을 만들지 않는다.
- 직접 범위 밖 행동은 NPC의 성격·관계·기억·상황과 현재의 자발적 선택만으로 성립할 때만 허용한다.
- 개변 수행·신체 반응만으로 호감·신뢰·복종·취향·동의·관계를 영구 확정하지 않는다.`;

function buildMindEffectBoundarySection({ hasApplicableCsa = false } = {}) {
  return hasApplicableCsa ? MIND_EFFECT_BOUNDARY_BASE : '';
}""",
    'CSA-only boundary'
)

story_vars_old = """  const csaSection = buildApplicableCsaSection(save, activeCsa);
  const suggestionSection = buildActiveSuggestionSection(save, master.characters || {});
  const mindEffectBoundarySection = buildMindEffectBoundarySection({
    hasApplicableCsa: Boolean(csaSection),
    hasActiveSuggestion: Boolean(suggestionSection)
  });
  const suggestionSecrecySection = buildPersonalSuggestionSecrecySection();
"""
story_vars_new = """  const csaSection = buildApplicableCsaSection(save, activeCsa);
  const mindEffectBoundarySection = buildMindEffectBoundarySection({
    hasApplicableCsa: Boolean(csaSection)
  });
"""
worker = replace_once(worker, story_vars_old, story_vars_new, 'Story suggestion section removal')
worker = worker.replace(' + csaSection + suggestionSection + mindEffectBoundarySection + suggestionSecrecySection + physicalSceneStateSection', ' + csaSection + mindEffectBoundarySection + physicalSceneStateSection')

worker = worker.replace(
    "const continuitySection = `\\n\\n[TURN CONTINUITY CONTRACT]\\n- 직전 턴에서 완료된 행동을 다시 실행하지 않는다.\\n- 이미 성공한 암시를 다시 시도하지 않는다.\\n- NPC가 확정 암시를 매 턴 이유 없이 의심하거나 거부하지 않는다.\\n- 현재 장면을 한 단계 앞으로 진행한다.",
    "const continuitySection = `\\n\\n[TURN CONTINUITY CONTRACT]\\n- 직전 턴에서 완료된 행동을 다시 실행하지 않는다.\\n- 현재 장소의 활성 상식개변을 직접 의미 범위 안에서 일관되게 적용한다.\\n- 현재 장면을 한 단계 앞으로 진행한다."
)
worker = worker.replace('개인 암시·상식개변의 생성·수정·삭제·강화·해제 같은 관리 조작', '상식개변의 생성·수정·삭제·강화·해제 같은 관리 조작')
worker = worker.replace('해당 관리는 최면 어플 UI에서만 한다.', '해당 관리는 상식개변 어플 UI에서만 한다.')
worker = worker.replace('Do not use formulaic first-impression or hypnosis-success calculations.', 'Do not use formulaic first-impression calculations.')
worker = worker.replace('사용자가 요청하지 않은 영구 암시·상식개변은 새로 만들지 않는다.', '사용자가 요청하지 않은 상식개변은 새로 만들지 않는다.')

worker = replace_once(
    worker,
    '    current_npc_stats: characterId && isPlainObject(save.npc_stats?.[characterId]) ? save.npc_stats[characterId] : {},',
    '    current_npc_stats: characterId && isPlainObject(save.npc_stats?.[characterId]) ? csaOnlyNpcStats(save.npc_stats[characterId]) : {},',
    'Story stat sanitizer'
)
worker = worker.replace('    active_suggestions: normalizeLegacyActiveSuggestions(save.active_suggestions),\n', '')

sanitize_anchor = """function sanitizeRecentNarrativeForPrompt(text) {
  let result = typeof text === 'string' ? text : '';
"""
sanitize_replacement = """function sanitizeRecentNarrativeForPrompt(text) {
  let result = typeof text === 'string' ? text : '';
  // Legacy turns sometimes printed sidebar-only mind-monitor blocks into Story.
  // Strip those copies only from the prompt view; stored history is untouched.
  result = result.replace(/\\n?\\[마인드 모니터\\][\\s\\S]*?(?=\\n\\[(?:1\\. 서사 및 행동|2\\. 플레이어 상황판|3\\. 선택지)\\]|$)/gi, '');
  result = result.replace(/\\n?\\[1\\.표면의식\\][\\s\\S]*?(?=\\n\\[2\\.잠재의식\\]|$)/gi, '');
  result = result.replace(/\\n?\\[2\\.잠재의식\\][\\s\\S]*?(?=\\n\\[3\\.신체반응\\]|$)/gi, '');
  result = result.replace(/\\n?\\[3\\.신체반응\\][\\s\\S]*?(?=\\n\\[(?:2\\. 플레이어 상황판|3\\. 선택지)\\]|$)/gi, '');
"""
worker = replace_once(worker, sanitize_anchor, sanitize_replacement, 'legacy mind-monitor prompt sanitizer')

worker = sub_once(
    worker,
    r"const MIND_EFFECT_EXTRACT_FIREWALL = `.*?function buildMindEffectExtractFirewallSection\(\{.*?\n\}",
    """const MIND_EFFECT_EXTRACT_FIREWALL = `
[COMMON-SENSE CHANGE MEMORY FIREWALL]
- 실제 사건과 현재 반응만 저장하고 개변의 의미 범위 확대나 항목 간 합성 해석은 저장하지 않는다.
- 개변에 따른 행동·신체 반응을 영구 호감·신뢰·복종·취향·동의·관계 변화로 저장하지 않는다.
- 객관적 사건과 자발성 해석을 분리하고, 독립적 감정 변화가 Story에 명확할 때만 관계·스탯 변화로 기록한다.`;

function buildMindEffectExtractFirewallSection({ hasApplicableCsa = false, hasCsaTransaction = false } = {}) {
  return hasApplicableCsa || hasCsaTransaction ? MIND_EFFECT_EXTRACT_FIREWALL : '';
}""",
    'CSA-only extract firewall'
)

extract_init_old = """  const applicableCsa = getApplicableCsaEntries(save);
  const suggestionMap = normalizeLegacyActiveSuggestions(save?.active_suggestions);
  const hasActiveSuggestion = Object.values(suggestionMap)
    .some(list => Array.isArray(list) && list.some(item => item?.active === true));
  const hasMindEffectTransaction = structuredPlan?.canonical_action?.type === 'app_transaction'
    && structuredPlan.canonical_action.operations?.some(operation => (
      operation?.domain === 'suggestion' || operation?.domain === 'csa'
    )) === true;
  const mindEffectExtractFirewallSection = buildMindEffectExtractFirewallSection({
    hasApplicableCsa: applicableCsa.length > 0,
    hasActiveSuggestion,
    hasMindEffectTransaction
  });
"""
extract_init_new = """  const applicableCsa = getApplicableCsaEntries(save);
  const hasCsaTransaction = structuredPlan?.canonical_action?.type === 'app_transaction'
    && structuredPlan.canonical_action.operations?.some(operation => operation?.domain === 'csa') === true;
  const mindEffectExtractFirewallSection = buildMindEffectExtractFirewallSection({
    hasApplicableCsa: applicableCsa.length > 0,
    hasCsaTransaction
  });
"""
worker = replace_once(worker, extract_init_old, extract_init_new, 'Extract suggestion state removal')
worker = worker.replace('정식 암시와 CSA 상태는 signed structured action 결과만 사용한다.', '정식 상식개변 상태는 signed structured action 결과만 사용한다.')
worker = worker.replace('활성 암시가 하나도 없어도, character_id가 narrator가 아닌 등록 NPC이고 그 NPC가 방금 서사에 실제로 등장한 정상 턴이면', 'character_id가 narrator가 아닌 등록 NPC이고 그 NPC가 방금 서사에 실제로 등장한 정상 턴이면')

worker = sub_once(
    worker,
    r"\[NPC STAT DELTA CONTRACT\]\nnpc_stat_changes만 반환한다\..*?reason은 서사 근거 한 문장이다\.",
    """[NPC STAT DELTA CONTRACT]
npc_stat_changes에는 호감도와 신뢰도만 반환한다. 서사에 숫자가 없어도 대사·행동·표정·판단의 실제 변화를 근거로 판단하되 변화 없는 반복 대화는 0이다. 의미 있는 호의·편안함·자발적 대화 지속은 호감 +1~2, 의심 완화·정직성 확인·도움 수용은 신뢰 +1~2를 검토한다. 무례는 호감 -1~-2, 거짓말 발각·모순·신분 의심은 신뢰 -1~-3을 검토한다. 상식개변의 직접 효과만으로 수행된 행동은 호감도·신뢰도 상승 근거가 아니다. 개변 외에 독립적인 감정·관계 변화가 Story에 명확하지 않으면 0으로 둔다. 신체 반응, 거부하지 않음, 반복 수행, 자기합리화만으로 관계 수치를 올리지 않는다. 한도는 각각 -5~+5이고 ±4~5는 중요한 전환에만 쓴다. reason은 서사 근거 한 문장이다.""",
    'CSA-only stat contract'
)
worker = worker.replace(
    '  "npc_stat_changes": {"호감도": {"delta": 0, "reason": "변화 근거 없음"}, "신뢰도": {"delta": 0, "reason": "변화 근거 없음"}, "최면깊이": {"delta": 0, "reason": "일반 대화"}, "순응도": {"delta": 0, "reason": "변화 근거 없음"}, "최면저항력": {"delta": 0, "reason": "고정값"}},',
    '  "npc_stat_changes": {"호감도": {"delta": 0, "reason": "변화 근거 없음"}, "신뢰도": {"delta": 0, "reason": "변화 근거 없음"}},'
)

worker = replace_once(worker, "const NPC_STAT_KEYS = ['호감도', '신뢰도', '최면깊이', '순응도', '최면저항력'];", "const NPC_STAT_KEYS = ['호감도', '신뢰도'];", 'CSA-only stat keys')
worker = sub_once(
    worker,
    r"function applyNpcStatChanges\(previous = \{\}, proposed = \{\}\) \{.*?\n\}",
    """function applyNpcStatChanges(previous = {}, proposed = {}) {
  const stats = isPlainObject(previous) ? { ...previous } : {};
  const changes = {};
  const errors = [];
  for (const key of NPC_STAT_KEYS) {
    const before = Number(previous?.[key]);
    const current = Number.isFinite(before) ? Math.max(0, Math.min(100, before)) : 0;
    const requested = Number(proposed?.[key]?.delta);
    const reason = typeof proposed?.[key]?.reason === 'string' ? proposed[key].reason.trim().slice(0, 240) : '';
    let delta = Number.isFinite(requested) ? Math.trunc(requested) : 0;
    if (Math.abs(delta) > 5) {
      errors.push(`${key}: delta ${delta} exceeds allowed ±5`);
      delta = 0;
    }
    stats[key] = Math.max(0, Math.min(100, current + delta));
    changes[key] = { delta: stats[key] - current, reason: delta === 0 ? '' : reason };
  }
  return { stats, changes, errors };
}""",
    'CSA-only stat application'
)

worker = sub_once(
    worker,
    r"    const workerStatChangeInput = \{.*?\n    \};\n\n    const statChangeInput",
    """    const workerStatChangeInput = {
      호감도: extract.npc_stat_changes?.호감도 || { delta: 0, reason: '' },
      신뢰도: extract.npc_stat_changes?.신뢰도 || { delta: 0, reason: '' }
    };

    const statChangeInput""",
    'CSA-only save stat input'
)
worker = sub_once(worker, r"\n  if \(!degraded && !isStructuredAppTransaction\) \{\n    const recovery = applyGlobalHypnosisDepthRecovery\(.*?\n  \}\n", '\n', 'remove hypnosis recovery')
worker = sub_once(
    worker,
    r"  if \(isStructuredAppTransaction\) \{\n    patch\.active_suggestions = structuredPlan\.plan\.active_suggestions;.*?\n  \} else if \(structuredPlan\?\.canonical_action\?\.type === 'find_npc'\)",
    """  if (isStructuredAppTransaction) {
    patch.csa_active = structuredPlan.plan.csa_active;
  } else if (structuredPlan?.canonical_action?.type === 'find_npc')""",
    'remove suggestion commit path'
)
worker = worker.replace("['player_progress', 'active_suggestions', 'csa_active',", "['player_progress', 'csa_active',")
worker = worker.replace("      active_suggestions: structuredPlan.plan?.active_suggestions ?? previousSave.active_suggestions,\n", '')

worker = sub_once(
    worker,
    r"function buildHypnosisRecoveryNarrativeRule\(\) \{.*?\n\}",
    """function buildHypnosisRecoveryNarrativeRule() {
  return `\n\n[상식개변 효과와 기억의 분리]\n- 상식개변의 수정·해제는 이미 일어난 사건의 기억과 현재 물리 상태를 지우지 않는다.\n- 해제는 현재의 사회적 전제만 멈춘다. 기억상실·시간 공백·사건의 소급 취소를 만들지 않는다.\n- 해제 후 인물은 자신의 성격·관계·현재 감정으로 과거 행동을 다시 평가하며 자동 후회나 자동 합리화를 하지 않는다.`;
}""",
    'CSA deactivation memory rule'
)

worker_path.write_text(worker, encoding='utf-8')

# Sidebar: expose only ordinary relationship stats and rename the app button.
sidebar_path = ROOT / 'pages/sidebar.js'
sidebar = sidebar_path.read_text(encoding='utf-8')
sidebar = sub_once(
    sidebar,
    r"stats: \[.*?\],",
    "stats: [\n    { key: '호감도', label: '호감' },\n    { key: '신뢰도', label: '신뢰' }\n  ],",
    'sidebar stats'
)
sidebar = sidebar.replace('📱 최면 어플', '📱 상식개변 어플')
sidebar_path.write_text(sidebar, encoding='utf-8')

# Existing page shell: rename user-facing strings and route failed app actions back to CSA.
index_path = ROOT / 'pages/index.html'
index = index_path.read_text(encoding='utf-8')
index = index.replace("open('suggestions')", "open('csa')")
index = index.replace('최면 어플', '상식개변 어플')
index = re.sub(r"\n\s*body\.appendChild\(manualSection\('개인 암시'.*?\);", '', index)
index = re.sub(r"\n\s*body\.appendChild\(manualSection\('최면깊이'.*?\);", '', index)
index_path.write_text(index, encoding='utf-8')

# Replace the mixed hypnosis/suggestion client with a CSA-only client while
# retaining the public window.hypnosisApp name expected by the existing shell.
hypnosis_path = ROOT / 'pages/hypnosis-app.js'
hypnosis_path.write_text(r'''// CSA-only app shell. The historical global name is retained for integration.
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
''', encoding='utf-8')

# Mark the branch purpose in project docs.
doc_path = ROOT / 'docs/project_v2/CSA_ONLY_BRANCH.md'
doc_path.write_text('''# CSA-only branch

- Branch: `feature/csa-only`
- Base: preserved `main`
- Personal suggestion and hypnosis mechanics are not exposed, injected into prompts, validated, or updated.
- Existing legacy save fields are preserved in storage but ignored by this branch.
- The only app-managed mental effect is spatial common-sense change (CSA).
- No database migration is required.
''', encoding='utf-8')

print('CSA-only conversion applied.')
