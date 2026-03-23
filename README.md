# FlowSpec

**Capture. Analyze. Specify.**

FlowSpec grava fluxos de tela (desktop ou mobile), analisa com IA (Google Gemini) e gera cenarios BDD/Gherkin automaticamente — prontos para enviar ao Jira.

---

## O que faz?

1. **Grava** o fluxo da tela (1 frame/segundo, max 20 frames)
2. **Analisa** os frames com Gemini AI (vision) e gera Gherkin em portugues
3. **Revisa** — voce edita o cenario gerado antes de enviar
4. **Envia** para o Jira como issue (Story, Task, Bug, Subtask)

## Modos de gravacao

| Modo | Como funciona | Quando usar |
|------|--------------|-------------|
| **Desktop** | Screen Capture API do navegador (`getDisplayMedia`) | Gravar fluxos em aplicacoes web |
| **Mobile (Appium)** | Screenshots via Appium WebDriver | Gravar fluxos em apps Android/iOS |

---

## Setup rapido

### Pre-requisitos

- Node.js v22+ (recomendado) ou v20+
- Chave da API Gemini (gratuita): [Google AI Studio](https://aistudio.google.com/apikey)

### Instalacao

```bash
git clone https://github.com/allysonbreno/map-gen.git
cd map-gen
npm install
```

### Configuracao

Crie um arquivo `.env` na raiz:

```env
VITE_GEMINI_API_KEY=sua_chave_gemini_aqui
```

### Executando

```bash
npm run dev
```

Abre automaticamente:
- **Frontend**: http://localhost:5173
- **Proxy server**: http://localhost:3001

---

## Como usar

### 1. Gravacao Desktop

1. Selecione o modo **Desktop**
2. Clique em **Iniciar Gravacao**
3. Escolha a tela/janela para compartilhar
4. Navegue pelo fluxo que deseja documentar
5. Clique em **Parar e Analisar**

### 2. Gravacao Mobile (Appium)

**Pre-requisitos adicionais:**
```bash
npm install -g appium
appium driver install uiautomator2   # Android
appium driver install xcuitest       # iOS (requer macOS)
```

1. Inicie o Appium: `appium`
2. Conecte um dispositivo ou inicie um emulador
3. No FlowSpec, selecione o modo **Mobile (Appium)**
4. Clique em **Configurar** e preencha:
   - **Servidor Appium**: `http://localhost:4723`
   - **Plataforma**: Android ou iOS
   - **Device Name**: ex. `emulator-5554`
5. Clique em **Iniciar Gravacao**
6. Opere o app no dispositivo manualmente
7. Clique em **Parar e Analisar**

### 3. Revisao do Gherkin

Apos a analise, o FlowSpec exibe o cenario gerado em Gherkin (portugues):

```gherkin
Funcionalidade: Login de Usuario
  Cenario: Fazer login com credenciais validas
    Dado o usuario esta na pagina de login
    Quando insere email e senha validos
    E clica no botao "Entrar"
    Entao e redirecionado para o dashboard
```

Voce pode editar o titulo e o conteudo antes de enviar.

### 4. Envio para o Jira

1. Clique em **Enviar para o Jira**
2. Preencha as credenciais:
   - **URL do Jira**: `https://sua-empresa.atlassian.net`
   - **E-mail**: seu email do Jira
   - **API Token**: gere em [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
3. Opcionalmente, informe um **card pai** (ex: `KAN-4`) para criar como subtask
   - O tipo filho e detectado automaticamente
4. Clique em **Criar no Jira**

As credenciais sao salvas no navegador (localStorage) para nao precisar preencher novamente.

---

## Scripts disponiveis

| Comando | Descricao |
|---------|-----------|
| `npm run dev` | Inicia frontend + proxy server |
| `npm run build` | Build de producao (dist/) |
| `npm run preview` | Preview do build local |
| `npm run server` | Apenas o proxy server |
| `npm run lint` | Verifica codigo com ESLint |

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite 5
- **IA**: Google Gemini 2.5 Flash (vision)
- **Proxy**: Express 5 (Node.js)
- **Jira**: REST API v3
- **Mobile**: Appium WebDriver Protocol
- **Mobile Build**: Capacitor 8

---

## Estrutura do projeto

```
src/
  components/
    Recorder/            # Gravacao (desktop + appium)
    GherkinEditor/       # Editor de revisao do Gherkin
    JiraModal/           # Config e envio para Jira
    AppiumConfigModal/   # Config do Appium
  hooks/
    useScreenRecorder    # Hook de gravacao desktop
    useAppiumRecorder    # Hook de gravacao mobile
  services/
    gemini.ts            # Analise de frames com Gemini AI
    jira.ts              # Criacao de issues no Jira
    jiraAnalyzer.ts      # Analise inteligente de card pai
    appium.ts            # Comunicacao com Appium
  types/
    index.ts             # Interfaces TypeScript
server.js                # Proxy Express (Jira + Appium)
```

---

## Licenca

MIT
