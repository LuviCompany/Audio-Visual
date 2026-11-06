import path from 'node:path';

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

function fmtSize(bytes) {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}

/** Texto simples, em português, para o Enzo ler no terminal. */
export function formatReport(a, savedPath, root) {
  const { probe, audio } = a;
  const v = probe.video;
  const lines = [];
  lines.push(`\n=== ${a.source.fileName} ===`);
  lines.push(`Duração: ${fmtTime(probe.durationSec)}  |  Tamanho: ${fmtSize(probe.sizeBytes)}`);
  lines.push(`Imagem: ${v.width}x${v.height} (${v.orientation}), ${v.fps ?? '?'} quadros/s, ${v.codec}`);

  if (audio) {
    lines.push(`Áudio: ${probe.audio.codec}, ${probe.audio.channels} canal(is). Volume médio ${audio.volume.meanDb} dB, pico ${audio.volume.maxDb} dB`);
    lines.push(`Silêncios (pausas de ${audio.settings.minSilenceSec}s ou mais): ${audio.silences.length}  (${audio.totals.silencePercent}% do vídeo)`);
    for (const s of audio.silences) {
      lines.push(`   • ${fmtTime(s.start)} → ${fmtTime(s.end)}  (${s.duration.toFixed(1)}s, ${s.position})`);
    }
    lines.push(`Trechos com som: ${audio.soundSegments.length}`);
    for (const s of audio.soundSegments) lines.push(`   • ${fmtTime(s.start)} → ${fmtTime(s.end)}  (${s.duration.toFixed(1)}s)`);
  } else {
    lines.push('Áudio: este vídeo não tem áudio.');
  }

  if (a.scenes) {
    lines.push(`Trocas de cena: ${a.scenes.cuts.length}${a.scenes.cuts.length ? '  em ' + a.scenes.cuts.map(fmtTime).join(', ') : ''}`);
  }

  lines.push('Formatos de saída:');
  for (const [name, f] of Object.entries(a.formatFit)) {
    lines.push(`   • ${name} (${f.output}): mantém ${f.keptPercent}% da imagem${f.upscale ? ', precisa ampliar' : ''}`);
    for (const n of f.notes) lines.push(`       ⚠ ${n}`);
  }

  if (a.warnings.length) {
    lines.push('Avisos:');
    for (const w of a.warnings) lines.push(`   ⚠ ${w}`);
  }
  lines.push(`Salvo em: ${path.relative(root, savedPath)}`);
  if (a.source.backupPath) lines.push(`Backup do original: ${path.relative(root, a.source.backupPath)}`);
  return lines.join('\n');
}
