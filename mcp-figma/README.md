# FlowSpec — Figma MCP + Teams Integration

Analisa designs do Figma com Claude AI (vision), gera cenarios BDD/Gherkin consolidados por fluxo, e integra com Jira e Microsoft Teams.

---

## Fluxograma

```
┌──────────────────────────────────────────────────────────────┐
│  ENTRADA (3 formas de usar)                                  │
│                                                              │
│  1. CLI direto:                                              │
│     npx tsx test-figma.ts <key> --node-id 22-346             │
│                                                              │
│  2. CLI via Agent SDK:                                       │
│     npm run figma-mcp -- <key>                               │
│                                                              │
│  3. Microsoft Teams:                                         │
│     @FlowSpec https://figma.com/design/ABC?node-id=22-346    │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                  workflow.ts (core)                           │
│                                                              │
│  [1] Figma API ──► Lista frames (SECTION → FRAME)           │
│  [2] Figma API ──► Render PNGs (scale=2)                    │
│  [3] Download  ──► Salva em temp-figma-output/images/       │
│  [4] Claude    ──► Analisa TODAS as telas de uma vez        │
│      Agent SDK     Gera Gherkins consolidados por fluxo     │
│                    Salva em temp-figma-output/gherkins/      │
│  [5] Jira      ──► Cria issues (opcional, --jira PROJ)      │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  SAIDA                                                       │
│                                                              │
│  temp-figma-output/                                          │
│    images/              gherkins/                            │
│      LOGIN.png            Autenticacao.feature               │
│      CADASTRO.png         Catalogo-de-Games.feature          │
│      CATALOGO.png         Fluxo-de-Pagamento.feature         │
│      PAGAMENTO.png                                           │
│                                                              │
│  + Adaptive Card no Teams (se via webhook)                   │
│  + Issues no Jira (se --jira)                                │
└──────────────────────────────────────────────────────────────┘
```

---

## Instalacao

### Pre-requisitos

- Node.js v22+
- Claude Code CLI instalado e logado (o Agent SDK usa a auth do CLI)
- Token do Figma: [Figma Settings → Personal access tokens](https://www.figma.com/settings)

### Setup

```bash
cd mcp-figma
npm install
```

### Variaveis de ambiente

No arquivo `.env` na raiz do projeto:

```env
# Obrigatorio
FIGMA_API_KEY=seu_token_figma

# Opcional — para upload ao Jira
JIRA_API_KEY=seu_token_jira
JIRA_BASE_URL=https://empresa.atlassian.net
JIRA_EMAIL=seu@email.com

# Opcional — para integracao Teams
TEAMS_WEBHOOK_SECRET=token_do_outgoing_webhook
TEAMS_INCOMING_WEBHOOK_URL=url_do_incoming_webhook
```

---

## Uso

### 1. CLI direto (recomendado para testes)

```bash
cd mcp-figma

# Analisar todas as telas do arquivo
npx tsx test-figma.ts <figma-file-key>

# Analisar apenas uma SECTION (ex: PROJETO)
npx tsx test-figma.ts <figma-file-key> --node-id 22-346

# Analisar e criar issues no Jira
npx tsx test-figma.ts <figma-file-key> --node-id 22-346 --jira PROJ

# Com issue pai (subtasks)
npx tsx test-figma.ts <figma-file-key> --node-id 22-346 --jira PROJ --parent PROJ-42
```

#### Como pegar o file-key e node-id

```
https://www.figma.com/design/OUFqaee6njUnXpmMZD6I2L/EBAC-Games?node-id=22-346
                              ^^^^^^^^^^^^^^^^^^^^^^^^                 ^^^^^^
                              file-key                                 node-id
```

- **file-key**: Sempre presente na URL
- **node-id**: Aparece quando voce clica numa SECTION ou frame no Figma

### 2. CLI via Agent SDK (orchestrator)

```bash
# Da raiz do projeto
npm run figma-mcp -- <figma-file-key>

# Com Jira
npm run figma-mcp -- <figma-file-key> --jira-project PROJ --jira-parent PROJ-42
```

> O proxy Express deve estar rodando: `npm run server`

### 3. Microsoft Teams

#### Configuracao (uma vez)

1. **Incoming Webhook** (para FlowSpec enviar resultados):
   - Teams → Canal → Gerenciar canal → Connectors → Incoming Webhook
   - Criar, copiar URL → colar em `TEAMS_INCOMING_WEBHOOK_URL` no `.env`

2. **ngrok** (expoe localhost para a internet):
   ```bash
   npm install -g ngrok
   ngrok http 3001
   # Anote a URL: https://abc123.ngrok-free.app
   ```

3. **Outgoing Webhook** (para receber comandos do Teams):
   - Teams → Time → Gerenciar equipe → Apps → Criar webhook de saida
   - Nome: `FlowSpec`
   - URL de callback: `https://abc123.ngrok-free.app/api/teams/webhook`
   - Copiar Security Token → colar em `TEAMS_WEBHOOK_SECRET` no `.env`

4. **Iniciar o servidor**:
   ```bash
   npm run server
   ```

#### Uso no Teams

Mencione o webhook no canal e envie um link do Figma:

```
@FlowSpec https://www.figma.com/design/OUFqaee6njUnXpmMZD6I2L/EBAC-Games?node-id=22-346
```

Com Jira:
```
@FlowSpec https://www.figma.com/design/ABC123/Projeto?node-id=22-346 --jira PROJ
```

Com issue pai:
```
@FlowSpec https://www.figma.com/design/ABC123/Projeto?node-id=22-346 --jira PROJ --parent PROJ-42
```

#### O que acontece

1. FlowSpec responde imediatamente: "Analisando design do Figma..."
2. Em background: baixa imagens, analisa com Claude, gera Gherkins
3. Quando termina: envia Adaptive Card no canal com:
   - Resumo (X telas, Y funcionalidades)
   - Preview dos cenarios gerados
   - Links para Jira (se criadas)
   - Botao "Abrir Figma"

---

## Como funciona a analise

O FlowSpec **NAO gera um Gherkin por tela**. Ele:

1. Baixa todas as imagens do Figma
2. Envia TODAS de uma vez para o Claude (vision)
3. Claude identifica os **fluxos do projeto** (Login, Cadastro, Pagamento, etc.)
4. Gera cenarios **consolidados por funcionalidade** cobrindo:
   - Caminho feliz
   - Cenarios negativos
   - Navegacao entre telas
5. Salva um `.feature` por funcionalidade

---

## Estrutura de arquivos

```
mcp-figma/
  workflow.ts        # Core — Figma API + Claude + Gherkin + Jira
  test-figma.ts      # CLI wrapper para workflow.ts
  teams-runner.ts    # Runner background para Teams webhook
  teams-notify.ts    # Envia Adaptive Card via Incoming Webhook
  server.ts          # MCP server (5 tools, StdioTransport)
  orchestrator.ts    # CLI via Agent SDK query()
  types.ts           # Tipos TypeScript compartilhados
  package.json
  tsconfig.json
  README.md
```

## Dependencias

| Pacote | Uso |
|--------|-----|
| `@anthropic-ai/claude-agent-sdk` | Analise de design com Claude (vision) |
| `@modelcontextprotocol/sdk` | MCP server (StdioServerTransport) |
| `axios` | HTTP para Figma API e Jira proxy |
| `zod` | Validacao de schemas dos MCP tools |
| `dotenv` | Carrega variaveis do .env |
| `tsx` | Executa TypeScript direto sem build |

## Tools do MCP Server

| # | Tool | Input | Output |
|---|------|-------|--------|
| 1 | `figma_get_file` | `fileKey` | Lista de frames (id, name, section) |
| 2 | `figma_render_frames` | `fileKey`, `nodeIds[]` | URLs das imagens PNG |
| 3 | `figma_download_images` | `images[]` | Imagens salvas em disco |
| 4 | `analyze_design_gherkin` | `nodeId`, `nodeName`, `imagePath` | Gherkin em portugues |
| 5 | `jira_create_issue` | `summary`, `gherkinContent`, `projectKey` | Issue key (ex: PROJ-123) |
