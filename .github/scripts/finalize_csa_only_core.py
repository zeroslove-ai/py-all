from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return updated


path = ROOT / 'worker/game-proxy-v2.js'
text = path.read_text(encoding='utf-8')

# The shared level/strength helper must not read legacy personal suggestions.
text = sub_once(
    text,
    r"function calculateHypnosisCapability\(save = \{\}, master = \{\}, activeCsa = getActiveCsaEntries\(save\)\) \{.*?(?=\n\nconst APP_STRENGTHS)",
    """function calculateHypnosisCapability(save = {}, master = {}, activeCsa = getActiveCsaEntries(save)) {
  const level = Math.max(1, Number(save?.player_progress?.level) || 1);
  const exp = Math.max(0, Number(save?.player_progress?.exp) || 0);
  const nextLevelExp = level >= 10 ? 0 : expForNextLevel(level);
  const availableStrength = level >= 5 ? '강함' : level >= 3 ? '중간' : '약함';
  const maxStrengthRank = hypnosisStrengthRank(availableStrength);
  const csaLimits = getCsaLimits(level);
  return {
    current_level: level,
    exp,
    next_level_exp: nextLevelExp,
    available_strength: availableStrength,
    max_strength_rank: maxStrengthRank,
    can_use_weak: true,
    can_use_medium: maxStrengthRank >= 1,
    can_use_strong: maxStrengthRank >= 2,
    active_count: 0,
    max_active: 0,
    remaining_slots: 0,
    can_create_suggestion: false,
    can_edit_same_strength: false,
    can_disable_or_delete: false,
    can_increase_strength: false,
    csa_active_count: activeCsa.length,
    csa_max_active: csaLimits.max_active
  };
}""",
    'CSA-only capability'
)

# Replace the mixed-domain transaction planner with a CSA-only planner. This
# also prevents old active_suggestions data from blocking CSA changes.
text = sub_once(
    text,
    r"function planAppTransaction\(previousSave, master, action, \{ turnNumber \}\) \{.*?(?=\n\nfunction planStructuredAction)",
    """function planAppTransaction(previousSave, master, action, { turnNumber }) {
  const rawOperations = Array.isArray(action.operations) ? action.operations : [];
  if (!rawOperations.length) return { ok: false, status: 422, error_code: 'NO_CHANGES', issues: [appIssue(action, 'NO_CHANGES', '적용할 변경사항이 없습니다.')] };
  if (rawOperations.length > 12) return { ok: false, status: 422, error_code: 'TOO_MANY_OPERATIONS', issues: [appIssue(action, 'TOO_MANY_OPERATIONS', '한 번에 최대 12개 작업만 적용할 수 있습니다.')] };

  const capability = calculateHypnosisCapability(previousSave, master);
  const csaLimits = getCsaLimits(capability.current_level);
  const csa = cloneCsaList(previousSave?.csa_active);
  const issues = [];
  const seenClientIds = new Set();
  const seenTargets = new Set();
  const ordered = rawOperations
    .map((operation, index) => ({ operation, index }))
    .sort((a, b) => APP_OPERATION_ORDER[a.operation?.operation] - APP_OPERATION_ORDER[b.operation?.operation] || a.index - b.index);
  const canonicalOperations = [];

  for (const { operation: raw, index } of ordered) {
    if (!isPlainObject(raw)
      || raw.domain !== 'csa'
      || !['activate', 'update', 'deactivate'].includes(raw.operation)
      || typeof raw.client_id !== 'string'
      || !raw.client_id.trim()
      || raw.client_id.length > 80) {
      issues.push(appIssue(raw, 'INVALID_OPERATION', '상식개변 작업 형식이 올바르지 않습니다.', index));
      continue;
    }
    if (seenClientIds.has(raw.client_id)) {
      issues.push(appIssue(raw, 'DUPLICATE_TARGET', '같은 작업 식별자가 중복되었습니다.', index));
      continue;
    }
    seenClientIds.add(raw.client_id);

    const id = typeof raw.id === 'string' && raw.id.trim().length <= 120 ? raw.id.trim() : '';
    if (raw.operation !== 'activate') {
      const targetKey = `csa:${id}`;
      if (seenTargets.has(targetKey)) {
        issues.push(appIssue(raw, 'DUPLICATE_TARGET', '같은 상식개변을 두 번 변경할 수 없습니다.', index));
        continue;
      }
      seenTargets.add(targetKey);
    }

    const content = normalizeAppContent(raw.content);
    const strength = typeof raw.strength === 'string' ? raw.strength.trim() : '';
    const validateContent = () => {
      if (!content) { issues.push(appIssue(raw, 'CONTENT_REQUIRED', '내용을 입력해 주세요.', index)); return false; }
      if (content.length > 300) { issues.push(appIssue(raw, 'CONTENT_TOO_LONG', '내용은 300자 이하여야 합니다.', index)); return false; }
      return true;
    };
    const validateStrength = () => {
      if (!APP_STRENGTHS.has(strength) || capability.current_level < APP_STRENGTH_UNLOCKS[strength]) {
        issues.push(appIssue(raw, 'STRENGTH_LOCKED', '현재 레벨에서 사용할 수 없는 강도입니다.', index));
        return null;
      }
      return APP_STRENGTH_LABELS[strength];
    };

    if (raw.operation === 'activate') {
      const storageStrength = validateStrength();
      const scopeType = typeof raw.scope_type === 'string' ? raw.scope_type.trim() : '';
      if (!validateContent() || !storageStrength) continue;
      if (!CSA_SCOPE_RANK[scopeType] || CSA_SCOPE_RANK[scopeType] > CSA_SCOPE_RANK[csaLimits.scope_type]) {
        issues.push(appIssue(raw, 'CSA_SCOPE_LOCKED', '현재 레벨에서 사용할 수 없는 상식개변 범위입니다.', index));
        continue;
      }
      const scopeId = resolveCsaScopeId(scopeType, previousSave?.world_state || {});
      if (!scopeId) {
        issues.push(appIssue(raw, 'LOCATION_UNAVAILABLE', '현재 위치에서 해당 범위를 설정할 수 없습니다.', index));
        continue;
      }
      if (csa.some(item => item?.active && normalizeAppContent(item.content) === content && item.scope_id === scopeId)) {
        issues.push(appIssue(raw, 'DUPLICATE_TARGET', '같은 범위에 동일한 활성 상식개변이 있습니다.', index));
        continue;
      }
      csa.push({ id: nextAppCsaId(csa, turnNumber), active: true, content, strength: storageStrength, scope_type: scopeType, scope_id: scopeId, scope_label: buildAppScopeLabel(scopeId), created_turn: turnNumber });
      canonicalOperations.push({ version: 1, client_id: raw.client_id, domain: 'csa', operation: 'activate', strength, scope_type: scopeType, content });
      continue;
    }

    const target = csa.find(item => item?.id === id);
    if (!target) {
      issues.push(appIssue(raw, 'CSA_NOT_FOUND', '대상 상식개변을 찾지 못했습니다.', index));
      continue;
    }
    if (!target.active) {
      issues.push(appIssue(raw, 'CSA_INACTIVE', '이미 비활성화된 상식개변입니다.', index));
      continue;
    }
    if (raw.operation === 'deactivate') {
      const at = csa.indexOf(target);
      csa[at] = { ...target, active: false, updated_turn: turnNumber };
      canonicalOperations.push({ version: 1, client_id: raw.client_id, domain: 'csa', operation: 'deactivate', id });
      continue;
    }

    const storageStrength = validateStrength();
    const scopeType = typeof raw.scope_type === 'string' && raw.scope_type.trim() ? raw.scope_type.trim() : target.scope_type;
    if (!validateContent() || !storageStrength) continue;
    if (!CSA_SCOPE_RANK[scopeType] || CSA_SCOPE_RANK[scopeType] > CSA_SCOPE_RANK[csaLimits.scope_type]) {
      issues.push(appIssue(raw, 'CSA_SCOPE_LOCKED', '현재 레벨에서 사용할 수 없는 상식개변 범위입니다.', index));
      continue;
    }
    const scopeId = scopeType === target.scope_type ? target.scope_id : resolveCsaScopeId(scopeType, previousSave?.world_state || {});
    if (!scopeId) {
      issues.push(appIssue(raw, 'LOCATION_UNAVAILABLE', '현재 위치에서 해당 범위를 설정할 수 없습니다.', index));
      continue;
    }
    if (normalizeAppContent(target.content) === content && target.strength === storageStrength && target.scope_type === scopeType) {
      issues.push(appIssue(raw, 'NO_CHANGES', '상식개변의 실제 변경사항이 없습니다.', index));
      continue;
    }
    if (csa.some(item => item !== target && item?.active && normalizeAppContent(item.content) === content && item.scope_id === scopeId)) {
      issues.push(appIssue(raw, 'DUPLICATE_TARGET', '같은 범위에 동일한 활성 상식개변이 있습니다.', index));
      continue;
    }
    const at = csa.indexOf(target);
    csa[at] = { ...target, content, strength: storageStrength, scope_type: scopeType, scope_id: scopeId, scope_label: scopeType === target.scope_type ? target.scope_label : buildAppScopeLabel(scopeId), updated_turn: turnNumber };
    canonicalOperations.push({ version: 1, client_id: raw.client_id, domain: 'csa', operation: 'update', id, strength, scope_type: scopeType, content });
  }

  if (issues.length) return { ok: false, status: 422, error_code: 'APP_ACTION_INVALID', issues };
  const activeCsaCount = csa.filter(item => item?.active === true).length;
  if (activeCsaCount > csaLimits.max_active) return { ok: false, status: 422, error_code: 'CSA_SLOT_FULL', issues: [appIssue(action, 'CSA_SLOT_FULL', '상식개변 활성 슬롯이 부족합니다.')] };

  const summary = summarizeAppOperations(canonicalOperations);
  const canonical_action = { version: 1, type: 'app_transaction', base_turn_count: action.base_turn_count, operations: canonicalOperations };
  return {
    ok: true,
    canonical_action,
    display_input: `상식개변 어플에서 상식개변 ${canonicalOperations.length}건의 변경사항을 적용한다.`,
    summary,
    plan: { csa_active: csa, operations: canonicalOperations, counts: summary }
  };
}""",
    'CSA-only transaction planner'
)

# Choice repair is now purely structural. It must not inspect legacy hypnosis
# capability or generate suggestion-themed fallback choices.
text = replace_once(
    text,
    "  if (capability) record(findInfeasibleChoices(choices, capability), 'hypnosis capability');\n",
    '',
    'choice capability validation removal'
)
text = sub_once(
    text,
    r"function buildCapabilitySafeChoice\(capability, index = 0\) \{.*?\n\}",
    """function buildCapabilitySafeChoice(capability, index = 0) {
  const choices = [
    '상대의 반응을 살피며 평범한 대화를 이어간다.',
    '현재 상황에 관해 가벼운 질문을 건넨다.',
    '주변 상황을 조용히 관찰한다.',
    '현재 장면에서 할 수 있는 다른 행동을 시도한다.'
  ];
  return choices[index % choices.length];
}""",
    'CSA-neutral fallback choices'
)
text = replace_once(text, '  const infeasible = findInfeasibleChoices(normalized, capability);', '  const infeasible = [];', 'choice infeasible removal')

# Remove obsolete hypnosis-depth mutation helpers and the unused suggestion
# semantic resolver from this branch's source.
text = sub_once(
    text,
    r"function resolveHypnosisDepthDelta\(.*?(?=\n\nfunction buildCsaDeactivationNarrativeRule)",
    '',
    'hypnosis depth helpers removal'
)
text = sub_once(
    text,
    r"async function buildSuggestionResolutions\(.*?(?=\n\n// Read-only preflight)",
    '',
    'suggestion resolution removal'
)
text = text.replace('  resolveHypnosisDepthDelta,\n', '')

path.write_text(text, encoding='utf-8')
print('CSA-only core finalization applied.')
