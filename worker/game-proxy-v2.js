// worker.js — 게임빌더_v2 프록시 Worker
// Cloudflare Workers (ES Modules)

const SUPABASE_URL = 'https://ovltkzwddxsekcfeskds.supabase.co';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // 속도 제한 (간이 — KV 기반 확장 가능)
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
  // 현재는 패스스루
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

  // RPC가 JSON을 반환하지 않을 수 있음 (예: void RPC)
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

// Supabase 테이블 직접 조회 (GET)
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

  // 병렬: get_context RPC + image_library 쿼리
  const [ctx, images] = await Promise.all([
    supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 15 }),
    supabaseGet(env, 'image_library', `select=*&character_id=not.is.null&limit=1000`)
  ]);

  // image_library를 character_id별로 그룹화 (프론트/추출용)
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

  // 컨텍스트 로드 (캐싱 고려 — KV나 짧은 TTL)
  const ctx = await supabaseRpc(env, 'get_context', { 
    p_game_id: game_id, 
    p_recent_count: 15 
  });

  // 프롬프트 조립 (서사 LLM용)
  const messages = buildStoryPrompt(ctx, player_input, turn_count);

  // DeepSeek SSE 호출
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

  // SSE 그대로 passthrough — Worker가 파싱하지 않음
  return new Response(deepseekRes.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }
  });
}

// ─────────────────────────────────────────────
// 3. /api/extract — 상태 추출 (JSON, 스트리밍 아님)
// ─────────────────────────────────────────────

async function handleExtract(req, env) {
  const { game_id, narrative_text, turn_count } = await readJson(req);
  if (!game_id || !narrative_text) {
    return jsonResponse({ error: 'game_id and narrative_text required' }, 400);
  }

  // 컨텍스트 + 이미지 카탈로그 병렬 로드
  const [ctx, images] = await Promise.all([
    supabaseRpc(env, 'get_context', { p_game_id: game_id, p_recent_count: 15 }),
    supabaseGet(env, 'image_library', `select=image_id,character_id,situation,is_sexual&limit=1000`)
  ]);

  // 추출 프롬프트 (EXTRACT_PROMPT.md 기반)
  const prompt = buildExtractPrompt(narrative_text, ctx, images);

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

  // JSON 파싱 (코드블록 제거)
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
// 4. /api/image — 이미지 URL 조회
// ─────────────────────────────────────────────

async function handleImage(req, env) {
  const { game_id, character_id, image_id } = await readJson(req);
  if (!game_id || !character_id) {
    return jsonResponse({ error: 'game_id and character_id required' }, 400);
  }

  // get_character_image RPC (v2: image_id 직접, emotion_id 폴백 제거)
  const result = await supabaseRpc(env, 'get_character_image', {
    p_game_id: game_id,
    p_character_id: character_id,
    p_image_id: image_id || null
  });

  return jsonResponse({ image_url: result });
}

// ─────────────────────────────────────────────
// 5. /api/tts — 음성 생성 (기존 Fish Audio Worker 호출)
// ─────────────────────────────────────────────

async function handleTts(req, env) {
  const { text, voice_id } = await readJson(req);
  if (!text || !voice_id) {
    return jsonResponse({ error: 'text and voice_id required' }, 400);
  }

  // 기존 Fish Audio Worker 호출
  const res = await fetch('https://fancy-dust-7f8c.zeroslove.workers.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id })
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: `TTS Worker error: ${res.status}` }, 502);
  }

  const data = await res.json();
  return jsonResponse({ url: data.url });
}

// ─────────────────────────────────────────────
// 6. /api/save-turn — 턴 서사 원문 저장
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// 7. /api/set-save — 진행 상태 갱신
// ─────────────────────────────────────────────

async function handleSetSave(req, env) {
  const { game_id, patch, turn_number } = await readJson(req);
  if (!game_id || !patch) {
    return jsonResponse({ error: 'game_id and patch required' }, 400);
  }

  // patch: { npc_stats, npc_emotion, story_summary_overall, story_summary_recent100, ... }
  await supabaseRpc(env, 'set_save', {
    p_game_id: game_id,
    p_patch: patch,
    p_turn_number: turn_number
  });

  // 갱신된 turn_count 반환
  const save = await supabaseGet(env, 'game_save', `select=turn_count&game_id=eq.${game_id}&limit=1`);
  const newTurnCount = save?.[0]?.turn_count || turn_number;

  return jsonResponse({ ok: true, turn_count: newTurnCount });
}

// ─────────────────────────────────────────────
// 8. /api/reset — 진행 초기화
// ─────────────────────────────────────────────

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
  // TODO: v1의 플레이 LLM 시스템 프롬프트를 여기로 이식
  // 현재는 간이 구현
  const systemPrompt = `너는 인터랙티브 게임의 진행자다. 아래 게임 설정과 장기기억을 바탕으로 사용자의 행동에 이어지는 장면을 진행하라.

[게임 설정]
${JSON.stringify(ctx?.master || {}, null, 2)}

[이전 저장값]
${JSON.stringify(ctx?.save || {}, null, 2)}

[플레이어 입력]
${playerInput}

[출력 원칙]
- 순수 텍스트 서사만 작성. 이미지, 오디오, HTML 태그, URL을 절대 포함하지 마라.
- 출력 순서: 1) 서사 2) 마인드 모니터 3) 플레이어 상황판 4) 선택지
- NPC 대사는 **캐릭터명** (연기지시): "대사 내용" 형식으로 작성`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: playerInput }
  ];
}

function buildExtractPrompt(narrativeText, ctx, images) {
  // EXTRACT_PROMPT.md 기반
  // TODO: 실제 프롬프트 문자열을 여기에 삽입
  const characterIdMap = {
    '한소영': 'heroine1', '강세라': 'heroine2', '최유리': 'heroine3',
    '배수진': 'heroine4', '김지은': 'heroine5', '윤아름': 'heroine6',
    '서지아': 'heroine7', '한세아': 'heroine8', '박소현': 'heroine9', '임수정': 'heroine10'
  };

  // character_id 일치 이미지만 필터
  // (추출 결과의 character_id를 아직 모르므로, 전체 카탈로그를 주고 LLM이 선택)
  const imageCatalog = images.map(img => ({
    image_id: img.image_id,
    character_id: img.character_id,
    situation: img.situation,
    is_sexual: img.is_sexual
  }));

  const prompt = `너는 플레이 LLM이 방금 쓴 서사를 읽고, 저장/이미지/음성에 필요한 값만 그대로 옮겨 적는 역할이다...

[방금 생성된 서사]
${narrativeText}

[게임 설정 / 이전 저장값]
${JSON.stringify(ctx, null, 2)}

[이미지 라이브러리]
${JSON.stringify(imageCatalog)}

... (EXTRACT_PROMPT.md 전문 참조)`;

  return prompt;
}
