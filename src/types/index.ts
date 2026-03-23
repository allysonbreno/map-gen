export interface RecordingSession {
  id: string
  frames: string[] // base64 screenshots
  startedAt: Date
  endedAt?: Date
}

export interface GherkinScenario {
  title: string
  content: string
}

export interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
  projectKey: string
  issueType: string
  parentIssueKey?: string // ex: PROJ-42 — se preenchido, cria como subtarefa
}

export type AppStep = 'idle' | 'recording' | 'analyzing' | 'reviewing' | 'sending'
