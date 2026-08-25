/*
 * Spoken reminders for prayer times and adhkar.
 *
 * Two channels, because a web app cannot be relied on to run in the background:
 *   - A system notification (needs permission) so it shows even on another tab.
 *   - A spoken announcement via speech synthesis ("صلاة العصر", "أذكار الصباح"),
 *     plus a chime, so the user hears it without looking.
 *
 * Honest limitation: this fires only while the page is open somewhere (a tab,
 * the installed app, or the desktop exe). A truly closed-app alarm needs a push
 * server or the native Android/iOS build.
 */
const Alerts = (() => {
  const KEY = 'alerts:prefs';
  const FIRED = 'alerts:fired';

  const PRAYER_LABELS = {
    Fajr: 'صلاة الفجر', Dhuhr: 'صلاة الظهر', Asr: 'صلاة العصر',
    Maghrib: 'صلاة المغرب', Isha: 'صلاة العشاء',
  };

  // Adhkar are tied to prayer times rather than clock times, which is how they
  // are actually observed: morning after Fajr, evening after Asr.
  const ADHKAR_AFTER = {
    Fajr:    { label: 'أذكار الصباح', set: 'morning', offsetMin: 20 },
    Asr:     { label: 'أذكار المساء', set: 'evening', offsetMin: 20 },
    Isha:    { label: 'أذكار النوم',  set: 'sleep',   offsetMin: 90 },
  };

  let timings = null;      // { Fajr:'04:52', ... } for today
  let ticker = null;

  const el = (id) => document.getElementById(id);

  function prefs() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function setPref(k, v) {
    const p = prefs(); p[k] = v;
    localStorage.setItem(KEY, JSON.stringify(p));
  }

  /** Remember what already fired today so a reminder is not repeated. */
  function firedToday() {
    try {
      const raw = JSON.parse(localStorage.getItem(FIRED)) || {};
      return raw.date === todayKey() ? new Set(raw.keys) : new Set();
    } catch (e) { return new Set(); }
  }
  function markFired(key) {
    const s = firedToday(); s.add(key);
    localStorage.setItem(FIRED, JSON.stringify({ date: todayKey(), keys: Array.from(s) }));
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  }

  /** Deep bell chime — A3/D3/A3 (220/147/220 Hz) for an authoritative male tone. */
  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      [[0, 220], [0.5, 147], [1.0, 220]].forEach(([t, freq]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.45, now + t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 1.0);
      });
      setTimeout(() => ctx.close(), 3500);
    } catch (e) { /* audio unavailable */ }
  }

  /* Prefer a male Arabic TTS voice: match known male voice names first, and
     never pick a voice known to be female. If the device exposes only female
     Arabic voices the best available one is used - nothing else we can do. */
  const MALE_VOICE_HINTS = ['maged', 'hamed', 'naayf', 'shakir', 'tarik',
    'fahed', 'fahad', 'hamdan', 'muhammad', 'mohammed', 'omar', 'male'];
  const FEMALE_VOICE_HINTS = ['zariyah', 'salma', 'laila', 'layla', 'amany',
    'amira', 'sana', 'hoda', 'reem', 'mariam', 'female'];

  let arabicVoice = null;   // resolved once voices load, then reused

  function pickArabicVoice() {
    const voices = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith('ar'));
    if (!voices.length) return null;
    const gender = (v) => {
      const n = (v.name || '').toLowerCase();
      if (FEMALE_VOICE_HINTS.some(h => n.includes(h))) return 0;
      if (MALE_VOICE_HINTS.some(h => n.includes(h))) return 2;
      return 1;   // unmarked voices outrank known-female ones
    };
    return voices.sort((a, b) => gender(b) - gender(a))[0];
  }

  /** Speak the announcement in Arabic so the user need not be looking. */
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA';
      u.rate = 0.85;
      u.pitch = 0.75;   // lower pitch reinforces the masculine, authoritative tone
      if (!arabicVoice) arabicVoice = pickArabicVoice();
      if (arabicVoice) u.voice = arabicVoice;
      speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  }

  function announce(title, body) {
    chime();
    // Let the chime finish before the voice starts, or they talk over each other.
    setTimeout(() => speak(title), 700);

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: 'icons/icon-192.png', tag: title, renotify: true });
      } catch (e) { /* some browsers require the SW registration instead */ }
    }
    const line = document.querySelector('.status-line');
    if (line) line.textContent = `🔔 ${title} — ${body}`;
  }

  /** Prayer times arrive as "HH:MM" for today in the user's local timezone. */
  function minutesFromMidnight(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function buildSchedule() {
    if (!timings) return [];
    const p = prefs();
    const out = [];
    if (p.prayers !== false) {
      for (const k in PRAYER_LABELS) {
        if (!timings[k]) continue;
        out.push({ key: 'p:' + k, at: minutesFromMidnight(timings[k].slice(0, 5)),
                   title: `حان الآن موعد ${PRAYER_LABELS[k]}`, body: timings[k].slice(0, 5) });
      }
    }
    if (p.adhkar !== false) {
      for (const k in ADHKAR_AFTER) {
        if (!timings[k]) continue;
        const a = ADHKAR_AFTER[k];
        out.push({ key: 'a:' + a.set,
                   at: minutesFromMidnight(timings[k].slice(0, 5)) + a.offsetMin,
                   title: `حان وقت ${a.label}`, body: 'اضغط لفتح الأذكار', set: a.set });
      }
    }
    return out.sort((x, y) => x.at - y.at);
  }

  function tick() {
    const now = nowMinutes();
    const fired = firedToday();
    for (const item of buildSchedule()) {
      // Fire within a two-minute window so a missed tick still catches it, but a
      // reminder whose time passed long ago (e.g. app opened at night) stays quiet.
      if (now >= item.at && now - item.at <= 2 && !fired.has(item.key)) {
        markFired(item.key);
        announce(item.title, item.body);
      }
    }
    renderNext();
  }

  function renderNext() {
    const box = el('alertsNext');
    if (!box) return;
    const sched = buildSchedule();
    if (!sched.length) {
      // Distinguish "never opted in" from "opted in but nothing to schedule
      // yet" - the second case is the exact bug that made alerts look broken:
      // notification permission granted, toggle on, but silent because no
      // prayer times had ever been fetched. Gate on the granted permission
      // (an explicit action) rather than the prefs defaulting to "on", or a
      // brand-new user who never pressed anything would see this too.
      const notifGranted = ('Notification' in window) && Notification.permission === 'granted';
      box.textContent = notifGranted && !timings
        ? '⚠️ التنبيهات مفعّلة لكن لم يُحدَّد موقعك بعد — اضغط "تفعيل التنبيهات" أو حدّد موقعك من الأعلى.'
        : 'التنبيهات متوقفة أو لم تُحدَّد المواقيت بعد.';
      return;
    }
    const now = nowMinutes();
    const upcoming = sched.find(s => s.at > now) || sched[0];
    const diff = upcoming.at > now ? upcoming.at - now : (24 * 60 - now) + upcoming.at;
    const h = Math.floor(diff / 60), m = diff % 60;
    box.textContent = `التنبيه القادم: ${upcoming.title} — بعد ${h ? h + ' س و' : ''}${m} د`;
  }

  /** Called by Worship once prayer times for today are known. */
  function setTimings(t) {
    timings = t;
    renderNext();
    scheduleNative();
  }

  /* On a native build (Android/iOS via Capacitor) hand the next week of prayer
     and adhkar times to the OS as real scheduled alarms, so they fire even with
     the app fully closed. No-op on the web/PWA/desktop build. */
  function scheduleNative() {
    if (!window.Worship) return;
    // Desktop: hand the current prefs to the Python-side reminder service.
    if (Worship.syncSettingsToHost) Worship.syncSettingsToHost();
    if (!window.NativeAlerts || !NativeAlerts.isNative()) return;
    NativeAlerts.scheduleUpcoming(Worship.fetchTimingsForDate, prefs())
      .then(showNativeStatus)
      .catch(() => showNativeStatus({ scheduled: false, reason: 'error' }));
  }

  /* Make the invisible part (OS-level alarms) diagnosable: without this line a
     reader whose phone silently refused scheduling has no way to know why. */
  function showNativeStatus(res) {
    const box = el('nativeAlertStatus');
    if (!box || !res) return;
    if (res.scheduled && res.count > 0) {
      box.textContent = `✅ تمت جدولة ${res.count} تنبيهاً على مدى ${res.days || 7} أيام — ستصل حتى لو كان التطبيق مغلقاً.`;
    } else {
      const msgs = {
        'permission-denied': '⚠️ إذن الإشعارات مرفوض — افتح إعدادات النظام واسمح للتطبيق بالإشعارات.',
        'not-native': '',
        'error': '⚠️ تعذّر جدولة تنبيهات النظام — أعد فتح التطبيق والاتصال بالإنترنت.',
      };
      box.textContent = msgs[res.reason] || '⚠️ تعذّر جدولة تنبيهات النظام.';
    }
    if (box.textContent) {
      // Aggressive battery savers (Xiaomi/Huawei/Samsung) drop exact alarms;
      // this is the single most common cause of "notifications never arrive".
      box.textContent += ' إن لم تصل التنبيهات، فعِّل التطبيق في إعدادات البطارية (بدون قيود).';
    }
  }

  function reflectToggles() {
    const p = prefs();
    el('alertPrayers').checked = p.prayers !== false;
    el('alertAdhkar').checked = p.adhkar !== false;
    const granted = ('Notification' in window) && Notification.permission === 'granted';
    el('btnEnableAlerts').textContent = granted ? '🔔 التنبيهات مفعّلة' : '🔔 تفعيل التنبيهات';
    el('btnEnableAlerts').classList.toggle('primary', !granted);
  }

  function init() {
    if (!el('alertPrayers')) return;
    reflectToggles();

    // Voice lists load asynchronously on some platforms; re-resolve when they
    // arrive, otherwise the first announcement uses whatever was available.
    if ('speechSynthesis' in window && speechSynthesis.addEventListener) {
      speechSynthesis.addEventListener('voiceschanged', () => { arabicVoice = pickArabicVoice(); });
    }

    el('btnEnableAlerts').addEventListener('click', async () => {
      const state = await requestPermission();
      reflectToggles();

      // The single most common reason alerts silently never fired: the toggle
      // was on, but no one had ever pressed "تحديد موقعي" on the qibla tab, so
      // Alerts never received prayer times to schedule against. Fold that step
      // into this button instead of leaving it as a separate, easy-to-miss step.
      let locationNote = 'ستصلك تنبيهات الصلاة والأذكار';
      if (!Worship.hasCoords) {
        const ok = await Worship.ensureLocation();
        locationNote = ok
          ? 'ستصلك تنبيهات الصلاة والأذكار حسب موقعك'
          : 'التنبيهات مفعّلة، لكن حددّ موقعك من تبويب «القبلة والمواقيت» لحساب أوقات الصلاة';
      }

      // Play a sample so the user hears exactly what a reminder sounds like, and
      // so the first audio happens inside a user gesture (browsers require that).
      announce('تم تفعيل التنبيهات', state === 'granted'
        ? locationNote
        : 'الصوت يعمل، لكن إشعارات النظام مرفوضة');

      // Explicitly reschedule native alarms now that the user has granted
      // permissions. This covers the case where coords were already saved but
      // native alarms had never been scheduled (fresh install, cleared data).
      scheduleNative();
    });

    el('alertPrayers').addEventListener('change', e => { setPref('prayers', e.target.checked); renderNext(); scheduleNative(); });
    el('alertAdhkar').addEventListener('change', e => { setPref('adhkar', e.target.checked); renderNext(); scheduleNative(); });
    el('btnTestAlert').addEventListener('click', () =>
      announce('تجربة التنبيه', 'هكذا سيصلك تنبيه الصلاة والأذكار'));

    clearInterval(ticker);
    ticker = setInterval(tick, 30000);   // half-minute resolution is enough
    tick();

    // Coming back to the foreground is the natural moment to refresh the rolling
    // window of native alarms (days elapsed while the app was closed).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && timings) scheduleNative();
    });
  }

  return { init, setTimings };
})();
