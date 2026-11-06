import { chmod, constants, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, slugify } from './files.js';

/**
 * Um "job" é a pasta de trabalho de UM vídeo:  workspace/<job-id>/
 *   job.json        -> ficha do vídeo (quem é, onde está o backup, em que etapa está)
 *   analysis/       -> análises numeradas (analysis.v001.json, v002...)
 *   (futuro) transcript/, plan/, render/, approval/
 *
 * O job-id = nome do arquivo + 8 letras do SHA-256. Mesmo vídeo = mesmo job.
 * Vídeo diferente com o mesmo nome = job diferente (nada é misturado).
 */
export async function prepareJob(videoPath, config) {
  const info = await stat(videoPath);
  const sha256 = await sha256File(videoPath);
  const name = path.basename(videoPath);
  const jobId = `${slugify(path.parse(name).name)}-${sha256.slice(0, 8)}`;
  const jobDir = path.join(config.dirs.workspace, jobId);
  await mkdir(jobDir, { recursive: true });

  const backupPath = config.backup ? await ensureBackup(videoPath, jobId, sha256, config) : null;

  const jobFile = path.join(jobDir, 'job.json');
  let job;
  try {
    job = JSON.parse(await readFile(jobFile, 'utf8'));
  } catch {
    job = {
      jobId,
      createdAt: new Date().toISOString(),
      source: { fileName: name, sizeBytes: info.size, sha256 },
      backupPath,
      stages: {},
    };
  }
  job.source.originalPath = path.resolve(videoPath);
  job.backupPath = backupPath ?? job.backupPath ?? null;
  return { job, jobDir, jobFile, sha256 };
}

/** Atualiza a ficha do job marcando uma etapa como feita. */
export async function markStage(jobFile, job, stage, details = {}) {
  job.stages[stage] = { doneAt: new Date().toISOString(), ...details };
  job.updatedAt = new Date().toISOString();
  await writeFile(jobFile, JSON.stringify(job, null, 2) + '\n');
}

/**
 * Cópia de segurança do original em backup/<job-id>/original.<ext>, somente leitura.
 * Tenta "clonar" o arquivo (instantâneo e sem gastar espaço em sistemas que suportam).
 * Se o backup já existe, não mexe nele.
 */
async function ensureBackup(videoPath, jobId, sha256, config) {
  const dir = path.join(config.dirs.backup, jobId);
  const dest = path.join(dir, `original${path.extname(videoPath).toLowerCase()}`);
  await mkdir(dir, { recursive: true });
  try {
    await copyFile(videoPath, dest, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    await chmod(dest, 0o444);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    // Já existe: confere se é o mesmo conteúdo, para nunca confiar num backup errado.
    if ((await sha256File(dest)) !== sha256) {
      throw new Error(`O backup ${dest} existe mas é diferente do vídeo. Não vou sobrescrever. Verifique manualmente.`);
    }
  }
  return dest;
}
