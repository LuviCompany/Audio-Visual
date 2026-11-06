/**
 * Os 3 formatos de saída do projeto. Tamanhos "ideais" para Reels/Stories/Feed.
 */
export const TARGET_FORMATS = {
  '9:16': { ratio: 9 / 16, width: 1080, height: 1920, uso: 'Reels, Stories, TikTok, Shorts' },
  '4:5': { ratio: 4 / 5, width: 1080, height: 1350, uso: 'Feed do Instagram/Facebook' },
  '1:1': { ratio: 1, width: 1080, height: 1080, uso: 'Feed quadrado, anúncios' },
};

const even = (n) => Math.floor(n / 2) * 2; // H.264 exige tamanho par

/**
 * Para cada formato, calcula o corte central que cabe no vídeo original
 * e avisa se vai precisar "esticar" (perde qualidade).
 * Isto é só um cálculo. Nada é renderizado aqui (isso é a Fase 4).
 */
export function formatFit(width, height) {
  const result = {};
  for (const [name, f] of Object.entries(TARGET_FORMATS)) {
    let cropW = width;
    let cropH = height;
    if (width / height > f.ratio) cropW = even(height * f.ratio); // vídeo mais largo: corta dos lados
    else cropH = even(width / f.ratio); // vídeo mais alto: corta em cima/embaixo
    const crop = { width: cropW, height: cropH, x: even((width - cropW) / 2), y: even((height - cropH) / 2) };
    const keptPercent = Number(((cropW * cropH) / (width * height) * 100).toFixed(1));
    const upscale = cropW < f.width;
    const notes = [];
    if (keptPercent < 50) notes.push(`Corta mais da metade da imagem (mantém ${keptPercent}%). Conferir se o assunto continua no quadro.`);
    if (upscale) notes.push(`A imagem cortada tem só ${cropW}px de largura e será ampliada para ${f.width}px. Pode perder nitidez.`);
    result[name] = { output: `${f.width}x${f.height}`, uso: f.uso, crop, keptPercent, upscale, notes };
  }
  return result;
}
