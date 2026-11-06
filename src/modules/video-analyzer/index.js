import path from 'node:path';
import { toolVersion } from '../../core/ffmpeg.js';
import { probeVideo } from './probe.js';
import { analyzeAudio } from './audio.js';
import { detectScenes } from './scenes.js';
import { formatFit } from './formats.js';

export const ANALYSIS_SCHEMA = 'luvi.video-analysis/1';

/**
 * Módulo video-analyzer.
 * ENTRADA: caminho de um vídeo. SAÍDA: um objeto JSON com tudo que descobrimos.
 * Este módulo só LÊ o vídeo. Não grava nada (quem grava é o cli/jobs).
 */
export async function analyzeVideo(videoPath, { analysis, scenes = false }) {
  const warnings = [];
  const probe = await probeVideo(videoPath);

  if (probe.durationSec === null || probe.durationSec <= 0) {
    throw new Error('Não consegui descobrir a duração do vídeo.');
  }

  let audio = null;
  if (probe.audio) {
    audio = await analyzeAudio(videoPath, probe.durationSec, analysis);
    if (audio.volume.maxDb !== null && audio.volume.maxDb <= -60) {
      warnings.push('O áudio está praticamente mudo. A transcrição provavelmente não vai funcionar.');
    }
    if (audio.volume.maxDb !== null && audio.volume.maxDb >= -0.5) {
      warnings.push('O áudio chega no limite máximo (pode estar estourado/distorcido).');
    }
    if (audio.totals.silencePercent >= 60) {
      warnings.push(`Mais de ${Math.round(audio.totals.silencePercent)}% do vídeo está em silêncio. Vale conferir se o áudio gravou direito.`);
    }
  } else {
    warnings.push('Este vídeo não tem áudio. Não dá para transcrever nem cortar por pausas.');
  }

  const sceneInfo = scenes ? await detectScenes(videoPath, analysis.sceneThreshold) : null;

  if (probe.video.height < 720) warnings.push(`Resolução baixa (${probe.video.width}x${probe.video.height}). A qualidade final pode ficar limitada.`);
  if (probe.video.rotation) warnings.push(`O vídeo tem rotação de ${probe.video.rotation}° gravada no arquivo. O tamanho considerado já é o que aparece na tela.`);
  if (probe.durationSec > 15 * 60) warnings.push('Vídeo longo (mais de 15 min). Transcrição e renderização vão demorar.');

  return {
    schema: ANALYSIS_SCHEMA,
    analyzedAt: new Date().toISOString(),
    tools: { ffmpeg: await toolVersion('ffmpeg'), node: process.version },
    source: { fileName: path.basename(videoPath) },
    probe,
    audio,
    scenes: sceneInfo,
    formatFit: formatFit(probe.video.width, probe.video.height),
    warnings,
  };
}
