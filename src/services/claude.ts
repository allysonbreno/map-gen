import axios from 'axios'
import type { GherkinScenario } from '../types'

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'

const SYSTEM_PROMPT = `You are a QA engineer expert in BDD and Gherkin.
Analyze the sequence of screenshots provided and generate a complete test scenario in Gherkin format (Portuguese).
The scenario must follow the structure:
- Funcionalidade: (feature name)
- Cenário: (scenario title)
- Dado / Quando / E / Então (steps)

Be concise, objective, and avoid duplicating steps. Return ONLY the Gherkin text, nothing else.`

export async function analyzeFlow(
  frames: string[],
  apiKey: string
): Promise<GherkinScenario> {
  const imageContent = frames.map((frame) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: frame,
    },
  }))

  const response = await axios.post(
    CLAUDE_API_URL,
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: 'Analise estas capturas de tela em sequência e gere o cenário de teste Gherkin correspondente.',
            },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  )

  const gherkinText: string = response.data.content[0].text
  const titleMatch = gherkinText.match(/Cenário:\s*(.+)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Cenário gerado'

  return { title, content: gherkinText }
}
