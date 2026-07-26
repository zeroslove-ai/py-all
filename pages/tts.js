const tts = {
  queue: [],
  pendingKeys: new Set(),
  completedKeys: new Set(JSON.parse(sessionStorage.getItem('playedTtsKeys') || '[]')),
  generation: 0,
  playing: false,
  unlocked: false,
  lastPlayable: null,

  // H3-A item 8: the <audio> element now lives outside .side-panel (see
  // pages/index.html), but sidebar.init() still fully replaces .side-panel's
  // innerHTML on every render, and a reset/DOM re-render could in principle
  // still detach or recreate elements — always re-resolve the live element
  // (recreating it if it's genuinely missing) instead of trusting a stale
  // this.audio reference.
  ensureAudioElement() {
    let audio = document.getElementById('audio-player');

    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-player';
      audio.className = 'audio-player';
      audio.controls = true;
      document.body.appendChild(audio);
    }

    this.audio = audio;

    if (typeof ui !== 'undefined' && ui.els) {
      ui.els.audioPlayer = audio;
    }

    return audio;
  },

  rebindAudioElement() {
    return this.ensureAudioElement();
  },

  init() {
    this.ensureAudioElement();
    this.toggle = document.getElementById('tts-toggle');
    this.replay = document.getElementById('tts-replay');
    this.status = document.getElementById('tts-status');
    state.autoTts = localStorage.getItem('autoTts') !== 'false';

    // H3-A item 9: missing TTS controls must never block game
    // input/initialization — log and disable TTS instead of throwing.
    if (!this.toggle || !this.replay) {
      console.error('TTS controls missing from DOM — disabling TTS', { toggle: Boolean(this.toggle), replay: Boolean(this.replay) });
      state.autoTts = false;
      return;
    }

    this.renderToggle();
    this.toggle.addEventListener('click', async () => {
      await this.unlockAudio();
      this.setEnabled(!state.autoTts);
    });
    this.replay.addEventListener('click', async () => {
      await this.unlockAudio();
      if (this.lastPlayable) this.enqueueLines(this.lastPlayable.extract, this.lastPlayable.turn, { force: true });
    });
  },

  async unlockAudio() {
    if (this.unlocked) return true;
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        this.audioContext ||= new AudioContextCtor();
        if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      }
      this.unlocked = true;
      return true;
    } catch (error) {
      console.error('TTS audio unlock failed', error);
      this.showStatus('브라우저 오디오 활성화에 실패했습니다. 재생 버튼을 다시 눌러주세요.', true);
      return false;
    }
  },

  setEnabled(enabled) {
    state.autoTts = Boolean(enabled);
    localStorage.setItem('autoTts', String(state.autoTts));
    if (!state.autoTts) this.stopAndClear();
    this.renderToggle();
    if (state.autoTts && this.lastPlayable) {
      if (this.replay) this.replay.hidden = false;
      this.showStatus('음성 ON: 마지막 NPC 대사를 재생하려면 재생 버튼을 누르세요.');
    }
  },

  renderToggle() {
    if (!this.toggle) return;
    this.toggle.textContent = state.autoTts ? '🔊 음성 ON' : '🔇 음성 OFF';
    this.toggle.setAttribute('aria-pressed', String(state.autoTts));
  },

  stopAndClear() {
    const audio = this.ensureAudioElement();
    this.generation += 1;
    this.queue.length = 0;
    this.pendingKeys.clear();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    this.playing = false;
  },

  key(turn, lines) {
    return `${turn}:${lines[0].speaker}:${lines.map(line => line.text).join('|')}`;
  },

  // Coarse tone grouping used only to decide whether adjacent same-speaker
  // lines can share one TTS request — deliberately looser/broader than the
  // Worker's own mapDirection (which picks the one emotion actually sent to
  // Fish Audio); this only needs to tell "compatible enough to read as one
  // breath" apart from a real tone swing (차분함→울음, 속삭임→분노, 중립→비명).
  ttsToneGroup(direction = '') {
    if (/속삭|작게|귓속말/.test(direction)) return 'whisper';
    if (/울먹|눈물|흐느끼|서럽/.test(direction)) return 'sad';
    if (/화난|분노|날카롭게|소리치|비명/.test(direction)) return 'angry';
    if (/웃으며|밝게|활기차게|신나/.test(direction)) return 'happy';
    if (/떨리는|떨림|긴장|당황|머뭇|가쁜|조심스럽게/.test(direction)) return 'nervous';
    if (/차분|침착|평온|담담/.test(direction)) return 'calm';
    return 'neutral';
  },

  // 같은 화자의 인접 발화를 하나의 TTS 요청으로 묶는다 — 화자명/연기지시는
  // 절대 TTS text에 넣지 않고 대사만 이어 붙인다. 화자가 바뀌면(현재 구조상
  // dialogue_lines는 이미 메인 NPC 한 명뿐이지만) 항상 새 묶음이고, 톤이
  // 크게 어긋나거나 350자를 넘으면 자연스러운 발화 경계에서 분리한다.
  batchDialogueLines(validLines) {
    const TTS_BATCH_MAX_CHARS = 350;
    const batches = [];
    let current = null;
    for (const line of validLines) {
      const speaker = line.speaker;
      const tone = this.ttsToneGroup(line.direction);
      const text = line.text.trim();
      const merged = current ? `${current.text} ${text}` : text;
      if (current && current.speaker === speaker && current.tone === tone && merged.length <= TTS_BATCH_MAX_CHARS) {
        current.text = merged;
        current.lines.push(line);
      } else {
        current = { speaker, tone, direction: line.direction, text, lines: [line] };
        batches.push(current);
      }
    }
    return batches;
  },

  // H3-A item 10: a TTS failure (missing DOM, bad extract shape, network
  // error) must never propagate out of enqueue — prepareMedia's caller
  // (retryCommit's post-commit UI update) must always finish regardless.
  enqueue(extract, turn) {
    try {
      if (!state.autoTts) {
        this.lastPlayable = { extract, turn };
        if (this.replay) this.replay.hidden = false;
        return;
      }
      this.enqueueLines(extract, turn);
    } catch (error) {
      console.error('TTS enqueue failed', error);
      this.showStatus(`음성 준비에 실패했습니다: ${error?.message || '알 수 없는 오류'}`, true);
    }
  },

  enqueueLines(extract, turn, { force = false } = {}) {
    const characterId = extract?.character_id;
    const character = state.context?.master?.characters?.[characterId];
    if (!characterId || characterId === 'narrator') {
      this.showStatus('TTS를 재생할 메인 NPC가 없습니다.', true);
      return;
    }
    if (!character || typeof character.voice_id !== 'string' || !character.voice_id.trim()) {
      const error = new Error(`voice_id missing for character_id=${characterId}`);
      console.error('TTS 구조 오류:', error, { characterId, character });
      this.showStatus(`TTS 구조 오류: ${characterId}의 voice_id를 찾을 수 없습니다.`, true);
      return;
    }
    const lines = Array.isArray(extract?.dialogue_lines) ? extract.dialogue_lines : [];
    if (!lines.length) {
      this.showStatus('이번 서사에서 재생할 NPC 대사가 추출되지 않았습니다.', true);
      return;
    }
    const validLines = lines.filter(line => line && typeof line.speaker === 'string' && line.speaker.trim() && typeof line.text === 'string' && line.text.trim() && typeof line.direction === 'string' && line.direction.trim());
    if (!validLines.length) {
      console.error('TTS dialogue_lines malformed', { characterId, lines });
      this.showStatus('NPC 대사 데이터가 불완전합니다. speaker, text, direction을 확인하세요.', true);
      return;
    }
    const batches = this.batchDialogueLines(validLines);
    const lastBatch = batches[batches.length - 1];
    this.lastPlayable = { extract: { ...extract, dialogue_lines: lastBatch.lines }, turn };
    for (const batch of batches) {
      const key = this.key(turn, batch.lines);
      if (!force && (this.pendingKeys.has(key) || this.completedKeys.has(key))) continue;
      this.pendingKeys.add(key);
      this.queue.push({ batch, voiceId: character.voice_id.trim(), key, generation: this.generation });
    }
    if (this.replay) this.replay.hidden = false;
    this.drain();
  },

  async drain() {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!state.autoTts || job.generation !== this.generation) {
          this.pendingKeys.delete(job.key);
          continue;
        }
        await this.play(job);
      }
    } finally {
      this.playing = false;
    }
  },

  async play(job) {
    const audio = this.ensureAudioElement();
    try {
      this.showStatus(`음성 준비 중: ${job.batch.speaker}`);
      // 묶음 text는 대사만 이어 붙인 것 — 화자명/(연기지시)는 절대 포함하지
      // 않는다. direction은 묶음의 대표(첫 발화) 값 하나만 전달한다.
      const result = await api.tts(job.batch.text, job.voiceId, job.batch.direction);
      if (!result.url) throw new Error('TTS 응답에 audio URL이 없습니다.');
      if (!state.autoTts || job.generation !== this.generation) return;
      audio.src = result.url;
      audio.classList.add('active');
      await this.waitForPlayback();
      this.completedKeys.add(job.key);
      sessionStorage.setItem('playedTtsKeys', JSON.stringify([...this.completedKeys]));
      this.showStatus('');
    } catch (error) {
      console.error('TTS playback failed', error, job);
      this.completedKeys.delete(job.key);
      const message = error?.name === 'NotAllowedError'
        ? '브라우저가 자동 음성 재생을 차단했습니다. 눌러서 재생하세요.'
        : error?.name === 'MediaError' || error?.message?.includes('decode')
          ? '음성 파일을 디코딩하거나 재생하지 못했습니다.'
          : `TTS API 또는 오디오 URL 오류: ${error?.message || '알 수 없는 오류'}`;
      this.showStatus(message, true);
      if (this.replay) this.replay.hidden = false;
    } finally {
      this.pendingKeys.delete(job.key);
    }
  },

  waitForPlayback() {
    const audio = this.ensureAudioElement();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new DOMException('Audio decoding or playback failed', 'MediaError')); };
      audio.play().catch(error => { cleanup(); reject(error); });
    });
  },

  showStatus(message, isError = false) {
    if (!this.status) {
      this.status = document.getElementById('tts-status');
    }
    if (!this.status) return;
    this.status.textContent = message;
    this.status.hidden = !message;
    this.status.classList.toggle('error', Boolean(isError));
  }
};
