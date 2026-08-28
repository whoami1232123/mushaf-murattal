/*
 * Prayer times + qibla, based on the device location.
 * Times come from api.aladhan.com; the qibla bearing is computed locally from the
 * great-circle initial bearing to the Kaaba so the compass keeps working offline.
 */
const Worship = (() => {
  const KAABA = { lat: 21.4224779, lng: 39.6266044 };
  const PRAYER_LABELS = {
    Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر',
    Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء',
  };
  const CALC_METHODS = [
    { id: 5,  name: 'الهيئة المصرية العامة للمساحة' },
    { id: 4,  name: 'أم القرى - مكة المكرمة' },
    { id: 8,  name: 'الخليج (الإمارات والسعودية)' },
    { id: 16, name: 'دبي' },
    { id: 3,  name: 'رابطة العالم الإسلامي' },
    { id: 2,  name: 'الجمعية الإسلامية لأمريكا الشمالية' },
    { id: 1,  name: 'جامعة العلوم الإسلامية - كراتشي' },
    { id: 9,  name: 'الكويت' },
    { id: 10, name: 'قطر' },
    { id: 12, name: 'الاتحاد الإسلامي الفرنسي' },
    { id: 13, name: 'ديانت - تركيا' },
  ];

  /*
   * Default calculation method by region. Getting this wrong is the usual reason
   * an app disagrees with the local mosque: for the UAE, Fajr differs by up to 22
   * minutes and Isha by 25 between methods, while Dhuhr/Asr/Maghrib never change.
   * The timezone is a reliable proxy for country here.
   */
  const METHOD_BY_ZONE = {
    'Asia/Dubai': 8, 'Asia/Muscat': 8, 'Asia/Bahrain': 8,
    'Asia/Qatar': 10, 'Asia/Kuwait': 9,
    'Asia/Riyadh': 4, 'Asia/Mecca': 4,
    'Africa/Cairo': 5,
    'Asia/Karachi': 1, 'Asia/Dhaka': 1, 'Asia/Kolkata': 1, 'Asia/Calcutta': 1,
    'Europe/Istanbul': 13, 'Europe/Paris': 12,
    'America/New_York': 2, 'America/Chicago': 2, 'America/Denver': 2,
    'America/Los_Angeles': 2, 'America/Toronto': 2,
  };

  function defaultMethodForDevice() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (METHOD_BY_ZONE[tz]) return String(METHOD_BY_ZONE[tz]);
    // Fall back by region prefix, then to the Muslim World League.
    if (tz.startsWith('Asia/')) return '8';
    if (tz.startsWith('Africa/')) return '5';
    if (tz.startsWith('America/')) return '2';
    return '3';
  }

  let coords = null;
  let qiblaBearing = null;
  let headingHandler = null;

  const el = (id) => document.getElementById(id);

  function setInfo(msg, isError = false) {
    const box = el('worshipInfo');
    box.textContent = msg;
    box.className = 'worship-info' + (isError ? ' bad' : '');
  }

  /** Initial great-circle bearing from a point to the Kaaba, in degrees from true north. */
  function computeQiblaBearing(lat, lng) {
    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const φ1 = toRad(lat), φ2 = toRad(KAABA.lat);
    const Δλ = toRad(KAABA.lng - lng);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function populateMethods() {
    // Only fall back to region detection until the user picks one explicitly.
    const saved = localStorage.getItem('worship:method') || defaultMethodForDevice();
    el('calcMethod').innerHTML = CALC_METHODS
      .map(m => `<option value="${m.id}"${String(m.id) === saved ? ' selected' : ''}>${m.name}</option>`)
      .join('');
  }

  function requestLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('المتصفح لا يدعم تحديد الموقع.')); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => {
          const msgs = {
            1: 'تم رفض إذن الموقع. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.',
            2: 'تعذّر تحديد الموقع حالياً.',
            3: 'انتهت مهلة تحديد الموقع.',
          };
          reject(new Error(msgs[err.code] || 'تعذّر تحديد الموقع.'));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  async function fetchTimings(lat, lng, method, forDate) {
    const d = forDate || new Date();
    const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    // `school` selects the Asr madhab: 0 = Shafi'i/Maliki/Hanbali, 1 = Hanafi.
    // This alone shifts Asr by about an hour, so it must be user-selectable.
    const school = el('asrSchool').value;
    // Deliberately no `timezonestring`: the API derives the zone from the
    // coordinates, which is always self-consistent. Forcing the device zone shifts
    // every time by the offset difference whenever the two disagree.
    const url = `https://api.aladhan.com/v1/timings/${dateStr}`
      + `?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('تعذّر جلب مواقيت الصلاة.');
    const json = await res.json();
    if (json.code !== 200) throw new Error('تعذّر جلب مواقيت الصلاة.');
    return json.data;
  }

  /** Per-prayer manual correction in minutes, to match a specific local mosque. */
  function tuneFor(key) {
    try {
      const t = JSON.parse(localStorage.getItem('worship:tune')) || {};
      return +t[key] || 0;
    } catch (e) { return 0; }
  }
  function setTune(key, minutes) {
    let t = {};
    try { t = JSON.parse(localStorage.getItem('worship:tune')) || {}; } catch (e) { /* fresh */ }
    t[key] = minutes;
    localStorage.setItem('worship:tune', JSON.stringify(t));
  }
  function applyTune(hhmm, key) {
    const adj = tuneFor(key);
    if (!adj) return hhmm;
    const [h, m] = hhmm.split(':').map(Number);
    let total = (h * 60 + m + adj + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  /** Minutes from now until a "HH:MM" time today, rolling past times to tomorrow. */
  function minutesUntil(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const now = new Date();
    const t = new Date(now); t.setHours(h, m, 0, 0);
    let diff = Math.round((t - now) / 60000);
    if (diff < 0) diff += 24 * 60;
    return diff;
  }

  function renderTimings(data) {
    const order = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    // Apply any manual per-prayer correction before anything else reads the times.
    const t = {};
    order.forEach(k => { t[k] = applyTune(data.timings[k].slice(0, 5), k); });

    // Only the five obligatory prayers count for "next prayer"; sunrise is not one.
    const prayerOnly = order.filter(k => k !== 'Sunrise');
    let nextKey = null, best = Infinity;
    for (const k of prayerOnly) {
      const mins = minutesUntil(t[k]);
      if (mins < best) { best = mins; nextKey = k; }
    }
    const hrs = Math.floor(best / 60), mins = best % 60;

    el('prayerTimes').innerHTML = order.map(k => {
      const adj = tuneFor(k);
      return `<div class="prayer-row${k === nextKey ? ' next' : ''}">
                <span class="prayer-name">${PRAYER_LABELS[k]}</span>
                <span class="prayer-adjust">
                  <button class="tune-btn" data-k="${k}" data-d="-1" title="أبكر دقيقة">−</button>
                  <span class="tune-val">${adj ? (adj > 0 ? '+' : '') + adj : ''}</span>
                  <button class="tune-btn" data-k="${k}" data-d="1" title="أمتأخر دقيقة">+</button>
                </span>
                <span class="prayer-time">${t[k]}</span>
              </div>`;
    }).join('');

    el('prayerTimes').querySelectorAll('.tune-btn').forEach(b =>
      b.addEventListener('click', () => {
        setTune(b.dataset.k, tuneFor(b.dataset.k) + (+b.dataset.d));
        renderTimings(data);
        Alerts.setTimings(currentTimings());
      }));

    const h = data.date.hijri;
    el('hijriDate').textContent = `${h.day} ${h.month.ar} ${h.year} هـ`;
    el('nextPrayer').textContent =
      `الصلاة القادمة: ${PRAYER_LABELS[nextKey]} — بعد ${hrs ? hrs + ' ساعة و' : ''}${mins} دقيقة`;
    // Show what the times were actually computed from, so a mismatch with the
    // local mosque is diagnosable rather than mysterious.
    el('calcInfo').textContent =
      `المنطقة الزمنية: ${data.meta.timezone} · الطريقة: ${data.meta.method.name}`
      + ` · العصر: ${el('asrSchool').selectedOptions[0].textContent}`;

    lastTimings = t;
    Alerts.setTimings(t);
    // Keep today's tuned times around so the native alarm scheduler can still
    // run when the app is next opened with no internet connection.
    try {
      localStorage.setItem('worship:lastTimings',
        JSON.stringify({ date: new Date().toDateString(), t }));
    } catch (e) { /* quota */ }
    syncSettingsToHost();
  }

  let lastTimings = null;
  const currentTimings = () => lastTimings;

  /** Restore today's previously fetched times (offline startup) for the alarm scheduler. */
  function reuseCachedTimings() {
    try {
      const raw = JSON.parse(localStorage.getItem('worship:lastTimings'));
      if (raw && raw.date === new Date().toDateString() && raw.t) {
        lastTimings = raw.t;
        Alerts.setTimings(raw.t);
      }
    } catch (e) { /* none cached */ }
  }

  /*
   * Mirror the settings the background reminder service needs into the desktop
   * host process. localStorage lives inside WebView2 and Python cannot read it,
   * so the desktop build exposes a POST endpoint that writes them to disk. This
   * is a no-op everywhere else (the endpoint simply will not exist).
   */
  function syncSettingsToHost() {
    let alerts = {};
    let tune = {};
    try { alerts = JSON.parse(localStorage.getItem('alerts:prefs')) || {}; } catch (e) { /* defaults */ }
    try { tune = JSON.parse(localStorage.getItem('worship:tune')) || {}; } catch (e) { /* defaults */ }

    const payload = {
      coords,
      method: localStorage.getItem('worship:method') || defaultMethodForDevice(),
      school: localStorage.getItem('worship:school') || '0',
      tune,
      alerts,
    };
    fetch('/__settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* not the desktop build - nothing listening */ });
  }

  /**
   * Tuned prayer times for an arbitrary future date, using the same coordinates,
   * calculation method and manual per-prayer corrections as the live display.
   * Used by NativeAlerts to schedule a multi-day window of exact alarms ahead of
   * time, rather than just "today".
   */
  async function fetchTimingsForDate(dateObj) {
    if (!coords) {
      try { coords = JSON.parse(localStorage.getItem('worship:coords')); } catch (e) { /* none */ }
    }
    if (!coords) return null;
    const method = localStorage.getItem('worship:method') || defaultMethodForDevice();
    const data = await fetchTimings(coords.lat, coords.lng, method, dateObj);
    const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const t = {};
    order.forEach(k => { t[k] = applyTune(data.timings[k].slice(0, 5), k); });
    return t;
  }

  function renderQibla() {
    el('qiblaAngle').textContent = `اتجاه القبلة: ${qiblaBearing.toFixed(1)}° من الشمال الحقيقي`;
    rotateNeedle(0);
    el('compassHint').textContent =
      'وجّه أعلى الجهاز نحو الشمال، ثم اتبع السهم. لدقة أعلى على الهاتف فعّل البوصلة أدناه.';
  }

  function rotateNeedle(deviceHeading) {
    // The needle shows where the Kaaba is relative to the direction the phone faces.
    const rot = (qiblaBearing - deviceHeading + 360) % 360;
    el('qiblaNeedle').style.transform = `rotate(${rot}deg)`;
  }

  /** iOS needs an explicit permission call from a user gesture for the compass. */
  async function enableCompass() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== 'granted') { setInfo('لم يُسمح باستخدام البوصلة.', true); return; }
      }
      if (headingHandler) window.removeEventListener('deviceorientationabsolute', headingHandler);
      headingHandler = (e) => {
        // iOS exposes a true-north heading directly; elsewhere alpha is counter-clockwise.
        const heading = (typeof e.webkitCompassHeading === 'number')
          ? e.webkitCompassHeading
          : (e.alpha != null ? 360 - e.alpha : null);
        if (heading != null && qiblaBearing != null) rotateNeedle(heading);
      };
      window.addEventListener('deviceorientationabsolute', headingHandler, true);
      window.addEventListener('deviceorientation', headingHandler, true);
      el('compassHint').textContent = 'البوصلة مفعّلة — أدر الجهاز حتى يشير السهم للأعلى.';
    } catch (err) {
      setInfo('تعذّر تفعيل البوصلة على هذا الجهاز.', true);
    }
  }

  async function locate() {
    try {
      setInfo('جارٍ تحديد موقعك...');
      coords = await requestLocation();
      localStorage.setItem('worship:coords', JSON.stringify(coords));
      await refresh();
    } catch (err) {
      setInfo(err.message, true);
      throw err;   // let callers (e.g. Alerts enabling) know it failed
    }
  }

  /*
   * Location fetch for callers other than the "تحديد موقعي" button - chiefly
   * turning alerts on, which needs coordinates even if the reader never opened
   * the qibla tab. Still only called from a user gesture (the enable-alerts
   * click), so prompting for permission here is expected, not a surprise; the
   * one thing it skips is re-prompting after an earlier explicit "block".
   */
  async function ensureLocation() {
    if (coords || localStorage.getItem('worship:coords')) return true;
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state === 'denied') return false;
      }
      await locate();
      return true;
    } catch (err) {
      return false;
    }
  }

  async function refresh() {
    if (!coords) {
      try { coords = JSON.parse(localStorage.getItem('worship:coords')); } catch (e) { /* none */ }
    }
    if (!coords) { setInfo('اضغط "تحديد موقعي" أولاً.'); return; }

    const method = el('calcMethod').value;
    localStorage.setItem('worship:method', method);

    qiblaBearing = computeQiblaBearing(coords.lat, coords.lng);
    renderQibla();

    setInfo(`الموقع: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    try {
      const data = await fetchTimings(coords.lat, coords.lng, method);
      renderTimings(data);
    } catch (err) {
      setInfo('تم حساب القبلة، لكن تعذّر جلب المواقيت (تحقق من الاتصال).', true);
    }
  }

  function init() {
    populateMethods();
    el('asrSchool').value = localStorage.getItem('worship:school') || '0';
    el('btnLocate').addEventListener('click', locate);
    el('btnCompass').addEventListener('click', enableCompass);
    el('calcMethod').addEventListener('change', () => refresh().catch(() => {}));
    el('asrSchool').addEventListener('change', () => {
      localStorage.setItem('worship:school', el('asrSchool').value);
      refresh().catch(() => {});
    });
    el('btnResetTune').addEventListener('click', () => {
      localStorage.removeItem('worship:tune');
      refresh().catch(() => {});
    });
    // Reuse a previously granted location without prompting again. If the
    // refetch fails (offline), fall back to today's cached times so the native
    // prayer alarms still get scheduled instead of silently not existing.
    if (localStorage.getItem('worship:coords')) {
      refresh().catch(() => {}).finally(() => { if (!lastTimings) reuseCachedTimings(); });
    }

    // A session left open across midnight (the desktop app, a pinned tab) would
    // otherwise keep announcing yesterday's times forever - recheck the date
    // periodically and refetch once it rolls over.
    let lastDate = new Date().toDateString();
    setInterval(() => {
      const today = new Date().toDateString();
      if (today !== lastDate) {
        lastDate = today;
        if (coords || localStorage.getItem('worship:coords')) refresh().catch(() => {});
      }
    }, 5 * 60 * 1000);
  }

  return {
    init, locate, ensureLocation, fetchTimingsForDate, syncSettingsToHost,
    get hasCoords() { return !!(coords || localStorage.getItem('worship:coords')); },
  };
})();
