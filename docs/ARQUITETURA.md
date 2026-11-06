# LUVI VIDEO AI — Arquitetura v2 (100% na nuvem)

> **Versão 2 — PROPOSTA para validação.** Substitui a v1 (que rodava no computador). Nenhum código novo foi escrito ainda.
> Explicado de forma simples: antes era uma **fábrica dentro da sua casa**; agora é uma **fábrica alugada por hora**.
> Você só aperta botões no navegador. A fábrica liga, trabalha, guarda o resultado e desliga.

## 0. Regra principal

**Nada é instalado no seu Windows 11.** Tudo que você faz é: abrir site, clicar, enviar arquivo, ver vídeo, aprovar.

## 1. Quem faz o quê

| Peça | Papel | Analogia |
|---|---|---|
| **GitHub (repositório privado)** | Guarda o **código** e as **instruções** (workflows). **Nunca** guarda vídeo de cliente. | O caderno de receitas |
| **GitHub Actions** | Liga um computador Linux temporário, roda a receita, desliga e apaga tudo | A cozinha alugada por hora |
| **Cloudflare R2 (bucket privado)** | Guarda vídeos originais, transcrições, planos, prévias e aprovações | O armário/estoque |
| **Whisper (faster-whisper)** | Roda **dentro** da cozinha (CPU) e transforma fala em texto com horário | O digitador |
| **FFmpeg** | Instalado automaticamente em cada execução; mede, corta e exporta | As tesouras |
| **Claude (API)** | Lê a transcrição e propõe os cortes. Não vê o vídeo, só o texto e os números | O diretor de edição |
| **GitHub Secrets** | Cofre das senhas (R2 e Claude). Nunca aparecem no código nem nos logs | O cofre |
| **Você (Enzo)** | Dispara, revisa e aprova pelo navegador | O dono |

## 2. O fluxo na nuvem

```
 VOCÊ                         GITHUB ACTIONS (Linux temporário)                       CLOUDFLARE R2
  │                                                                                       │
  │ 1. envia o vídeo (navegador) ───────────────────────────────────────────────────────▶ inbox/
  │ 2. Actions ▸ "Processar vídeo" ▸ Run workflow                                          │
  │       (cliente, arquivo, estilo, formatos)                                             │
  │                         ┌─ INGEST   confere tamanho/duração, calcula SHA-256, ◀────── inbox/
  │                         │           move p/ jobs/<id>/original/ (nunca mais mexe) ──▶ original/
  │                         ├─ ANÁLISE  (Fase 1, já pronta) ────────────────────────────▶ analysis/
  │                         ├─ TRANSCRIÇÃO  Whisper, com horário de cada palavra ────────▶ transcript/
  │                         ├─ PLANO    Claude → plan.json (cortes + motivo) ───────────▶ plan/
  │ 3. recebe link do plano ◀┘   (para aqui: REVISÃO HUMANA do plano)
  │ 4. Actions ▸ "Aprovar" ▸ plano ok / pede mudança
  │                         ┌─ PRÉVIA   FFmpeg, 720p leve, com legenda ─────────────────▶ preview/
  │ 5. assiste a prévia ◀───┘
  │ 6. Actions ▸ "Aprovar" ▸ aprovado / pede alteração (volta ao passo 3 com versão nova)
  │                         ┌─ FINAL    só depois de aprovado: 9:16, 4:5, 1:1 em qualidade total ▶ final/
  │ 7. baixa o final ◀──────┘
```

Ideias importantes:
- **O fluxo para em dois pontos humanos**: depois do plano e depois da prévia. O sistema não segue sozinho.
- **Prévia leve primeiro, final pesado depois.** Economiza tempo de máquina (que é o que custa) e disco.
- **Nunca publica.** Não existe integração de postagem.

## 3. Como o código atual vira nuvem (reaproveitamento)

Regra de ouro da migração: **o código da Fase 1 não muda de jeito nenhum.** A nuvem entra por volta dele:

```
 baixa o job do R2  ─▶  roda o MESMO código (luvi analyze etc.) numa pasta local temporária  ─▶  envia só o que é NOVO para o R2
 (sync-in)                                                                                       (sync-out)
```

| O que já existe | Destino | Mudança |
|---|---|---|
| `modules/video-analyzer/*` (probe, áudio/silêncio, cenas, formatos, relatório) | **Mantém 100%** | nenhuma |
| `core/ffmpeg.js`, `files.js`, `versioning.js`, `config.js` | **Mantém 100%** | nenhuma |
| `core/jobs.js` (job, hash, backup local) | **Mantém** | no servidor o backup local é desligado (config); o **original no R2 é o backup** |
| `cli.js` (`doctor`, `list`, `analyze`) | **Mantém** e ganha comandos | + `ingest`, `pipeline` (e depois `transcribe`, `plan`, `render`, `approve`) |
| 15 testes automáticos | **Mantém** e passam a rodar também no GitHub | + novos testes |
| `README.md` | **Reescrito** | passo a passo 100% no navegador |
| `docs/ARQUITETURA.md` | **Este documento** | v2 |
| *(novo)* `core/storage/` | Fala com o R2 | usa o **AWS CLI**, que já vem nas máquinas do GitHub (S3 compatível). Assim **continuamos sem nenhuma biblioteca npm** |
| *(novo)* `.github/workflows/*.yml` | Receitas do GitHub Actions | **finos**: só chamam o `cli.js`. A lógica fica no código, onde dá para testar |

### Por que "workflow fino"
Se a lógica ficar escondida no YAML, não dá para testar sem gastar minutos de máquina. No código, testamos aqui e no GitHub.

## 4. Organização no R2

```
bucket: luvi-video            (PRIVADO, sem acesso público)
├─ inbox/<cliente>/<arquivo>              ← você joga aqui; é só a "caixa de entrada"
└─ clients/<cliente>/jobs/<job-id>/       ← job-id = nome + 8 letras do SHA-256 (igual à Fase 1)
    ├─ job.json
    ├─ original/video.<ext>               ← gravado UMA vez, nunca sobrescrito, nunca apagado pelo sistema
    ├─ analysis/analysis.v001.json ...
    ├─ transcript/transcript.v001.json  +  .srt
    ├─ plan/plan.v001.json ...
    ├─ preview/preview.v001.mp4 ...
    ├─ final/final.v001.<9x16|4x5|1x1>.mp4
    ├─ approval/approval.v001.json ...
    └─ report/report.v001.md
```
Mesmas regras da Fase 1: versões numeradas, nada sobrescrito, job-id pelo conteúdo do vídeo.

**Ver prévia sem instalar nada:** o sistema gera um **link temporário** (expira em poucos dias) para a prévia e para o final. Esses links são "senhas": aparecem só no resumo da execução (repositório privado) e ficam **escondidos nos logs**.

## 5. Workflows (GitHub Actions)

| Workflow | Quando roda | O que faz |
|---|---|---|
| `ci.yml` | a cada alteração no código | roda os testes + confere as receitas (actionlint) + **barra qualquer arquivo de vídeo no repositório** |
| `process.yml` | **você dispara** (Run workflow) | ingest → análise → transcrição → plano. Para na revisão |
| `approve.yml` | **você dispara** | registra sua decisão (plano ok / mudar / prévia ok / alterar) e dispara o próximo passo |
| `render.yml` | disparado pelo `approve.yml` (ou manual) | gera prévia leve ou final em 3 formatos |
| `smoke-r2.yml` | manual | teste de saúde: envia, baixa e confere arquivo pequeno no R2 (prova que as senhas funcionam) |

Formulário de disparo (aparece no site do GitHub, funciona até no celular): `cliente`, `arquivo`, `idioma` (padrão `pt`), `modelo` do Whisper (padrão `small`), `estilo`, `formatos`.

Cuidados embutidos:
- **Só disparo manual** (`workflow_dispatch`). Sem gatilho de pull request ⇒ ninguém de fora consegue usar suas senhas.
- Dados do formulário vão para **variáveis de ambiente validadas**, nunca coladas dentro do comando (evita injeção de comando).
- `permissions` mínimas, `timeout-minutes` em todo job e `concurrency` por job-id (não roda 2 vezes o mesmo vídeo ao mesmo tempo).
- Versões das ações travadas (sem "latest").
- Logs mostram **contagens e tempos**, nunca o texto da fala do cliente.

## 6. Whisper na nuvem

- `faster-whisper` instalado por `pip` a cada execução, **modelo em cache** do GitHub (`actions/cache`) para não baixar toda vez.
- Roda em **CPU** (sem GPU). Por isso é **mais lento que o tempo do vídeo em modelos grandes**. Ponto de partida: modelo `small` em português; `medium` opcional para qualidade maior.
- Saída: texto + horário de **cada palavra**, com filtro de silêncio (VAD) para reduzir "alucinações" do Whisper, e comparação com os silêncios que a Fase 1 já mede.
- **O áudio nunca sai da máquina do GitHub** (não vai para nenhuma API de IA). Só o **texto** da transcrição vai para o Claude.
- ⚠ A velocidade real **só dá para medir rodando no GitHub com um vídeo seu**. Não vou prometer número antes disso.

## 7. Claude (Fase 3)

- Chamado por um script Node usando a **API da Anthropic** (chave em `ANTHROPIC_API_KEY`, no cofre).
- Recebe: transcrição + silêncios + cenas + estilo escolhido. **Não recebe o vídeo.**
- Devolve: JSON com cortes (início, fim, motivo, tipo). **Nunca devolve texto de fala novo.**
- Um **validador** (com testes) rejeita o plano se: algum corte aponta para tempo inexistente, se algum trecho de fala removido não estiver marcado como "precisa de aprovação", ou se aparecer texto que não existe na transcrição.
- ⚠ A API é cobrada **à parte** da assinatura do Claude (console.anthropic.com). Como o plano usa só texto, o custo por vídeo tende a ser baixo.

## 8. Limites e como respeitamos

| Limite | Valor | Situação da informação | O que fazemos |
|---|---|---|---|
| Tempo máximo de um job no GitHub | 6 horas | ✔ confirmado em busca | `timeout-minutes` menor (ex.: 120) e aviso antes de começar |
| Tempo máximo de um workflow | 35 dias (inclui espera) | ✔ confirmado em busca | irrelevante, pois a aprovação é um workflow separado (sem ficar "esperando") |
| Disco da máquina padrão | ~14 GB livres | ⚠ de memória, **conferir** | trava antes de baixar: tamanho do vídeo ≤ teto configurável (começo: 2 GB) e `df` verificado |
| CPU/memória da máquina padrão | repo privado: 2 vCPU/7 GB; público: 4 vCPU/16 GB | ⚠ de memória, **conferir** | por isso o plano usa repo **privado**; testamos tempo real |
| Minutos grátis por mês (repo privado) | ~2.000 no plano Free | ⚠ de memória, **conferir** | relatório de minutos gastos por job; precisamos do **volume de vídeos/mês** para dimensionar |
| Armazenamento de artefatos do GitHub | pequeno no plano Free | ⚠ de memória, **conferir** | **não usamos artefatos** para vídeo; tudo vai para o R2 |
| R2 grátis | 10 GB, 1 mi operações de escrita, 10 mi de leitura por mês, **sem cobrança de saída** | ✔ confirmado em busca (fontes de terceiros) | política de limpeza: prévias expiram sozinhas (regra do bucket); originais ficam |
| Objeto máximo no R2 | ~5 TiB; 5 GiB por parte | ✔ confirmado em busca (terceiro) | irrelevante para nossos arquivos |
| Envio pelo painel web do R2 | limite por arquivo (≈300 MB, de memória) | ⚠ **conferir** | acima disso: página de envio própria (Fase 8) ou outro caminho — ver decisão D3 |

> Os sites oficiais do GitHub e da Cloudflare estão bloqueados nesta sessão. Os itens ⚠ precisam ser conferidos por você nas páginas oficiais, ou eu confiro quando o acesso for liberado.

## 9. Segurança e privacidade

1. Repositório **privado**. Sem vídeo, sem transcrição, sem senha dentro dele. O `ci.yml` **reprova** qualquer `.mp4/.mov/...` enviado ao repositório.
2. Senhas só em **GitHub Secrets**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `ANTHROPIC_API_KEY`. A chave do R2 vale para **um bucket só**.
3. **Original preservado**: gravado uma vez no R2; o código nunca chama "apagar" nem "sobrescrever" em `original/`; o SHA-256 é conferido a cada download. ⚠ O R2 não tem chave "só escreve, não apaga" — a proteção forte é uma **regra de retenção do bucket** (conferir se disponível no seu plano).
4. A máquina do GitHub é **descartada** ao fim de cada execução (nada fica nela).
5. **Cliente é dado pessoal** (rostos, vozes): combinar com os clientes o uso de nuvem e definir por quanto tempo guardamos (decisão D5).
6. Música: continua proibido usar sem licença registrada.

## 10. Regras editoriais (continuam valendo, sem mudança)

Não inventar falas · não mudar significado · não remover trecho importante sem autorização · preservar qualidade · cortes naturais · áudio e vídeo sincronizados · sem efeitos exagerados · nunca sobrescrever original · versões numeradas · nunca publicar. (Detalhe de como o código garante cada uma: ver v1 no histórico; a tabela continua a mesma.)

## 11. Módulos

Iguais à v1, mudando só **onde** rodam: tudo dentro do Actions.

| Módulo | Fase | Estado |
|---|---|---|
| `video-analyzer` | 1 | ✔ pronto e testado |
| `core/storage` (R2) + `ingest` + `pipeline` | **1.5 (nova)** | a fazer |
| `transcription` | 2 | depois de validar este documento |
| `editing-planner` | 3 | |
| `video-renderer` (prévia leve + final 3 formatos) | 4 | |
| `subtitle-generator` | 5 | |
| `quality-control` + relatório | 6 | |
| `approval-manager` | 7 | |
| Interface web (Cloudflare Pages protegida) | 8 | |

## 12. PLANO DE MIGRAÇÃO (cada passo só termina com teste passando)

| Passo | Entrega | Como provamos que funciona |
|---|---|---|
| **M0** Prova de vida | Enviar um workflow "olá" ao GitHub, rodar e ler o resultado | Execução verde; consigo ver status/log daqui. **Este passo decide se eu consigo trabalhar de ponta a ponta** (hoje o login do `gh` nesta sessão está inválido) |
| **M1** Código no GitHub | Projeto atual no repositório, `.gitignore` e trava de vídeo | `ci.yml` reprova um `.mp4` de teste e aprova o resto |
| **M2** Testes na nuvem | `ci.yml`: instala FFmpeg e roda os 15 testes + actionlint | Execução verde no GitHub (prova que FFmpeg automático e a Fase 1 funcionam no Linux da nuvem) |
| **M3** Armazenamento | `core/storage` + `smoke-r2.yml` | Testes locais com "AWS falso"; no GitHub: envia, baixa, confere hash, tenta sobrescrever original (**tem que recusar**) |
| **M4** Pipeline básico | `ingest` + `process.yml` (só ingest + análise) | Vídeo de teste no R2 → job criado → `analysis.v001.json` no R2 → rodar de novo cria `v002` → original idêntico |
| **M5 = FASE 2** Transcrição | `transcription` com faster-whisper no `process.yml` | Fixtures + execução real num vídeo seu curto em português; conferência de timestamps; medição de tempo/minutos |
| M6… | Fases 3 a 8 | cada uma com seus testes, como no plano de fases |

## 13. Riscos honestos

| Risco | Efeito | Plano |
|---|---|---|
| Esta sessão pode não conseguir enviar arquivos de workflow (`.github/workflows`) ou ler execuções | Eu não consigo validar rodando | M0 testa isso primeiro. Se falhar, você cola/aprova pelo site e eu valido pelos logs que você me enviar |
| Whisper em CPU lento | Execuções longas, gasta minutos | começar com `small`; medir; limitar duração por job (ex.: 30 min) |
| Estourar minutos grátis | Cobrança ou bloqueio | relatório de minutos por job + alerta; definir limite mensal no GitHub |
| Link temporário vazar | Alguém vê uma prévia | expira rápido; repositório privado; logs mascarados |
| Enviar vídeos grandes pelo navegador | Falha no envio | limite no painel do R2 (conferir); depois, página de envio própria |
| Sem GPU, planos longos de vídeo | tempo | processar áudio só (16 kHz mono) e dividir em pedaços em fases futuras |

## 14. Decisões que preciso de você (com minha recomendação)

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Repositório **privado** ou público? | **Privado.** Público dá mais máquina grátis, mas expõe logs e configurações. Ele já é privado hoje |
| D2 | Você já tem (ou cria) conta na **Cloudflare** (R2) e na **API da Anthropic**? São contas separadas, grátis para criar; o uso da Anthropic é pago | Criar as duas. O R2 pode pedir cartão mesmo dentro do grátis (conferir) |
| D3 | Como enviar vídeos? | Começar pelo **painel da Cloudflare no navegador**. Se os vídeos passarem do limite, construímos uma **página de envio** na Fase 8 |
| D4 | Como aprovar? | Começar com o formulário **"Aprovar"** do GitHub Actions (funciona no celular). Na Fase 8, uma página própria com botões |
| D5 | Por quanto tempo guardar originais e prévias? | Originais: até você decidir. Prévias: 30 dias (apagam sozinhas) |
| D6 | Quantos vídeos por mês e de quantos minutos? | Preciso para calcular o gasto de minutos do GitHub |
| D7 | Posso enviar o projeto para o repositório `LuviCompany/audio-visual`? | Sim, é o M1. Preciso do seu "ok" (é um envio para fora desta sessão) |
