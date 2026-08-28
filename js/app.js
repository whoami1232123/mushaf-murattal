/* App bootstrap: tab switching, settings, service worker, install prompt. */
(function initApp() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  Mushaf.init();
  Memorize.init();
  Quiz.init();
  Lessons.init();
  Adhkar.init();
  Worship.init();
  AyahActions.init();
  Search.init();
  Alerts.init();

  Mushaf.buildLegend('memLegend');

  // Tapping an ayah opens the listen/repeat/tafsir sheet in BOTH reading views.
  // In the memorize view the sheet is suppressed only while the hide-text drill is
  // on, because there taps are used to reveal the blurred ayah instead.
  // Both leaves of the spread, so an ayah on the left page is tappable too.
  AyahActions.bindContainer('mushafPage', () => Mushaf.currentAyahs);
  AyahActions.bindContainer('mushafPageLeft', () => Mushaf.currentAyahs);
  AyahActions.bindContainer('memPage', () => Memorize.loadedAyahs);

  initGlobalBar();
  registerServiceWorker();
  wireInstallPrompt();
  initFocusMode();
})();

/* Focus reading mode: on phones the menus start collapsed so the mushaf gets
   the whole screen; the chevron in the slim top bar pulls them back down.
   Desktop keeps everything visible but can still toggle. */
function initFocusMode() {
  const compact = () =>
    window.innerWidth < 768 || (window.NativeAlerts && NativeAlerts.isNative());
  if (compact()) document.body.classList.add('focus-on');

  document.getElementById('btnFocusToggle').addEventListener('click', () =>
    document.body.classList.toggle('focus-on'));

  // Picking something from a temporarily-expanded menu means "take me there",
  // not "I want to browse settings" - drop back into reading right away.
  const autoCollapse = () => { if (compact()) document.body.classList.add('focus-on'); };
  ['selSurah', 'selJuz', 'selHizb'].forEach(id =>
    document.getElementById(id).addEventListener('change', autoCollapse));
  document.getElementById('tab-mushaf').addEventListener('click', e => {
    if (e.target.closest('.search-jump, .search-hit')) autoCollapse();
  });
}

/* Reciter choice and cache control live in a bar that is visible on every tab,
   so there is no settings screen to go looking for. */
function initGlobalBar() {
  const sel = document.getElementById('reciterSelect');
  sel.innerHTML = RECITERS.map(r =>
    `<option value="${r.id}"${r.id === getReciter() ? ' selected' : ''}>${r.name}</option>`).join('');
  sel.addEventListener('change', () => {
    setReciter(sel.value);
    document.querySelector('.status-line').textContent =
      'تم تغيير القارئ إلى: ' + sel.selectedOptions[0].textContent;
  });

  const stat = document.getElementById('cacheStat');
  const refreshStat = () => {
    const { entries, bytes } = cacheStats();
    stat.textContent = `${entries} عنصر · ${formatBytes(bytes)}`;
  };
  refreshStat();
  // The figure goes stale as pages are browsed, so refresh it on tab changes too.
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', refreshStat));

  document.getElementById('btnCacheClear').addEventListener('click', async () => {
    const { removed } = await clearCache();
    refreshStat();
    document.querySelector('.status-line').textContent =
      `تم مسح الكاش (${removed} عنصر).`;
  });
}

/* Offline support. Service workers need a secure context, so this is a no-op when
   the page is opened straight off the filesystem via file:// . Never registered
   inside the Android/iOS app either: assets are already local there, and a worker
   only adds a stale-cache layer that survives APK updates. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  const native = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  if (native) {
    // An older build may have left a worker + caches inside the WebView; rip
    // them out so the bundled code is what actually runs from now on.
    navigator.serviceWorker.getRegistrations()
      .then(rs => Promise.all(rs.map(r => r.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
  });
}

/* Chrome/Edge fire beforeinstallprompt; show our own button and defer to it.
   Safari/iOS has no such event - those users install via Share > Add to Home Screen. */
function wireInstallPrompt() {
  const btn = document.getElementById('btnInstall');
  if (!btn) return;
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    btn.hidden = true;
  });
}
