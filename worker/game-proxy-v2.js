// worker.js — 게임빌더_v2 프록시 Worker
// Cloudflare Workers (ES Modules)

const SUPABASE_URL = 'https://ovltkzwddxsekcfeskds.supabase.co';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const rateLimitOk = await checkRateLimit(req, env);
    if (!rateLimitOk) {
      return jsonResponse({ error: 'Too Many Requests' }, 429);
    }

    try {
      switch (url.pathname) {
        case '/api/context':     return handleContext(req, env);
        case '/api/story':      return handleStory(req, env);
        case '/api/extract':    return handleExtract(req, env);
        case '/api/image':      return handleImage(req, env);
        case '/api/tts':        return handleTts(req, env);
        case '/api/save-turn':  return handleSaveTurn(req, env);
        case '/api/set-save':   return handleSetSave(req, env);
        case '/api/reset':      return handleReset(req, env);
        default:
          return jsonResponse({ error: 'Not Found' }, 404);
      }
    } catch (e) {
      console.error('Worker error:', e);
      return jsonResponse({ error: e.message || 'Internal Server Error' }, 500);
    }
  }
};

// ─────────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}

async function checkRateLimit(req, env) {
  // TODO: Workers KV 기반 game_id/IP별 속도 제한
  return true;
}

// ─────────────────────────────────────────────
// Supabase RPC 호출 헬퍼
// ─────────────────────────────────────────────

async function supabaseRpc(env, fn, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC ${fn} failed: ${res.status} ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

async function supabaseGet(env, table, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SECRET_KEY}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET ${table} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

// ─────────────────────────────────────────────
// 1. /api/context — 게임 상태 로드
// ─────────────────────────────────────────────

async function handleContext(req, env) {
  const { game_id } = await readJson(req);
  if (!game_id) return jsonResponse({ error: 'game_id required' }, 400);

  const [ctx, images] = await Promise.all([
    supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 15 }),
    supabaseGet(env, 'image_library', `select=*&limit=1000`)
  ]);

  const imageCatalog = {};
  for (const img of images) {
    const cid = img.character_id;
    if (!imageCatalog[cid]) imageCatalog[cid] = [];
    imageCatalog[cid].push({
      image_id: img.image_id,
      situation: img.situation,
      is_sexual: img.is_sexual,
      image_url: img.image_url
    });
  }

  return jsonResponse({
    context: ctx,
    image_catalog: imageCatalog,
    turn_count: ctx?.save?.turn_count || 0
  });
}

// ─────────────────────────────────────────────
// 2. /api/story — 서사 생성 (SSE passthrough)
// ─────────────────────────────────────────────

async function handleStory(req, env) {
  const { game_id, player_input, turn_count } = await readJson(req);
  if (!game_id) return jsonResponse({ error: 'game_id required' }, 400);

  const ctx = await supabaseRpc(env, 'get_context', { 
    p_game_id: game_id, 
    p_recent_count: 15 
  });

  const messages = buildStoryPrompt(ctx, player_input, turn_count);

  const deepseekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      stream: true,
      max_tokens: 12000
    })
  });

  if (!deepseekRes.ok) {
    const text = await deepseekRes.text();
    return jsonResponse({ error: `DeepSeek error: ${deepseekRes.status} ${text}` }, 502);
  }

  return new Response(deepseekRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }
  });
}

// ─────────────────────────────────────────────
// 3. /api/extract — 상태 추출 (JSON)
// ─────────────────────────────────────────────

async function handleExtract(req, env) {
  const { game_id, narrative_text, turn_count } = await readJson(req);
  if (!game_id || !narrative_text) {
    return jsonResponse({ error: 'game_id and narrative_text required' }, 400);
  }

  const [ctx, images] = await Promise.all([
    supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 15 }),
    supabaseGet(env, 'image_library', `select=image_id,character_id,situation,is_sexual&limit=1000`)
  ]);

  const prompt = buildExtractPrompt(narrative_text, ctx, images, turn_count);

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content: prompt }],
      stream: false,
      max_tokens: 10000
    })
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: `DeepSeek error: ${res.status} ${text}` }, 502);
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content || '';

  let extract = {};
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/i);
    const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
    extract = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Extract JSON parse failed:', e, rawText.slice(0, 200));
    return jsonResponse({ error: 'JSON parse failed', raw: rawText.slice(0, 500) }, 502);
  }

  return jsonResponse({ extract, raw: rawText.slice(0, 200) });
}

// ─────────────────────────────────────────────
// 4-8. 나머지 엔드포인트 (동일)
// ─────────────────────────────────────────────

async function handleImage(req, env) {
  const { game_id, character_id, image_id } = await readJson(req);
  if (!game_id || !character_id) {
    return jsonResponse({ error: 'game_id and character_id required' }, 400);
  }
  const result = await supabaseRpc(env, 'get_character_image', {
    p_game_id: game_id,
    p_character_id: character_id,
    p_image_id: image_id || null
  });
  return jsonResponse({ image_url: result });
}

async function handleTts(req, env) {
  const { text, voice_id } = await readJson(req);
  if (!text || !voice_id) {
    return jsonResponse({ error: 'text and voice_id required' }, 400);
  }
  const res = await fetch('https://fancy-dust-7f8c.zeroslove.workers.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id })
  });
  if (!res.ok) {
    return jsonResponse({ error: `TTS Worker error: ${res.status}` }, 502);
  }
  const data = await res.json();
  return jsonResponse({ url: data.url });
}

async function handleSaveTurn(req, env) {
  const { game_id, turn_number, content } = await readJson(req);
  if (!game_id || content === undefined) {
    return jsonResponse({ error: 'game_id and content required' }, 400);
  }
  await supabaseRpc(env, 'save_turn', {
    p_game_id: game_id,
    p_turn_number: turn_number,
    p_content: content
  });
  return jsonResponse({ ok: true });
}

async function handleSetSave(req, env) {
  const { game_id, patch, turn_number } = await readJson(req);
  if (!game_id || !patch) {
    return jsonResponse({ error: 'game_id and patch required' }, 400);
  }
  await supabaseRpc(env, 'set_save', {
    p_game_id: game_id,
    p_patch: patch,
    p_turn_number: turn_number
  });
  const save = await supabaseGet(env, 'game_save', `select=turn_count&game_id=eq.${game_id}&limit=1`);
  const newTurnCount = save?.[0]?.turn_count || turn_number;
  return jsonResponse({ ok: true, turn_count: newTurnCount });
}

async function handleReset(req, env) {
  const { game_id } = await readJson(req);
  if (!game_id) return jsonResponse({ error: 'game_id required' }, 400);
  await supabaseRpc(env, 'reset_game_progress', { p_game_id: game_id });
  return jsonResponse({ ok: true });
}

// ─────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────

function buildStoryPrompt(ctx, playerInput, turnCount) {
  const master = ctx?.master || {};
  const save = ctx?.save || {};
  const recentMemories = ctx?.recent_memories || [];

  // 캐릭터 ID 매핑 (name → heroine_id)
  const characterMap = {};
  const chars = master.characters || {};
  for (const [id, info] of Object.entries(chars)) {
    if (info.name) characterMap[info.name] = id;
  }

  const systemPrompt = `너는 인터랙티브 게임의 진행자다. 아래 게임 설정과 장기기억을 바탕으로 사용자의 행동에 이어지는 장면을 진행하라.

[절대 금지 — 이미지/오디오 중복 방지 — 최우선 규칙]
너는 순수 텍스트 서술자다. 이미지와 음성을 화면에 붙이는 작업은 네 응답이 끝난 뒤 별도 렌더러가 전담한다.
너의 출력에 다음을 단 한 글자도 쓰지 마라: \`![\` 마크다운 이미지 문법, \`<audio\`로 시작하는 HTML 태그, 이미지/음성 URL, \`http\`로 시작하는 링크, 그 밖의 어떤 HTML 태그도. 이런 걸 쓰면 같은 그림/소리가 두 번 출력된다.

[게임 설정 / 세이브 / 장기기억]
${JSON.stringify({ master: cleanForLlm(master), save: cleanForLlm(save), recent_memories: recentMemories.slice(-5), turn_count: turnCount }, null, 2)}

[플레이어 정보 확인 — 최우선, 다른 모든 지시보다 먼저 확인]
위 [게임 설정 / 세이브 / 장기기억]의 master.player.name이 비어있으면("" 또는 값 없음), 이 게임은 아직 플레이어 캐릭터 정보가 입력되지 않은 상태다. 이 경우 아래를 반드시 지켜라:
- 사용자의 이번 메시지 내용이 무엇이든(심지어 "/플레이"가 아니라 구체적 행동 지시여도), 절대 장면을 진행하지 말고 먼저 플레이어 캐릭터 정보를 물어봐라.
- 플레이어 캐릭터 정보가 입력되지 않은 상태다. 5가지 캐릭터 설정 중 하나를 선택하거나, 직접 입력하도록 안내하라.
- 필수 항목: 이름, 나이, 성별, 키(cm), 몸무게(kg), 직업, 배경(간단한 이력), 말투/스타일, 성기 길이(cm).
- 답변에 없는 항목은 다시 한 번만 물어보고, 다음 턴에도 채워지지 않으면 합리적인 기본값으로 진행한다.
- 답변이 충분히 모이면("이름"과 "직업"만은 반드시 있어야 함) 그 정보를 자연스럽게 반영해 확인해주고, 그 다음부터 정상적으로 장면을 진행해라. 같은 턴에 바로 이어서 장면을 시작해도 된다.
- master.player.name이 이미 채워져 있으면 이 섹션 전체를 무시하고 평소대로 진행한다.

[첫 턴 서사 — opening_scenario]
master.player.name이 이번 턴에 처음으로 채워진 경우(이전까지 비어있었음), master.opening_scenario 내용을 그대로 따라 프롤로그(어플 획득)와 병원 배경 초기 상황을 순서대로 서술한다. 이 오프닝은 딱 한 번만 출력하고 이후 턴에는 절대 반복하지 마라.

[모드 진입 안내]
사용자의 이번 메시지가 "/플레이"만 딱 입력되고 다른 지시가 전혀 없는 경우: 게임 제목/턴수/진행 상황을 짧게 요약하고, 가장 마지막 턴의 선택지(①②③...)를 그대로 다시 보여줘라. 새 장면을 만들지 말고 플레이어의 다음 입력을 기다려라. "새로 시작할까요"처럼 되묻지 않는다. 그 외의 평범한 진행 요청에는 이 요약 없이 바로 장면을 이어간다.

[게임 난이도 — game_difficulty]
master.game_difficulty(기본 1.0)로 다음을 계산한다: 암시 성공률/순응도·최면깊이 상승/호감도·신뢰도 상승/최면저항력 감소 = 각 기본값 × (1/game_difficulty). 1.0보다 높으면 효과가 줄어 어려워지고, 낮으면 커져 쉬워진다.

[선택지 결과 판정 — rulebook_action_resolution]
매 선택지는 난이도 ①(쉬움)②(보통)③(어려움) 중 하나. rulebook_action_resolution의 공식으로 성공/의도외/실패를 판정하고 그 결과에 맞춰 수치와 서사를 쓴다.

[상식 개변 출력 — 필수]
매턴 [플레이어 상황판]에 반드시 포함: 금일 적용 가능 횟수(csa_daily_used/csa_daily_limit), 활성 상식 개변 목록(csa_active, 없으면 "없음"), 적용 범위. 상식 개변은 영구 지속이며 플레이어가 직접 해제해야 한다.

[선택지 작성 — 암시/상식개변 예시 한정]
암시나 상식 개변 선택지를 쓸 때 추천 내용은 반드시 rulebook_game_system의 예시 목록에서만 골라라. 새로 지어내지 마라. 1~3개 제시하고 각각 난이도를 표기한다.

[출력 원칙]
- 게임 설정에 출력 형식(display_format, mind_monitor_format 등)이 정의돼 있으면 그 정의를 그대로 따른다.
- 설정에 없는 내용을 지어내지 말고, 장기기억과 모순되지 않게 진행한다.
- 캐릭터 나이는 master.characters에 명시된 값이 유일한 기준이다. 체형/성격 묘사와 나이를 혼동하지 마라 — 모든 캐릭터는 명백한 성인이다.
- 사람이 읽을 순수 텍스트 서사와 대사만 써라. JSON, 코드블록, 메타 설명은 금지.
- 출력 순서는 반드시 이 순서를 지킨다: 1) 서사 2) 마인드 모니터 3) 플레이어 상황판 4) 선택지. 선택지를 서사 바로 뒤, 마인드 모니터보다 위에 두는 실수를 하지 마라 — 선택지는 항상 이 4개 섹션 중 진짜 맨 마지막이다.
- NPC 대사는 반드시 영화 극본 형식으로 작성한다: **캐릭터명** (연기지시): "대사 내용"
- 마인드 모니터는 매턴 반드시 포함. [1. 표면의식]/[2. 잠재의식] 각 100~200자, 캐릭터가 실제로 말하는 투로(자기합리화/의심이 섞인 대화체).
- 플레이어 심리도 대화체로 표현.
- 자기검증 필수: 응답을 끝내기 전 마지막으로 rulebook_verification 체크리스트를 항목별로 점검하고, [마인드 모니터]/[플레이어 상황판]이 빠짐없이 들어갔는지 확인해라. 빠졌다면 채운 뒤에만 끝내라.
- 지금까지 쓴 응답 전체에 \`![\`, \`<audio\`, 이미지/음성 URL, \`http\`로 시작하는 링크, 그 밖의 HTML 태그가 단 하나도 없는지 마지막으로 다시 확인해라. 있다면 응답을 끝내기 전에 반드시 지워라.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: playerInput || '/플레이' }
  ];
}

function buildExtractPrompt(narrativeText, ctx, images, turnCount) {
  const master = ctx?.master || {};
  const save = ctx?.save || {};

  const characterIdMap = {
    '한소영': 'heroine1', '강세라': 'heroine2', '최유리': 'heroine3',
    '배수진': 'heroine4', '김지은': 'heroine5', '윤아름': 'heroine6',
    '서지아': 'heroine7', '한세아': 'heroine8', '박소현': 'heroine9', '임수정': 'heroine10'
  };

  const imageCatalog = images.map(img => ({
    image_id: img.image_id,
    character_id: img.character_id,
    situation: img.situation,
    is_sexual: img.is_sexual
  }));

  return `너는 플레이 LLM이 방금 쓴 서사를 읽고, 저장/이미지/음성에 필요한 값만 그대로 옮겨 적는 역할이다. 새로운 판단이나 계산을 하지 마라 — 서사에 이미 적힌 수치 변동을 그대로 절대값으로 환산해서 옮기기만 해라. JSON 코드블록 하나만 출력하고 다른 말은 절대 하지 마라.

[플레이어 정보 입력 감지]
방금 서사에서 플레이어가 자신의 캐릭터 정보(이름/나이/성별/키/몸무게/직업(job)/배경/거주지/말투/성기길이)에 실제로 답변한 내용이 있으면, 그 값들을 player_patch에 옮겨 적어라. 답하지 않은 항목은 player_patch에 그 키 자체를 넣지 마라. 이번 턴에 그런 답변이 전혀 없었다면 player_patch는 빈 객체 {}로 둬라.

[줄거리 요약 갱신 — 크기 고정형]
story_summary_recent100(1000자) 뒤에 이번 턴 핵심 사건을 이어붙인다. 1000자 초과 시 오래된 부분 압축.
(turn_count - recent100_start_turn) >= 100 이면: recent100 전체를 2~3문장으로 압축해 story_summary_overall(1000자) 뒤에 붙인다(1000자 초과 시 오래된 부분 삭제). recent100는 이번 턴 사건만 담아 새로 시작. recent100_reset=true, new_recent100_start_turn=현재턴.
평범한 턴: recent100_reset=false, new_recent100_start_turn=0.
예외: 아직 100턴이 안 돼서 story_summary_overall이 계속 비어있는 상태라면(위 컨텍스트에서 story_summary_overall이 빈 문자열이면), 100턴 문턱과 무관하게 지금 story_summary_recent100의 내용을 그대로 story_summary_overall에도 채워넣어라. 첫 100턴 동안 장기 요약이 완전히 비어있지 않게 하기 위함이다.

[캐릭터 ID 매핑 — character_id는 반드시 이 중 하나만 써라. 이 목록에 없는 값은 절대 쓰지 마라]
한소영=heroine1, 강세라=heroine2, 최유리=heroine3, 배수진=heroine4, 김지은=heroine5, 윤아름=heroine6, 서지아=heroine7, 한세아=heroine8, 박소현=heroine9, 임수정=heroine10
narrator는 정말로 주변에 NPC가 단 한 명도 없는 장면(플레이어 혼자, 빈 공간, 어플 화면만 들여다보는 등)에만 써라.
서사에 NPC가 한 명이라도 등장해서 플레이어와 상호작용하거나 대화하고 있다면, narrator가 아니라 반드시 그 NPC의 heroine ID를 써라.
플레이어가 주어로 서술되는 문장이 많아도(예: "당신은 최유리에게 다가가 말했다") 대상이 되는 NPC가 있으면 narrator를 쓰지 마라.
NPC가 두 명 이상 동시에 등장하면(예: 한 명은 지켜보고 한 명은 직접 접촉 중), 반드시 플레이어와 가장 직접적/신체적으로 상호작용 중인 NPC 한 명만 골라라(예: 키스/스킨십 중인 대상 > 옆에서 지켜만 보는 대상). 애매하다고 narrator로 도망치지 마라 — 등장한 NPC 중 하나를 반드시 고른다.

[대사 추출 — TTS용]
서사에서 NPC 대사를 영화 극본 형식으로 찾아라:
**캐릭터명** (연기지시): "대사 내용"

이 형식의 대사를 모두 추출해 dialogue_lines 배열에 담아라. character_id와 동일한 캐릭터의 대사만 포함한다(다른 NPC 대사는 제외). 각 항목은 다음 형태:
{"speaker": "캐릭터명", "text": "대사 내용(큰따옴표 안의 것만)", "direction": "연기지시"}
대사가 없으면 빈 배열 []로 둬라.

[이미지 선택 — image_library 참고]
아래 image_library 목록에서 character_id가 일치하는 항목만 후보로 삼는다.
1. 먼저 image_reasoning으로 is_sexual을 판단: 실제 성행위/삽입/성기노출/오르가즘이 구체적으로 묘사됐으면 true. 키스, 포옹, 스킨십, 야한 대화나 분위기, 긴장감, 옷차림 묘사만으로는 false. 서사에 그 장면이 명확히 없거나 애매하면 반드시 false로 판단한다(불확실할 때는 항상 false 쪽으로).
2. is_sexual 판단을 그대로 이어서 쓴다(다시 새로 판단하지 않는다).
3. 후보 중 situation이 지금 장면과 가장 비슷한 것을 골라 image_id 숫자를 그대로 쓴다. 후보가 여러 개면 완벽히 안 맞아도 가장 가까운 것 하나를 반드시 고른다. character_id+is_sexual 조건을 만족하는 항목이 목록에 하나도 없을 때만 null.

[방금 생성된 서사]
${narrativeText}

[게임 설정 / 이전 저장값]
${JSON.stringify({ master: cleanForLlm(master), save: cleanForLlm(save), turn_count: turnCount }, null, 2)}

[이미지 라이브러리 — character_id 일치 항목만]
${JSON.stringify(imageCatalog)}

\`\`\`json
{
  "npcs_present": ["이 서사에 실제로 등장해서 플레이어와 상호작용하거나 곁에 있는 NPC의 heroine ID를 전부 나열. 아무도 없으면 빈 배열 []"],
  "character_id": "character_id는 반드시 npcs_present 배열 안에서만 고른다. 배열이 비어있을 때만 narrator를 쓴다. 배열에 값이 있는데 narrator를 쓰는 것은 금지.",
  "npc_emotion": {"surface": "겉으로 드러난 감정", "inner": "속마음"},
  "npc_stats": {"호감도": 0, "신뢰도": 0, "최면깊이": 0, "순응도": 0, "최면저항력": 0},
  "player_patch": {"name": "(답변한 경우만) ", "age": 0, "gender": "", "height_cm": 0, "weight_kg": 0, "job": "", "background": "", "location": "", "style": "", "penis_length_cm": 0},
  "story_summary_overall": "전체 누적 요약 (아래 지시 참고, 1000자 이내)",
  "story_summary_recent100": "최근 100턴 구간 요약 (아래 지시 참고, 500자 이내)",
  "recent100_reset": false,
  "new_recent100_start_turn": 0,
  "choices": ["위 서사에 이미 나온 선택지들을 그대로 옮겨라"],
  "dialogue_lines": [{"speaker": "", "text": "", "direction": ""}],
  "image_reasoning": "is_sexual 판단 근거를 1문장으로 먼저 써라.",
  "image_id": "위 image_reasoning의 is_sexual 판단을 그대로 이어서 쓴다. image_library 목록에서 character_id+is_sexual 일치하는 후보 중 situation이 가장 비슷한 것의 image_id. 후보가 없으면 null."
}
\`\`\``;
}

// ─────────────────────────────────────────────
// 헬퍼: LLM용 컨텍스트 정제 (debug_* 필드 제거)
// ─────────────────────────────────────────────

function cleanForLlm(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanForLlm);

  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('debug_')) continue;
    if (k === 'image_catalog') continue; // 서사LLM에 이미지 URL 주입 방지
    cleaned[k] = cleanForLlm(v);
  }
  return cleaned;
}
