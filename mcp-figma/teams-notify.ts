import axios from 'axios'
import type { WorkflowResult } from './workflow.js'

export async function notifyTeams(
  webhookUrl: string,
  result: WorkflowResult,
  figmaUrl: string
): Promise<void> {
  // Build feature list for the card
  const featureItems = result.features.map((f) => {
    const preview = f.content.split('\n').slice(0, 4).join('\n')
    const jiraInfo = f.jiraKey ? ` → [${f.jiraKey}]` : ''
    return {
      type: 'Container',
      items: [
        {
          type: 'TextBlock',
          text: `**${f.name}**${jiraInfo}`,
          wrap: true,
        },
        {
          type: 'TextBlock',
          text: preview,
          wrap: true,
          fontType: 'Monospace',
          size: 'Small',
        },
      ],
      separator: true,
    }
  })

  // Build Jira links if any
  const jiraKeys = result.features
    .filter((f) => f.jiraKey)
    .map((f) => f.jiraKey)

  const actions: Record<string, unknown>[] = [
    {
      type: 'Action.OpenUrl',
      title: 'Abrir Figma',
      url: figmaUrl,
    },
  ]

  if (jiraKeys.length > 0) {
    const jiraBase = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
    if (jiraBase) {
      actions.push({
        type: 'Action.OpenUrl',
        title: `Ver no Jira (${jiraKeys.length} issues)`,
        url: `${jiraBase}/browse/${jiraKeys[0]}`,
      })
    }
  }

  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: 'FlowSpec — Analise Concluida',
              size: 'Large',
              weight: 'Bolder',
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Telas analisadas', value: String(result.totalFrames) },
                { title: 'Funcionalidades', value: String(result.features.length) },
                ...(jiraKeys.length > 0
                  ? [{ title: 'Issues Jira', value: jiraKeys.join(', ') }]
                  : []),
              ],
            },
            {
              type: 'TextBlock',
              text: '**Cenarios Gerados:**',
              wrap: true,
              spacing: 'Medium',
            },
            ...featureItems,
          ],
          actions,
        },
      },
    ],
  }

  await axios.post(webhookUrl, card, {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function notifyTeamsError(
  webhookUrl: string,
  figmaUrl: string,
  error: string
): Promise<void> {
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: 'FlowSpec — Erro na Analise',
              size: 'Large',
              weight: 'Bolder',
              color: 'Attention',
            },
            {
              type: 'TextBlock',
              text: error,
              wrap: true,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'Abrir Figma',
              url: figmaUrl,
            },
          ],
        },
      },
    ],
  }

  await axios.post(webhookUrl, card, {
    headers: { 'Content-Type': 'application/json' },
  })
}
