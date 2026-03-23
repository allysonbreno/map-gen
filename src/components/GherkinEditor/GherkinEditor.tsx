import { useState } from 'react'
import type { GherkinScenario } from '../../types'
import styles from './GherkinEditor.module.css'

interface GherkinEditorProps {
  scenario: GherkinScenario
  onConfirm: (scenario: GherkinScenario) => void
  onBack: () => void
}

export function GherkinEditor({ scenario, onConfirm, onBack }: GherkinEditorProps) {
  const [content, setContent] = useState(scenario.content)
  const [title, setTitle] = useState(scenario.title)

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Revisar Cenário</h2>

      <label className={styles.label}>Título</label>
      <input
        className={styles.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className={styles.label}>Gherkin</label>
      <textarea
        className={styles.textarea}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={16}
        spellCheck={false}
      />

      <div className={styles.actions}>
        <button className={styles.btnBack} onClick={onBack}>Voltar</button>
        <button
          className={styles.btnConfirm}
          onClick={() => onConfirm({ title, content })}
        >
          Enviar para o Jira
        </button>
      </div>
    </div>
  )
}
