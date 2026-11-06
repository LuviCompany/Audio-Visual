import { ffprobeJson } from '../../core/ffmpeg.js';

const round = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);

/** "30000/1001" -> 29.97 */
export function parseFrameRate(text) {
  if (!text || text === '0/0') return null;
  const [a, b = '1'] = text.split('/');
  const value = Number(a) / Number(b);
  return Number.isFinite(value) && value > 0 ? round(value, 3) : null;
}

/** Celulares gravam em pé guardando "rotação 90". Precisamos do tamanho que a pessoa REALMENTE vê. */
export function getRotation(videoStream) {
  const fromMatrix = (videoStream.side_data_list ?? []).find((d) => d.rotation !== undefined)?.rotation;
  const raw = fromMatrix ?? Number(videoStream.tags?.rotate ?? 0);
  return ((Math.round(Number(raw) || 0) % 360) + 360) % 360;
}

export async function probeVideo(file) {
  const data = await ffprobeJson(file);
  const video = data.streams.find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const audio = data.streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new Error('Este arquivo não tem imagem de vídeo.');

  const rotation = getRotation(video);
  const swap = rotation === 90 || rotation === 270;
  const width = swap ? video.height : video.width;
  const height = swap ? video.width : video.height;
  const duration = Number(data.format.duration ?? video.duration);

  return {
    container: data.format.format_name,
    durationSec: round(duration),
    sizeBytes: Number(data.format.size),
    bitrateKbps: data.format.bit_rate ? Math.round(Number(data.format.bit_rate) / 1000) : null,
    video: {
      codec: video.codec_name,
      width,
      height,
      storedWidth: video.width,
      storedHeight: video.height,
      rotation,
      fps: parseFrameRate(video.avg_frame_rate) ?? parseFrameRate(video.r_frame_rate),
      pixelFormat: video.pix_fmt,
      orientation: width === height ? 'quadrado' : width > height ? 'horizontal' : 'vertical',
    },
    audio: audio
      ? {
          codec: audio.codec_name,
          channels: audio.channels,
          sampleRate: Number(audio.sample_rate),
          bitrateKbps: audio.bit_rate ? Math.round(Number(audio.bit_rate) / 1000) : null,
        }
      : null,
  };
}
