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
    this.onError = null;       // (message) => void — playback gave up
    this._timer = null;
    this._retryTimer = null;
    this._watchdogTimer = null;

    /* Mobile networks fail or stall constantly; these counters decide between
       "retry the same ayah", "skip to the next one" and "give up cleanly". */
    this._itemRetries = 0;          // reload attempts for the current item
    this._consecutiveFailures = 0;  // items failed in a row with no progress
    this._lastProgressAt = 0;

    // A second element that quietly downloads the next ayah while the current
    // one plays, so the gap between ayahs does not depend on network latency.
    this._prefetchEl = new Audio();
    this._prefetchEl.preload = 'auto';

    const liveLoad = () => this.playing && !this.paused;

    this.audioEl.addEventListener('ended', () => {
      if (!liveLoad()) return;
      this._stopWatchdog();
      this._scheduleNextWithGap();
    });

    // Recheck MediaError after a tick: an aborted load from a rapid src swap can
    // surface here too, and skipping on that phantom error is what makes
    // playback audibly jump over ayahs.
    this.audioEl.addEventListener('error', () => {
      if (!liveLoad()) return;
      setTimeout(() => {
        if (liveLoad() && this.audioEl.error) this._handleLoadFailure();
      }, 100);
    });

    this.audioEl.addEventListener('timeupdate', () => {
      if (!liveLoad()) return;
      this._consecutiveFailures = 0;
      this._lastProgressAt = Date.now();
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
    this._consecutiveFailures = 0;
    this._advance();
  }

  /** Pause mid-ayah; resume() picks up at the same position. */
  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    clearTimeout(this._timer);    // also cancels a pending inter-ayah gap
    clearTimeout(this._retryTimer);
    this._stopWatchdog();
    this.audioEl.pause();
    this._emitState();
  }

  resume() {
    if (!this.playing || !this.paused) return;
    this.paused = false;
    // If the pause landed during the gap between ayahs there is nothing loaded
    // to resume, so step to the next queue item instead.
    if (this.audioEl.ended || !this.audioEl.src) this._advance();
    else {
      this.audioEl.play().catch(() => {});
      this._armWatchdog();
    }
    this._emitState();
  }

  togglePause() {
    if (this.paused) this.resume(); else this.pause();
  }

  stop() {
    this.playing = false;
    this.paused = false;
    clearTimeout(this._timer);
    clearTimeout(this._retryTimer);
    this._stopWatchdog();
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
      this._stopWatchdog();
      this._emitState();
      if (this.onQueueEnd) this.onQueueEnd();
      return;
    }
    const item = this.queue[this.index];
    if (this.onItemStart) this.onItemStart(item, this.index);
    const url = audioUrlForAyah(item.globalNumber, item.surahNumber, item.numberInSurah);
    if (!url) { this._scheduleNextWithGap(); return; }
    this._itemRetries = 0;
    this.audioEl.src = url;
    this.audioEl.play().catch(err => {
      // NotAllowedError means autoplay is blocked — stop and wait for a gesture.
      // Transient load errors are handled by the 'error' listener + watchdog.
      if (err.name === 'NotAllowedError') {
        this.playing = false;
        this._stopWatchdog();
        this._emitState();
        if (this.onQueueEnd) this.onQueueEnd();
      }
    });
    this._armWatchdog();
    this._prefetch(this.index + 1);
    this._emitState();
  }

  /** Quietly start downloading a future queue item so playing it later is instant. */
  _prefetch(i) {
    const item = this.queue[i];
    if (!item) return;
    const url = audioUrlForAyah(item.globalNumber, item.surahNumber, item.numberInSurah);
    if (url && this._prefetchEl.src !== url) this._prefetchEl.src = url;
  }

  _handleLoadFailure() {
    this._stopWatchdog();
    // Mobile networks drop requests constantly — retry up to 3 times with
    // increasing back-off before skipping to the next ayah.
    if (this._itemRetries < 3) {
      const delay = [700, 2000, 4000][this._itemRetries];
      this._itemRetries++;
      this._reloadCurrentAfter(delay);
      return;
    }
    this._consecutiveFailures++;
    // Many in a row with no timeupdate progress means we are offline.
    // Stop entirely rather than racing through the queue in silence.
    if (this._consecutiveFailures >= 6) {
      this.stop();
      if (this.onError) this.onError('تعذّر تحميل الصوت بعد عدة محاولات — تحقق من الاتصال بالإنترنت.');
      return;
    }
    this._scheduleNextWithGap();
  }

  _reloadCurrentAfter(delayMs) {
    const item = this.currentItem;
    if (!item) return;
    const url = audioUrlForAyah(item.globalNumber, item.surahNumber, item.numberInSurah);
    if (!url) { this._scheduleNextWithGap(); return; }
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => {
      if (!this.playing || this.paused || this.currentItem !== item) return;
      this.audioEl.src = url;
      this.audioEl.load();
      this.audioEl.play().catch(() => {});
      this._armWatchdog();
    }, delayMs);
  }

  /* Mobile WebViews sometimes stall indefinitely without firing 'error'.
     If playback makes no progress for 12s, treat it as a load failure. */
  _armWatchdog() {
    this._stopWatchdog();
    this._lastProgressAt = Date.now();
    this._watchdogTimer = setInterval(() => {
      if (!this.playing || this.paused) return;
      if (Date.now() - this._lastProgressAt > 12000) this._handleLoadFailure();
    }, 3000);
  }

  _stopWatchdog() {
    clearInterval(this._watchdogTimer);
    this._watchdogTimer = null;
  }

  _scheduleNextWithGap() {
    if (!this.playing || this.paused) return;
    clearTimeout(this._timer);
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
