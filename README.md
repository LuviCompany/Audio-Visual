# LUVI VIDEO AI

Agente de edição de vídeos da Luvi Company. Recebe vídeo cru, analisa, planeja os cortes e entrega uma **prévia para aprovação humana**.
Ele **nunca publica nada sozinho** e **nunca mexe no vídeo original**.

**Fase atual: 1 — análise do vídeo.** (Transcrição, plano de edição, render e legendas vêm nas próximas fases. Veja `docs/ARQUITETURA.md`.)

> **Mudança de rumo (arquitetura v2, em validação):** o projeto vai rodar 100% na nuvem (GitHub Actions + Cloudflare R2),
> sem instalar nada no Windows. As instruções abaixo valem para quem desenvolve e testa o código fora do Windows do Enzo
> (ex.: este ambiente na nuvem). O novo passo a passo, todo pelo navegador, será escrito na migração. Veja `docs/ARQUITETURA.md`, seções 12 a 14.

## O que precisa ter instalado

- Node.js 20 ou mais novo
- FFmpeg (já inclui o FFprobe)

Instalar o FFmpeg:

```bash
# Windows (PowerShell)
winget install Gyan.FFmpeg
```

```bash
# Mac
brew install ffmpeg
```

```bash
# Linux (Ubuntu/Debian)
sudo apt install ffmpeg
```

Não precisa de `npm install`: a Fase 1 não usa nenhuma biblioteca de fora.

## Como usar

1. Confira se está tudo certo:

```bash
node src/cli.js doctor
```

2. Coloque os vídeos brutos na pasta `input/` (aceita `.mp4 .mov .mkv .webm .avi .m4v`).

3. Veja o que o sistema encontrou:

```bash
node src/cli.js list
```

4. Analise (todos os vídeos da pasta, ou só um):

```bash
node src/cli.js analyze
node src/cli.js analyze input/meu-video.mp4 --scenes
```

### Opções do `analyze`

| Opção | Para que serve | Padrão |
|---|---|---|
| `--scenes` | Também acha trocas de cena (um pouco mais lento) | desligado |
| `--noise -35` | Volume abaixo do qual é "silêncio". Mais negativo = só silêncio bem quieto | -30 |
| `--min-silence 0.8` | Pausa mínima (segundos) para contar como silêncio | 0.5 |
| `--no-backup` | Não copia o original para `backup/` | backup ligado |
| `--json` | Mostra o resultado em JSON | texto |

## O que ele entrega

Para cada vídeo, o terminal mostra um resumo em português: duração, tamanho da imagem, volume, **pausas (silêncios)**,
trechos com som, trocas de cena e **quais dos 3 formatos (9:16, 4:5, 1:1) cabem bem** sem perder qualidade. Também dá avisos
(áudio estourado, muito silêncio, resolução baixa, vídeo sem áudio, etc.).

Arquivos criados (nada é sobrescrito):

```
backup/<video>/original.mp4                     cópia do original (somente leitura)
workspace/<video>/job.json                      ficha do vídeo
workspace/<video>/analysis/analysis.v001.json   análise completa
workspace/<video>/analysis/analysis.v002.json   (rodou de novo? vira v002)
```

## Importante saber

- "Trecho com som" **não é o mesmo** que "trecho com fala": pode ser música ou barulho. Quem confirma a fala é a transcrição (Fase 2).
- O detector de silêncio depende do ruído do ambiente. Se o vídeo foi gravado num lugar barulhento, teste `--noise -25` ou `--noise -40` e veja qual acha as pausas certas.
- Para vídeos grandes, o backup duplica o arquivo no disco (em sistemas de arquivos modernos, como APFS/Btrfs/XFS, a cópia é instantânea e não ocupa espaço extra). Se faltar espaço, use `--no-backup` — mas só se o original estiver guardado em outro lugar.

## Testes

```bash
npm test
```

Os testes criam um vídeo de 20 segundos com pausas em lugares conhecidos e conferem se o sistema acha exatamente isso. Também provam que o original não muda, que o backup é idêntico e que as versões nunca se sobrescrevem.

## Estrutura

```
src/cli.js                      comandos
src/core/                       ferramentas compartilhadas
src/modules/video-analyzer/     Fase 1
config/default.json             configurações
docs/ARQUITETURA.md             arquitetura completa e plano de fases
```
