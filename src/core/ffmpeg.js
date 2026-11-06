import { spawn } from 'node:child_process';

/**
 * Roda um programa SEM passar pelo shell (nomes de arquivo com espaço/aspas são seguros).
 * Nunca lança erro por código de saída diferente de 0: devolve { code, stdout, stderr }.
 */
export function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Programa "${cmd}" não encontrado. Instale o FFmpeg (veja o README).`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Roda o ffmpeg e falha com mensagem clara se der erro. */
export async function ffmpeg(args) {
  const res = await run('ffmpeg', ['-hide_banner', '-nostats', '-nostdin', ...args]);
  if (res.code !== 0) {
    throw new Error(`ffmpeg falhou (código ${res.code}):\n${res.stderr.split('\n').slice(-8).join('\n')}`);
  }
  return res;
}

/** Roda o ffprobe e devolve o JSON já convertido. */
export async function ffprobeJson(file) {
  const res = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  if (res.code !== 0) {
    throw new Error(`Não consegui ler o vídeo "${file}". Ele pode estar corrompido.\n${res.stderr.trim()}`);
  }
  return JSON.parse(res.stdout);
}

/** Primeira linha de "<programa> -version", ou null se não existir. */
export async function toolVersion(cmd, versionArg = '-version') {
  try {
    const res = await run(cmd, [versionArg]);
    if (res.code !== 0) return null;
    return (res.stdout || res.stderr).split('\n')[0].trim();
  } catch {
    return null;
  }
}
