/*
 * Smart search: one box that works out what was typed.
 *   - a number      -> page / surah / juz shortcuts
 *   - a surah name  -> that surah
 *   - anything else -> full-text search across the Quran
 * Text search is unvocalized-friendly: typing "الحمد لله" finds "الْحَمْدُ لِلَّهِ".
 */
const Search = (() => {
  const el = (id) => document.getElementById(id);
  let lastQuery = '';

  /* Letter-level normalization only: strips diacritics and unifies letter shapes,
     but never touches whitespace. Keeping this separate matters for highlight(),
     which normalizes one character at a time and must not lose spaces. */
  function normalizeChars(s) {
    return (s || '')
      .replace(/[ً-ْٰۖ-ۭ]/g, '')  // tashkeel & quranic marks
      .replace(/ـ/g, '')                                  // tatweel
      .replace(/[أإآٱ]/g, 'ا')     // alef variants
      .replace(/ى/g, 'ي')                           // alef maqsura -> ya
      .replace(/ؤ/g, 'و')                           // hamza on waw
      .replace(/ئ/g, 'ي')                           // hamza on ya
      .replace(/ة/g, 'ه');                          // ta marbuta -> ha
  }

  /* Full normalization for comparing whole strings: letters plus tidy whitespace. */
  function normalizeArabic(s) {
    return normalizeChars(s).replace(/\s+/g, ' ').trim();
  }

  /** Western and Arabic-Indic digits both count as numeric input. */
  function parseNumber(raw) {
    const western = raw.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
                       .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    return /^\d+$/.test(western.trim()) ? parseInt(western, 10) : null;
  }

  function matchingSurahs(query) {
    const q = normalizeArabic(query);
    if (!q) return [];
    return (Mushaf.surahList || []).filter(s => {
      const name = normalizeArabic(s.name).replace(/^سوره\s*/, '');
      return name.includes(q) || normalizeArabic(s.englishName).toLowerCase().includes(q.toLowerCase());
    });
  }

  function sectionHtml(title, bodyHtml) {
    return `<div class="search-section"><h4>${title}</h4>${bodyHtml}</div>`;
  }

  /** Wrap occurrences of the query in the result text so the hit is visible. */
  function highlight(text, query) {
    const nQuery = normalizeArabic(query);
    if (!nQuery) return escapeHtml(text);

    // Normalizing changes length (diacritics vanish), so walk the original text and
    // build a map from each normalized index back to its original index.
    // normalizeChars is used rather than normalizeArabic because the latter trims
    // whitespace, which would drop the spaces between words from the map.
    const map = [];
    let norm = '';
    for (let i = 0; i < text.length; i++) {
      const piece = normalizeChars(text[i]);
      for (let k = 0; k < piece.length; k++) map.push(i);
      norm += piece;
    }
    const at = norm.indexOf(nQuery);
    if (at === -1 || !map.length) return escapeHtml(text);

    const start = map[at] ?? 0;
    // End at the original index of the first character *after* the match, so the
    // diacritics attached to the last matched letter stay inside the highlight.
    const afterIdx = at + nQuery.length;
    const end = afterIdx < map.length ? map[afterIdx] : text.length;
    return escapeHtml(text.slice(0, start)) +
           '<mark>' + escapeHtml(text.slice(start, end)) + '</mark>' +
           escapeHtml(text.slice(end));
  }

  async function run(input, box) {
    const raw = input.value.trim();
    if (!raw) { box.hidden = true; box.innerHTML = ''; return; }
    lastQuery = raw;
    box.hidden = false;

    const parts = [];
    const num = parseNumber(raw);

    // 1) Numeric shortcuts
    if (num !== null) {
      const jumps = [];
      if (num >= 1 && num <= TOTAL_PAGES) {
        jumps.push(`<button class="search-jump" data-kind="page" data-value="${num}">📄 الصفحة ${num}</button>`);
      }
      if (num >= 1 && num <= 114) {
        const s = (Mushaf.surahList || []).find(x => x.number === num);
        jumps.push(`<button class="search-jump" data-kind="surah" data-value="${num}">📖 سورة ${s ? escapeHtml(s.name) : num}</button>`);
      }
      if (num >= 1 && num <= TOTAL_JUZ) {
        jumps.push(`<button class="search-jump" data-kind="juz" data-value="${num}">🔖 الجزء ${num}</button>`);
      }
      if (jumps.length) parts.push(sectionHtml('انتقال سريع', `<div class="search-jumps">${jumps.join('')}</div>`));
    }

    // 2) Surah name matches
    const surahs = matchingSurahs(raw);
    if (surahs.length) {
      const items = surahs.slice(0, 12).map(s =>
        `<button class="search-jump" data-kind="surah" data-value="${s.number}">
           ${s.number}. ${escapeHtml(s.name)} <span class="search-meta">${s.numberOfAyahs} آية</span>
         </button>`).join('');
      parts.push(sectionHtml(`سور مطابقة (${surahs.length})`, `<div class="search-jumps">${items}</div>`));
    }

    // 3) Full-text search - skipped for bare numbers, which are already handled
    if (num === null && normalizeArabic(raw).length >= 2) {
      parts.push(sectionHtml('البحث في نص القرآن', '<div class="search-loading">جارٍ البحث...</div>'));
      box.innerHTML = parts.join('');
      bindJumps(box);

      try {
        const { total, matches } = await searchQuranText(raw);
        if (raw !== lastQuery) return;   // a newer search superseded this one
        const shown = matches.length;
        const header = total === 0
          ? 'لا توجد نتائج في نص القرآن'
          : `نتائج البحث في نص القرآن (${total}${total > shown ? ` — تُعرض أول ${shown}` : ''})`;
        const body = total === 0
          ? '<div class="search-empty">جرّب كلمات أقل أو تهجئة مختلفة.</div>'
          : matches.map(m => `
              <button class="search-hit" data-kind="ayah" data-value="${m.number}">
                <span class="search-hit-ref">${escapeHtml(m.surah.name)} — آية ${m.numberInSurah}</span>
                <span class="search-hit-text">${highlight(m.text, raw)}</span>
              </button>`).join('');
        parts[parts.length - 1] = sectionHtml(header, body);
      } catch (err) {
        parts[parts.length - 1] = sectionHtml('البحث في نص القرآن',
          `<div class="search-empty">${escapeHtml(err.message)}</div>`);
      }
    }

    if (!parts.length) {
      parts.push(sectionHtml('لا نتائج', '<div class="search-empty">اكتب رقم صفحة، أو اسم سورة، أو جزءاً من آية.</div>'));
    }
    box.innerHTML = parts.join('');
    bindJumps(box);
  }

  function bindJumps(box) {
    box.querySelectorAll('[data-kind]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const v = +btn.dataset.value;
        // Search lives in the mushaf tab, so make sure it is the visible one.
        document.querySelector('[data-tab="mushaf"]').click();
        try {
          if (btn.dataset.kind === 'page') await Mushaf.loadPage(v);
          else if (btn.dataset.kind === 'surah') await Mushaf.loadSurah(v);
          else if (btn.dataset.kind === 'juz') await Mushaf.loadJuz(v);
          else if (btn.dataset.kind === 'ayah') await Mushaf.gotoAyah(v);
          closeAll();
        } catch (err) {
          document.querySelector('.status-line').textContent = 'تعذّر الانتقال: ' + err.message;
        }
      });
    });
  }

  function closeAll() {
    document.querySelectorAll('.search-results').forEach(box => { box.hidden = true; });
  }

  /* The same smart search bar lives on both the mushaf and memorize tabs, so
     bind every .search-wrap rather than hard-coded element ids. */
  function bindBar(wrap) {
    const input = wrap.querySelector('input');
    const box = wrap.querySelector('.search-results');
    if (!input || !box) return;
    let debounce = null;

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      // Wait for a pause in typing so each keystroke does not fire a request.
      debounce = setTimeout(() => run(input, box), 350);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(debounce); run(input, box); }
      if (e.key === 'Escape') { input.value = ''; box.hidden = true; }
    });
    wrap.querySelector('.primary').addEventListener('click', () => {
      clearTimeout(debounce); run(input, box);
    });
    wrap.querySelectorAll('button:not(.primary)').forEach(btn =>
      btn.addEventListener('click', () => { input.value = ''; box.hidden = true; input.focus(); }));
  }

  function init() {
    document.querySelectorAll('.search-wrap').forEach(bindBar);

    // Clicking outside the search area dismisses the results panel.
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar') && !e.target.closest('.search-results')) closeAll();
    });
  }

  return { init, normalizeArabic, parseNumber };
})();
