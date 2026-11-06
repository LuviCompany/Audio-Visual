import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pad = (n) => String(n).padStart(3, '0');

/** Descobre o maior número de versão já existente (ex.: analysis.v003.json -> 3). */
export async function highestVersion(dir, base, ext) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.v(\\d+)\\.${ext}$`);
  let max = 0;
  for (const name of names) {
    const m = name.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Grava um arquivo NOVO com número de versão (base.v001.ext, base.v002.ext...).
 * Usa a flag "wx": se o arquivo já existir, NUNCA sobrescreve, tenta o próximo número.
 */
export async function writeNewVersion(dir, base, content, ext = 'json') {
  await mkdir(dir, { recursive: true });
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n';
  for (let v = (await highestVersion(dir, base, ext)) + 1; ; v++) {
    const file = path.join(dir, `${base}.v${pad(v)}.${ext}`);
    try {
      await writeFile(file, text, { flag: 'wx' });
      return { path: file, version: v };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}
