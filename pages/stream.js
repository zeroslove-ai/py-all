// stream.js — SSE 스트리밍 파싱 (fetch + ReadableStream)

const stream = {
  // ─── 서사 스트리밍 ───
  // Worker가 DeepSeek OpenAI 호환 SSE를 그대로 중계
  // 파싱은 브라우저에서 한 번만 수행
  async story(gameId, playerInput, turnCount, onChunk, feedback = []) {
    const res = await fetch(`${API_BASE}/api/story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: gameId,
        player_input: playerInput,
        turn_count: turnCount,
        feedback
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`story failed: ${res.status} ${text}`);
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported');
    }

    const mode = res.headers.get('X-Game-Mode') || 'normal';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // 마지막 미완성 조각은 다음 루프로 넘김

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          return { text: fullText, mode };
        }

        try {
          const json = JSON.parse(payload);
          // DeepSeek OpenAI 호환 포맷
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch (e) {
          // 아직 완전하지 않은 JSON 조각일 수 있음 — 무시하고 다음 청크에서 이어붙여짐
        }
      }
    }

    // 남은 버퍼 처리
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data: ')) {
        const payload = trimmed.slice(6);
        if (payload !== '[DONE]') {
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch (e) {
            // 마지막 조각 파싱 실패 — 무시
          }
        }
      }
    }

    return { text: fullText, mode };
  }
};
