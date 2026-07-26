// api.js — Worker API 호출 함수들

const API_BASE = 'https://game-proxy-v2.zeroslove.workers.dev';

class ApiError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function readApiResponse(res, label) {
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    throw new ApiError(data.error || `${label} failed: ${res.status}`, res.status, data);
  }
  return data;
}

const api = {
  // ─── 1. 컨텍스트 로드 ───
  async context(gameId) {
    const res = await fetch(`${API_BASE}/api/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });
    return readApiResponse(res, 'context');
  },

  // ─── 2. 서사 생성 (SSE) — stream.js에서 직접 호출 ───
  // story()는 stream.js의 streamStory()가 담당

  // ─── 3. 상태 추출 ───
  // extract·request_id·timing을 모두 담은 전체 응답을 반환한다. 호출부에서
  // result.extract로 실제 값을, result.timing으로 [extract-timing] 로그를 남긴다.
  async extract(gameId, narrativeText, turnCount, playerInput = '') {
    const res = await fetch(`${API_BASE}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        narrative_text: narrativeText,
        player_input: playerInput,
        turn_count: turnCount
      })
    });
    return readApiResponse(res, 'extract');
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
    return readApiResponse(res, 'image');
  },

  // ─── 5. TTS 생성 ───
  async tts(text, voiceId, direction = '') {
    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId, direction })
    });
    const data = await readApiResponse(res, 'tts');
    if (typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
      throw new ApiError('TTS 응답에 유효한 audio URL이 없습니다.', res.status, data);
    }
    return data;
  },

  // ─── 6. 턴 저장 ───
  // ─── 7. 진행 상태 갱신 ───
  // ─── 8. 턴 전체 커밋 ───
  // DB의 save_turn/set_save는 Worker가 순서대로 호출하고 브라우저는 한 번만 요청한다.
  async commitTurn(gameId, turnNumber, content, extract, enginePatch = {}, playerInput = '', playerAction = null) {
    const res = await fetch(`${API_BASE}/api/commit-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        turn_number: turnNumber,
        content,
        extract,
        engine_patch: enginePatch,
        player_input: playerInput,
        player_action: playerAction
      })
    });
    return readApiResponse(res, 'commit-turn');
  },

  // ─── 8-2. 플레이 기록 조회 ───
  async history(gameId, { limit = 20, beforeTurn = null } = {}) {
    const res = await fetch(`${API_BASE}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        limit,
        before_turn: beforeTurn
      })
    });
    return readApiResponse(res, 'history');
  },

  // ─── 9. 진행 초기화 ───
  async reset(gameId) {
    const res = await fetch(`${API_BASE}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId })
    });
    return readApiResponse(res, 'reset');
  },

  // ─── 9-2. 마지막 턴 롤백만 수행 (Story/Extract/Commit은 여기서 하지 않음) ───
  async feedbackRollback(gameId, feedbackText, expectedTurnNumber = null) {
    const res = await fetch(`${API_BASE}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        feedback: feedbackText,
        expected_turn_number: Number.isInteger(expectedTurnNumber) ? expectedTurnNumber : null
      })
    });
    return readApiResponse(res, 'feedback');
  },

  // ─── 9-3. 피드백 재생성 실패 시 롤백된 턴 복구 ───
  async feedbackRestore(gameId, turnNumber, restorePayload) {
    const res = await fetch(`${API_BASE}/api/feedback/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId, turn_number: turnNumber, restore_payload: restorePayload })
    });
    return readApiResponse(res, 'feedback-restore');
  },

  // ─── 10. API 버전 조회 — 배포 확인용, 앱 초기화 시 1회만 호출 ───
  async version() {
    const res = await fetch(`${API_BASE}/api/version`);
    return readApiResponse(res, 'version');
  }
};
