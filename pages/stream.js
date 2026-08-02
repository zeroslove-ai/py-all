// stream.js — SSE 스트리밍 파싱 (fetch + ReadableStream)

// Foreground display pacing is always fixed — no backlog-based acceleration.
// A backed-up queue (e.g. after a backgrounded tab) never speeds up the
// visible typing; it only means the background branch below flushes it
// immediately while the tab isn't visible anyway.

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

// Story occasionally echoes a system-style writing instruction instead of
// producing the actual [3. 선택지] block. This deterministic line sanitizer
// removes only that leaked instruction segment. It does not invent choices,
// rewrite narrative meaning, or make another model call. A carry buffer is
// required because SSE deltas may split the instruction across chunks.
const STORY_META_LEAK_SEGMENT_RE = /(?:선택지(?:에는|는)[^\n]{0,70}(?:4가지|네\s*가지)[^\n]{0,100}(?:형식|쓰세요|작성)|아래\s*\[?\s*3\.\s*선택지\s*\]?[^\n]{0,100}(?:형식|쓰세요|작성)|(?:지시사항|출력\s*규칙)[^\n]{0,80}(?:따르세요|쓰세요|작성하세요))/i;

function sanitizeStoryMetaLeakLine(line = '') {
  const value = String(line || '');
  const match = STORY_META_LEAK_SEGMENT_RE.exec(value);
  if (!match) return value;
  return value.slice(0, match.index).trimEnd();
}

function createStoryMetaLeakSanitizer() {
  let carry = '';
  return {
    push(delta) {
      const combined = carry + String(delta || '');
      const lines = combined.split(/\r?\n/);
      carry = lines.pop() || '';
      if (!lines.length) return '';
      return lines.map(sanitizeStoryMetaLeakLine).filter(line => line.trim()).join('\n') + '\n';
    },
    flush() {
      const leftover = sanitizeStoryMetaLeakLine(carry);
      carry = '';
      return leftover;
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
  story(gameId, playerInput, turnCount, onChunk, feedback = [], regenerationFeedback = null, playerAction = null, structuredAction = null) {
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
            regeneration_feedback: regenerationFeedback,
            player_action: playerAction,
            structured_action: structuredAction
          })
        });
        fetchHeadersMs = Date.now() - overallStart;
        requestId = res.headers.get('X-Request-ID') || null;

        if (!res.ok) {
          const text = await res.text();
          let details = {};
          try { details = JSON.parse(text); } catch { /* legacy text response */ }
          const error = new Error(details.error || `story failed: ${res.status} ${text}`);
          error.status = res.status;
          error.requestId = requestId;
          error.details = details;
          throw error;
        }
        if (!res.body) throw new Error('ReadableStream not supported');

        const mode = res.headers.get('X-Game-Mode') || 'normal';
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const ellipsisSanitizer = createEllipsisSanitizer();
        const metaLeakSanitizer = createStoryMetaLeakSanitizer();
        let buffer = '';
        let fullText = '';
        let firstContentMs = null;
        const recordFirstContent = () => {
          if (firstContentMs === null) firstContentMs = Date.now() - overallStart;
        };
        const appendSanitizedText = (text) => {
          const sanitized = ellipsisSanitizer.push(text);
          if (!sanitized) return;
          fullText += sanitized;
          recordFirstContent();
          onChunk(sanitized);
        };
        const ingestDelta = (delta) => {
          const filtered = metaLeakSanitizer.push(delta);
          if (filtered) appendSanitizedText(filtered);
        };

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

        const metaFlushed = metaLeakSanitizer.flush();
        if (metaFlushed) appendSanitizedText(metaFlushed);
        const flushed = ellipsisSanitizer.flush();
        if (flushed) { fullText += flushed; onChunk(flushed); }

        resolveNetworkDone({
          text: fullText,
          mode,
          requestId,
          timing: { fetch_headers_ms: fetchHeadersMs, first_content_ms: firstContentMs, stream_total_ms: Date.now() - overallStart }
        });

        resolveRenderDone();
      } catch (error) {
        rejectNetworkDone(error);
        rejectRenderDone(error);
      }
    })();

    return { networkDone, renderDone };
  }
};
