/*
 * Tajweed lessons.
 *
 * Each sub-rule carries its own Quranic example, marked in the body with
 *   <div data-ex="<globalAyahNumber>" data-note="..."></div>
 * The renderer replaces every marker with the real ayah (fetched, tajweed-coloured)
 * plus listen/repeat buttons, so the rule is heard where it is explained rather
 * than in a separate block at the end.
 */
const TAJWEED_LESSONS = [
  {
    id: 'intro',
    title: 'مقدمة في علم التجويد',
    body: `
      <p><strong>التجويد</strong> لغةً: التحسين. واصطلاحاً: إخراج كل حرف من مخرجه مع إعطائه حقّه ومستحقّه من الصفات.</p>
      <p>حقّ الحرف: صفاته اللازمة له (كالجهر والهمس والاستعلاء...). ومستحقّ الحرف: ما ينشأ عن هذه الصفات من أحكام كالإدغام والإخفاء والمدّ.</p>
      <p>حكم تعلّم التجويد: علمًا فرض كفاية، وتطبيقًا عمليًا عند القراءة فرض عين على كل مسلم يقرأ القرآن.</p>
      <p>في هذا المصحف تم تلوين الأحكام تلقائياً بنفس الألوان المستخدمة في هذه الدروس، وتحت كل حكم مثال من القرآن يمكنك سماعه.</p>
      <div data-ex="1" data-note="ابدأ بالاستماع إلى البسملة وتأمّل الألوان: همزة الوصل رمادية، واللام الشمسية رمادية، والمدود بدرجات الأزرق."></div>
    `
  },
  {
    id: 'noon-sakinah',
    title: 'أحكام النون الساكنة والتنوين',
    body: `
      <p>للنون الساكنة (نْ) والتنوين (ـً ـٍ ـٌ) إذا جاء بعدهما حرف، أربعة أحكام:</p>

      <h4>١. الإظهار الحلقي</h4>
      <p>عند حروف الحلق الستة: <strong>ء هـ ع ح غ خ</strong>. تُنطق النون واضحة بلا غنّة زائدة.</p>
      <div data-ex="6197" data-note="«مِّنْ خَوْفٍ» — النون الساكنة قبل الخاء (حرف حلقي) تُنطق واضحة تماماً بلا غنّة. لاحظ الفرق مع «مِّن جُوعٍ» في أول الآية وهي إخفاء."></div>

      <h4 style="color:#169777">٢. الإدغام بغنّة</h4>
      <p>عند حروف <strong>ي ن م و</strong> (تجمعها كلمة «ينمو»). تُدغم النون في الحرف التالي مع بقاء الغنّة حركتين.</p>
      <div data-ex="5685" data-note="«سِرَاجًا وَهَّاجًا» — تنوين الفتح يُدغم في الواو مع غنّة واضحة."></div>

      <h4 style="color:#169200">٣. الإدغام بلا غنّة</h4>
      <p>عند حرفي <strong>ل ر</strong> فقط. تُدغم النون إدغاماً كاملاً بلا غنّة.</p>
      <div data-ex="5708" data-note="«مِّن رَّبِّكَ» — النون تختفي تماماً وتُشدَّد الراء، بلا أي غنّة."></div>

      <h4 style="color:#26BFFD">٤. الإقلاب</h4>
      <p>عند حرف <strong>الباء</strong> فقط: تُقلب النون الساكنة أو التنوين ميماً مخفاة بغنّة، وتُرسم فوقها ميم صغيرة.</p>
      <div data-ex="5938" data-note="«مِنۢ بَيْنِ» — انظر الميم الصغيرة فوق النون: تُنطق ميماً مخفاة بغنّة، لا نوناً."></div>

      <h4 style="color:#9400A8">٥. الإخفاء الحقيقي</h4>
      <p>عند بقية الحروف الخمسة عشر (ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك). تُنطق النون بين الإظهار والإدغام مع غنّة.</p>
      <div data-ex="5686" data-note="«وَأَنزَلْنَا» — النون قبل الزاي لا تُظهر ولا تُدغم، بل تُخفى مع غنّة مقدار حركتين."></div>
    `
  },
  {
    id: 'meem-sakinah',
    title: 'أحكام الميم الساكنة',
    body: `
      <p>للميم الساكنة (مْ) ثلاثة أحكام حسب الحرف الذي يليها:</p>

      <h4 style="color:#D500B7">١. الإخفاء الشفوي</h4>
      <p>إذا جاء بعدها حرف <strong>الباء</strong>، تُخفى الميم مع غنّة، مع إطباق الشفتين إطباقاً خفيفاً.</p>
      <div data-ex="5726" data-note="«هُم بِٱلسَّاهِرَةِ» — الميم الساكنة قبل الباء تُخفى بغنّة ولا تُظهر."></div>

      <h4 style="color:#58B800">٢. الإدغام الشفوي (مثلين صغير)</h4>
      <p>إذا جاء بعدها <strong>ميم</strong> أخرى، تُدغم الأولى في الثانية مع غنّة كاملة.</p>
      <div data-ex="5929" data-note="«وَرَآئِهِم مُّحِيطٌ» — ميمان تلتقيان فتصيران ميماً واحدة مشدّدة بغنّة."></div>

      <h4>٣. الإظهار الشفوي</h4>
      <p>عند بقية الحروف كلها (ما عدا الباء والميم)، تُظهر الميم واضحة بلا غنّة زائدة، ويُشدَّد الحذر عند <strong>الواو والفاء</strong> لقرب المخرج.</p>
      <div data-ex="6193" data-note="«فَجَعَلَهُمْ كَعَصْفٍ» — الميم الساكنة قبل الكاف تُنطق واضحة تماماً بلا غنّة."></div>
    `
  },
  {
    id: 'ghunnah',
    title: 'الغنة',
    body: `
      <p style="color:#FF7E1E">الغنّة: صوت يخرج من الخيشوم (الأنف) مركّب في جسم النون والميم، ومقدارها حركتان (نحو ثانية).</p>
      <p>تظهر وجوباً في: <strong>النون والميم المشدّدتين</strong>، والإدغام بغنّة، والإخفاء، والإقلاب، والإخفاء والإدغام الشفويين.</p>
      <div data-ex="5674" data-note="«ٱلنَّبَإِ» — النون المشدّدة: أمسك الصوت في أنفك مقدار حركتين قبل الانتقال."></div>
      <div data-ex="5677" data-note="«هُمْ فِيهِ مُخْتَلِفُونَ» — تأمّل الميم المشدّدة في «ثُمَّ» وكيف تُمدّ بالغنّة."></div>
    `
  },
  {
    id: 'madd',
    title: 'أحكام المدود',
    body: `
      <p>المدّ: إطالة الصوت بحرف من حروف المدّ الثلاثة: الألف الساكنة بعد فتح، والواو الساكنة بعد ضم، والياء الساكنة بعد كسر.</p>

      <h4 style="color:#537FFF">١. المدّ الطبيعي (الأصلي)</h4>
      <p>مقداره <strong>حركتان</strong>، ولا يتوقف على همز أو سكون بعده.</p>
      <div data-ex="5678" data-note="«مِهَٰدًا» — الألف تُمدّ حركتين فقط، لا أكثر ولا أقل."></div>

      <h4 style="color:#4050FF">٢. المدّ الجائز المنفصل</h4>
      <p>حرف المدّ في آخر كلمة والهمزة في أول الكلمة التالية. مقداره <strong>٢ أو ٤ أو ٦ حركات</strong> (عند حفص من طريق الشاطبية: ٤-٥).</p>
      <div data-ex="6208" data-note="«يَٰٓأَيُّهَا» — حرف المدّ في «يا» والهمزة في «أيها»، فالكلمتان منفصلتان."></div>

      <h4 style="color:#2144C1">٣. المدّ الواجب المتّصل</h4>
      <p>حرف المدّ والهمزة في <strong>كلمة واحدة</strong>. مقداره <strong>٤ أو ٥ حركات</strong> وجوباً.</p>
      <div data-ex="5695" data-note="«فِيهَآ» ... تأمّل «جَآءَ» ونحوها: المدّ والهمزة في كلمة واحدة فيجب إطالته."></div>

      <h4 style="color:#000EBC">٤. المدّ اللازم</h4>
      <p>حرف مدّ يليه <strong>سكون أصلي</strong> ثابت وصلاً ووقفاً. مقداره <strong>٦ حركات</strong> وجوباً.</p>
      <div data-ex="5791" data-note="«ٱلصَّآخَّةُ» — بعد الألف خاء مشدّدة (سكون لازم)، فيُمدّ ستّ حركات وجوباً."></div>
    `
  },
  {
    id: 'qalqalah',
    title: 'القلقلة',
    body: `
      <p style="color:#DD0008">القلقلة: اضطراب المخرج عند النطق بالحرف الساكن حتى يُسمع له نبرة قوية. حروفها خمسة تجمعها عبارة <strong>«قُطْبُ جَدٍ»</strong>: ق ط ب ج د.</p>

      <h4>القلقلة الصغرى</h4>
      <p>إذا كان حرف القلقلة ساكناً في <strong>وسط</strong> الكلمة.</p>
      <div data-ex="5678" data-note="«نَجْعَلِ» — الجيم ساكنة في وسط الكلمة، يُسمع لها نبرة خفيفة."></div>

      <h4>القلقلة الكبرى</h4>
      <p>إذا كان حرف القلقلة في <strong>آخر</strong> الكلمة وسكن بسبب الوقف، وتكون النبرة أقوى.</p>
      <div data-ex="6226" data-note="«ٱلْفَلَقِ» — عند الوقف تسكن القاف فتظهر القلقلة قوية واضحة."></div>
    `
  },
  {
    id: 'laam',
    title: 'أحكام اللام وهمزة الوصل',
    body: `
      <p>لام «أل» التعريف نوعان:</p>

      <h4 style="color:#AAAAAA">١. اللام الشمسية</h4>
      <p>تُكتب ولا تُنطق (تُدغم فيما بعدها)، أمام الحروف الشمسية الأربعة عشر المجموعة في:
      «طِبْ ثُمَّ صِلْ رَحِماً تَفُزْ ضِفْ ذَا نِعَمْ دَعْ سُوءَ ظَنٍّ زُرْ شَرِيفاً لِلْكَرَمِ نِلْ».</p>
      <div data-ex="5674" data-note="«ٱلنَّبَإِ» — اللام مكتوبة لكنها لا تُنطق، والنون بعدها مشدّدة. جرّب النطق: «أنـنـبإ»."></div>

      <h4>٢. اللام القمرية</h4>
      <p>تُنطق اللام واضحة، أمام باقي الحروف المجموعة في «ابْغِ حَجَّكَ وَخَفْ عَقِيمَهُ».</p>
      <div data-ex="2" data-note="«ٱلْحَمْدُ» و«ٱلْعَٰلَمِينَ» — اللام تُنطق واضحة لأن بعدها حاء وعين وهما قمريتان."></div>

      <h4 style="color:#AAAAAA">٣. همزة الوصل</h4>
      <p>همزة زائدة تُنطق عند <strong>البدء</strong> بالكلمة وتسقط عند <strong>وصلها</strong> بما قبلها.</p>
      <div data-ex="5678" data-note="«ٱلْأَرْضَ» — لو بدأت بها نطقت الهمزة، ولو وصلتها بما قبلها سقطت تماماً."></div>
    `
  },
  {
    id: 'idgham-mutajanisayn',
    title: 'الإدغام المتجانس والمتقارب',
    body: `
      <p style="color:#A1A1A1">يقع بين حرفين متّحدين في المخرج (متجانسين) أو متقاربين في المخرج والصفة، إذا سكن الأول وتحرّك الثاني.</p>

      <h4>الإدغام المتجانسين</h4>
      <p>حرفان من <strong>مخرج واحد</strong> مختلفان في الصفات، مثل: د/ت، ت/ط، ذ/ظ، ب/م.</p>
      <div data-ex="5509" data-note="«مَهَّدتُّ» — الدال الساكنة تُدغم في التاء لاتّحاد المخرج، فتُنطق تاءً مشدّدة."></div>

      <h4>الإدغام المتقاربين</h4>
      <p>حرفان <strong>متقاربان</strong> في المخرج أو الصفة، مثل: ق/ك، ل/ر.</p>
      <div data-ex="5642" data-note="«نَخْلُقكُّم» — القاف تُدغم في الكاف لتقارب المخرج."></div>
    `
  },
  {
    id: 'raa',
    title: 'أحكام الراء: التفخيم والترقيق',
    body: `
      <h4>تفخيم الراء</h4>
      <p>تُفخَّم إذا كانت <strong>مفتوحة أو مضمومة</strong>، أو ساكنة وقبلها فتح أو ضم، أو ساكنة بعد كسر عارض،
      أو بعد كسر وجاء بعدها حرف استعلاء في نفس الكلمة.</p>
      <div data-ex="6231" data-note="«بِرَبِّ ٱلنَّاسِ» — الراء مفتوحة فتُفخَّم: امتلئ بها الفم."></div>

      <h4>ترقيق الراء</h4>
      <p>تُرقَّق إذا كانت <strong>مكسورة</strong>، أو ساكنة وقبلها كسر أصلي متّصل ولم يأتِ بعدها حرف استعلاء.</p>
      <div data-ex="5729" data-note="«فِرْعَوْنَ» — الراء ساكنة وقبلها كسر أصلي، فتُرقَّق."></div>

      <p class="note-inline">ملاحظة: حكم الراء غير ملوَّن في المصحف لأنه يعتمد على الحركة والسياق لا على رمز ثابت في النص،
      لذلك اعتمد على السماع في المثالين أعلاه.</p>
    `
  }
];

const Lessons = (() => {
  let player = null;
  let currentId = null;

  function ensurePlayer() {
    player = player || new AyahQueuePlayer(document.getElementById('lessonAudio'));
    return player;
  }

  function render(id) {
    currentId = id;
    const lesson = TAJWEED_LESSONS.find(l => l.id === id) || TAJWEED_LESSONS[0];
    document.getElementById('lessonContent').innerHTML = `<h2>${lesson.title}</h2>${lesson.body}`;
    document.querySelectorAll('.lesson-item')
      .forEach(el => el.classList.toggle('active', el.dataset.id === lesson.id));
    fillExamples(lesson.id);
  }

  /** Replace every <div data-ex="..."> marker with the real ayah and its controls. */
  async function fillExamples(lessonId) {
    const slots = Array.from(document.querySelectorAll('#lessonContent [data-ex]'));
    if (!slots.length) return;
    slots.forEach(s => { s.innerHTML = '<div class="ex-loading">جارٍ تحميل المثال...</div>'; });

    for (const slot of slots) {
      try {
        const ayah = await fetchAyah(+slot.dataset.ex);
        if (currentId !== lessonId) return;    // user switched lessons meanwhile
        const note = slot.dataset.note || '';
        slot.classList.add('lesson-example');
        slot.innerHTML = `
          <div class="ex-ayah">${parseTajweedText(ayah.text)}</div>
          <div class="ex-foot">
            <span class="ex-ref">${escapeHtml(ayah.surah.name)} — آية ${ayah.numberInSurah}</span>
            <span class="ex-actions">
              <button class="ex-play">▶ استمع</button>
              <button class="ex-repeat">🔁 ردّد ٣ مرات</button>
            </span>
          </div>
          ${note ? `<p class="ex-note">${escapeHtml(note)}</p>` : ''}`;
        slot.querySelector('.ex-play').addEventListener('click', () => play(ayah, 1, slot));
        slot.querySelector('.ex-repeat').addEventListener('click', () => play(ayah, 3, slot));
      } catch (err) {
        slot.innerHTML = `<div class="ex-loading">تعذّر تحميل المثال: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function play(ayah, times, slot) {
    const p = ensurePlayer();
    p.setQueue(Array.from({ length: times }, () => queueItemFor(ayah)));
    document.querySelectorAll('.lesson-example.playing')
      .forEach(el => el.classList.remove('playing'));
    slot.classList.add('playing');
    p.onQueueEnd = () => slot.classList.remove('playing');
    p.start();
  }

  function init() {
    const list = document.getElementById('lessonsList');
    list.innerHTML = TAJWEED_LESSONS.map(l =>
      `<button class="lesson-item" data-id="${l.id}">${l.title}</button>`).join('');
    list.querySelectorAll('.lesson-item').forEach(btn => {
      btn.addEventListener('click', () => render(btn.dataset.id));
    });
    render(TAJWEED_LESSONS[0].id);
  }

  return { init };
})();
