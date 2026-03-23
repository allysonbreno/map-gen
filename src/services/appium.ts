import axios from 'axios'

const PROXY = 'http://localhost:3001/api/appium'

export async function createAppiumSession(
  serverUrl: string,
  capabilities: Record<string, unknown>
): Promise<string> {
  const res = await axios.post(`${PROXY}/session`, { serverUrl, capabilities })
  return res.data.value.sessionId
}

export async function takeAppiumScreenshot(
  serverUrl: string,
  sessionId: string
): Promise<string> {
  const res = await axios.post(`${PROXY}/screenshot`, { serverUrl, sessionId })
  return res.data.screenshot // base64 PNG
}

export async function deleteAppiumSession(
  serverUrl: string,
  sessionId: string
): Promise<void> {
  await axios.post(`${PROXY}/session/delete`, { serverUrl, sessionId })
}
