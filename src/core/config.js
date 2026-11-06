import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lê config/default.json e transforma as pastas em caminhos absolutos. */
export async function loadConfig(root = PROJECT_ROOT) {
  const raw = JSON.parse(await readFile(path.join(root, 'config', 'default.json'), 'utf8'));
  const dirs = {};
  for (const [name, rel] of Object.entries(raw.dirs)) dirs[name] = path.resolve(root, rel);
  return { ...raw, dirs, root };
}
