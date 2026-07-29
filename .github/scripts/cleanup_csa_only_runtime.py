from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def replace_all(text, old, new, label, minimum=1):
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"{label}: expected at least {minimum} matches, found {count}")
    return text.replace(old, new)


def sub_once(text, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return updated


worker_path = ROOT / 'worker/game-proxy-v2.js'
worker = worker_path.read_text(encoding='utf-8')

# Runtime names and user-facing copy must be CSA-only even though historical
# database keys remain readable for compatibility.
for old, new, label in [
    ('resolveHypnosisAppUiRoute', 'resolveCsaAppUiRoute', 'route helper rename'),
    ('buildHypnosisRuntimeSection', 'buildCsaRuntimeSection', 'runtime helper rename'),
    ('buildHypnosisRecoveryNarrativeRule', 'buildCsaDeactivationNarrativeRule', 'deactivation helper rename'),
    ('buildCurrentHypnosisStatusSnapshot', 'buildCurrentCsaStatusSnapshot', 'status snapshot rename'),
    ('buildCurrentHypnosisStatusPanelText', 'buildCurrentCsaStatusPanelText', 'status text rename'),
]:
    worker = replace_all(worker, old, new, label)

copy_replacements = [
    ('이 내용은 ${APP_STRENGTH_LABEL[result.required_strength]} 암시가 필요합니다. 선택 강도를 변경해 주세요.',
     '이 내용은 ${APP_STRENGTH_LABEL[result.required_strength]} 상식개변 강도가 필요합니다. 선택 강도를 변경해 주세요.',
     'strength issue copy'),
    ('암시 강도 확인에 실패했습니다. 잠시 후 다시 적용해 주세요.',
     '상식개변 강도 확인에 실패했습니다. 잠시 후 다시 적용해 주세요.',
     'strength validation error copy'),
    ('최면 어플을 연 뒤 게임 상태가 변경되었습니다.',
     '상식개변 어플을 연 뒤 게임 상태가 변경되었습니다.',
     'stale app copy'),
    ('암시와 상식개변은 최면 어플에서 관리합니다.',
     '상식개변은 상식개변 어플에서 관리합니다.',
     'route error copy'),
    ('최면 어플 검증 정보가 올바르지 않습니다. 어플을 다시 열어 적용해 주세요.',
     '상식개변 어플 검증 정보가 올바르지 않습니다. 어플을 다시 열어 적용해 주세요.',
     'validation proof copy'),
    ('삭제되지 않는 최면 어플 발견과 핵심 기능을 2~3문장으로 짧게 알린다.',
     '삭제되지 않는 상식개변 어플 발견과 핵심 기능을 2~3문장으로 짧게 알린다.',
     'setup discovery copy'),
    ('초반 난이도, 최면 어플을 쓸 동기, 시작 장소가 서로 확실히 달라야 한다.',
     '초반 난이도, 상식개변 어플을 쓸 동기, 시작 장소가 서로 확실히 달라야 한다.',
     'setup motivation copy'),
    ('(?:어플|앱|최면 어플)', '(?:어플|앱|상식개변 어플)', 'app usage regex copy'),
    ('display_input: `최면 어플의 위치 추적을 이용해 ${name}이 있는 ${locationLabel}로 찾아간다.`',
     'display_input: `상식개변 어플의 위치 추적을 이용해 ${name}이 있는 ${locationLabel}로 찾아간다.`',
     'find npc display copy'),
    ('display_input: `최면 어플에서 ${labels.join(\'과 \')}의 변경사항을 적용한다.`',
     'display_input: `상식개변 어플에서 ${labels.join(\'과 \')}의 변경사항을 적용한다.`',
     'transaction display copy'),
]
for old, new, label in copy_replacements:
    worker = replace_all(worker, old, new, label)

# CSA transactions do not need suggestion success resolution or hypnosis state.
worker = sub_once(
    worker,
    r"function collectSemanticStrengthCandidates\(previousSave, canonicalAction\) \{.*?(?=\n\nfunction readAppStrengthExamples)",
    """function collectSemanticStrengthCandidates(previousSave, canonicalAction) {
  const csa = Array.isArray(previousSave?.csa_active) ? previousSave.csa_active : [];
  return canonicalAction.operations.flatMap(operation => {
    if (operation.domain !== 'csa' || !['activate', 'update'].includes(operation.operation)) return [];
    const previous = operation.operation === 'update'
      ? csa.find(item => item?.id === operation.id)
      : null;
    const contentChanged = operation.operation === 'activate'
      || normalizeAppContent(previous?.content) !== normalizeAppContent(operation.content);
    const strengthChanged = operation.operation === 'activate'
      || normalizeStrengthForStorage(previous?.strength) !== normalizeStrengthForStorage(operation.strength);
    return contentChanged || strengthChanged
      ? [{ client_id: operation.client_id, domain: 'csa', operation: operation.operation, selected_strength: operation.strength, content: operation.content }]
      : [];
  });
}""",
    'CSA semantic candidate builder'
)
worker = replace_once(
    worker,
    '    const resolvedSemanticResults = await buildSuggestionResolutions(env, game_id, result.canonical_action, semanticResults, ctx.save, ctx.master, actionDigest);',
    '    const resolvedSemanticResults = semanticResults.map(item => ({ client_id: item.client_id, required_strength: item.required_strength }));',
    'CSA semantic result builder'
)
worker = replace_once(worker, 'const semantic_validation = { version: 2,', 'const semantic_validation = { version: 1,', 'semantic version')
worker = replace_all(
    worker,
    '    structuredPlan = applySuggestionResolutionsToPlan(ctx?.save || {}, ctx?.master || {}, structuredPlan, { turnNumber: currentTurn + 1, turnCount: currentTurn });\n',
    '',
    'Story suggestion resolution call',
    minimum=1
)
worker = replace_all(
    worker,
    '    structuredPlan = applySuggestionResolutionsToPlan(compatCtx.save || {}, compatCtx.master || {}, structuredPlan, { turnNumber: nextTurn, turnCount: ctx?.turn_count ?? 0 });\n',
    '',
    'Extract suggestion resolution call',
    minimum=1
)
worker = replace_all(
    worker,
    '    structuredPlan = applySuggestionResolutionsToPlan(ctx?.save || {}, ctx?.master || {}, structuredPlan, { turnNumber: turn_number, turnCount: ctx?.turn_count ?? 0 });\n',
    '',
    'Commit suggestion resolution call',
    minimum=1
)

# Never inject the legacy mixed hypnosis/app text stored in master data. The
# Story receives a compact CSA-only explanation instead.
usage_anchor = """function isAppUsageInfoRequest(playerInput) {
  const input = typeof playerInput === 'string' ? playerInput.trim() : '';
  if (!input) return false;
  return /(?:어플|앱|상식개변 어플).*(?:정보|사용법|설명|기능|예시)|(?:정보|사용법|설명|기능|예시).*(?:어플|앱|상식개변 어플)/.test(input);
}
"""
usage_replacement = usage_anchor + """

function buildCsaOnlyAppUsageStorySection() {
  return `\n\n[상식개변 어플 안내]\n- 이 어플은 특정 개인에게 암시나 최면을 거는 기능 없이, 지정 공간의 사회적 상식만 생성·수정·해제한다.\n- 현재 레벨이 허용하는 강도·공간 범위·활성 슬롯 안에서만 작동한다.\n- 강도는 직접 의미 범위 안의 확신과 사회적 압력만 바꾸며 의미 범위를 넓히지 않는다.\n- 범위를 벗어나면 현재 적용은 멈추지만 이미 벌어진 사건의 기억과 물리 상태는 유지된다.\n- 모든 관리는 상식개변 어플 UI에서만 한다.`;
}
"""
worker = replace_once(worker, usage_anchor, usage_replacement, 'CSA app usage helper')
worker = sub_once(
    worker,
    r"  const openingScenarioSection = !setupComplete && master\.opening_scenario.*?  const appUsageSection = \(!setupComplete \|\| appUsageRequested\) && master\.app_usage.*?    : '';",
    """  const openingScenarioSection = '';
  const appUsageSection = (!setupComplete || appUsageRequested)
    ? buildCsaOnlyAppUsageStorySection()
    : '';""",
    'CSA-only setup app usage'
)
worker = replace_once(
    worker,
    """  const storyMasterSnapshot = buildStoryMasterSnapshot(master, {
    includeAppUsage: !setupComplete || appUsageRequested,
    includeOpeningScenario: !setupComplete
  });""",
    """  const storyMasterSnapshot = buildStoryMasterSnapshot(master, {
    includeAppUsage: false,
    includeOpeningScenario: false
  });""",
    'master mixed app data omission'
)

# Delete the unused legacy player-status prompt and its suggestion calculations.
worker = sub_once(
    worker,
    r"  const activeCsa = getActiveCsaEntries\(save\);\n  const suggestionPanelData =.*?  const currentHypnosisStatusText = buildCurrentCsaStatusPanelText\(save, master, activeCsa\);",
    """  const activeCsa = getActiveCsaEntries(save);
  const currentCsaStatusText = buildCurrentCsaStatusPanelText(save, master, activeCsa);""",
    'legacy hypnosis status prompt removal'
)
worker = replace_once(worker, '[PLAYER STATUS HYPNOSIS SNAPSHOT — COPY EXACTLY]', '[PLAYER STATUS CSA SNAPSHOT — COPY EXACTLY]', 'CSA status header')
worker = replace_once(worker, '${currentHypnosisStatusText}', '${currentCsaStatusText}', 'CSA status variable')
worker = replace_once(worker, '다른 NPC의 암시, 범위 밖 상식개변, 비활성 항목을 추가하지 않는다.', '범위 밖 상식개변과 비활성 항목을 추가하지 않는다.', 'CSA status constraint')

# Hypnosis-onset art is no longer a valid candidate in this branch.
worker = replace_once(worker, '  const imageCatalog = images.map(img => ({', "  const imageCatalog = images.filter(img => img?.scene_role !== 'hypnosis_onset').map(img => ({", 'hypnosis image filter')
worker = replace_once(
    worker,
    '3. scene_role=hypnosis_onset 이미지는 실제 최면 반응·암시 성공이 발생한 장면 전용이다. scene_role=heart_eyes 이미지는 높은 호감이나 깊은 최면·순응 상태의 애정·황홀 반응 전용이다. 단순 계획이나 평범한 대화에는 고르지 마라.',
    '3. scene_role=hypnosis_onset 이미지는 CSA-only 버전에서 선택하지 않는다. scene_role=heart_eyes 이미지는 독립적으로 형성된 높은 호감과 명확한 애정·황홀 반응에만 사용한다. 단순 계획·상식개변 적용·평범한 대화에는 고르지 마라.',
    'CSA image contract'
)

# CSA-only plan/result payload copy. Non-CSA operations are rejected before
# this function, so suggestion fields must not be exposed downstream.
worker = replace_once(
    worker,
    "  if (summary.suggestion_activate + summary.suggestion_update + summary.suggestion_deactivate) labels.push(`개인 암시 ${summary.suggestion_activate + summary.suggestion_update + summary.suggestion_deactivate}건`);\n",
    '',
    'suggestion transaction label removal'
)
worker = sub_once(
    worker,
    r"  const suggestionTargets = canonicalOperations.*?  return \{ ok: true, canonical_action, display_input: `상식개변 어플에서 \$\{labels\.join\('과 '\)\}의 변경사항을 적용한다\.`, summary, plan: \{ active_suggestions: suggestions, csa_active: csa, operations: canonicalOperations, suggestion_activations: suggestionActivations, suggestion_targets: suggestionTargets, counts: summary \} \};",
    """  return { ok: true, canonical_action, display_input: `상식개변 어플에서 ${labels.join('과 ')}의 변경사항을 적용한다.`, summary, plan: { csa_active: csa, operations: canonicalOperations, counts: summary } };""",
    'CSA-only transaction plan payload'
)

worker_path.write_text(worker, encoding='utf-8')

# Remove obsolete static fallback rows. sidebar.js rebuilds this panel at
# runtime, but the HTML fallback must not flash hypnosis/compliance labels.
index_path = ROOT / 'pages/index.html'
index = index_path.read_text(encoding='utf-8')
index = replace_once(
    index,
    '''          <div class="stat-row"><span class="stat-label">위치</span><span class="stat-value" id="stat-location">-</span></div>
          <div class="stat-row"><span class="stat-label">순응도</span><span class="stat-value" id="stat-순응도">-</span></div>
          <div class="stat-row"><span class="stat-label">호감도</span><span class="stat-value" id="stat-호감도">-</span></div>
          <div class="stat-row"><span class="stat-label">최면깊이</span><span class="stat-value" id="stat-최면깊이">-</span></div>
          <div class="stat-row"><span class="stat-label">상식개변</span><span class="stat-value" id="stat-csa">없음</span></div>''',
    '''          <div class="stat-row"><span class="stat-label">위치</span><span class="stat-value" id="stat-location">-</span></div>
          <div class="stat-row"><span class="stat-label">호감도</span><span class="stat-value" id="stat-호감도">-</span></div>
          <div class="stat-row"><span class="stat-label">신뢰도</span><span class="stat-value" id="stat-신뢰도">-</span></div>
          <div class="stat-row"><span class="stat-label">상식개변</span><span class="stat-value" id="stat-csa">없음</span></div>''',
    'static sidebar fallback'
)
index_path.write_text(index, encoding='utf-8')

print('CSA-only runtime cleanup applied.')
