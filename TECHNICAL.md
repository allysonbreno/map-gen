# FlowSpec — Documento Tecnico

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React + Vite)                       │
│                                                                     │
│  ┌───────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Recorder  │  │GherkinEditor │  │ JiraModal │  │AppiumConfig  │ │
│  │ (desktop  │  │ (revisao do  │  │ (config + │  │   Modal      │ │
│  │ + appium) │  │  Gherkin)    │  │  envio)   │  │              │ │
│  └─────┬─────┘  └──────────────┘  └─────┬─────┘  └──────────────┘ │
│        │                                 │                          │
│  ┌─────┴─────────────────────────────────┴──────┐                  │
│  │              Services Layer                    │                  │
│  │  gemini.ts │ jira.ts │ jiraAnalyzer.ts │ appium.ts              │
│  └─────────────────────┬────────────────────────┘                  │
└────────────────────────┼────────────────────────────────────────────┘
                         │ HTTP (axios)
                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                  server.js (Express :3001)                          │
│                                                                    │
│  /api/jira/issue/:key     GET   → Jira REST API v3                │
│  /api/jira/project/:key   GET   → Jira REST API v3                │
│  /api/jira/issue          POST  → Jira REST API v3                │
│  /api/appium/session      POST  → Appium Server                   │
│  /api/appium/screenshot   POST  → Appium Server                   │
│  /api/appium/session/delete POST → Appium Server                  │
└────────────┬───────────────────────────────┬──────────────────────┘
             │ HTTPS                         │ HTTP
             ▼                               ▼
     ┌──────────────┐               ┌──────────────────┐
     │  Jira Cloud  │               │  Appium Server   │
     │  REST API v3 │               │  (:4723)         │
     └──────────────┘               │       │          │
                                    │  ┌────┴────┐     │
                                    │  │ Device/ │     │
                                    │  │Emulador │     │
                                    │  └─────────┘     │
                                    └──────────────────┘
```

---

## Tipos (src/types/index.ts)

```typescript
interface RecordingSession {
  id: string
  frames: string[]       // base64 JPEG
  startedAt: Date
  endedAt?: Date
}

interface GherkinScenario {
  title: string           // ex: "Fazer login com credenciais validas"
  content: string         // Gherkin completo (Funcionalidade/Cenario/passos)
}

interface JiraConfig {
  baseUrl: string         // ex: "https://empresa.atlassian.net"
  email: string
  apiToken: string
  projectKey: string      // ex: "KAN"
  issueType: string       // ex: "Story" (ignorado se parent definido)
  parentIssueKey?: string // ex: "KAN-4" — cria como subtask
}

type AppStep = 'idle' | 'recording' | 'analyzing' | 'reviewing' | 'sending'

type RecordingMode = 'desktop' | 'appium'

interface AppiumConfig {
  serverUrl: string       // ex: "http://localhost:4723"
  platformName: string    // "Android" | "iOS"
  deviceName: string      // ex: "emulator-5554"
  automationName: string  // "UiAutomator2" | "XCUITest"
  platformVersion?: string
  app?: string            // caminho do .apk/.ipa
  noReset?: boolean
  udid?: string           // dispositivo real
}
```

---

## Services

### gemini.ts — Analise de frames com IA

```typescript
analyzeFlow(frames: string[], apiKey: string): Promise<GherkinScenario>
```

- **Modelo**: `gemini-2.5-flash` com vision
- **Input**: Array de frames JPEG base64
- **Output**: Cenario Gherkin em portugues (`{ title, content }`)
- **Prompt**: Instrui o modelo a agir como QA/BDD expert, gerando `Funcionalidade/Cenario/Dado/Quando/Entao`
- **Limite**: Max 20 frames (enforced pelo hook)

### jira.ts — Criacao de issues

```typescript
createJiraIssue(
  scenario: GherkinScenario,
  config: JiraConfig,
  resolvedChildType?: string
): Promise<string>  // retorna issue key (ex: "KAN-42")
```

- Monta payload Jira com description em ADF (Atlassian Document Format)
- Gherkin vai como `codeBlock` com language `gherkin`
- Se `parentIssueKey` definido, adiciona `fields.parent`
- Usa `resolvedChildType` (da analise automatica) ou `config.issueType`

### jiraAnalyzer.ts — Analise inteligente de card pai

```typescript
interface ParentAnalysis {
  key: string
  summary: string
  parentType: string          // "Epic", "Story", etc.
  resolvedChildType: string   // tipo resolvido automaticamente
  projectKey: string
  isNextGen: boolean          // team-managed project?
}

analyzeParent(parentKey: string, config: JiraConfig): Promise<ParentAnalysis>
```

**Logica de resolucao de tipo filho:**

| Tipo do pai | Tipo filho resolvido |
|-------------|---------------------|
| Epic | Primeiro tipo que nao e Epic nem Subtask |
| Story/Task/Bug | Subtask (se disponivel), senao primeiro tipo nao-Epic |

- Funciona em qualquer idioma (portugues, ingles, etc.)
- Detecta next-gen via campo `style` da API do projeto

### appium.ts — Comunicacao com Appium

```typescript
createAppiumSession(serverUrl: string, capabilities: Record<string, unknown>): Promise<string>
takeAppiumScreenshot(serverUrl: string, sessionId: string): Promise<string>  // base64 PNG
deleteAppiumSession(serverUrl: string, sessionId: string): Promise<void>
```

- Todas as chamadas passam pelo proxy Express (CORS)
- Usa W3C WebDriver protocol (`capabilities.alwaysMatch`)

---

## Hooks

### useScreenRecorder

```typescript
function useScreenRecorder(): {
  isRecording: boolean
  frames: string[]
  start: () => Promise<void>
  stop: () => void
}
```

| Parametro | Valor |
|-----------|-------|
| Captura | `getDisplayMedia({ video: { frameRate: 1 } })` |
| Intervalo | 1 frame/segundo via `setInterval` |
| Formato | JPEG 70% quality, base64 (sem prefix) |
| Limite | 20 frames |
| Auto-stop | Quando usuario fecha o dialog de compartilhamento |

### useAppiumRecorder

```typescript
function useAppiumRecorder(): {
  isRecording: boolean
  connecting: boolean
  frames: string[]
  error: string | null
  start: (config: AppiumConfig) => Promise<void>
  stop: () => Promise<void>
}
```

| Parametro | Valor |
|-----------|-------|
| Captura | Appium `GET /session/{id}/screenshot` |
| Intervalo | 1 frame/segundo |
| Formato | PNG do Appium → convertido para JPEG 70% via canvas |
| Limite | 20 frames |
| Protecao | `busyRef` evita requests sobrepostos |
| Cleanup | `deleteAppiumSession` no stop (best-effort) |

---

## Server.js — Endpoints do Proxy

**Porta**: 3001 | **JSON limit**: 10mb

### Jira

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/jira/issue/:key` | Busca issue (tipo, projeto, sumario) |
| GET | `/api/jira/project/:key` | Busca projeto (issueTypes, style) |
| POST | `/api/jira/issue` | Cria issue no Jira |

**Autenticacao**: Basic Auth (`base64(email:apiToken)`) adicionada no proxy.

**GET params**: `baseUrl`, `email`, `apiToken` (query string).

**POST body**: `{ baseUrl, email, apiToken, body: { fields: {...} } }`

### Appium

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/appium/session` | Cria sessao Appium (W3C) |
| POST | `/api/appium/screenshot` | Captura screenshot da sessao |
| POST | `/api/appium/session/delete` | Encerra sessao |

**Body**: `{ serverUrl, sessionId?, capabilities? }`

Proxy detecta HTTP vs HTTPS automaticamente via `url.protocol`.

---

## Componentes

### App.tsx — Orquestrador

Maquina de estados:

```
idle → (grava) → analyzing → (Gemini responde) → reviewing → (envia) → idle
                     ↓ erro                                      ↓ erro
                   idle                                        idle
```

### Recorder — Gravacao

- Toggle Desktop / Mobile (Appium)
- Usa ambos hooks (`useScreenRecorder` + `useAppiumRecorder`)
- Appium config salva em `localStorage('appium_config')`
- Estados visuais: idle, connecting, recording

### GherkinEditor — Revisao

- Input para titulo
- Textarea monospace para Gherkin
- Botoes: Voltar / Enviar para o Jira

### JiraModal — Configuracao Jira

- Campos: URL, email, token, projeto, tipo, card pai
- Analise automatica do card pai (debounce 800ms)
- Auto-preenche projeto e tipo do filho
- Salva config em `localStorage('jira_config')`

### AppiumConfigModal — Configuracao Appium

- Campos: servidor, plataforma, device, automation, version, UDID
- Auto-set: Android → UiAutomator2, iOS → XCUITest
- Salva config em `localStorage('appium_config')`

---

## Persistencia (localStorage)

| Chave | Dados | Componente |
|-------|-------|------------|
| `jira_config` | baseUrl, email, apiToken, projectKey, issueType | JiraModal |
| `appium_config` | serverUrl, platformName, deviceName, automationName, ... | AppiumConfigModal |

Nota: `parentIssueKey` do Jira **nao** e persistido (varia por sessao).

---

## Variaveis de ambiente

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `VITE_GEMINI_API_KEY` | Sim | Chave da API Google Gemini |

O prefixo `VITE_` expoe a variavel ao browser via `import.meta.env`.

Credenciais Jira e Appium sao informadas na interface (nao em `.env`).

---

## Design System

### Cores

| Elemento | Valor |
|----------|-------|
| Background | `linear-gradient(135deg, #4f46e5, #7c3aed, #ec4899)` |
| Glass card | `rgba(255,255,255,0.08)` + `backdrop-filter: blur(20px)` |
| Glass modal | `rgba(30,20,60,0.85)` + `backdrop-filter: blur(24px)` |
| Texto primario | `#ffffff` |
| Texto secundario | `rgba(255,255,255,0.6)` |
| Accent | `#c4b5fd` (lilac) |
| Erro | `#fca5a5` sobre `rgba(239,68,68,0.15)` |
| Sucesso | `#6ee7b7` sobre `rgba(16,185,129,0.15)` |

### Tipografia

| Uso | Font | Peso |
|-----|------|------|
| Interface | Inter (Google Fonts) | 400-700 |
| Gherkin editor | JetBrains Mono / Fira Code / Courier New | 400 |

### Efeitos

- Glassmorphism em todos os cards e modais
- Botoes com gradiente + glow no hover (`box-shadow`)
- Titulo com gradiente de texto (`background-clip: text`)
- Transicoes `0.3s ease`
- Recording dot com pulse + glow vermelho

---

## Dependencias

### Producao

| Pacote | Versao | Uso |
|--------|--------|-----|
| react | ^18.3.1 | UI |
| react-dom | ^18.3.1 | DOM rendering |
| @google/generative-ai | ^0.24.1 | Gemini API |
| axios | ^1.13.6 | HTTP client |
| express | ^5.2.1 | Proxy server |
| cors | ^2.8.6 | CORS middleware |
| @capacitor/core | ^8.2.0 | Mobile framework |
| @capacitor/cli | ^8.2.0 | Capacitor CLI |
| @capacitor/android | ^8.2.0 | Android platform |
| @capacitor/ios | ^8.2.0 | iOS platform |

### Desenvolvimento

| Pacote | Uso |
|--------|-----|
| vite ^5.4.10 | Build tool + dev server |
| typescript ~5.6.2 | Type checking |
| concurrently ^9.2.1 | Roda server + vite em paralelo |
| eslint + plugins | Linting |

---

## Decisoes arquiteturais

1. **Proxy Express obrigatorio**: Jira e Appium nao aceitam chamadas diretas do browser (CORS + auth)
2. **Hooks separados**: `useScreenRecorder` e `useAppiumRecorder` sao independentes para facilitar manutencao
3. **JPEG 70%**: Reduz payload em ~60% vs PNG sem perda significativa para analise visual
4. **Max 20 frames**: Balanceia custo de tokens vs qualidade da analise
5. **1 FPS**: Suficiente para capturar transicoes de tela sem redundancia
6. **localStorage**: UX — nao obriga o usuario a preencher configs toda vez
7. **Gherkin em portugues**: Publico-alvo brasileiro
8. **ADF para description**: Formato nativo do Jira v3 — Gherkin aparece como code block formatado
9. **Resolucao automatica de tipo**: Evita erros de hierarquia ao criar subtasks

---

## Limitacoes conhecidas

- Nao ha selecao de frames (envia todos para o Gemini)
- Um cenario por gravacao
- Campos customizados do Jira nao sao suportados
- Sem diff/comparacao de screenshots
- `getDisplayMedia` nao funciona em WebView nativa (apenas browser)
