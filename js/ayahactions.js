/*
 * Tapping an ayah anywhere in the mushaf opens a sheet with: listen once,
 * repeat N times, and read the tafsir.
 */
const AyahActions = (() => {
  let player = null;
  let currentAyah = null;

  const el = (id) => document.getElementById(id);

  function ensurePlayer() {
    player = player || new AyahQueuePlayer(el('ayahAudio'));
    player.onError = (msg) => { el('sheetStatus').textContent = msg; };
    return player;
  }

  function open(ayah) {
    currentAyah = ayah;
    el('sheetTitle').textContent = `${ayah.surah.name} — آية ${ayah.numberInSurah}`;
    el('sheetAyah').innerHTML = parseTajweedText(ayah.text);
    el('sheetTafsir').hidden = true;
    el('sheetTafsir').textContent = '';
    el('ayahSheet').hidden = false;
    el('sheetBackdrop').hidden = false;
  }

  function close() {
    ensurePlayer().stop();
    el('ayahSheet').hidden = true;
    el('sheetBackdrop').hidden = true;
    currentAyah = null;
  }

  function playOnce() {
    if (!currentAyah) return;
    const p = ensurePlayer();
    p.setQueue([queueItemFor(currentAyah)]);
    p.onStateChange = reflect;
    p.start();
  }

  function repeatTimes() {
    if (!currentAyah) return;
    const n = Math.max(1, Math.min(50, +el('sheetRepeat').value || 3));
    const p = ensurePlayer();
    p.setQueue(Array.from({ length: n }, () => queueItemFor(currentAyah)));
    p.onStateChange = reflect;
    p.onItemStart = (_i, idx) => { el('sheetStatus').textContent = `التكرار ${idx + 1} من ${n}`; };
    p.onQueueEnd = () => { el('sheetStatus').textContent = 'انتهى الترديد.'; };
    p.start();
  }

  function reflect({ playing, paused }) {
    const btn = el('sheetPause');
    btn.disabled = !playing;
    btn.textContent = paused ? '▶ استكمال' : '⏸ إيقاف مؤقت';
  }

  async function showTafsir() {
    if (!currentAyah) return;
    const box = el('sheetTafsir');
    box.hidden = false;
    box.textContent = 'جارٍ تحميل التفسير...';
    try {
      const edition = el('tafsirEdition').value;
      const text = await fetchTafsir(currentAyah.number, edition);
      box.textContent = text;
    } catch (err) {
      box.textContent = 'تعذّر تحميل التفسير: ' + err.message;
    }
  }

  /** Wire a rendered mushaf container so tapping an ayah opens the sheet. */
  function bindContainer(containerId, getAyahs) {
    const container = document.getElementById(containerId);
    container.addEventListener('click', (e) => {
      // Memorization test mode uses taps to reveal text, so don't hijack them.
      if (container.classList.contains('hidden-text')) return;
      const ayahEl = e.target.closest('.ayah');
      if (!ayahEl) return;
      const globalNum = +ayahEl.dataset.global;
      const ayah = (getAyahs() || []).find(a => a.number === globalNum);
      if (ayah) open(ayah);
    });
  }

  function init() {
    el('tafsirEdition').innerHTML =
      TAFSIR_EDITIONS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    el('sheetClose').addEventListener('click', close);
    el('sheetBackdrop').addEventListener('click', close);
    el('sheetPlay').addEventListener('click', playOnce);
    el('sheetRepeatBtn').addEventListener('click', repeatTimes);
    el('sheetPause').addEventListener('click', () => ensurePlayer().togglePause());
    el('sheetTafsirBtn').addEventListener('click', showTafsir);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  return { init, bindContainer, open };
})();
