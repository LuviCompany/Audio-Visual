import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { sha256File } from '../src/core/files.js';
import { prepareJob, markStage } from '../src/core/jobs.js';
import { writeNewVersion } from '../src/core/versioning.js';
import { analyzeVideo } from '../src/modules/video-analyzer/index.js';
import { makeSampleVideo, makeTempDir } from './helpers.js';

const SETTINGS = { silenceNoiseDb: -30, minSilenceSec: 0.5, minSoundSec: 0.15, sceneThreshold: 0.3 };
const near = (actual, expected, tol = 0.15) => assert.ok(Math.abs(actual - expected) <= tol, `esperava ~${expected}, veio ${actual}`);

let dir;
let video;

before(async () => {
  dir = await makeTempDir();
  video = path.join(dir, 'amostra.mp4');
  await makeSampleVideo(video);
});

test('analisa um vídeo real: metadados, silêncios e cenas batem com o esperado', async () => {
  const a = await analyzeVideo(video, { analysis: SETTINGS, scenes: true });

  near(a.probe.durationSec, 20, 0.2);
  assert.equal(a.probe.video.width, 1280);
  assert.equal(a.probe.video.height, 720);
  assert.equal(a.probe.video.orientation, 'horizontal');
  assert.equal(a.probe.video.fps, 30);
  assert.equal(a.probe.audio.codec, 'aac');

  assert.equal(a.audio.silences.length, 2);
  near(a.audio.silences[0].start, 4);
  near(a.audio.silences[0].end, 6.5);
  near(a.audio.silences[1].start, 12);
  near(a.audio.silences[1].end, 13);
  assert.equal(a.audio.soundSegments.length, 3);

  assert.equal(a.scenes.cuts.length, 2);
  near(a.scenes.cuts[0], 7, 0.1);
  near(a.scenes.cuts[1], 13, 0.1);
});

test('vídeo sem áudio: avisa em vez de quebrar', async () => {
  const mudo = path.join(dir, 'mudo.mp4');
  await makeSampleVideo(mudo, { withAudio: false });
  const a = await analyzeVideo(mudo, { analysis: SETTINGS });
  assert.equal(a.audio, null);
  assert.ok(a.warnings.some((w) => w.includes('não tem áudio')));
});

test('arquivo que não é vídeo dá erro claro', async () => {
  const fake = path.join(dir, 'fake.mp4');
  await copyFile(new URL('../package.json', import.meta.url), fake);
  await assert.rejects(() => analyzeVideo(fake, { analysis: SETTINGS }), /Não consegui ler o vídeo/);
});

test('fluxo completo: backup, versões numeradas e original intacto', async () => {
  const config = {
    backup: true,
    dirs: { workspace: path.join(dir, 'workspace'), backup: path.join(dir, 'backup') },
  };
  const before = await sha256File(video);
  const mtimeBefore = (await stat(video)).mtimeMs;

  for (let i = 0; i < 2; i++) {
    const { job, jobDir, jobFile } = await prepareJob(video, config);
    const a = await analyzeVideo(video, { analysis: SETTINGS });
    const saved = await writeNewVersion(path.join(jobDir, 'analysis'), 'analysis', a);
    await markStage(jobFile, job, 'analyzed', { version: saved.version });
  }

  const { job, jobDir } = await prepareJob(video, config);
  assert.deepEqual((await readdir(path.join(jobDir, 'analysis'))).sort(), ['analysis.v001.json', 'analysis.v002.json']);
  assert.equal(await sha256File(job.backupPath), before, 'backup tem que ser idêntico ao original');
  assert.equal((await stat(job.backupPath)).mode & 0o222, 0, 'backup tem que ser somente leitura');
  assert.equal(await sha256File(video), before, 'original não pode mudar');
  assert.equal((await stat(video)).mtimeMs, mtimeBefore);
  assert.equal(JSON.parse(await readFile(path.join(jobDir, 'job.json'), 'utf8')).stages.analyzed.version, 2);
});

test('backup divergente nunca é sobrescrito', async () => {
  const config = {
    backup: true,
    dirs: { workspace: path.join(dir, 'ws2'), backup: path.join(dir, 'bk2') },
  };
  const { job } = await prepareJob(video, config);
  // simula backup corrompido: troca o conteúdo (precisa soltar a proteção de leitura)
  const { chmod, writeFile } = await import('node:fs/promises');
  await chmod(job.backupPath, 0o644);
  await writeFile(job.backupPath, 'lixo');
  await assert.rejects(() => prepareJob(video, config), /Não vou sobrescrever/);
});
