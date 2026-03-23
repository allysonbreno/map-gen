import { useState } from 'react'
import { Recorder } from './components/Recorder/Recorder'
import { GherkinEditor } from './components/GherkinEditor/GherkinEditor'
import { JiraModal } from './components/JiraModal/JiraModal'
import { analyzeFlow } from './services/gemini'
import { createJiraIssue } from './services/jira'
import type { AppStep, GherkinScenario, JiraConfig } from './types'
import styles from './App.module.css'

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string

export default function App() {
  const [step, setStep] = useState<AppStep>('idle')
  const [scenario, setScenario] = useState<GherkinScenario | null>(null)
  const [showJiraModal, setShowJiraModal] = useState(false)
  const [jiraLoading, setJiraLoading] = useState(false)
  const [jiraResult, setJiraResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRecordingComplete = async (frames: string[]) => {
    if (frames.length === 0) {
      setError('Nenhum frame capturado. Tente novamente.')
      return
    }

    setStep('analyzing')
    setError(null)

    try {
      const result = await analyzeFlow(frames, GEMINI_API_KEY)
      setScenario(result)
      setStep('reviewing')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Gemini]', err)
      setError(`Erro ao analisar o fluxo: ${msg}`)
      setStep('idle')
    }
  }

  const handleJiraSubmit = async (config: JiraConfig) => {
    if (!scenario) return
    setJiraLoading(true)

    try {
      const key = await createJiraIssue(scenario, config)
      setJiraResult(key)
      setShowJiraModal(false)
      setStep('idle')
      setScenario(null)
    } catch (err: unknown) {
      console.error('[Jira]', err)
      const axiosErr = err as { response?: { status: number; data: unknown } }
      const detail = axiosErr.response
        ? `HTTP ${axiosErr.response.status}: ${JSON.stringify(axiosErr.response.data)}`
        : err instanceof Error ? err.message : String(err)
      setError(`Erro ao criar issue no Jira: ${detail}`)
    } finally {
      setJiraLoading(false)
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>FlowDoc</h1>
        <p className={styles.subtitle}>Grave. Analise. Documente.</p>
      </header>

      <main className={styles.main}>
        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {jiraResult && (
          <div className={styles.success}>
            Issue criada com sucesso: <strong>{jiraResult}</strong>
            <button onClick={() => setJiraResult(null)}>✕</button>
          </div>
        )}

        {step === 'idle' && (
          <Recorder onRecordingComplete={handleRecordingComplete} />
        )}

        {step === 'analyzing' && (
          <div className={styles.analyzing}>
            <div className={styles.spinner} />
            <p>Analisando fluxo com Claude...</p>
          </div>
        )}

        {step === 'reviewing' && scenario && (
          <GherkinEditor
            scenario={scenario}
            onConfirm={(updated) => {
              setScenario(updated)
              setShowJiraModal(true)
            }}
            onBack={() => setStep('idle')}
          />
        )}
      </main>

      {showJiraModal && (
        <JiraModal
          onSubmit={handleJiraSubmit}
          onCancel={() => setShowJiraModal(false)}
          loading={jiraLoading}
        />
      )}
    </div>
  )
}
