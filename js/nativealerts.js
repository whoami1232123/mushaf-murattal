/*
 * Real background prayer/adhkar alerts on Android, using @capacitor/local-notifications.
 *
 * The JS-timer approach in alerts.js only fires while a page is open and visible -
 * mobile OSes throttle or kill JS the moment the app is backgrounded or closed.
 * The fix is not "run JS in the background" (there is no reliable way to do that
 * on Android without a foreground service showing a persistent notification,
 * which is the wrong UX for this). The correct mechanism, used by every prayer
 * app on the Play Store, is to hand exact future fire-times to the OS via
 * AlarmManager (what this plugin wraps) - Android itself wakes the app briefly
 * to show the notification, with no JS execution required in between.
 *
 * Scope/honest limitation: notifications are scheduled for a rolling N-day
 * window, refreshed each time the app is opened. As long as the app is opened
 * at least once every N days it behaves as "always on"; a永-forever schedule
 * with the app never reopened would need a native periodic background job
 * (WorkManager), which is a further native-code addition beyond this scope.
 */
const NativeAlerts = (() => {
  const DAYS_AHEAD = 7;
  const CHANNEL_ID = 'prayer-adhkar';

  const PRAYER_LABELS = {
    Fajr: 'صلاة الفجر', Dhuhr: 'صلاة الظهر', Asr: 'صلاة العصر',
    Maghrib: 'صلاة المغرب', Isha: 'صلاة العشاء',
  };
  const ADHKAR_AFTER = {
    Fajr: { label: 'أذكار الصباح', offsetMin: 20 },
    Asr:  { label: 'أذكار المساء', offsetMin: 20 },
    Isha: { label: 'أذكار النوم',  offsetMin: 90 },
  };

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function plugin() {
    return window.Capacitor.Plugins.LocalNotifications;
  }

  /** Deterministic 32-bit id from a date + event key, so rescheduling is idempotent. */
  function idFor(dateStr, key) {
    let hash = 0;
    const s = dateStr + ':' + key;
    for (let i = 0; i < s.length; i++) { hash = (hash * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(hash) || 1;
  }

  async function ensureChannel() {
    try {
      await plugin().createChannel({
        id: CHANNEL_ID, name: 'الصلاة والأذكار',
        description: 'تنبيهات مواقيت الصلاة والأذكار', importance: 5, visibility: 1,
      });
    } catch (err) { /* channel may already exist */ }
  }

  /** Returns true if exact-alarm permission is already granted (no redirect). */
  async function _hasExactAlarm() {
    try {
      const res = await plugin().checkExactNotificationSetting();
      return res.exact_alarm === 'granted';
    } catch (err) {
      return false; // API not available on this Android version — treat as granted
    }
  }

  async function ensurePermissions() {
    const perm = await plugin().checkPermissions();
    if (perm.display !== 'granted') {
      const req = await plugin().requestPermissions();
      if (req.display !== 'granted') return { granted: false, exact: false };
    }
    const exact = await _hasExactAlarm();
    // Do NOT redirect to settings here — that would interrupt the user flow.
    // scheduleUpcoming will use allowWhileIdle only when exact alarms are available.
    return { granted: true, exact };
  }

  function minutesToDate(baseDate, hhmm, offsetMin = 0) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m + offsetMin, 0, 0);
    return d;
  }

  /**
   * fetchDay(dateObj) must resolve to { Fajr:'HH:MM', Dhuhr:'HH:MM', ... } for
   * that calendar date - the caller (alerts.js) already knows how to ask
   * Aladhan for a specific date and apply the user's manual per-prayer tuning.
   */
  async function scheduleUpcoming(fetchDay, prefs) {
    if (!isNative()) return { scheduled: false, reason: 'not-native' };
    const { granted, exact } = await ensurePermissions();
    if (!granted) return { scheduled: false, reason: 'permission-denied' };
    await ensureChannel();

    // Clear out everything we previously scheduled before laying down a fresh
    // window - simplest way to stay correct after a tuning change, a location
    // change, or just the rolling window advancing by a day.
    const pending = await plugin().getPending();
    const ours = pending.notifications.filter(n => n.id >= 1 && n.id <= 2147483647);
    if (ours.length) await plugin().cancel({ notifications: ours.map(n => ({ id: n.id })) });

    const notifications = [];
    const now = new Date();
    let daysScheduled = 0;
    for (let dayOffset = 0; dayOffset < DAYS_AHEAD; dayOffset++) {
      const day = new Date(now);
      day.setDate(day.getDate() + dayOffset);
      const dateKey = day.toDateString();
      // One flaky request must not abort the whole week: skip the failed day
      // and keep scheduling the rest.
      let timings = null;
      try { timings = await fetchDay(day); } catch (err) { continue; }
      if (!timings) continue;
      daysScheduled++;

      if (prefs.prayers !== false) {
        for (const key in PRAYER_LABELS) {
          if (!timings[key]) continue;
          const at = minutesToDate(day, timings[key]);
          if (at <= now) continue;   // do not schedule times already past today
          notifications.push({
            id: idFor(dateKey, 'p:' + key),
            title: `حان الآن موعد ${PRAYER_LABELS[key]}`,
            body: timings[key],
            channelId: CHANNEL_ID,
            // allowWhileIdle fires even in Doze mode but needs SCHEDULE_EXACT_ALARM
            // on Android 12 (API 31-32). Fall back to inexact if not granted — the
            // notification may arrive a few minutes late but will always fire.
            schedule: { at, allowWhileIdle: exact },
          });
        }
      }
      if (prefs.adhkar !== false) {
        for (const key in ADHKAR_AFTER) {
          if (!timings[key]) continue;
          const a = ADHKAR_AFTER[key];
          const at = minutesToDate(day, timings[key], a.offsetMin);
          if (at <= now) continue;
          notifications.push({
            id: idFor(dateKey, 'a:' + key),
            title: `حان وقت ${a.label}`,
            body: 'اضغط لفتح الأذكار',
            channelId: CHANNEL_ID,
            schedule: { at, allowWhileIdle: exact },
          });
        }
      }
    }

    if (notifications.length) await plugin().schedule({ notifications });
    return { scheduled: true, count: notifications.length, days: daysScheduled };
  }

  return { isNative, scheduleUpcoming };
})();
