import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let count = 0;
async function check(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
    if (entry.isDirectory()) await check(url);
    else if (/\.m?js$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(url)], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
      count++;
    }
  }
}
for (const dir of ['src', 'scripts', 'tests']) await check(new URL(`../${dir}/`, import.meta.url));
console.log(`${count} fichiers JavaScript : syntaxe valide.`);
