import axios from 'axios'
import { query } from '@anthropic-ai/claude-agent-sdk'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const FIGMA_TOKEN = process.env.FIGMA_API_KEY ?? ''
const FIGMA_API = 'https://api.figma.com/v1'
const OUTPUT_DIR = path.resolve(__dirname, '..', 'temp-figma-output')

const JIRA_BASE_URL = process.env.JIRA_BASE_URL ?? ''
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? ''
const JIRA_API_TOKEN = process.env.JIRA_API_KEY ?? ''
const JIRA_PROXY = 'http://localhost:3001/api/jira/issue'

// ── Types ──

export interface WorkflowOptions {
  fileKey: string
  nodeId?: string
  jiraProject?: string
  jiraParent?: string
}

export interface FeatureResult {
  name: string
  content: string
  jiraKey?: string
}

export interface WorkflowResult {
  totalFrames: number
  features: FeatureResult[]
  imagesDir: string
  gherkinsDir: string
}

interface FrameEntry {
  id: string
  name: string
  type: string
  section?: string
}

// ── Helpers ──

function extractFrames(
  node: { id: string; name: string; type: string; children?: unknown[] },
  frames: FrameEntry[] = [],
  parentSection?: string
): FrameEntry[] {
  if (node.type === 'SECTION') {
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        extractFrames(child as typeof node, frames, node.name)
      }
    }
    return frames
  }

  if (node.type === 'FRAME' && parentSection !== undefined) {
    frames.push({ id: node.id, name: node.name, type: node.type, section: parentSection })
  } else if (node.type === 'FRAME' && parentSection === undefined) {
    frames.push({ id: node.id, name: node.name, type: node.type })
  }

  if (node.type === 'CANVAS' && Array.isArray(node.children)) {
    for (const child of node.children) {
      extractFrames(child as typeof node, frames, parentSection)
    }
  }

  return frames
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '-')
}

const GHERKIN_PROMPT = `Voce e um engenheiro de QA especialista em BDD e Gherkin.
Voce vai receber TODAS as telas de um projeto de aplicativo mobile.
Analise o conjunto completo de telas e gere cenarios de teste consolidados por FLUXO/FUNCIONALIDADE.

Regras:
- NAO gere um Gherkin por tela. Agrupe telas que fazem parte do mesmo fluxo.
- Identifique os fluxos do projeto (ex: Login, Cadastro, Catalogo, Pagamento, etc.)
- Para cada fluxo, gere UMA Funcionalidade com multiplos cenarios cobrindo o caminho feliz e cenarios negativos.
- Considere a navegacao entre telas e a jornada completa do usuario.
- Use portugues.
- Estrutura: Funcionalidade / Cenario / Dado / Quando / E / Entao.

IMPORTANTE: Separe cada Funcionalidade com uma linha contendo apenas "---SPLIT---".
Isso sera usado para dividir o output em arquivos separados.
Retorne APENAS o texto Gherkin com os separadores, sem explicacoes, sem markdown code blocks.`

// ── Workflow ──

export async function runFigmaWorkflow(
  opts: WorkflowOptions,
  log: (msg: string) => void = console.log
): Promise<WorkflowResult> {
  // Clean output dir
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  // ── Step 1: Fetch frames ──
  log('[1/4] Buscando estrutura do Figma...')
  const frames: FrameEntry[] = []

  if (opts.nodeId) {
    const nodeRes = await axios.get(
      `${FIGMA_API}/files/${opts.fileKey}/nodes?ids=${opts.nodeId}&depth=2`,
      { headers: { 'X-Figma-Token': FIGMA_TOKEN } }
    )
    const nodeData = nodeRes.data.nodes[opts.nodeId]
    if (!nodeData?.document) {
      throw new Error(`Node ${opts.nodeId} nao encontrado no arquivo.`)
    }
    const rootNode = nodeData.document
    log(`  Node: "${rootNode.name}" (${rootNode.type})`)

    if (rootNode.type === 'SECTION' && Array.isArray(rootNode.children)) {
      for (const child of rootNode.children as typeof rootNode[]) {
        if (child.type === 'FRAME') {
          frames.push({ id: child.id, name: child.name, type: child.type, section: rootNode.name })
        }
      }
    } else if (rootNode.type === 'FRAME') {
      frames.push({ id: rootNode.id, name: rootNode.name, type: rootNode.type })
    } else {
      extractFrames(rootNode, frames)
    }
  } else {
    const fileRes = await axios.get(`${FIGMA_API}/files/${opts.fileKey}?depth=3`, {
      headers: { 'X-Figma-Token': FIGMA_TOKEN },
    })
    for (const page of fileRes.data.document.children) {
      extractFrames(page, frames)
    }
  }

  log(`  Frames encontrados: ${frames.length}`)
  if (frames.length === 0) {
    throw new Error('Nenhum frame encontrado no arquivo Figma.')
  }

  // ── Step 2: Render frames ──
  log('[2/4] Renderizando frames como PNG...')
  const ids = frames.map((f) => f.id).join(',')
  const imgRes = await axios.get(`${FIGMA_API}/images/${opts.fileKey}?ids=${ids}&format=png&scale=2`, {
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  })
  const imageMap = imgRes.data.images as Record<string, string>

  // ── Step 3: Download images ──
  log('[3/4] Baixando imagens...')
  const imagesDir = path.join(OUTPUT_DIR, 'images')
  await fs.mkdir(imagesDir, { recursive: true })

  const downloaded: { name: string; fullName: string; path: string }[] = []

  for (const frame of frames) {
    const url = imageMap[frame.id]
    if (!url) continue
    const res = await axios.get(url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(res.data)
    const fullName = frame.section ? `${frame.section}_${frame.name}` : frame.name
    const filename = `${sanitize(fullName)}.png`
    const filePath = path.join(imagesDir, filename)
    await fs.writeFile(filePath, buffer)
    downloaded.push({ name: frame.name, fullName, path: filePath })
  }
  log(`  ${downloaded.length} imagens baixadas`)

  // ── Step 4: Analyze with Claude Agent SDK ──
  log(`[4/4] Analisando ${downloaded.length} telas com Claude (consolidado por fluxo)...`)
  const gherkinsDir = path.join(OUTPUT_DIR, 'gherkins')
  await fs.mkdir(gherkinsDir, { recursive: true })

  const imageList = downloaded.map((img) => `- "${img.name}" → ${img.path}`).join('\n')

  let fullResult = ''

  for await (const message of query({
    prompt: [
      GHERKIN_PROMPT,
      '',
      `O projeto tem ${downloaded.length} telas. Leia TODAS as imagens abaixo:`,
      '',
      imageList,
      '',
      'Analise todas as telas como um projeto unico e gere Gherkins consolidados por fluxo.',
      'Lembre-se: separe cada Funcionalidade com "---SPLIT---" entre elas.',
      'Retorne APENAS o texto Gherkin com os separadores.',
    ].join('\n'),
    options: {
      allowedTools: ['Read'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
    },
  })) {
    if ('result' in message) {
      fullResult = message.result
    }
  }

  if (!fullResult.trim()) {
    throw new Error('Claude retornou resposta vazia')
  }

  // Clean markdown fences
  fullResult = fullResult.replace(/^```(?:gherkin)?\n?/gm, '').replace(/```$/gm, '').trim()

  // Split into features
  const featureTexts = fullResult
    .split(/---SPLIT---/i)
    .map((f) => f.trim())
    .filter((f) => f.length > 0)

  log(`  ${featureTexts.length} funcionalidades geradas`)

  const features: FeatureResult[] = []

  for (let i = 0; i < featureTexts.length; i++) {
    const content = featureTexts[i]
    const nameMatch = content.match(/Funcionalidade:\s*(.+)/i)
    const name = nameMatch ? nameMatch[1].trim() : `feature-${i + 1}`
    const filename = `${sanitize(name)}.feature`
    await fs.writeFile(path.join(gherkinsDir, filename), content, 'utf-8')

    const feature: FeatureResult = { name, content }

    // Create Jira issue if requested
    if (opts.jiraProject && JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN) {
      try {
        const jiraRes = await axios.post(JIRA_PROXY, {
          baseUrl: JIRA_BASE_URL,
          email: JIRA_EMAIL,
          apiToken: JIRA_API_TOKEN,
          body: {
            fields: {
              project: { key: opts.jiraProject },
              summary: `[FlowSpec] ${name}`,
              description: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'codeBlock',
                    attrs: { language: 'gherkin' },
                    content: [{ type: 'text', text: content }],
                  },
                ],
              },
              issuetype: { name: 'Story' },
              ...(opts.jiraParent ? { parent: { key: opts.jiraParent } } : {}),
            },
          },
        })
        feature.jiraKey = jiraRes.data.key
        log(`  Jira: ${feature.jiraKey} — ${name}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`  Jira ERRO: ${name} — ${msg}`)
      }
    }

    features.push(feature)
    log(`  OK: ${filename}`)
  }

  return { totalFrames: downloaded.length, features, imagesDir, gherkinsDir }
}
