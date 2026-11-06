import { ffmpeg } from '../../core/ffmpeg.js';

/** Lê o texto do filtro "showinfo" e devolve os instantes (em segundos) das trocas de cena. */
export function parseSceneLog(log) {
  const times = [];
  for (const m of log.matchAll(/pts_time:\s*(-?[\d.]+)/g)) times.push(Number(parseFloat(m[1]).toFixed(3)));
  return times;
}

/**
 * Acha os momentos em que a imagem muda muito (troca de câmera / corte seco).
 * Usa uma versão reduzida do vídeo (320px) só para ficar rápido. Não altera o arquivo.
 */
export async function detectScenes(file, threshold) {
  const { stderr } = await ffmpeg([
    '-i', file,
    '-an',
    '-vf', `scale=320:-2,select='gt(scene,${threshold})',showinfo`,
    '-f', 'null', '-',
  ]);
  return { threshold, cuts: parseSceneLog(stderr) };
}
