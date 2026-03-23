import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GherkinScenario } from '../types'

const SYSTEM_PROMPT = `Você é um engenheiro de QA especialista em BDD e Gherkin.
Analise a sequência de screenshots fornecida e gere um cenário de teste completo em formato Gherkin (em português).
O cenário deve seguir a estrutura:
- Funcionalidade: (nome da funcionalidade)
- Cenário: (título do cenário)
- Dado / Quando / E / Então (passos)

Seja conciso, objetivo e evite duplicar passos. Retorne APENAS o texto Gherkin, sem mais nada.`

export async function analyzeFlow(
  frames: string[],
  apiKey: string
): Promise<GherkinScenario> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const imageParts = frames.map((frame) => ({
    inlineData: {
      data: frame,
      mimeType: 'image/jpeg' as const,
    },
  }))

  const result = await model.generateContent([
    SYSTEM_PROMPT,
    ...imageParts,
    'Analise estas capturas de tela em sequência e gere o cenário de teste Gherkin correspondente.',
  ])

  const gherkinText = result.response.text()
  const titleMatch = gherkinText.match(/Cenário:\s*(.+)/i)
  const title = titleMatch ? titleMatch[1].trim() : 'Cenário gerado'

  return { title, content: gherkinText }
}
