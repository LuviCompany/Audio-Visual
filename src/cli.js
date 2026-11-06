#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { loadConfig } from './core/config.js';
import { toolVersion } from './core/ffmpeg.js';
import { listVideos } from './core/files.js';
import { markStage, prepareJob } from './core/jobs.js';
import { writeNewVersion } from './core/versioning.js';
import { analyzeVideo } from './modules/video-analyzer/index.js';
import { formatReport } from './modules/video-analyzer/report.js';

const HELP = `
LUVI VIDEO AI - Fase 1 (análise de vídeo)

Uso:
  luvi doctor                      Confere se o computador tem tudo que precisa
  luvi list                        Mostra os vídeos que estão na pasta input/
  luvi analyze [arquivo] [opções]  Analisa 1 vídeo (ou todos da pasta input/ se não disser qual)

Opções do analyze:
  --scenes            Também procura trocas de cena (um pouco mais lento)
  --noise <dB>        Volume abaixo do qual conta como silêncio (padrão: -30)
  --min-silence <s>   Pausa mínima, em segundos, para contar como silêncio (padrão: 0.5)
  --no-backup         Não copiar o original para a pasta backup/
  --json              Mostra o resultado em JSON em vez de texto

O vídeo original NUNCA é alterado. Cada análise vira um arquivo novo e numerado em workspace/.
`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) return console.log(HELP);

  const config = await loadConfig();
  if (command === 'doctor') return doctor(config);
  if (command === 'list') return list(config);
  if (command === 'analyze') return analyze(config, rest);

  console.error(`Comando desconhecido: "${command}"\n${HELP}`);
  process.exitCode = 1;
}

async function doctor(config) {
  const checks = [
    ['Node.js', process.version, Number(process.versions.node.split('.')[0]) >= 20, true],
    ['FFmpeg', await toolVersion('ffmpeg'), null, true],
    ['FFprobe', await toolVersion('ffprobe'), null, true],
    ['Whisper (Fase 2)', (await toolVersion('whisper-cli', '--help')) ?? (await toolVersion('whisper', '--help')), null, false],
  ];
  let ok = true;
  for (const [name, found, passes, required] of checks) {
    const good = passes ?? Boolean(found);
    if (!good && required) ok = false;
    const mark = good ? 'OK ' : required ? 'FALTA' : 'ainda não (só é preciso na Fase 2)';
    console.log(`${good ? '✔' : required ? '✘' : '·'} ${name}: ${found ?? '-'}  ${good ? '' : `[${mark}]`}`);
  }
  console.log(`\nPasta de entrada: ${config.dirs.input}`);
  if (!ok) process.exitCode = 1;
}

async function list(config) {
  const videos = await listVideos(config.dirs.input, config.videoExtensions);
  if (!videos.length) return console.log(`Nenhum vídeo em ${config.dirs.input}\nColoque os vídeos brutos lá (${config.videoExtensions.join(', ')}).`);
  videos.forEach((v, i) => console.log(`${i + 1}. ${path.basename(v)}`));
}

async function analyze(config, args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      scenes: { type: 'boolean', default: false },
      noise: { type: 'string' },
      'min-silence': { type: 'string' },
      'no-backup': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const settings = { ...config.analysis };
  if (values.noise !== undefined) settings.silenceNoiseDb = toNumber(values.noise, '--noise');
  if (values['min-silence'] !== undefined) settings.minSilenceSec = toNumber(values['min-silence'], '--min-silence');
  if (values['no-backup']) config.backup = false;

  const videos = positionals.length
    ? positionals.map((p) => path.resolve(p))
    : await listVideos(config.dirs.input, config.videoExtensions);

  if (!videos.length) {
    console.error(`Nenhum vídeo encontrado. Coloque arquivos em ${config.dirs.input} ou diga o caminho: luvi analyze meu-video.mp4`);
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const videoPath of videos) {
    try {
      const { job, jobDir, jobFile } = await prepareJob(videoPath, config);
      const result = await analyzeVideo(videoPath, { analysis: settings, scenes: values.scenes });
      result.source = { ...job.source, backupPath: job.backupPath };
      result.jobId = job.jobId;

      const saved = await writeNewVersion(path.join(jobDir, 'analysis'), 'analysis', result);
      await markStage(jobFile, job, 'analyzed', { version: saved.version });

      if (values.json) console.log(JSON.stringify(result, null, 2));
      else console.log(formatReport(result, saved.path, config.root));
    } catch (err) {
      failures++;
      console.error(`✘ ${path.basename(videoPath)}: ${err.message}`);
    }
  }
  if (failures) process.exitCode = 1;
}

function toNumber(text, flag) {
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`${flag} precisa ser um número (recebi "${text}")`);
  return n;
}

main().catch((err) => {
  console.error(`Erro: ${err.message}`);
  process.exitCode = 1;
});
