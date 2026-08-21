/**
 * Copies the web assets into www/, which is what Capacitor bundles into the
 * Android and iOS apps. Run before `cap sync`.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

const ASSETS = ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'icons'];

await rm(www, { recursive: true, force: true });
await mkdir(www, { recursive: true });

for (const item of ASSETS) {
  const src = join(root, item);
  if (!existsSync(src)) { console.warn(`  ! missing, skipped: ${item}`); continue; }
  await cp(src, join(www, item), { recursive: true });
  console.log(`  + ${item}`);
}
console.log(`\nwww/ ready at ${www}`);
