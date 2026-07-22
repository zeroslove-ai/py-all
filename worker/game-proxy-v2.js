// worker.js — 게임빌더_v2 프록시 Worker (동적 프롬프트)
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
// 4-8. 나머지 엔드포인트
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

// ═════════════════════════════════════════════
// 동적 프롬프트 빌더 (C안)
// ═════════════════════════════════════════════

function buildStoryPrompt(ctx, playerInput, turnCount) {
  const master = ctx?.master || {};
  const save = ctx?.save || {};
  const recentMemories = ctx?.recent_memories || [];
  const isReentry = !playerInput || playerInput.trim() === '' || playerInput.trim() === '/플레이';
  const isFirstTurn = turnCount <= 1;
  const hasPlayer = !!(save.player?.name);
  const needsRulebook = turnCount % 10 === 0; // 10털마다 rulebook 주입

  // ─── 섹션 1: 핵심 규칙 (항상 포함) ───
  const coreRules = `[핵심 규칙]
너는 인터랙티브 게임 진행자다. 순수 텍스트 서사만 작성한다.

[금지] 이미지(![), 오디오(<audio), URL(http), HTML 태그를 절대 쓰지 마라. 이건 렌더러가 처리한다.
[순서] 출력 순서: ①서사 ②마인드모니터 ③플레이어상황판 ④선택지. 선택지는 항상 맨 마지막.
[대사] NPC 대사는 **캐릭터명** (연기지시): "대사 내용" 형식으로만.
[모니터] 매턴 [1.표면의식]/[2.잠재의식] 각 100~200자, 대화체로 작성.`;

  // ─── 섹션 2: 플레이어 게이트 (조걸) ───
  let playerGate = '';
  if (!hasPlayer) {
    playerGate = `

[플레이어 정보 입력 — 최우선]
아직 플레이어 캐릭터 정보가 없다. 이름/나이/성별/키/몸무게/직업/배경/말투/성기길이를 물어라.
필수: 이름, 직업. 나머지는 기본값으로 진행. 장면은 정보 입력 후부터 시작.`;
  }

  // ─── 섹션 3: 첫 턴/재진입 (조걸) ───
  let modeSection = '';
  if (isReentry) {
    modeSection = `

[재진입 모드]
"${playerInput || '/플레이'}"만 입력됨. 새 장면을 만들지 말고, 게임 제목/턴수/진행 상황을 짧게 요약하고 마지막 선택지를 다시 보여줘라.`;
  } else if (isFirstTurn && hasPlayer) {
    modeSection = `

[첫 턴]
opening_scenario를 그대로 따라 프롤로그와 병원 배경을 순서대로 서술. 이 오프닝은 딱 한 번만.`;
  }

  // ─── 섹션 4: rulebook 주입 (10털마다) ───
  let rulebookSection = '';
  if (needsRulebook) {
    const rb = master.rulebook_game_system || '';
    const action = master.rulebook_action_resolution || {};
    rulebookSection = `

[rulebook 주입 — ${turnCount}턴]
${rb ? rb.slice(0, 800) : ''}
${action.description ? '선택지 판정: ' + action.description : ''}`;
  }

  // ─── 섹션 5: 컨텍스트 ───
  const contextSection = `

[게임 설정]
${JSON.stringify(cleanForLlm(master), null, 2).slice(0, 2000)}

[이전 저장값]
${JSON.stringify(cleanForLlm(save), null, 2).slice(0, 1500)}

[최근 기억]
${recentMemories.slice(-3).map(m => m.content?.slice(0, 200) || '').join('\n---\n')}`;

  // ─── 조립 ───
  const systemPrompt = coreRules + playerGate + modeSection + rulebookSection + contextSection;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: playerInput || '/플레이' }
  ];
}

// ─────────────────────────────────────────────
// 추출 프롬프트 (동일)
// ─────────────────────────────────────────────

function buildExtractPrompt(narrativeText, ctx, images, turnCount) {
  const master = ctx?.master || {};
  const save = ctx?.save || {};

  const imageCatalog = images.map(img => ({
    image_id: img.image_id,
    character_id: img.character_id,
    situation: img.situation,
    is_sexual: img.is_sexual
  }));

  return `너는 플레이 LLM이 방금 쓴 서사를 읽고, 저장/이미지/음성에 필요한 값만 그대로 옮겨 적는 역할이다. 새로운 판단이나 계산을 하지 마라 — 서사에 이미 적힌 수치 변동을 그대로 절대값으로 환산해서 옮기기만 하라. JSON 코드블록 하나만 출력하고 다른 말은 절대 하지 마라.

[플레이어 정보 입력 감지]
방금 서사에서 플레이어가 자신의 캐릭터 정보(이름/나이/성별/키/몸무게/직업(job)/배경/거주지/말투/성기길이)에 실제로 답변한 내용이 있으면, 그 값들을 player_patch에 옮겨 적어라. 답하지 않은 항목은 player_patch에 그 키 자체를 넣지 마라. 이번 턴에 그런 답변이 전혀 없었다면 player_patch는 빈 객체 {}로 둬라.

[줄거리 요약 갱신 — 크기 고정형]
story_summary_recent100(1000자) 뒤에 이번 턴 핵심 사건을 이어붙인다. 1000자 초과 시 오래된 부분 압축.
(turn_count - recent100_start_turn) >= 100 이면: recent100 전체를 2~3문장으로 압축해 story_summary_overall(1000자) 뒤에 붙인다(1000자 초과 시 오래된 부분 삭제). recent100는 이번 턴 사걸만 담아 새로 시작. recent100_reset=true, new_recent100_start_turn=현재턴.
평범한 턴: recent100_reset=false, new_recent100_start_turn=0.
예외: 아직 100턴이 안 돼서 story_summary_overall이 계속 비어있는 상태라면(위 컨텍스트에서 story_summary_overall이 빈 문자열이면), 100턴 문턱과 무관하게 지금 story_summary_recent100의 내용을 그대로 story_summary_overall에도 채워넣어라.

[캐릭터 ID 매핑 — character_id는 반드시 이 중 하나만 써라]
한소영=heroine1, 강세라=heroine2, 최유리=heroine3, 배수진=heroine4, 김지은=heroine5, 윤아름=heroine6, 서지아=heroine7, 한세아=heroine8, 박소현=heroine9, 임수정=heroine10
narrator는 정말로 주변에 NPC가 단 한 명도 없는 장면에만 써라. NPC가 등장하면 반드시 heroine ID를 써라.

[대사 추출 — TTS용]
서사에서 **캐릭터명** (연기지시): "대사 내용" 형식을 찾아 dialogue_lines에 담아라.
{"speaker": "캐릭터명", "text": "대사 내용", "direction": "연기지시"}
대사가 없으면 빈 배열 []로 둬라.

[이미지 선택]
1. image_reasoning으로 is_sexual 판단: 실제 성행위/삽입/성기노출/오르가즘이 구체적이면 true. 키스/포옹/스킨십/분위기만으로는 false. 애매하면 반드시 false.
2. image_library에서 character_id+is_sexual 일치 항목 필터 → situation 매칭 → image_id 선택. 후보 없으면 null.

[방금 생성된 서사]
${narrativeText}

[게임 설정 / 이전 저장값]
${JSON.stringify({ master: cleanForLlm(master), save: cleanForLlm(save), turn_count: turnCount }, null, 2)}

[이미지 라이브러리]
${JSON.stringify(imageCatalog)}

\`\`\`json
{
  "npcs_present": ["등장 NPC heroine ID 전부. 없으면 []"],
  "character_id": "npcs_present 안에서만 선택. 비어있을 때만 narrator.",
  "npc_emotion": {"surface": "겉 감정", "inner": "속마음"},
  "npc_stats": {"호감도": 0, "신뢰도": 0, "최면깊이": 0, "순응도": 0, "최면저항력": 0},
  "player_patch": {"name": "", "age": 0, "gender": "", "height_cm": 0, "weight_kg": 0, "job": "", "background": "", "location": "", "style": "", "penis_length_cm": 0},
  "story_summary_overall": "전체 누적 요약 (1000자 이내)",
  "story_summary_recent100": "최근 100턴 요약 (500자 이내)",
  "recent100_reset": false,
  "new_recent100_start_turn": 0,
  "choices": ["서사의 선택지를 그대로 옮겨라"],
  "dialogue_lines": [{"speaker": "", "text": "", "direction": ""}],
  "image_reasoning": "is_sexual 판단 근거 1문장",
  "image_id": "is_sexual 판단 유지 → image_library 후보 중 situation 매칭 → image_id. 없으면 null."
}
\`\`\``;
}

// ─────────────────────────────────────────────
// 헬퍼: LLM용 컨텍스트 정제
// ─────────────────────────────────────────────

function cleanForLlm(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanForLlm);

  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('debug_')) continue;
    if (k === 'image_catalog') continue;
    cleaned[k] = cleanForLlm(v);
  }
  return cleaned;
}
