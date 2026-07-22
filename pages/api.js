// api.js — Worker API 호출 함수들

const API_BASE = ''; // 같은 도메인 (Cloudflare Pages + Worker)

const api = {
  // ─── 1. 컨텍스트 로드 ───
  async context(gameId) {
    const res = await fetch(`${API_BASE}/api/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });
    if (!res.ok) throw new Error(`context failed: ${res.status}`);
    return await res.json();
  },

  // ─── 2. 서사 생성 (SSE) — stream.js에서 직접 호출 ───
  // story()는 stream.js의 streamStory()가 담당

  // ─── 3. 상태 추출 ───
  async extract(gameId, narrativeText, turnCount) {
    const res = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        narrative_text: narrativeText,
        turn_count: turnCount
      })
    });
    if (!res.ok) throw new Error(`extract failed: ${res.status}`);
    const data = await res.json();
    return data.extract;
  },

  // ─── 4. 이미지 URL 조회 ───
  async image(gameId, characterId, imageId) {
    const res = await fetch(`${API_BASE}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        character_id: characterId,
        image_id: imageId || null
      })
    });
    if (!res.ok) throw new Error(`image failed: ${res.status}`);
    return await res.json();
  },

  // ─── 5. TTS 생성 ───
  async tts(text, voiceId) {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId })
    });
    if (!res.ok) throw new Error(`tts failed: ${res.status}`);
    return await res.json();
  },

  // ─── 6. 턴 저장 ───
  async saveTurn(gameId, turnNumber, content) {
    const res = await fetch(`${API_BASE}/api/save-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        turn_number: turnNumber,
        content: content
      })
    });
    if (!res.ok) throw new Error(`save-turn failed: ${res.status}`);
    return await res.json();
  },

  // ─── 7. 진행 상태 갱신 ───
  async setSave(gameId, patch, turnNumber) {
    const res = await fetch(`${API_BASE}/api/set-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        patch: patch,
        turn_number: turnNumber
      })
    });
    if (!res.ok) throw new Error(`set-save failed: ${res.status}`);
    return await res.json();
  },

  // ─── 8. 진행 초기화 ───
  async reset(gameId) {
    const res = await fetch(`${API_BASE}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });
    if (!res.ok) throw new Error(`reset failed: ${res.status}`);
    return await res.json();
  }
};
