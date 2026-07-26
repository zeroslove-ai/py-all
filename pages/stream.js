// stream.js — SSE 스트리밍 파싱 (fetch + ReadableStream)

// Foreground display pacing is always fixed — no backlog-based acceleration.
// A backed-up queue (e.g. after a backgrounded tab) never speeds up the
// visible typing; it only means the background branch below flushes it
// immediately while the tab isn't visible anyway.
const STREAM_RENDER_INTERVAL_MS = 8;
const STREAM_RENDER_CHARS_PER_TICK = 1;

// Collapses any run of 3+ '.'/'…' characters down to exactly '..' — the
// only postprocessing this does is capping the *count* of ellipsis
// characters; it never rewrites or reworks the sentence itself.
function capExcessEllipsis(text) {
  return text.replace(/[.…]{3,}/g, '..');
}

// A fresh carry-buffer per call (never shared across concurrent/streamed
// turns). SSE chunk boundaries can split an ellipsis run apart (one delta
// ending in ".." and the next starting with "."), so a plain per-delta
// replace could miss a run that's actually 3+ characters long once joined.
// This holds back a trailing run of dots/ellipsis until the next delta (or
// end of stream) confirms whether it keeps growing.
function createEllipsisSanitizer() {
  let carry = '';
  return {
    push(delta) {
      const combined = carry + delta;
      const trailingRun = combined.match(/[.…]+$/);
      if (trailingRun && trailingRun[0].length === combined.length && combined.length < 40) {
        // Bounded so a pathological all-dots stream can't buffer forever.
        carry = combined;
        return '';
      }
      if (trailingRun) {
        carry = trailingRun[0];
        return capExcessEllipsis(combined.slice(0, combined.length - trailingRun[0].length));
      }
      carry = '';
      return capExcessEllipsis(combined);
    },
    flush() {
      const leftover = carry;
      carry = '';
      return leftover ? capExcessEllipsis(leftover) : '';
    }
  };
}

const stream = {
  // ─── 서사 스트리밍 ───
  // Worker가 DeepSeek OpenAI 호환 SSE를 그대로 중계, 파싱은 브라우저에서 한 번만.
  //
  // Returns { networkDone, renderDone } immediately (not one combined
  // promise): networkDone resolves as soon as the full SSE body has been
  // received (narrative text ready for Extract), renderDone resolves once
  // the paced display queue has finished revealing every character. Callers
  // that need the final text (Extract) should await networkDone and can run
  // concurrently with the still-typing display; callers touching the DOM
  // (finalizing the narrative element, revealing choices) must await
  // renderDone so they never cut the animation short.
  story(gameId, playerInput, turnCount, onChunk, feedback = [], regenerationFeedback = null) {
    const overallStart = Date.now();
    let resolveNetworkDone, rejectNetworkDone;
    let resolveRenderDone, rejectRenderDone;
    const networkDone = new Promise((resolve, reject) => { resolveNetworkDone = resolve; rejectNetworkDone = reject; });
    const renderDone = new Promise((resolve, reject) => { resolveRenderDone = resolve; rejectRenderDone = reject; });

    (async () => {
      let fetchHeadersMs = null;
      let requestId = null;
      try {
        const res = await fetch(`${API_BASE}/api/story`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game_id: gameId,
            player_input: playerInput,
            turn_count: turnCount,
            feedback,
            regeneration_feedback: regenerationFeedback
          })
        });
        fetchHeadersMs = Date.now() - overallStart;
        requestId = res.headers.get('X-Request-ID') || null;

        if (!res.ok) {
          const text = await res.text();
          const error = new Error(`story failed: ${res.status} ${text}`);
          error.status = res.status;
          error.requestId = requestId;
          throw error;
        }
        if (!res.body) throw new Error('ReadableStream not supported');

        const mode = res.headers.get('X-Game-Mode') || 'normal';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const ellipsisSanitizer = createEllipsisSanitizer();
        let buffer = '';
        let fullText = '';
        let displayQueue = '';
        let firstContentMs = null;
        const recordFirstContent = () => {
          if (firstContentMs === null) firstContentMs = Date.now() - overallStart;
        };
        const ingestDelta = (delta) => {
          const sanitized = ellipsisSanitizer.push(delta);
          if (!sanitized) return;
          fullText += sanitized;
          recordFirstContent();
          displayQueue += sanitized;
        };

        let networkFinished = false;
        (function drainTick() {
          if (!displayQueue.length) {
            if (networkFinished) { resolveRenderDone(); return; }
            setTimeout(drainTick, STREAM_RENDER_INTERVAL_MS);
            return;
          }
          if (document.hidden) {
            // Backgrounded — no reason to animate an invisible tab; flush
            // whatever's buffered immediately instead of pacing it out.
            onChunk(displayQueue);
            displayQueue = '';
          } else {
            onChunk(displayQueue.slice(0, STREAM_RENDER_CHARS_PER_TICK));
            displayQueue = displayQueue.slice(STREAM_RENDER_CHARS_PER_TICK);
          }
          setTimeout(drainTick, STREAM_RENDER_INTERVAL_MS);
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
            if (payload === '[DONE]') { sawDone = true; break; }

            try {
              const json = JSON.parse(payload);
              // DeepSeek OpenAI 호환 포맷
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) ingestDelta(delta);
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
                if (delta) ingestDelta(delta);
              } catch (e) {
                // 마지막 조각 파싱 실패 — 무시
              }
            }
          }
        }

        const flushed = ellipsisSanitizer.flush();
        if (flushed) { fullText += flushed; displayQueue += flushed; }

        resolveNetworkDone({
          text: fullText,
          mode,
          requestId,
          timing: { fetch_headers_ms: fetchHeadersMs, first_content_ms: firstContentMs, stream_total_ms: Date.now() - overallStart }
        });

        networkFinished = true;
        // drainTick's own pending setTimeout will notice networkFinished and
        // resolve renderDone once displayQueue is empty — nothing further to
        // do here.
      } catch (error) {
        rejectNetworkDone(error);
        rejectRenderDone(error);
      }
    })();

    return { networkDone, renderDone };
  }
};
