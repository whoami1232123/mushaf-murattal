/* alquran.cloud REST client with a simple in-memory + localStorage cache. */
const QURAN_API = 'https://api.alquran.cloud/v1';
const AUDIO_BASE = 'https://cdn.islamic.network/quran/audio';
const EVERYAYAH_BASE = 'https://everyayah.com/data';
const AUDIO_BITRATE = 128;

const TOTAL_PAGES = 604;
const TOTAL_JUZ = 30;
const TOTAL_HIZB_QUARTERS = 240;
const TOTAL_AYAHS = 6236;
const SEARCH_RESULT_LIMIT = 60;

/* Reciters. Two hosts with different URL schemes:
 *  - 'cdn'  : cdn.islamic.network, addressed by global ayah number (1-6236).
 *  - 'everyayah' : everyayah.com, addressed by surah + ayah-in-surah.
 * Every entry below was verified to return HTTP 200 before being listed. */
const RECITERS = [
  { id: 'ar.alafasy',        host: 'cdn', name: 'مشاري العفاسي' },
  { id: 'ar.husary',         host: 'cdn', name: 'محمود خليل الحصري' },
  { id: 'ar.husarymujawwad', host: 'cdn', name: 'الحصري (المجوّد)' },
  { id: 'ar.minshawi',       host: 'cdn', name: 'محمد صديق المنشاوي' },
  { id: 'ar.mahermuaiqly',   host: 'cdn', name: 'ماهر المعيقلي' },
  { id: 'ar.ahmedajamy',     host: 'cdn', name: 'أحمد العجمي' },
  { id: 'ar.shaatree',       host: 'cdn', name: 'أبو بكر الشاطري' },
  { id: 'ar.hudhaify',       host: 'cdn', name: 'علي الحذيفي' },
  { id: 'ar.muhammadjibreel',host: 'cdn', name: 'محمد جبريل' },
  { id: 'ar.muhammadayyoub', host: 'cdn', name: 'محمد أيوب' },
  // Slow "repeat after me" teaching recitation - the classic choice for children.
  { id: 'Husary_Muallim_128kbps', host: 'everyayah', name: '👶 الحصري المعلّم (للأطفال والتعليم)' },
  { id: 'Minshawy_Murattal_128kbps', host: 'everyayah', name: 'المنشاوي (مرتّل)' },
];

const TAFSIR_EDITIONS = [
  { id: 'ar.muyassar', name: 'التفسير الميسّر' },
  { id: 'ar.jalalayn', name: 'تفسير الجلالين' },
  { id: 'ar.baghawi',  name: 'تفسير البغوي' },
  { id: 'ar.qurtubi',  name: 'تفسير القرطبي' },
  { id: 'ar.waseet',   name: 'التفسير الوسيط' },
];

const CACHE_PREFIX = 'qapi:';
const _memCache = new Map();

/** Currently selected reciter id, persisted so it survives reloads. */
function getReciter() {
  return localStorage.getItem('quran:reciter') || 'ar.alafasy';
}
function setReciter(id) {
  localStorage.setItem('quran:reciter', id);
}

async function apiGet(path) {
  if (_memCache.has(path)) return _memCache.get(path);
  const cacheKey = CACHE_PREFIX + path;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      _memCache.set(path, parsed);
      return parsed;
    }
  } catch (e) { /* ignore storage errors */ }

  // A network failure rejects fetch outright, so it never reaches the !res.ok
  // check below - without this the browser's English "Failed to fetch" would be
  // shown to the reader instead of an Arabic message.
  let res;
  try {
    res = await fetch(QURAN_API + path);
  } catch (err) {
    throw new Error('لا يوجد اتصال بالإنترنت، وهذا المحتوى غير محفوظ في الكاش.');
  }
  if (!res.ok) throw new Error('تعذّر جلب المحتوى من الخادم.');
  const json = await res.json();
  if (json.code !== 200) throw new Error('تعذّر جلب المحتوى من الخادم.');
  _memCache.set(path, json.data);
  try { localStorage.setItem(cacheKey, JSON.stringify(json.data)); } catch (e) { /* quota */ }
  return json.data;
}

function fetchSurahList() {
  return apiGet('/surah');
}

function fetchPage(pageNum) {
  return apiGet(`/page/${pageNum}/quran-tajweed`);
}

async function fetchSurah(surahNum) {
  const data = await apiGet(`/surah/${surahNum}/quran-tajweed`);
  // Unlike /page, /juz and /hizbQuarter, the /surah endpoint omits a per-ayah
  // `surah` object (it's redundant with the top-level fields), so normalize it in.
  if (data.ayahs.length && !data.ayahs[0].surah) {
    const surahMeta = {
      number: data.number, name: data.name, englishName: data.englishName,
      englishNameTranslation: data.englishNameTranslation, numberOfAyahs: data.numberOfAyahs,
      revelationType: data.revelationType,
    };
    data.ayahs = data.ayahs.map(a => ({ ...a, surah: surahMeta }));
  }
  return data;
}

function fetchJuz(juzNum) {
  return apiGet(`/juz/${juzNum}/quran-tajweed`);
}

function fetchHizb(hizbNum) {
  return apiGet(`/hizbQuarter/${hizbNum}/quran-tajweed`);
}

/** One ayah with its tajweed markup and location metadata (page, juz...). */
function fetchAyah(globalAyahNumber) {
  return apiGet(`/ayah/${globalAyahNumber}/quran-tajweed`);
}

/*
 * Full-text search over the Quran.
 *
 * Uses the `quran-simple` edition specifically: searching `all/ar` also matches
 * the tafsir editions, which returns commentary text rather than Quran verses.
 * The endpoint already normalizes Arabic (alef and hamza variants match), so an
 * unvocalized query finds vocalized text.
 */
const _searchCache = new Map();

async function searchQuranText(query) {
  const q = query.trim();
  if (!q) return { total: 0, matches: [] };
  if (_searchCache.has(q)) return _searchCache.get(q);

  let res;
  try {
    res = await fetch(`${QURAN_API}/search/${encodeURIComponent(q)}/all/quran-simple`);
  } catch (err) {
    throw new Error('البحث يحتاج اتصالاً بالإنترنت.');
  }
  // The API answers 404 when nothing matched; that is an empty result, not a failure.
  if (res.status === 404) {
    const empty = { total: 0, matches: [] };
    _searchCache.set(q, empty);
    return empty;
  }
  if (!res.ok) throw new Error('تعذّر تنفيذ البحث، تحقّق من الاتصال.');
  const json = await res.json();
  const all = json.data.matches || [];
  const out = {
    total: json.data.count ?? all.length,
    // A common word matches ~1900 ayahs; keep the rendered list bounded. Results are
    // held in memory only - writing them to localStorage would exhaust the quota.
    matches: all.slice(0, SEARCH_RESULT_LIMIT).map(m => ({
      number: m.number,
      numberInSurah: m.numberInSurah,
      surah: m.surah,
      text: m.text,
    })),
  };
  _searchCache.set(q, out);
  return out;
}

/** Tafsir text for one ayah, addressed by global ayah number. */
async function fetchTafsir(globalAyahNumber, editionId) {
  const data = await apiGet(`/ayah/${globalAyahNumber}/${editionId}`);
  return data.text;
}

/** Is the device online right now? Used to phrase failures helpfully. */
function isOffline() {
  return typeof navigator.onLine === 'boolean' && !navigator.onLine;
}

/** Audio URL for an ayah, honouring the selected reciter's host scheme. */
function audioUrlForAyah(globalAyahNumber, surahNum, ayahInSurah) {
  const reciterId = getReciter();
  const reciter = RECITERS.find(r => r.id === reciterId) || RECITERS[0];
  if (reciter.host === 'everyayah') {
    // everyayah.com is addressed by zero-padded surah + ayah, not global number.
    if (!surahNum || !ayahInSurah) return null;
    const s = String(surahNum).padStart(3, '0');
    const a = String(ayahInSurah).padStart(3, '0');
    return `${EVERYAYAH_BASE}/${reciter.id}/${s}${a}.mp3`;
  }
  return `${AUDIO_BASE}/${AUDIO_BITRATE}/${reciter.id}/${globalAyahNumber}.mp3`;
}

/** Slice a surah's ayahs to an inclusive numberInSurah range. */
async function fetchSurahRange(surahNum, fromAyah, toAyah) {
  const data = await fetchSurah(surahNum);
  const ayahs = data.ayahs.filter(a => a.numberInSurah >= fromAyah && a.numberInSurah <= toAyah);
  return { ...data, ayahs };
}

/**
 * Run async tasks with bounded concurrency. Firing 30+ requests at once gets
 * refused by the API ("Failed to fetch"), so batches are kept small.
 */
async function mapLimit(items, limit, fn, onProgress) {
  const results = new Array(items.length);
  let cursor = 0, done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

/** One retry with a short backoff, for transient network refusals. */
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Ayahs spanning an inclusive range of mushaf pages. */
async function fetchPageRange(fromPage, toPage) {
  const pages = [];
  for (let p = fromPage; p <= toPage; p++) pages.push(p);
  const results = await mapLimit(pages, 4, p => withRetry(() => fetchPage(p)));
  return results.flatMap(r => r.ayahs);
}

/** Every ayah in the Quran, loaded juz by juz with bounded concurrency. */
async function fetchWholeQuran(onProgress) {
  const juzNums = Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1);
  const results = await mapLimit(juzNums, 4, j => withRetry(() => fetchJuz(j)), onProgress);
  return results.flatMap(r => r.ayahs);
}

/* ---------- Cache management ---------- */

/** Approximate size of everything this app has cached in localStorage. */
function cacheStats() {
  let entries = 0, chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      entries++;
      chars += (localStorage.getItem(k) || '').length + k.length;
    }
  }
  // localStorage stores UTF-16, so bytes are roughly 2x the character count.
  return { entries, bytes: chars * 2 };
}

/** Drop cached Quran data (localStorage + in-memory + service worker runtime cache). */
async function clearCache() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
  _memCache.clear();

  let swCleared = 0;
  if ('caches' in window) {
    const names = await caches.keys();
    for (const n of names) {
      // Keep the app shell so the app still opens offline; only drop fetched data.
      if (n.includes('runtime')) { await caches.delete(n); swCleared++; }
    }
  }
  return { removed: keys.length, swCachesCleared: swCleared };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' بايت';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ك.بايت';
  return (bytes / (1024 * 1024)).toFixed(2) + ' م.بايت';
}
