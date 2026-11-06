import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ffmpeg } from '../src/core/ffmpeg.js';

export async function makeTempDir(prefix = 'luvi-test-') {
  return mkdtemp(path.join(tmpdir(), prefix));
}

/**
 * Cria um vídeo de 20s com resposta CONHECIDA:
 *   som: 0-4s, 6.5-12s, 13-20s      silêncios: 4-6.5s e 12-13s
 *   cortes de cena (imagem muda de repente): 7s e 13s
 */
export async function makeSampleVideo(file, { withAudio = true } = {}) {
  const src = (name, d) => `${name}=size=1280x720:rate=30:duration=${d}`;
  const args = [
    '-y',
    '-f', 'lavfi', '-i', src('testsrc2', 7),
    '-f', 'lavfi', '-i', src('smptebars', 6),
    '-f', 'lavfi', '-i', src('testsrc', 7),
  ];
  if (withAudio) {
    args.push('-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*440*t)*(between(t,0,4)+between(t,6.5,12)+between(t,13,20))':s=44100:d=20");
  }
  args.push(
    '-filter_complex', '[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[2:v]format=yuv420p[c];[a][b][c]concat=n=3:v=1:a=0[v]',
    '-map', '[v]',
  );
  if (withAudio) args.push('-map', '3:a', '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file);
  await ffmpeg(args);
}
