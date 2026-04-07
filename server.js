import express from 'express'
import cors from 'cors'
import https from 'https'
import http from 'http'
import crypto from 'crypto'
import { spawn } from 'child_process'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(cors())

// Teams webhook needs raw body for HMAC validation — must come BEFORE express.json()
app.use('/api/teams/webhook', express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf }
}))

app.use(express.json({ limit: '10mb' }))

// Utilitário: faz requisição GET autenticada ao Jira
function jiraGet(baseUrl, path, auth) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`)
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    req.end()
  })
}

// Utilitário: faz requisição POST autenticada ao Jira
function jiraPost(baseUrl, path, auth, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${path}`)
    const body = JSON.stringify(payload)
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// GET /api/jira/issue/:key — busca dados de um card (para análise do pai)
app.get('/api/jira/issue/:key', async (req, res) => {
  const { baseUrl, email, apiToken } = req.query
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')

  try {
    const result = await jiraGet(baseUrl, `/rest/api/3/issue/${req.params.key}?fields=issuetype,project,summary`, auth)
    res.status(result.status).json(result.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/jira/project/:key — retorna dados do projeto incluindo issueTypes
app.get('/api/jira/project/:key', async (req, res) => {
  const { baseUrl, email, apiToken } = req.query
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')

  try {
    const result = await jiraGet(baseUrl, `/rest/api/3/project/${req.params.key}`, auth)
    res.status(result.status).json(result.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/jira/issue — cria issue
app.post('/api/jira/issue', async (req, res) => {
  const { baseUrl, email, apiToken, body } = req.body
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')

  try {
    const result = await jiraPost(baseUrl, '/rest/api/3/issue', auth, body)
    res.status(result.status).json(result.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Appium Proxy ──

function appiumRequest(serverUrl, method, path, payload = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${serverUrl}${path}`)
    const lib = url.protocol === 'https:' ? https : http
    const body = payload ? JSON.stringify(payload) : null
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body)

    const req = lib.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// POST /api/appium/session — cria sessão Appium
app.post('/api/appium/session', async (req, res) => {
  const { serverUrl, capabilities } = req.body
  try {
    const result = await appiumRequest(serverUrl, 'POST', '/session', {
      capabilities: { alwaysMatch: capabilities },
    })
    res.status(result.status).json(result.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/appium/screenshot — captura screenshot da sessão
app.post('/api/appium/screenshot', async (req, res) => {
  const { serverUrl, sessionId } = req.body
  try {
    const result = await appiumRequest(serverUrl, 'GET', `/session/${sessionId}/screenshot`)
    res.json({ screenshot: result.body.value })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/appium/session/delete — encerra sessão Appium
app.post('/api/appium/session/delete', async (req, res) => {
  const { serverUrl, sessionId } = req.body
  try {
    const result = await appiumRequest(serverUrl, 'DELETE', `/session/${sessionId}`)
    res.json(result.body)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Teams Outgoing Webhook ──

const TEAMS_WEBHOOK_SECRET = process.env.TEAMS_WEBHOOK_SECRET ?? ''
const TEAMS_INCOMING_WEBHOOK_URL = process.env.TEAMS_INCOMING_WEBHOOK_URL ?? ''

function verifyTeamsHmac(rawBody, secret, authHeader) {
  if (!secret || !authHeader) return false
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody)
    .digest('base64')
  const actual = authHeader.replace(/^HMAC\s+/i, '')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  } catch {
    return false
  }
}

function parseFigmaMessage(text) {
  // Strip HTML tags from Teams message
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()

  // Extract Figma URL
  const urlMatch = clean.match(
    /https:\/\/www\.figma\.com\/design\/([a-zA-Z0-9]+)\/[^\s?]*/
  )
  if (!urlMatch) return null

  const fileKey = urlMatch[1]
  const fullUrl = urlMatch[0]

  // Extract node-id from URL query params
  const nodeIdMatch = clean.match(/[?&]node-id=([0-9]+-[0-9]+)/)
  const nodeId = nodeIdMatch ? nodeIdMatch[1].replace('-', ':') : undefined

  // Extract --jira flag
  const jiraMatch = clean.match(/--jira\s+([A-Z][A-Z0-9-]+)/i)
  const jiraProject = jiraMatch ? jiraMatch[1].toUpperCase() : undefined

  // Extract --parent flag
  const parentMatch = clean.match(/--parent\s+([A-Z][A-Z0-9]+-\d+)/i)
  const jiraParent = parentMatch ? parentMatch[1].toUpperCase() : undefined

  return { fileKey, fullUrl, nodeId, jiraProject, jiraParent }
}

app.post('/api/teams/webhook', async (req, res) => {
  // Validate HMAC if secret is configured
  if (TEAMS_WEBHOOK_SECRET) {
    const authHeader = req.headers.authorization ?? ''
    if (!verifyTeamsHmac(req.rawBody, TEAMS_WEBHOOK_SECRET, authHeader)) {
      return res.status(401).json({ type: 'message', text: 'Unauthorized' })
    }
  }

  const messageText = req.body?.text ?? ''
  const parsed = parseFigmaMessage(messageText)

  if (!parsed) {
    return res.json({
      type: 'message',
      text: 'Envie um link do Figma para analisar.\n\nExemplo: @FlowSpec https://www.figma.com/design/ABC123/Projeto?node-id=22-346 --jira PROJ',
    })
  }

  const { fileKey, fullUrl, nodeId, jiraProject, jiraParent } = parsed
  const nodeInfo = nodeId ? ` (node: ${nodeId})` : ' (arquivo completo)'
  const jiraInfo = jiraProject ? ` → Jira: ${jiraProject}` : ''

  // Respond immediately
  res.json({
    type: 'message',
    text: `Analisando design do Figma${nodeInfo}${jiraInfo}...\n\nVoce recebera os resultados aqui quando a analise terminar.`,
  })

  // Fire-and-forget: run workflow in background via subprocess
  // Using subprocess because workflow.ts uses Agent SDK which needs Claude CLI
  const args = ['tsx', 'mcp-figma/teams-runner.ts', fileKey]
  if (nodeId) args.push('--node-id', nodeId)
  if (jiraProject) args.push('--jira', jiraProject)
  if (jiraParent) args.push('--parent', jiraParent)
  args.push('--figma-url', fullUrl)
  args.push('--teams-webhook', TEAMS_INCOMING_WEBHOOK_URL)

  const child = spawn('npx', args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: true,
    shell: true,
  })

  child.stdout.on('data', (data) => console.log(`[teams-runner] ${data.toString().trim()}`))
  child.stderr.on('data', (data) => console.error(`[teams-runner] ${data.toString().trim()}`))
  child.on('close', (code) => console.log(`[teams-runner] exited with code ${code}`))
  child.unref()
})

app.listen(3001, () => {
  console.log('Proxy server rodando em http://localhost:3001')
})
