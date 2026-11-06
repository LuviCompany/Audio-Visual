import { ffmpeg } from '../../core/ffmpeg.js';

const round = (n) => Number(n.toFixed(3));

/** Lê o texto que o filtro "silencedetect" escreve e devolve a lista de silêncios. */
export function parseSilenceLog(log, totalDuration) {
  const silences = [];
  let openStart = null;
  for (const line of log.split('\n')) {
    let m = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (m) {
      openStart = Math.max(0, parseFloat(m[1]));
      continue;
    }
    m = line.match(/silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (m) {
      const end = parseFloat(m[1]);
      const start = openStart ?? Math.max(0, end - parseFloat(m[2]));
      silences.push({ start: round(start), end: round(end), duration: round(end - start) });
      openStart = null;
    }
  }
  // Silêncio que começou e o vídeo acabou antes de terminar
  if (openStart !== null && totalDuration > openStart) {
    silences.push({ start: round(openStart), end: round(totalDuration), duration: round(totalDuration - openStart) });
  }
  return silences;
}

/** Lê o resultado do filtro "volumedetect". */
export function parseVolumeLog(log) {
  const mean = log.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const max = log.match(/max_volume:\s*(-?[\d.]+) dB/);
  return { meanDb: mean ? parseFloat(mean[1]) : null, maxDb: max ? parseFloat(max[1]) : null };
}

/** Os trechos COM som são o "contrário" dos silêncios. Trechos minúsculos (cliques) são ignorados. */
export function soundSegmentsFrom(silences, totalDuration, minSoundSec) {
  const segments = [];
  let cursor = 0;
  for (const s of [...silences].sort((a, b) => a.start - b.start)) {
    if (s.start > cursor) segments.push({ start: round(cursor), end: round(s.start) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < totalDuration) segments.push({ start: round(cursor), end: round(totalDuration) });
  return segments
    .map((s) => ({ ...s, duration: round(s.end - s.start) }))
    .filter((s) => s.duration >= minSoundSec);
}

/**
 * Analisa o áudio numa única passada: acha silêncios e mede o volume.
 * IMPORTANTE: "trecho com som" NÃO quer dizer "tem fala". Quem diz o que é fala é a transcrição (Fase 2).
 */
export async function analyzeAudio(file, durationSec, opts) {
  const { silenceNoiseDb, minSilenceSec, minSoundSec } = opts;
  const { stderr } = await ffmpeg([
    '-i', file,
    '-vn',
    '-af', `silencedetect=noise=${silenceNoiseDb}dB:d=${minSilenceSec},volumedetect`,
    '-f', 'null', '-',
  ]);

  const silences = parseSilenceLog(stderr, durationSec);
  const soundSegments = soundSegmentsFrom(silences, durationSec, minSoundSec);
  const silentTotal = silences.reduce((sum, s) => sum + s.duration, 0);

  return {
    settings: { silenceNoiseDb, minSilenceSec, minSoundSec },
    volume: parseVolumeLog(stderr),
    silences: silences.map((s) => ({
      ...s,
      position: s.start < 0.05 ? 'inicio' : s.end > durationSec - 0.05 ? 'fim' : 'meio',
    })),
    soundSegments,
    totals: {
      silenceSec: round(silentTotal),
      soundSec: round(soundSegments.reduce((sum, s) => sum + s.duration, 0)),
      silencePercent: durationSec > 0 ? Number(((silentTotal / durationSec) * 100).toFixed(1)) : 0,
    },
  };
}
