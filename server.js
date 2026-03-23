import express from 'express'
import cors from 'cors'
import https from 'https'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Proxy para Jira — evita bloqueio de CORS no browser
app.post('/api/jira/issue', async (req, res) => {
  const { baseUrl, email, apiToken, body } = req.body

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
  const url = new URL(`${baseUrl}/rest/api/3/issue`)

  const payload = JSON.stringify(body)

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }

  const proxyReq = https.request(options, (proxyRes) => {
    let data = ''
    proxyRes.on('data', (chunk) => (data += chunk))
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode).json(JSON.parse(data))
    })
  })

  proxyReq.on('error', (err) => {
    res.status(500).json({ error: err.message })
  })

  proxyReq.write(payload)
  proxyReq.end()
})

app.listen(3001, () => {
  console.log('Proxy server rodando em http://localhost:3001')
})
