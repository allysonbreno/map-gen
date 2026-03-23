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

export type RecordingMode = 'desktop' | 'appium'

export interface AppiumConfig {
  serverUrl: string        // ex: "http://localhost:4723"
  platformName: string     // "Android" | "iOS"
  deviceName: string       // ex: "emulator-5554"
  automationName: string   // "UiAutomator2" | "XCUITest"
  platformVersion?: string
  app?: string             // caminho ou URL do .apk/.ipa (opcional)
  noReset?: boolean
  udid?: string            // para dispositivos reais
}
