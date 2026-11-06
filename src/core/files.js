import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** Lista os vídeos de uma pasta (só o primeiro nível), em ordem alfabética. */
export async function listVideos(dir, extensions) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const allowed = new Set(extensions.map((e) => e.toLowerCase()));
  return entries
    .filter((e) => e.isFile() && allowed.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b));
}

/** SHA-256 do arquivo (lido aos poucos, não carrega o vídeo inteiro na memória). */
export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** "Vídeo do Cliente Açaí.MOV" -> "video-do-cliente-acai" */
export function slugify(text) {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'video';
}
