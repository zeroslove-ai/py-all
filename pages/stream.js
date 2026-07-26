// stream.js — SSE 스트리밍 파싱 (fetch + ReadableStream)

// Display-only pacing — the server/DeepSeek SSE stream itself is never
// throttled, only how fast arrived text is *revealed* to the reader. There
// was previously no such delay at all (each SSE delta was rendered the
// instant it arrived), so this is a new, deliberately slow typewriter pace
// rather than "the old interval doubled" — chosen to land at roughly half
// the felt speed of a normal ~30ms/char typewriter reveal.
const STREAM_RENDER_INTERVAL_MS = 60;
// If the tab was backgrounded (or a huge chunk arrives at once), the reveal
// queue can back up; once it does, reveal several characters per tick
// instead of one so the display safely catches up instead of lagging
// further and further behind — never by dropping or truncating text.
const STREAM_CATCHUP_QUEUE_THRESHOLD = 400;
const STREAM_CATCHUP_CHARS_PER_TICK = 8;

const stream = {
  // ─── 서사 스트리밍 ───
  // Worker가 DeepSeek OpenAI 호환 SSE를 그대로 중계
  // 파싱은 브라우저에서 한 번만 수행
  async story(gameId, playerInput, turnCount, onChunk, feedback = []) {
    const overallStart = Date.now();
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
    const fetchHeadersMs = Date.now() - overallStart;
    const requestId = res.headers.get('X-Request-ID') || null;

    if (!res.ok) {
      const text = await res.text();
      const error = new Error(`story failed: ${res.status} ${text}`);
      error.status = res.status;
      error.requestId = requestId;
      throw error;
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported');
    }

    const mode = res.headers.get('X-Game-Mode') || 'normal';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let firstContentMs = null;
    const recordFirstContent = () => {
      if (firstContentMs === null) firstContentMs = Date.now() - overallStart;
    };
    const finish = () => ({
      text: fullText,
      mode,
      requestId,
      timing: { fetch_headers_ms: fetchHeadersMs, first_content_ms: firstContentMs, stream_total_ms: Date.now() - overallStart }
    });

    // Display queue: network reading below fills this as fast as chunks
    // actually arrive (never throttled, never dropped); a separate paced
    // loop drains it into onChunk(). This is what decouples "network done"
    // from "fully displayed" — retryStory awaits this function's return
    // before finalizing the narrative, so slowing display here still means
    // the typing cursor/finalize only happens once every character is
    // actually on screen.
    let displayQueue = '';
    let networkDone = false;
    let resolveDrain;
    const drained = new Promise(resolve => { resolveDrain = resolve; });
    (function drainTick() {
      if (displayQueue.length) {
        const charsThisTick = displayQueue.length > STREAM_CATCHUP_QUEUE_THRESHOLD
          ? STREAM_CATCHUP_CHARS_PER_TICK
          : 1;
        onChunk(displayQueue.slice(0, charsThisTick));
        displayQueue = displayQueue.slice(charsThisTick);
        setTimeout(drainTick, STREAM_RENDER_INTERVAL_MS);
      } else if (networkDone) {
        resolveDrain();
      } else {
        setTimeout(drainTick, STREAM_RENDER_INTERVAL_MS);
      }
    })();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // 마지막 미완성 조각은 다음 루프로 넘김

      let sawDone = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          sawDone = true;
          break;
        }

        try {
          const json = JSON.parse(payload);
          // DeepSeek OpenAI 호환 포맷
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            recordFirstContent();
            displayQueue += delta;
          }
        } catch (e) {
          // 아직 완전하지 않은 JSON 조각일 수 있음 — 무시하고 다음 청크에서 이어붙여짐
        }
      }
      if (sawDone) break;
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
              recordFirstContent();
              displayQueue += delta;
            }
          } catch (e) {
            // 마지막 조각 파싱 실패 — 무시
          }
        }
      }
    }

    networkDone = true;
    await drained;
    return finish();
  }
};
