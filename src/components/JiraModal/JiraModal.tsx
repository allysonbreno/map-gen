import { useState, useRef } from 'react'
import type { JiraConfig } from '../../types'
import { analyzeParent, type ParentAnalysis } from '../../services/jiraAnalyzer'
import styles from './JiraModal.module.css'

interface JiraModalProps {
  onSubmit: (config: JiraConfig, resolvedChildType?: string) => void
  onCancel: () => void
  loading: boolean
}

const DEFAULT_CONFIG: JiraConfig = {
  baseUrl: '',
  email: '',
  apiToken: '',
  projectKey: '',
  issueType: 'Story',
}

export function JiraModal({ onSubmit, onCancel, loading }: JiraModalProps) {
  const [config, setConfig] = useState<JiraConfig>(() => {
    const saved = localStorage.getItem('jira_config')
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved), parentIssueKey: '' } : DEFAULT_CONFIG
  })
  const [analysis, setAnalysis] = useState<ParentAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = (key: keyof JiraConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleParentKeyChange = (value: string) => {
    set('parentIssueKey', value)
    setAnalysis(null)
    setAnalysisError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = value.trim()
    if (!trimmed || !config.baseUrl || !config.email || !config.apiToken) return

    debounceRef.current = setTimeout(async () => {
      setAnalyzing(true)
      try {
        const result = await analyzeParent(trimmed, config)
        setAnalysis(result)
        setConfig((prev) => ({ ...prev, projectKey: result.projectKey }))
      } catch (err) {
        setAnalysisError(err instanceof Error ? err.message : 'Erro ao buscar card pai.')
      } finally {
        setAnalyzing(false)
      }
    }, 800)
  }

  const handleSubmit = () => {
    const configToSave = { ...config, parentIssueKey: undefined }
    localStorage.setItem('jira_config', JSON.stringify(configToSave))
    onSubmit(config, analysis?.resolvedChildType)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.heading}>Configuração do Jira</h2>

        <label className={styles.label}>URL do Jira</label>
        <input
          className={styles.input}
          placeholder="https://empresa.atlassian.net"
          value={config.baseUrl}
          onChange={(e) => set('baseUrl', e.target.value)}
        />

        <label className={styles.label}>E-mail</label>
        <input
          className={styles.input}
          placeholder="seu@email.com"
          value={config.email}
          onChange={(e) => set('email', e.target.value)}
        />

        <label className={styles.label}>API Token</label>
        <input
          className={styles.input}
          type="password"
          placeholder="Token gerado no Jira"
          value={config.apiToken}
          onChange={(e) => set('apiToken', e.target.value)}
        />

        <label className={styles.label}>Chave do Projeto</label>
        <input
          className={styles.input}
          placeholder="Ex: KAN (preenchido automaticamente ao informar card pai)"
          value={config.projectKey}
          onChange={(e) => set('projectKey', e.target.value)}
        />

        <label className={styles.label}>
          Tipo de Issue <span className={styles.optional}>(ignorado se houver card pai)</span>
        </label>
        <select
          className={styles.input}
          value={config.issueType}
          onChange={(e) => set('issueType', e.target.value)}
          disabled={Boolean(analysis)}
        >
          <option>Story</option>
          <option>Task</option>
          <option>Bug</option>
          <option>Test</option>
        </select>

        <label className={styles.label}>
          Card pai <span className={styles.optional}>(opcional — ex: KAN-4)</span>
        </label>
        <input
          className={styles.input}
          placeholder="Deixe vazio para criar issue avulsa"
          value={config.parentIssueKey ?? ''}
          onChange={(e) => handleParentKeyChange(e.target.value)}
        />

        {analyzing && <p className={styles.hintNeutral}>Consultando card no Jira...</p>}

        {analysisError && <p className={styles.hintError}>{analysisError}</p>}

        {analysis && (
          <div className={styles.hintSuccess}>
            <strong>{analysis.key}</strong>: {analysis.summary}
            <br />
            Tipo pai: <strong>{analysis.parentType}</strong> → Será criado como:{' '}
            <strong>{analysis.resolvedChildType}</strong>
            {analysis.isNextGen && <span className={styles.badge}>next-gen</span>}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            className={styles.btnSubmit}
            onClick={handleSubmit}
            disabled={loading || analyzing}
          >
            {loading ? 'Enviando...' : 'Criar no Jira'}
          </button>
        </div>
      </div>
    </div>
  )
}
