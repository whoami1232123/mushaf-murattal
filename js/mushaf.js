/* Mushaf tab: navigation (surah/juz/hizb/page) + tajweed rendering + page audio playback. */
const Mushaf = (() => {
  let surahList = [];
  let currentAyahs = [];
  let player = null;

  /* Global ayah number the current surah/juz/hizb selection starts with, or null.
     Kept until the reader pages away by hand, so a tajweed/view-mode re-render
     still shows the selection from its beginning rather than the raw page top. */
  let clipTarget = null;

  /* Global ayah number playback should start from (set by gotoAyah after a
     search jump), consumed once by playCurrent so ▶ starts at the found ayah
     instead of the top of the page. */
  let playFromGlobal = null;

  function renderAyahs(container, ayahs, { tajweedOn = true } = {}) {
    container.classList.toggle('no-tajweed', !tajweedOn);
    const parts = [];
    for (const ayah of ayahs) {
      // The API's ayah-1 text never includes the Basmalah (verified against both
      // a normal surah and a surah's actual first ayah), so a surah boundary that
      // lands inside a page needs its own banner + Basmalah inserted here - that
      // is exactly the gap the reader is asking about, seen between two surahs
      // that share a page.
      if (ayah.numberInSurah === 1) {
        parts.push(surahBannerHtml(ayah.surah));
        // Al-Fatiha's own ayah 1 IS the Basmalah, and At-Tawbah (9) has none.
        if (ayah.surah.number !== 1 && ayah.surah.number !== 9) {
          parts.push('<div class="basmalah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>');
        }
      }
      const html = tajweedOn ? parseTajweedText(ayah.text) : escapeHtml(stripTajweedMarkup(ayah.text));
      // The text sits in its own span so memorization mode can blur it while the
      // ayah number stays sharp (a child cannot undo an ancestor's CSS filter).
      parts.push(
        `<span class="ayah" data-global="${ayah.number}" data-numinsurah="${ayah.numberInSurah}" data-surah="${ayah.surah.number}">` +
        `<span class="ayah-text">${html}</span>` +
        `<span class="ayah-end">﴿${toArabicDigits(ayah.numberInSurah)}﴾</span></span> `
      );
    }
    container.innerHTML = parts.join('');
  }

  function surahBannerHtml(surah) {
    const typeLabel = surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية';
    return `<div class="surah-banner">
      <span class="surah-banner-name">سورة ${escapeHtml(surah.name.replace(/^سُورَةُ\s*/, ''))}</span>
      <span class="surah-banner-meta">${toArabicDigits(surah.numberOfAyahs)} آية · ${typeLabel}</span>
    </div>`;
  }

  function toArabicDigits(n) {
    const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return String(n).split('').map(d => map[+d] ?? d).join('');
  }

  /* Searches the whole spread, not one leaf: in two-page mode the ayah being
     recited is just as likely to be on the left page as the right. */
  function highlightAyah(scope, globalNumber) {
    const root = scope || document.getElementById('mushafSpread') || document;
    root.querySelectorAll('.ayah.playing').forEach(el => el.classList.remove('playing'));
    const el = root.querySelector(`.ayah[data-global="${globalNumber}"]`);
    if (el) {
      el.classList.add('playing');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function populateSelects() {
    surahList = await fetchSurahList();
    const selSurah = document.getElementById('selSurah');
    selSurah.innerHTML = '<option value="">— اختر سورة —</option>' +
      surahList.map(s => `<option value="${s.number}">${s.number}. ${s.name}</option>`).join('');

    const selJuz = document.getElementById('selJuz');
    selJuz.innerHTML = '<option value="">— اختر جزء —</option>' +
      Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1)
        .map(j => `<option value="${j}">الجزء ${toArabicDigits(j)}</option>`).join('');

    const selHizb = document.getElementById('selHizb');
    selHizb.innerHTML = '<option value="">— اختر ربع —</option>' +
      Array.from({ length: TOTAL_HIZB_QUARTERS }, (_, i) => i + 1)
        .map(h => `<option value="${h}">الربع ${toArabicDigits(h)}</option>`).join('');
  }

  function buildLegend(targetId = 'tajweedLegend') {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = tajweedLegendEntries().map(r =>
      `<span class="legend-item"><span class="swatch" style="background:${r.color}"></span>${r.name}</span>`
    ).join('');
  }

  let currentPage = 1;

  const spreadOn = () => document.getElementById('chkSpread').checked;

  /* Phones get one page only: two leaves are too cramped on a small screen, and
     the native app has no room for the switcher either. */
  const singlePageOnly = () =>
    window.innerWidth < 768 || (window.NativeAlerts && NativeAlerts.isNative());

  /* One page or two, chosen explicitly. The hidden checkbox stays as the single
     source of truth the rest of the module reads. */
  function setViewMode(mode, { reload = true } = {}) {
    const twoUp = mode === 'spread' && !singlePageOnly();
    document.getElementById('chkSpread').checked = twoUp;
    localStorage.setItem('mushaf:spread', twoUp ? '1' : '0');
    document.querySelectorAll('#viewMode .seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
    if (reload) render();
  }

  function initViewMode() {
    document.querySelectorAll('#viewMode .seg-btn').forEach(btn =>
      btn.addEventListener('click', () => setViewMode(btn.dataset.mode)));
    if (singlePageOnly()) {
      document.getElementById('viewMode').closest('.nav-group').style.display = 'none';
    }
    // Two leaves need room, so a narrow screen starts on a single page unless the
    // user has already chosen otherwise.
    const forced = singlePageOnly();
    const saved = localStorage.getItem('mushaf:spread');
    const twoUp = forced ? false : saved === null ? window.innerWidth >= 1100 : saved === '1';
    setViewMode(twoUp ? 'spread' : 'single', { reload: false });
  }

  /* An open mushaf shows an odd page on the right and the following even page on
     the left, so page 1 faces page 2. Returns the pair for whichever page is asked. */
  function spreadFor(pageNum) {
    const right = pageNum % 2 === 1 ? pageNum : pageNum - 1;
    return { right: Math.max(1, right), left: Math.min(TOTAL_PAGES, right + 1) };
  }

  async function loadPage(pageNum, direction = 0) {
    setStatus('جارٍ تحميل الصفحة ' + pageNum + '...');
    const from = currentPage;

    const twoUp = spreadOn();
    const pair = twoUp ? spreadFor(pageNum) : { right: pageNum, left: null };
    const [rightData, leftData] = await Promise.all([
      fetchPage(pair.right),
      pair.left && pair.left !== pair.right ? fetchPage(pair.left) : Promise.resolve(null),
    ]);

    // Audio and the ayah sheet treat the whole spread as one continuous run.
    currentAyahs = leftData ? rightData.ayahs.concat(leftData.ayahs) : rightData.ayahs;
    currentPage = pair.right;

    // A surah/juz/hizb selection keeps governing playback too: skip whatever
    // precedes its first ayah on this page (no-op when nothing is selected or
    // the first ayah is not on the current spread, e.g. after auto page-turn).
    if (clipTarget) {
      const idx = currentAyahs.findIndex(a => Number(a.number) === Number(clipTarget));
      if (idx > 0) currentAyahs = currentAyahs.slice(idx);
    }

    if (direction) {
      const distance = Math.abs(pageNum - from);
      if (distance > (twoUp ? 2 : 1)) await riffle(direction, distance);
      await flip(direction);
    }

    renderSheet('mushafPage', rightData.ayahs);
    updateSheetChrome(rightData.ayahs, pair.right, '');

    const leftSheet = document.getElementById('mushafSheetLeft');
    leftSheet.hidden = !leftData;
    if (leftData) {
      renderSheet('mushafPageLeft', leftData.ayahs);
      updateSheetChrome(leftData.ayahs, pair.left, 'Left');
    }

    applyStickyClip();

    document.getElementById('selPage').value = pair.right;
    document.getElementById('bookNavLabel').textContent = leftData
      ? `${toArabicDigits(pair.right)} — ${toArabicDigits(pair.left)}`
      : toArabicDigits(pair.right);
    setStatus(leftData
      ? `الصفحتان ${pair.right} و ${pair.left} — ${rightData.ayahs[0].surah.name} — جزء ${rightData.ayahs[0].juz}`
      : `الصفحة ${pair.right} — سورة ${rightData.ayahs[0].surah.name} — جزء ${rightData.ayahs[0].juz}`);
  }

  function renderSheet(containerId, ayahs) {
    const container = document.getElementById(containerId);
    const tajweedOn = document.getElementById('chkTajweedOn').checked;
    renderAyahs(container, ayahs, { tajweedOn });
  }

  /* Page-turn animation. The sheet rotates away, the new page is painted while it
     is edge-on, then it rotates back - so the swap is never visible. */
  function flip(direction, speed = 1) {
    // Animate the whole spread so both leaves turn together.
    const sheet = document.getElementById('mushafSpread');
    if (!sheet) return Promise.resolve();
    const half = 240 * speed;
    return new Promise(resolve => {
      const outClass = direction > 0 ? 'flip-out-next' : 'flip-out-prev';
      const inClass = direction > 0 ? 'flip-in-next' : 'flip-in-prev';
      sheet.style.setProperty('--flip-ms', `${half}ms`);
      sheet.classList.add(outClass);
      setTimeout(() => {
        sheet.classList.remove(outClass);
        sheet.classList.add(inClass);
        resolve();
        setTimeout(() => sheet.classList.remove(inClass), half + 20);
      }, half);
    });
  }

  /* Jumping several pages riffles through the leaves instead of cutting straight
     there, so the distance is visible. Capped so a jump of 500 pages does not
     take forever - the flips just represent the movement. */
  async function riffle(direction, distance) {
    const sheet = document.getElementById('mushafSpread');
    if (!sheet) return;
    const count = Math.min(Math.abs(distance) - 1, 6);
    sheet.classList.add('riffling');
    for (let i = 0; i < count; i++) {
      await flip(direction, 0.22);
    }
    sheet.classList.remove('riffling');
  }

  /** Surah / juz header and the page-number medallion on one mushaf leaf. */
  function updateSheetChrome(ayahs, pageNum, suffix) {
    const nameEl = document.getElementById('sheetSurahName' + suffix);
    if (!nameEl) return;
    // A page can span two surahs; name them all so the header matches the page.
    const names = [...new Set(ayahs.map(a => a.surah.name))];
    nameEl.textContent = names.join(' · ');
    document.getElementById('sheetJuzName' + suffix).textContent =
      'الجزء ' + toArabicDigits(ayahs[0].juz);
    document.getElementById('pageMedallion' + suffix).textContent = toArabicDigits(pageNum);
    // The focus bar is the only chrome left in reading mode - keep it oriented.
    if (!suffix) {
      const fl = document.getElementById('focusLabel');
      if (fl) {
        const shortName = (typeof Search !== 'undefined')
          ? Search.normalizeArabic(names[0]).replace(/^سوره\s*/, '') : names[0];
        fl.textContent = `${shortName} · ${toArabicDigits(pageNum)}`;
      }
    }
  }

  /*
   * Picking a surah / juz / hizb turns the mushaf to the page it begins on and
   * records that start in clipTarget; the actual clipping happens inside
   * loadPage so it survives later re-renders (tajweed toggle, view mode).
   */
  async function loadSurah(surahNum) {
    setStatus('جارٍ تحميل السورة...');
    const data = await fetchSurah(surahNum);
    stopAudio();
    clipTarget = data.ayahs[0].number;
    playFromGlobal = null;
    await turnTo(data.ayahs[0].page);
    scrollSheetIntoView();
    setStatus(`سورة ${data.name} — ${data.numberOfAyahs} آية — تبدأ في الصفحة ${data.ayahs[0].page}`);
  }

  /** Re-apply the active selection's clipping to whichever sheet holds its start. */
  function applyStickyClip() {
    if (!clipTarget) return;
    // Try the right sheet first; if the selection starts on an even page in
    // spread mode it will be on the left sheet instead.
    if (!clipPageToSurah('mushafPage', clipTarget)) {
      clipPageToSurah('mushafPageLeft', clipTarget);
    }
  }

  /** Bring the reading area to the top so the selection's banner is what is seen. */
  function scrollSheetIntoView() {
    const el = document.getElementById('mushafSpread');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Strip all rendered content that appears *before* the first ayah of the
   * chosen surah in a sheet container, so that surah starts at the top.
   * Only acts on the given container (right sheet); the left sheet is left
   * intact because a whole page belonging to a previous surah is correct.
   */
  function clipPageToSurah(containerId, firstGlobal) {
    const container = document.getElementById(containerId);
    if (!container) return false;
    const firstEl = container.querySelector(`.ayah[data-global="${firstGlobal}"]`);
    if (!firstEl) return false;   // first ayah is on the other sheet

    // Walk backwards to include the surah-banner (and basmalah) above the ayah.
    let cutEl = firstEl;
    let sib = firstEl.previousElementSibling;
    while (sib) {
      if (sib.classList.contains('surah-banner')) { cutEl = sib; break; }
      if (sib.classList.contains('basmalah'))     { cutEl = sib; }
      sib = sib.previousElementSibling;
    }

    // Remove everything that comes before the cut point.
    while (cutEl.previousElementSibling) {
      cutEl.previousElementSibling.remove();
    }
    return true;
  }

  async function loadJuz(juzNum) {
    setStatus('جارٍ تحميل الجزء...');
    const data = await fetchJuz(juzNum);
    stopAudio();
    clipTarget = data.ayahs[0].number;
    playFromGlobal = null;
    await turnTo(data.ayahs[0].page);
    scrollSheetIntoView();
    setStatus(`الجزء ${toArabicDigits(juzNum)} — يبدأ في الصفحة ${data.ayahs[0].page}`);
  }

  async function loadHizb(hizbNum) {
    setStatus('جارٍ تحميل الربع...');
    const data = await fetchHizb(hizbNum);
    stopAudio();
    clipTarget = data.ayahs[0].number;
    playFromGlobal = null;
    await turnTo(data.ayahs[0].page);
    scrollSheetIntoView();
    setStatus(`الربع ${toArabicDigits(hizbNum)} — يبدأ في الصفحة ${data.ayahs[0].page}`);
  }

  /** Turn to a page, animating in the direction of travel. */
  function turnTo(page) {
    const direction = page === currentPage ? 0 : (page > currentPage ? 1 : -1);
    return loadPage(page, direction);
  }

  /** Repaint whatever is on screen (used when the tajweed toggle changes). */
  function render() {
    loadPage(currentPage).catch(err => setStatus(err.message));
  }

  /** Open the mushaf page containing an ayah and mark that ayah. */
  async function gotoAyah(globalNumber) {
    const meta = await fetchAyah(globalNumber);
    clipTarget = null;   // an explicit ayah jump replaces any surah/juz/hizb selection
    playFromGlobal = globalNumber;   // ▶ تشغيل starts from this ayah, not the page top
    await loadPage(meta.page);
    // Look across the spread: the target ayah may be on either leaf.
    const container = document.getElementById('mushafSpread');
    container.querySelectorAll('.ayah.found').forEach(el => el.classList.remove('found'));
    const el = container.querySelector(`.ayah[data-global="${globalNumber}"]`);
    if (el) {
      el.classList.add('found');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setStatus(`الصفحة ${meta.page} — ${meta.surah.name} — آية ${meta.numberInSurah}`);
    return meta;
  }

  function setStatus(msg) {
    document.querySelector('.status-line').textContent = msg;
  }

  function playCurrent() {
    if (!currentAyahs.length) return;
    let list = currentAyahs;
    // A search jump leaves the full page on screen but recitation starts at the
    // ayah the reader actually asked for.
    if (playFromGlobal != null) {
      const idx = list.findIndex(a => Number(a.number) === Number(playFromGlobal));
      if (idx > 0) {
        list = list.slice(idx);
        setStatus(`التشغيل من آية ${list[0].numberInSurah}`);
      }
      playFromGlobal = null;
    }
    const container = document.getElementById('mushafSpread');
    player = player || new AyahQueuePlayer(document.getElementById('audioPlayer'));
    player.setQueue(list.map(queueItemFor));
    player.onStateChange = ({ playing, paused }) => {
      const btn = document.getElementById('btnPausePage');
      btn.disabled = !playing;
      btn.textContent = paused ? '▶ استكمال' : '⏸ إيقاف مؤقت';
    };
    player.onError = (msg) => setStatus(msg);
    player.onItemStart = (item) => highlightAyah(container, item.globalNumber);
    player.onQueueEnd = async () => {
      // Reaching the end of a page turns to the next one and keeps reciting, the
      // way a reader turns the leaf without stopping.
      const auto = document.getElementById('chkAutoTurn');
      const step = spreadOn() ? 2 : 1;
      if (auto && auto.checked && currentPage + step <= TOTAL_PAGES) {
        try {
          await loadPage(currentPage + step, 1);
          playCurrent();
          return;
        } catch (err) { /* fall through to the plain end message */ }
      }
      setStatus('انتهى التشغيل.');
    };
    player.start();
  }

  let turning = false;

  function goPage(delta) {
    // A spread turns a whole leaf, which is two pages.
    const step = spreadOn() ? delta * 2 : delta;
    goToPage(Math.min(TOTAL_PAGES, Math.max(1, currentPage + step)));
  }

  /** Turn to an absolute page, animating in the direction of travel. */
  function goToPage(target) {
    if (turning || target === currentPage) return;
    turning = true;
    // Paging by hand ends a surah/juz/hizb selection: the reader asked for the
    // whole leaf, so later re-renders must not re-clip it.
    clipTarget = null;
    playFromGlobal = null;
    const direction = target > currentPage ? 1 : -1;
    loadPage(target, direction)
      .catch(err => setStatus(err.message))
      .finally(() => { turning = false; });
  }

  function togglePause() {
    if (player) player.togglePause();
  }

  function stopAudio() {
    if (player) player.stop();
  }

  function init() {
    buildLegend();
    // Returned, not fire-and-forget: otherwise a failed first load rejects
    // unhandled and the reader is left staring at the placeholder with no reason.
    populateSelects()
      .then(() => loadPage(1))
      .catch(err => setStatus('خطأ: ' + err.message));

    document.getElementById('selSurah').addEventListener('change', e => {
      if (e.target.value) loadSurah(+e.target.value).catch(err => setStatus(err.message));
    });
    document.getElementById('selJuz').addEventListener('change', e => {
      if (e.target.value) loadJuz(+e.target.value).catch(err => setStatus(err.message));
    });
    document.getElementById('selHizb').addEventListener('change', e => {
      if (e.target.value) loadHizb(+e.target.value).catch(err => setStatus(err.message));
    });
    document.getElementById('selPage').addEventListener('change', e => {
      const n = Math.min(TOTAL_PAGES, Math.max(1, +e.target.value || 1));
      // Riffle in the direction of travel so a distant jump reads as leafing through.
      goToPage(n);
    });
    document.getElementById('btnPrevPage').addEventListener('click', () => goPage(-1));
    document.getElementById('btnNextPage').addEventListener('click', () => goPage(1));
    // Sheet arrows follow the RTL mushaf convention: the book advances toward
    // the LEFT (next page = left arrow), unlike the LTR media-player habit.
    document.getElementById('btnSheetPrev').addEventListener('click', () => goPage(-1));
    document.getElementById('btnSheetNext').addEventListener('click', () => goPage(1));

    // Arrow keys match the sheet arrows, unless the user is typing in a field.
    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('tab-mushaf').classList.contains('active')) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPage(1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goPage(-1); }
    });
    document.getElementById('chkTajweedOn').addEventListener('change', render);
    initViewMode();
    document.getElementById('btnPlayPage').addEventListener('click', playCurrent);
    document.getElementById('btnPausePage').addEventListener('click', togglePause);
    document.getElementById('btnStopAudio').addEventListener('click', stopAudio);
  }

  return {
    init, populateSelects, toArabicDigits, renderAyahs, buildLegend,
    loadPage, loadSurah, loadJuz, gotoAyah,
    get surahList() { return surahList; },
    get currentAyahs() { return currentAyahs; },
  };
})();
