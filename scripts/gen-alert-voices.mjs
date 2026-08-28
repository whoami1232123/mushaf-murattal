/**
 * Generates the male Arabic voice MP3s for prayer/adhkar alerts using the
 * free Microsoft Edge neural TTS endpoint. Run once (needs internet):
 *   node scripts/gen-alert-voices.mjs
 * Outputs to assets/audio/alerts/ — the two *_alert clips are also copied into
 * android/app/src/main/res/raw/ so Android notifications carry a real voice
 * even when the app is closed.
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'audio', 'alerts');
await mkdir(outDir, { recursive: true });

const VOICE = 'ar-SA-HamedNeural'; // natural male Saudi Arabic voice

const PHRASES = {
  fajr:    'حان الآن موعد صلاة الفجر',
  dhuhr:   'حان الآن موعد صلاة الظهر',
  asr:     'حان الآن موعد صلاة العصر',
  maghrib: 'حان الآن موعد صلاة المغرب',
  isha:    'حان الآن موعد صلاة العشاء',
  morning: 'حان وقت أذكار الصباح',
  evening: 'حان وقت أذكار المساء',
  sleep:   'حان وقت أذكار النوم',
  test:    'تجربة التنبيه',
  enabled: 'تم تفعيل التنبيهات، ستصلك تنبيهات الصلاة والأذكار',
  salah_alert: 'تنبيه، حان وقت الصلاة',
  adhkar_alert: 'تنبيه، حان وقت الأذكار',
};

async function synth(tts, text, outFile) {
  // msedge-tts v2: toStream resolves to a readable of MP3 bytes; toFile would
  // treat our path as a directory, so collect chunks ourselves.
  const { audioStream } = await tts.toStream(text, { rate: '-8%' });
  const chunks = [];
  for await (const c of audioStream) chunks.push(c);
  await writeFile(outFile, Buffer.concat(chunks));
}

const tts = new MsEdgeTTS();
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

for (const [name, text] of Object.entries(PHRASES)) {
  const file = join(outDir, `${name}.mp3`);
  await synth(tts, text, file);
  console.log(`+ ${name}.mp3`);
}

// Channel sounds for closed-app Android notifications.
const rawDir = join(root, 'android', 'app', 'src', 'main', 'res', 'raw');
await mkdir(rawDir, { recursive: true });
for (const name of ['salah_alert', 'adhkar_alert']) {
  await copyFile(join(outDir, `${name}.mp3`), join(rawDir, `${name}.mp3`));
  console.log(`+ res/raw/${name}.mp3`);
}
console.log('\nDone.');
