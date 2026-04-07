import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const FIGMA_TOKEN = process.env.FIGMA_API_KEY ?? ''
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY ?? ''
const JIRA_BASE_URL = process.env.JIRA_BASE_URL ?? ''
const JIRA_EMAIL = process.env.JIRA_EMAIL ?? ''
const JIRA_API_TOKEN = process.env.JIRA_API_KEY ?? ''

const FIGMA_API = 'https://api.figma.com/v1'
const JIRA_PROXY = 'http://localhost:3001/api/jira/issue'
const OUTPUT_DIR = path.resolve(__dirname, '..', 'temp-figma-output')

// ── Helpers ──────────────────────────────────────────────────────────

async function figmaGet(endpoint: string) {
  const res = await axios.get(`${FIGMA_API}${endpoint}`, {
    headers: { 'X-Figma-Token': FIGMA_TOKEN },
  })
  return res.data
}

interface FrameEntry {
  id: string
  name: string
  type: string
  section?: string
}

function extractFrames(
  node: { id: string; name: string; type: string; children?: unknown[] },
  frames: FrameEntry[] = [],
  parentSection?: string
): FrameEntry[] {
  // SECTIONs are containers — recurse and tag children with section name
  if (node.type === 'SECTION') {
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        extractFrames(child as typeof node, frames, node.name)
      }
    }
    return frames
  }

  // Collect FRAME nodes from pages or sections
  if (node.type === 'FRAME') {
    frames.push({ id: node.id, name: node.name, type: node.type, section: parentSection })
  }

  // Recurse into CANVAS (page) nodes
  if (node.type === 'CANVAS' && Array.isArray(node.children)) {
    for (const child of node.children) {
      extractFrames(child as typeof node, frames, parentSection)
    }
  }

  return frames
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '-')
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

// ── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: 'flowspec-figma',
  version: '1.0.0',
})

// ── Tool 1: figma_get_file ───────────────────────────────────────────

server.tool(
  'figma_get_file',
  'Fetch a Figma file structure and list all top-level frames/screens',
  { fileKey: z.string().describe('Figma file key from the file URL') },
  async ({ fileKey }) => {
    try {
      const data = await figmaGet(`/files/${fileKey}?depth=3`)
      const frames: FrameEntry[] = []

      if (data.document?.children) {
        for (const page of data.document.children) {
          extractFrames(page, frames)
        }
      }

      const result = {
        fileName: data.name,
        lastModified: data.lastModified,
        totalFrames: frames.length,
        frames: frames.map((f) => ({ id: f.id, name: f.name, type: f.type, section: f.section })),
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error fetching Figma file: ${msg}` }],
        isError: true,
      }
    }
  }
)

// ── Tool 2: figma_render_frames ──────────────────────────────────────

server.tool(
  'figma_render_frames',
  'Render specific Figma frames as PNG images and get download URLs',
  {
    fileKey: z.string().describe('Figma file key'),
    nodeIds: z.array(z.string()).describe('Array of node IDs to render'),
  },
  async ({ fileKey, nodeIds }) => {
    try {
      const ids = nodeIds.join(',')
      const data = await figmaGet(`/images/${fileKey}?ids=${ids}&format=png&scale=2`)

      if (data.err) {
        return {
          content: [{ type: 'text' as const, text: `Figma render error: ${data.err}` }],
          isError: true,
        }
      }

      const images = Object.entries(data.images).map(([nodeId, url]) => ({
        nodeId,
        imageUrl: url as string,
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(images, null, 2) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error rendering frames: ${msg}` }],
        isError: true,
      }
    }
  }
)

// ── Tool 3: figma_download_images ────────────────────────────────────

server.tool(
  'figma_download_images',
  'Download rendered Figma images, save to temp folder, and return base64',
  {
    images: z.array(
      z.object({
        nodeId: z.string(),
        nodeName: z.string(),
        imageUrl: z.string(),
      })
    ).describe('Array of images with nodeId, nodeName, and imageUrl'),
  },
  async ({ images }) => {
    try {
      const imagesDir = path.join(OUTPUT_DIR, 'images')
      await ensureDir(imagesDir)

      const results = []

      for (const img of images) {
        const response = await axios.get(img.imageUrl, {
          responseType: 'arraybuffer',
        })
        const buffer = Buffer.from(response.data)
        const base64 = buffer.toString('base64')
        const filename = `${sanitizeFilename(img.nodeName)}.png`
        const filePath = path.join(imagesDir, filename)

        await fs.writeFile(filePath, buffer)

        results.push({
          nodeId: img.nodeId,
          nodeName: img.nodeName,
          imagePath: filePath,
          imageBase64: base64,
        })
      }

      // Return metadata without base64 (too large for display)
      const summary = results.map((r) => ({
        nodeId: r.nodeId,
        nodeName: r.nodeName,
        imagePath: r.imagePath,
        base64Length: r.imageBase64.length,
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error downloading images: ${msg}` }],
        isError: true,
      }
    }
  }
)

// ── Tool 4: analyze_design_gherkin ───────────────────────────────────

const GHERKIN_SYSTEM_PROMPT = `Voce e um engenheiro de QA especialista em BDD e Gherkin.
Analise o screenshot de um design de interface (UI) do Figma e gere cenarios de teste completos em formato Gherkin (em portugues).

Considere:
- Elementos visiveis na tela (botoes, campos de texto, labels, navegacao, menus)
- Fluxos possiveis do usuario (caminho feliz e cenarios alternativos)
- Validacoes de campos e estados (campos obrigatorios, formatos, limites)
- Cenarios positivos e negativos
- Acessibilidade e responsividade quando relevante

Estrutura obrigatoria:
- Funcionalidade: (nome descritivo da tela/feature)
- Cenario: (titulo do cenario)
- Dado / Quando / E / Entao (passos)

Gere multiplos cenarios se a tela permitir. Retorne APENAS o texto Gherkin, nada mais.`

server.tool(
  'analyze_design_gherkin',
  'Analyze a Figma design screenshot with Gemini vision and generate Gherkin BDD scenarios',
  {
    nodeId: z.string().describe('Node ID of the frame'),
    nodeName: z.string().describe('Name of the frame'),
    imagePath: z.string().describe('Path to the saved PNG image'),
  },
  async ({ nodeId, nodeName, imagePath }) => {
    try {
      const imageBuffer = await fs.readFile(imagePath)
      const imageBase64 = imageBuffer.toString('base64')

      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const result = await model.generateContent([
        GHERKIN_SYSTEM_PROMPT,
        {
          inlineData: {
            data: imageBase64,
            mimeType: 'image/png',
          },
        },
        `Analise este design de UI chamado "${nodeName}" e gere cenarios de teste Gherkin completos em portugues.`,
      ])

      const gherkinText = result.response.text()

      // Save Gherkin file
      const gherkinsDir = path.join(OUTPUT_DIR, 'gherkins')
      await ensureDir(gherkinsDir)
      const filename = `${sanitizeFilename(nodeName)}.feature`
      const featurePath = path.join(gherkinsDir, filename)
      await fs.writeFile(featurePath, gherkinText, 'utf-8')

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                nodeId,
                nodeName,
                gherkinFile: featurePath,
                imagePath,
                gherkinContent: gherkinText,
              },
              null,
              2
            ),
          },
        ],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error analyzing design: ${msg}` }],
        isError: true,
      }
    }
  }
)

// ── Tool 5: jira_create_issue ────────────────────────────────────────

server.tool(
  'jira_create_issue',
  'Create a Jira issue with Gherkin content in the description',
  {
    summary: z.string().describe('Issue title/summary'),
    gherkinContent: z.string().describe('Gherkin BDD scenario text'),
    projectKey: z.string().describe('Jira project key (e.g., PROJ)'),
    issueType: z.string().default('Story').describe('Issue type name'),
    parentIssueKey: z.string().optional().describe('Parent issue key for subtasks'),
  },
  async ({ summary, gherkinContent, projectKey, issueType, parentIssueKey }) => {
    try {
      if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Jira credentials not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_KEY in .env',
            },
          ],
          isError: true,
        }
      }

      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'codeBlock',
              attrs: { language: 'gherkin' },
              content: [{ type: 'text', text: gherkinContent }],
            },
          ],
        },
        issuetype: { name: issueType },
      }

      if (parentIssueKey?.trim()) {
        fields.parent = { key: parentIssueKey.trim().toUpperCase() }
      }

      const response = await axios.post(JIRA_PROXY, {
        baseUrl: JIRA_BASE_URL,
        email: JIRA_EMAIL,
        apiToken: JIRA_API_TOKEN,
        body: { fields },
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { issueKey: response.data.key, summary, projectKey },
              null,
              2
            ),
          },
        ],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error creating Jira issue: ${msg}` }],
        isError: true,
      }
    }
  }
)

// ── Start Server ─────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
