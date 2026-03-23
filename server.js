import express from 'express'
import cors from 'cors'
import https from 'https'
import http from 'http'

const app = express()
app.use(cors())
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

app.listen(3001, () => {
  console.log('Proxy server rodando em http://localhost:3001')
})
