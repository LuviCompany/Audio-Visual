import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseSilenceLog, parseVolumeLog, soundSegmentsFrom } from '../src/modules/video-analyzer/audio.js';
import { parseSceneLog } from '../src/modules/video-analyzer/scenes.js';
import { parseFrameRate, getRotation } from '../src/modules/video-analyzer/probe.js';
import { formatFit } from '../src/modules/video-analyzer/formats.js';
import { slugify } from '../src/core/files.js';
import { writeNewVersion } from '../src/core/versioning.js';
import { makeTempDir } from './helpers.js';

const LOG = `
[silencedetect @ 0x1] silence_start: 4.0004
[silencedetect @ 0x1] silence_end: 6.5 | silence_duration: 2.4996
[silencedetect @ 0x1] silence_start: 19.2
[Parsed_volumedetect_1 @ 0x2] mean_volume: -21.6 dB
[Parsed_volumedetect_1 @ 0x2] max_volume: -6.0 dB
`;

test('silêncios: lê início/fim e fecha o silêncio que ficou aberto no fim do vídeo', () => {
  const s = parseSilenceLog(LOG, 20);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { start: 4, end: 6.5, duration: 2.5 });
  assert.equal(s[1].start, 19.2);
  assert.equal(s[1].end, 20);
});

test('volume: lê média e pico', () => {
  assert.deepEqual(parseVolumeLog(LOG), { meanDb: -21.6, maxDb: -6 });
});

test('trechos com som são o contrário dos silêncios', () => {
  const sil = [{ start: 4, end: 6.5, duration: 2.5 }];
  const seg = soundSegmentsFrom(sil, 10, 0.15);
  assert.deepEqual(seg.map((s) => [s.start, s.end]), [[0, 4], [6.5, 10]]);
});

test('trecho com som menor que o mínimo é descartado', () => {
  const sil = [{ start: 0, end: 5, duration: 5 }, { start: 5.1, end: 10, duration: 4.9 }];
  assert.equal(soundSegmentsFrom(sil, 10, 0.15).length, 0);
});

test('trocas de cena', () => {
  assert.deepEqual(parseSceneLog('n: 0 pts: 210 pts_time:7 ...\nn: 1 pts: 390 pts_time:13.02'), [7, 13.02]);
});

test('frame rate e rotação', () => {
  assert.equal(parseFrameRate('30000/1001'), 29.97);
  assert.equal(parseFrameRate('0/0'), null);
  assert.equal(getRotation({ side_data_list: [{ rotation: -90 }] }), 270);
  assert.equal(getRotation({ tags: { rotate: '90' } }), 90);
  assert.equal(getRotation({}), 0);
});

test('formatFit: vídeo horizontal 1920x1080 em 9:16 corta dos lados', () => {
  const f = formatFit(1920, 1080)['9:16'];
  assert.equal(f.crop.height, 1080);
  assert.equal(f.crop.width, 607 - 1); // 1080*9/16 = 607.5 -> par
  assert.equal(f.upscale, true);
  assert.ok(f.keptPercent < 50);
});

test('formatFit: vídeo vertical 1080x1920 em 9:16 não corta nada', () => {
  const f = formatFit(1080, 1920)['9:16'];
  assert.equal(f.keptPercent, 100);
  assert.equal(f.upscale, false);
});

test('slugify tira acentos e símbolos', () => {
  assert.equal(slugify('Vídeo do Cliente — Açaí #1.MOV'), 'video-do-cliente-acai-1-mov');
  assert.equal(slugify('???'), 'video');
});

test('versionamento: nunca sobrescreve, sempre cria v001, v002...', async () => {
  const dir = path.join(await makeTempDir(), 'analysis');
  await mkdir(dir);
  const a = await writeNewVersion(dir, 'analysis', { n: 1 });
  const b = await writeNewVersion(dir, 'analysis', { n: 2 });
  assert.equal(a.version, 1);
  assert.equal(b.version, 2);
  assert.deepEqual((await readdir(dir)).sort(), ['analysis.v001.json', 'analysis.v002.json']);
});
