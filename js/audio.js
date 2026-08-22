/* Sequential ayah-audio queue player built on the single shared <audio> element. */
class AyahQueuePlayer {
  constructor(audioEl) {
    this.audioEl = audioEl;
    this.queue = [];
    this.index = -1;
    this.playing = false;
    this.paused = false;
    this.pauseBetweenMs = 400;
    this.onItemStart = null;   // (item, index) => void
    this.onQueueEnd = null;    // () => void
    this.onStateChange = null; // ({playing, paused}) => void
    this._timer = null;
    this.audioEl.addEventListener('ended', () => this._scheduleNextWithGap());
    // Skip over ayahs whose audio file fails to load (404, offline, etc.)
    // rather than killing the entire queue.
    this.audioEl.addEventListener('error', () => {
      if (this.playing && !this.paused) this._scheduleNextWithGap();
    });
  }

  setQueue(items) {
    this.stop();
    this.queue = items;
  }

  start() {
    if (!this.queue.length) return;
    this.playing = true;
    this.paused = false;
    this.index = -1;
    this._advance();
  }

  /** Pause mid-ayah; resume() picks up at the same position. */
  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    clearTimeout(this._timer);   // also cancels a pending inter-ayah gap
    this.audioEl.pause();
    this._emitState();
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    // If the pause landed during the gap between ayahs there is nothing loaded
    // to resume, so step to the next queue item instead.
    if (this.audioEl.ended || !this.audioEl.src) this._advance();
    else this.audioEl.play().catch(() => {});
    this._emitState();
  }

  togglePause() {
    if (this.paused) this.resume(); else this.pause();
  }

  stop() {
    this.playing = false;
    this.paused = false;
    clearTimeout(this._timer);
    this.audioEl.pause();
    this.audioEl.removeAttribute('src');
    this.index = -1;
    this._emitState();
  }

  get currentItem() {
    return this.queue[this.index] || null;
  }

  _emitState() {
    if (this.onStateChange) this.onStateChange({ playing: this.playing, paused: this.paused });
  }

  _advance() {
    if (!this.playing || this.paused) return;
    this.index++;
    if (this.index >= this.queue.length) {
      this.playing = false;
      this._emitState();
      if (this.onQueueEnd) this.onQueueEnd();
      return;
    }
    const item = this.queue[this.index];
    if (this.onItemStart) this.onItemStart(item, this.index);
    const url = audioUrlForAyah(item.globalNumber, item.surahNumber, item.numberInSurah);
    if (!url) { this._scheduleNextWithGap(); return; }
    this.audioEl.src = url;
    this.audioEl.play().catch(err => {
      // NotAllowedError means autoplay is blocked — stop and wait for a gesture.
      // Other errors (AbortError from a rapid src-swap, etc.) are handled by
      // the 'error' event listener above, which skips to the next item.
      if (err.name === 'NotAllowedError') {
        this.playing = false;
        this._emitState();
        if (this.onQueueEnd) this.onQueueEnd();
      }
    });
    this._emitState();
  }

  _scheduleNextWithGap() {
    if (!this.playing || this.paused) return;
    this._timer = setTimeout(() => this._advance(), this.pauseBetweenMs);
  }
}

/** Build a queue item from an ayah object (carries both addressing schemes). */
function queueItemFor(ayah) {
  return {
    globalNumber: ayah.number,
    numberInSurah: ayah.numberInSurah,
    surahNumber: ayah.surah ? ayah.surah.number : null,
  };
}
