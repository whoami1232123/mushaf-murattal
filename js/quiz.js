/*
 * Quiz tab.
 *  - Scope levels: one surah -> one juz -> the whole Quran.
 *  - Subject: Quran recall only, or Quran + tajweed rule questions.
 *  - Variety: asked ayahs are remembered (per scope, in localStorage) so a repeat
 *    session serves fresh questions rather than the same ones again.
 */
const Quiz = (() => {
  let ayahs = [];
  let score = 0, total = 0, skipped = 0;
  let current = null;
  let answered = false;
  let scopeKey = '';
  let askedIds = new Set();

  const ASKED_PREFIX = 'quiz:asked:';

  function setBox(html) { document.getElementById('quizBox').innerHTML = html; }

  function updateScore() {
    document.getElementById('quizScore').textContent = score;
    document.getElementById('quizTotal').textContent = total;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const extra = document.getElementById('quizPct');
    if (extra) {
      extra.textContent = total
        ? `${pct}%` + (skipped ? ` · تخطّيت ${skipped}` : '')
        : '';
    }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const plainText = (ayah) => stripTajweedMarkup(ayah.text).trim();

  /* ---------- asked-history so repeat sessions differ ---------- */

  function loadAsked(key) {
    try {
      const raw = localStorage.getItem(ASKED_PREFIX + key);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) { return new Set(); }
  }

  function saveAsked() {
    try {
      localStorage.setItem(ASKED_PREFIX + scopeKey, JSON.stringify(Array.from(askedIds)));
    } catch (e) { /* quota - history is best effort */ }
  }

  function markAsked(id) {
    askedIds.add(id);
    saveAsked();
  }

  /** Ayahs not yet asked in this scope; recycles once every ayah has been seen. */
  function unseen(pool) {
    const fresh = pool.filter(a => !askedIds.has(a.number));
    if (fresh.length >= 2) return fresh;
    askedIds = new Set();          // full cycle complete - start over
    saveAsked();
    return pool;
  }

  /* ---------- scope loading ---------- */

  async function populateSelects() {
    const list = Mushaf.surahList.length ? Mushaf.surahList : await fetchSurahList();
    document.getElementById('quizSurah').innerHTML =
      list.map(s => `<option value="${s.number}">${s.number}. ${s.name}</option>`).join('');
    document.getElementById('quizJuz').innerHTML =
      Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1)
        .map(j => `<option value="${j}">الجزء ${Mushaf.toArabicDigits(j)}</option>`).join('');
  }

  function updateScopeVisibility() {
    const level = document.getElementById('quizLevel').value;
    document.getElementById('quizSurahGroup').style.display = level === 'surah' ? '' : 'none';
    document.getElementById('quizJuzGroup').style.display = level === 'juz' ? '' : 'none';
  }

  async function loadScope() {
    const level = document.getElementById('quizLevel').value;
    // Drop the previous scope first: if this load fails, "Next" must not quietly
    // keep serving questions from whatever was loaded before.
    ayahs = [];
    if (level === 'surah') {
      const n = +document.getElementById('quizSurah').value;
      scopeKey = 'surah:' + n;
      ayahs = (await fetchSurah(n)).ayahs;
    } else if (level === 'juz') {
      const n = +document.getElementById('quizJuz').value;
      scopeKey = 'juz:' + n;
      ayahs = (await fetchJuz(n)).ayahs;
    } else {
      scopeKey = 'quran';
      // The whole Quran is fetched a juz at a time; each juz is cached separately
      // so a second whole-Quran session costs no network at all.
      ayahs = await fetchWholeQuran((done, all) => {
        setBox(`<div class="loading">جارٍ تحميل المصحف كاملاً... (${done} من ${all} جزء)<br>
                <small>يُحفظ في الكاش، فلن يتكرر التحميل مرة أخرى.</small></div>`);
      });
    }
    askedIds = loadAsked(scopeKey);
  }

  async function start() {
    setBox('<div class="loading">جارٍ التحميل...</div>');
    try {
      await loadScope();
    } catch (err) {
      ayahs = [];
      setBox(`<div class="loading">تعذّر تحميل الاختبار: ${escapeHtml(err.message)}<br>
              تحقّق من الاتصال ثم اضغط "ابدأ الاختبار" مرة أخرى.</div>`);
      return;
    }
    score = 0; total = 0; skipped = 0;
    current = null; answered = false;
    updateScore();
    next();
  }

  /* ---------- question dispatch ---------- */

  /* Moving on without answering used to vanish from the tally, so a user who saw
     10 questions could be shown "1/1". A skip now counts as an attempt. */
  function skipCurrent() {
    if (!current || answered) return;
    answered = true;
    total++;
    skipped++;
    updateScore();
  }

  function next() {
    skipCurrent();
    if (!ayahs.length) { setBox('<div class="loading">اضغط "ابدأ الاختبار" أولاً.</div>'); return; }
    const subject = document.getElementById('quizSubject').value;
    const type = document.getElementById('quizType').value;

    // With tajweed enabled, roughly a third of questions test the rules instead.
    if (subject === 'both' && Math.random() < 0.34) { renderTajweedQuiz(); return; }
    if (subject === 'tajweed') { renderTajweedQuiz(); return; }

    const minWords = type === 'complete' ? 4 : 3;
    const pool = ayahs.filter(a => plainText(a).split(/\s+/).length >= minWords);
    if (pool.length < 2) {
      setBox('<div class="loading">لا توجد آيات كافية في هذا النطاق لهذا النوع، جرّب نطاقاً أوسع أو نوعاً آخر.</div>');
      return;
    }
    if (type === 'complete') renderCompleteQuiz(pool);
    else renderWordQuiz(pool);
  }

  function renderOptions(labelHtml, stemHtml, options, correct, extraHtml = '') {
    current = { correct };
    answered = false;
    setBox(`
      <div class="quiz-q">
        <div class="quiz-label">${labelHtml}</div>
        <div class="quiz-stem">${stemHtml}</div>
        <div class="quiz-options">
          ${options.map(o => `<button class="quiz-opt" data-val="${escapeHtml(o)}">${escapeHtml(o)}</button>`).join('')}
        </div>
        <div class="quiz-feedback" id="quizFeedback"></div>
        ${extraHtml}
      </div>
    `);
    document.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.addEventListener('click', () => checkAnswer(btn.dataset.val === current.correct, btn));
    });
  }

  function renderCompleteQuiz(pool) {
    const candidates = unseen(pool);
    const ayah = candidates[Math.floor(Math.random() * candidates.length)];
    markAsked(ayah.number);

    const words = plainText(ayah).split(/\s+/);
    const splitPoint = Math.max(2, Math.floor(words.length * (0.4 + Math.random() * 0.2)));
    const stem = words.slice(0, splitPoint).join(' ');
    const correctEnding = words.slice(splitPoint).join(' ');
    const endingLen = Math.max(2, words.length - splitPoint);

    // Quranic ayahs frequently share identical endings, so a distractor can come out
    // textually equal to the answer. Dedupe, or two buttons would both count correct.
    const distractors = [];
    const add = (c) => {
      if (c && c !== correctEnding && !distractors.includes(c) && distractors.length < 3) {
        distractors.push(c);
      }
    };
    for (const a of shuffle(pool.filter(a => a.number !== ayah.number)).slice(0, 200)) {
      const w = plainText(a).split(/\s+/);
      add(w.slice(Math.max(0, w.length - endingLen)).join(' '));
      if (distractors.length === 3) break;
    }
    // Short scopes cannot supply 3 distinct endings; fall back to near-misses.
    const answerWords = correctEnding.split(/\s+/);
    for (let g = 0; distractors.length < 3 && g < 40; g++) add(shuffle(answerWords).join(' '));
    const vocab = Array.from(new Set(
      ayahs.slice(0, 500).flatMap(a => plainText(a).split(/\s+/)).filter(w => w.length > 1)
    ));
    for (let g = 0; distractors.length < 3 && g < 80 && vocab.length; g++) {
      const v = answerWords.slice();
      v[Math.floor(Math.random() * v.length)] = vocab[Math.floor(Math.random() * vocab.length)];
      add(v.join(' '));
    }

    renderOptions(
      `أكمل الآية (${ayah.surah.name} - آية ${ayah.numberInSurah}):`,
      escapeHtml(stem) + ' ...',
      shuffle([correctEnding, ...distractors]),
      correctEnding
    );
  }

  function renderWordQuiz(pool) {
    const candidates = unseen(pool);
    const ayah = candidates[Math.floor(Math.random() * candidates.length)];
    markAsked(ayah.number);

    const words = plainText(ayah).split(/\s+/);
    const hideIdx = 1 + Math.floor(Math.random() * (words.length - 1));
    const correctWord = words[hideIdx];

    const wordPool = new Set();
    for (const a of ayahs.slice(0, 500)) {
      for (const w of plainText(a).split(/\s+/)) {
        if (w !== correctWord && w.length > 1) wordPool.add(w);
      }
    }
    const distractors = shuffle(Array.from(wordPool)).slice(0, 3);
    const display = words.map((w, i) => i === hideIdx ? '_____' : w).join(' ');

    renderOptions(
      `اختر الكلمة الناقصة (${ayah.surah.name} - آية ${ayah.numberInSurah}):`,
      escapeHtml(display),
      shuffle([correctWord, ...distractors]),
      correctWord
    );
  }

  /* ---------- tajweed rule questions ---------- */

  /** Find ayahs in scope that carry a given tajweed rule code, with the marked word. */
  function findTajweedExamples(ruleCode, limit = 60) {
    const out = [];
    const re = new RegExp(`\\[${ruleCode}(?::\\d+)?\\[([^\\]]*)\\]`);
    for (const a of shuffle(ayahs).slice(0, 900)) {
      const m = a.text.match(re);
      if (m && m[1] && m[1].trim()) {
        out.push({ ayah: a, marked: m[1] });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function renderTajweedQuiz() {
    // Ask about a rule that actually occurs in the loaded scope.
    const codes = shuffle(Object.keys(TAJWEED_RULES));
    let picked = null;
    for (const code of codes) {
      const ex = findTajweedExamples(code, 1);
      if (ex.length) { picked = { code, example: ex[0] }; break; }
    }
    if (!picked) {
      setBox('<div class="loading">لم أجد أمثلة تجويد كافية في هذا النطاق، جرّب نطاقاً أوسع.</div>');
      return;
    }

    const rule = TAJWEED_RULES[picked.code];
    const wrongNames = shuffle(
      Array.from(new Set(Object.values(TAJWEED_RULES).map(r => r.name))).filter(n => n !== rule.name)
    ).slice(0, 3);

    const ayah = picked.example.ayah;
    const highlighted = parseTajweedText(ayah.text);

    renderOptions(
      `ما حكم التجويد في الجزء الملوَّن؟ (${ayah.surah.name} - آية ${ayah.numberInSurah})`,
      `<span class="tajweed-sample">${highlighted}</span>` +
      `<div class="tajweed-target">الكلمة: <span style="color:${rule.color}">${escapeHtml(picked.example.marked)}</span></div>`,
      shuffle([rule.name, ...wrongNames]),
      rule.name,
      `<div class="quiz-hint" id="quizHint" hidden></div>`
    );
    // Stash the explanation so checkAnswer can reveal it after answering.
    current.explain = `${rule.name} — يُلوَّن بهذا اللون في المصحف. راجع درس التجويد المتعلق به.`;
  }

  function checkAnswer(isCorrect, btn) {
    if (answered) return;   // options are disabled, but stay defensive
    answered = true;
    total++;
    if (isCorrect) score++;
    updateScore();
    document.querySelectorAll('.quiz-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.val === current.correct) b.classList.add('correct');
    });
    if (!isCorrect) btn.classList.add('wrong');
    const fb = document.getElementById('quizFeedback');
    fb.textContent = isCorrect ? '✔ إجابة صحيحة، بارك الله فيك!' : `✘ الإجابة الصحيحة: ${current.correct}`;
    fb.className = 'quiz-feedback ' + (isCorrect ? 'ok' : 'bad');
    const hint = document.getElementById('quizHint');
    if (hint && current.explain) { hint.textContent = current.explain; hint.hidden = false; }
  }

  function resetHistory() {
    askedIds = new Set();
    if (scopeKey) saveAsked();
    // The visible score must go with it, or a stale tally lingers on screen.
    score = 0; total = 0; skipped = 0;
    current = null; answered = false;
    updateScore();
    setBox('<div class="loading">تم تصفير النتيجة وسجل الأسئلة. اضغط "ابدأ الاختبار" لتبدأ من جديد.</div>');
  }

  function init() {
    populateSelects().catch(() => {});
    updateScopeVisibility();
    document.getElementById('quizLevel').addEventListener('change', updateScopeVisibility);
    document.getElementById('btnQuizStart').addEventListener('click', () => start());
    document.getElementById('btnQuizNext').addEventListener('click', next);
    document.getElementById('btnQuizReset').addEventListener('click', resetHistory);
  }

  return { init };
})();
