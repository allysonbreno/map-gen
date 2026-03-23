import axios from 'axios'
import type { JiraConfig } from '../types'

const PROXY = 'http://localhost:3001/api/jira'

export interface ParentAnalysis {
  key: string
  summary: string
  parentType: string
  resolvedChildType: string
  projectKey: string
  isNextGen: boolean
}

// Dado o tipo do pai e os tipos disponíveis, resolve o melhor tipo filho
function resolveChildType(parentType: string, availableTypes: string[]): string {
  const parentLower = parentType.toLowerCase()
  const available = availableTypes.map((t) => t.toLowerCase())

  // Para filho de Epic: primeiro tipo que não seja Epic nem subtask (funciona em qualquer idioma)
  if (parentLower === 'epic') {
    const subtaskKeywords = ['subtask', 'sub-task', 'subtarefa', 'sub-tarefa']
    return (
      availableTypes.find(
        (t) => t.toLowerCase() !== 'epic' && !subtaskKeywords.includes(t.toLowerCase())
      ) ?? availableTypes[0]
    )
  }

  // Para filho de Story/Task/Bug: preferir tipo subtask (nomes em qualquer idioma)
  for (const candidate of ['subtask', 'sub-task', 'subtarefa', 'sub-tarefa']) {
    const idx = available.indexOf(candidate)
    if (idx !== -1) return availableTypes[idx]
  }

  // Fallback: primeiro tipo que não seja Epic
  return availableTypes.find((t) => t.toLowerCase() !== 'epic') ?? availableTypes[0]
}

export async function analyzeParent(
  parentKey: string,
  config: JiraConfig
): Promise<ParentAnalysis> {
  const params = {
    baseUrl: config.baseUrl,
    email: config.email,
    apiToken: config.apiToken,
  }

  // 1. Busca o card pai
  const issueRes = await axios.get(`${PROXY}/issue/${parentKey.trim().toUpperCase()}`, { params })

  if (issueRes.status !== 200) {
    throw new Error(`Card ${parentKey} não encontrado ou sem permissão.`)
  }

  const issue = issueRes.data
  const parentType: string = issue.fields.issuetype.name
  const projectKey: string = issue.fields.project.key
  const summary: string = issue.fields.summary

  // 2. Busca tipos disponíveis e estilo do projeto
  let availableTypes: string[] = []
  let isNextGen = false
  try {
    const projectRes = await axios.get(`${PROXY}/project/${projectKey}`, { params })
    availableTypes = (projectRes.data?.issueTypes ?? []).map((t: { name: string }) => t.name)
    // next-gen (team-managed) é identificado pelo campo style retornado pela API
    isNextGen = projectRes.data?.style === 'next-gen'
  } catch {
    availableTypes = ['Story', 'Task', 'Bug', 'Epic']
  }

  // 4. Resolve o tipo filho correto
  const resolvedChildType = resolveChildType(parentType, availableTypes)

  return {
    key: parentKey.trim().toUpperCase(),
    summary,
    parentType,
    resolvedChildType,
    projectKey,
    isNextGen,
  }
}
