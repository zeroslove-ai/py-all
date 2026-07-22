const tts = {
  queue: [],
  pendingKeys: new Set(),
  completedKeys: new Set(JSON.parse(sessionStorage.getItem('playedTtsKeys') || '[]')),
  generation: 0,
  playing: false,
  unlocked: false,
  lastPlayable: null,

  init() {
    this.audio = document.getElementById('audio-player');
    this.toggle = document.getElementById('tts-toggle');
    this.replay = document.getElementById('tts-replay');
    this.status = document.getElementById('tts-status');
    state.autoTts = localStorage.getItem('autoTts') !== 'false';
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
      this.replay.hidden = false;
      this.showStatus('음성 ON: 마지막 NPC 대사를 재생하려면 재생 버튼을 누르세요.');
    }
  },

  renderToggle() {
    this.toggle.textContent = state.autoTts ? '🔊 음성 ON' : '🔇 음성 OFF';
    this.toggle.setAttribute('aria-pressed', String(state.autoTts));
  },

  stopAndClear() {
    this.generation += 1;
    this.queue.length = 0;
    this.pendingKeys.clear();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.playing = false;
  },

  key(turn, line) {
    return `${turn}:${line.speaker}:${line.text}`;
  },

  enqueue(extract, turn) {
    if (!state.autoTts) {
      this.lastPlayable = { extract, turn };
      this.replay.hidden = false;
      return;
    }
    this.enqueueLines(extract, turn);
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
    this.lastPlayable = { extract: { ...extract, dialogue_lines: [validLines[validLines.length - 1]] }, turn };
    for (const line of validLines) {
      const key = this.key(turn, line);
      if (!force && (this.pendingKeys.has(key) || this.completedKeys.has(key))) continue;
      this.pendingKeys.add(key);
      this.queue.push({ line, voiceId: character.voice_id.trim(), key, generation: this.generation });
    }
    this.replay.hidden = false;
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
    try {
      this.showStatus(`음성 준비 중: ${job.line.speaker}`);
      const result = await api.tts(job.line.text, job.voiceId, job.line.direction);
      if (!result.url) throw new Error('TTS 응답에 audio URL이 없습니다.');
      if (!state.autoTts || job.generation !== this.generation) return;
      this.audio.src = result.url;
      this.audio.classList.add('active');
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
      this.replay.hidden = false;
    } finally {
      this.pendingKeys.delete(job.key);
    }
  },

  waitForPlayback() {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.audio.onended = null;
        this.audio.onerror = null;
      };
      this.audio.onended = () => { cleanup(); resolve(); };
      this.audio.onerror = () => { cleanup(); reject(new DOMException('Audio decoding or playback failed', 'MediaError')); };
      this.audio.play().catch(error => { cleanup(); reject(error); });
    });
  },

  showStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.hidden = !message;
    this.status.classList.toggle('error', Boolean(isError));
  }
};
