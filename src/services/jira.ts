import axios from 'axios'
import type { JiraConfig, GherkinScenario } from '../types'

const PROXY_URL = 'http://localhost:3001/api/jira/issue'

export async function createJiraIssue(
  scenario: GherkinScenario,
  config: JiraConfig,
  resolvedChildType?: string  // tipo resolvido pela análise automática do card pai
): Promise<string> {
  const hasParent = Boolean(config.parentIssueKey?.trim())
  const issueType = resolvedChildType ?? config.issueType

  const fields: Record<string, unknown> = {
    project: { key: config.projectKey },
    summary: scenario.title,
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'gherkin' },
          content: [{ type: 'text', text: scenario.content }],
        },
      ],
    },
    issuetype: { name: issueType },
  }

  if (hasParent) {
    fields.parent = { key: config.parentIssueKey!.trim().toUpperCase() }
  }

  const response = await axios.post(PROXY_URL, {
    baseUrl: config.baseUrl,
    email: config.email,
    apiToken: config.apiToken,
    body: { fields },
  })

  return response.data.key
}
