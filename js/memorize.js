/*
 * Memorize/repeat tab.
 * Scopes: whole surah, ayah range, page or page range, juz, hizb quarter.
 * Playback repeats each ayah N times and the whole range M times, with
 * pause/resume and an optional blur-the-text test mode.
 */
const Memorize = (() => {
  let player = null;
  let loadedAyahs = [];

  function setStatus(msg) {
    const line = document.querySelector('.status-line');
    if (line) line.textContent = msg;
    document.getElementById('memStatus').textContent = msg;
  }

  async function populateSelects() {
    const list = Mushaf.surahList.length ? Mushaf.surahList : await fetchSurahList();
    document.getElementById('memSurah').innerHTML =
      list.map(s => `<option value="${s.number}">${s.number}. ${s.name}</option>`).join('');
    document.getElementById('memJuz').innerHTML =
      Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1)
        .map(j => `<option value="${j}">الجزء ${Mushaf.toArabicDigits(j)}</option>`).join('');
    document.getElementById('memHizb').innerHTML =
      Array.from({ length: TOTAL_HIZB_QUARTERS }, (_, i) => i + 1)
        .map(h => `<option value="${h}">الربع ${Mushaf.toArabicDigits(h)}</option>`).join('');
    syncRangeBounds();
  }

  /** Keep the ayah-range inputs bounded by the selected surah's ayah count. */
  function syncRangeBounds() {
    const surahNum = +document.getElementById('memSurah').value;
    const meta = (Mushaf.surahList || []).find(s => s.number === surahNum);
    if (!meta) return;
    const from = document.getElementById('memFrom');
    const to = document.getElementById('memTo');
    from.max = to.max = meta.numberOfAyahs;
    document.getElementById('memRangeHint').textContent =
      `(هذه السورة بها ${meta.numberOfAyahs} آية)`;
    if (+from.value > meta.numberOfAyahs) from.value = 1;
    if (+to.value > meta.numberOfAyahs || document.getElementById('memWholeSurah').checked) {
      to.value = meta.numberOfAyahs;
    }
  }

  /** "To end of surah" fills the last ayah in and locks the field. */
  function applyWholeSurahToggle() {
    const whole = document.getElementById('memWholeSurah').checked;
    const from = document.getElementById('memFrom');
    const to = document.getElementById('memTo');
    const meta = (Mushaf.surahList || []).find(s => s.number === +document.getElementById('memSurah').value);
    to.disabled = whole;
    if (whole) {
      from.value = 1;
      if (meta) to.value = meta.numberOfAyahs;
    }
  }

  function updateScopeVisibility() {
    const scope = document.getElementById('memScope').value;
    const show = (id, on) => { document.getElementById(id).style.display = on ? '' : 'none'; };
    show('memSurahGroup', scope === 'surah' || scope === 'range');
    show('memRangeGroup', scope === 'range');
    show('memPageGroup',  scope === 'page');
    show('memJuzGroup',   scope === 'juz');
    show('memHizbGroup',  scope === 'hizb');
  }

  async function loadScope() {
    const scope = document.getElementById('memScope').value;
    setStatus('جارٍ التحميل...');

    if (scope === 'surah') {
      loadedAyahs = (await fetchSurah(+document.getElementById('memSurah').value)).ayahs;

    } else if (scope === 'range') {
      const surahNum = +document.getElementById('memSurah').value;
      const meta = (Mushaf.surahList || []).find(s => s.number === surahNum);
      const maxAyah = meta ? meta.numberOfAyahs : Infinity;
      const whole = document.getElementById('memWholeSurah').checked;
      let from = Math.max(1, Math.min(maxAyah, +document.getElementById('memFrom').value || 1));
      let to = whole ? maxAyah
                     : Math.max(1, Math.min(maxAyah, +document.getElementById('memTo').value || from));
      if (from > to) [from, to] = [to, from];   // tolerate a reversed range
      document.getElementById('memFrom').value = from;
      document.getElementById('memTo').value = to;
      loadedAyahs = (await fetchSurahRange(surahNum, from, to)).ayahs;

    } else if (scope === 'page') {
      let from = Math.max(1, Math.min(TOTAL_PAGES, +document.getElementById('memPageFrom').value || 1));
      let to = Math.max(1, Math.min(TOTAL_PAGES, +document.getElementById('memPageTo').value || from));
      if (from > to) [from, to] = [to, from];
      document.getElementById('memPageFrom').value = from;
      document.getElementById('memPageTo').value = to;
      loadedAyahs = await fetchPageRange(from, to);

    } else if (scope === 'juz') {
      loadedAyahs = (await fetchJuz(+document.getElementById('memJuz').value)).ayahs;

    } else if (scope === 'hizb') {
      loadedAyahs = (await fetchHizb(+document.getElementById('memHizb').value)).ayahs;
    }

    render();
    setStatus(`تم تحميل ${loadedAyahs.length} آية.`);
  }

  function render() {
    const container = document.getElementById('memPage');
    const hide = document.getElementById('memHideText').checked;
    const tajweedOn = document.getElementById('memTajweed').checked;
    Mushaf.renderAyahs(container, loadedAyahs, { tajweedOn });
    container.classList.toggle('hidden-text', hide);
  }

  /** Tap/click an ayah in test mode to peek at it (touch screens have no hover). */
  function bindRevealTap() {
    document.getElementById('memPage').addEventListener('click', (e) => {
      if (!document.getElementById('memPage').classList.contains('hidden-text')) return;
      const ayahEl = e.target.closest('.ayah');
      if (ayahEl) ayahEl.classList.toggle('revealed');
    });
  }

  function buildRepeatedQueue() {
    const perAyah = Math.max(1, +document.getElementById('memRepeatAyah').value || 1);
    const perRange = Math.max(1, +document.getElementById('memRepeatRange').value || 1);
    const queue = [];
    for (let r = 0; r < perRange; r++) {
      for (const a of loadedAyahs) {
        for (let i = 0; i < perAyah; i++) {
          queue.push({ ...queueItemFor(a), pass: r + 1, rep: i + 1, repTotal: perAyah });
        }
      }
    }
    return queue;
  }

  function reflectState({ playing, paused }) {
    const btn = document.getElementById('btnMemPause');
    btn.disabled = !playing;
    btn.textContent = paused ? '▶ استكمال' : '⏸ إيقاف مؤقت';
  }

  function play() {
    if (!loadedAyahs.length) { setStatus('حمّل نطاقاً أولاً.'); return; }
    const container = document.getElementById('memPage');
    player = player || new AyahQueuePlayer(document.getElementById('audioPlayer'));
    player.setQueue(buildRepeatedQueue());
    player.onStateChange = reflectState;
    player.onItemStart = (item) => {
      container.querySelectorAll('.ayah.playing').forEach(x => x.classList.remove('playing'));
      const el = container.querySelector(`.ayah[data-global="${item.globalNumber}"]`);
      if (el) { el.classList.add('playing'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      setStatus(`آية ${item.numberInSurah} — تكرار ${item.rep}/${item.repTotal} — جولة ${item.pass}`);
    };
    player.onQueueEnd = () => setStatus('اكتمل الترديد. أحسنت!');
    player.start();
  }

  function togglePause() {
    if (player) player.togglePause();
  }

  function stop() {
    if (player) player.stop();
    setStatus('تم الإيقاف.');
  }

  function init() {
    populateSelects().catch(() => {});
    updateScopeVisibility();
    bindRevealTap();
    document.getElementById('memScope').addEventListener('change', updateScopeVisibility);
    document.getElementById('memSurah').addEventListener('change', () => { syncRangeBounds(); applyWholeSurahToggle(); });
    document.getElementById('memWholeSurah').addEventListener('change', applyWholeSurahToggle);
    document.getElementById('btnMemLoad').addEventListener('click', () =>
      loadScope().catch(err => setStatus('خطأ: ' + err.message)));
    document.getElementById('btnMemPlay').addEventListener('click', play);
    document.getElementById('btnMemPause').addEventListener('click', togglePause);
    document.getElementById('btnMemStop').addEventListener('click', stop);
    document.getElementById('memHideText').addEventListener('change', render);
    document.getElementById('memTajweed').addEventListener('change', render);
  }

  return {
    init,
    // Exposed so the ayah action sheet can resolve a tapped ayah in this view.
    get loadedAyahs() { return loadedAyahs; },
  };
})();
