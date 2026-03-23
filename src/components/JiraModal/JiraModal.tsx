import { useState } from 'react'
import type { JiraConfig } from '../../types'
import styles from './JiraModal.module.css'

interface JiraModalProps {
  onSubmit: (config: JiraConfig) => void
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
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG
  })

  const set = (key: keyof JiraConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = () => {
    localStorage.setItem('jira_config', JSON.stringify(config))
    onSubmit(config)
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
          placeholder="Ex: PROJ"
          value={config.projectKey}
          onChange={(e) => set('projectKey', e.target.value)}
        />

        <label className={styles.label}>Tipo de Issue</label>
        <select
          className={styles.input}
          value={config.issueType}
          onChange={(e) => set('issueType', e.target.value)}
        >
          <option>Story</option>
          <option>Task</option>
          <option>Bug</option>
          <option>Test</option>
        </select>

        <label className={styles.label}>
          Tarefa pai <span className={styles.optional}>(opcional — ex: PROJ-42)</span>
        </label>
        <input
          className={styles.input}
          placeholder="Deixe vazio para criar issue avulsa"
          value={config.parentIssueKey ?? ''}
          onChange={(e) => set('parentIssueKey', e.target.value)}
        />
        {config.parentIssueKey?.trim() && (
          <p className={styles.hint}>
            Será criada como <strong>Subtask</strong> de {config.parentIssueKey.trim().toUpperCase()}
          </p>
        )}

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button className={styles.btnSubmit} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Enviando...' : 'Criar no Jira'}
          </button>
        </div>
      </div>
    </div>
  )
}
