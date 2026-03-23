import { useState } from 'react'
import type { AppiumConfig } from '../../types'
import styles from './AppiumConfigModal.module.css'

interface AppiumConfigModalProps {
  onSave: (config: AppiumConfig) => void
  onCancel: () => void
  initial?: AppiumConfig | null
}

const DEFAULT_CONFIG: AppiumConfig = {
  serverUrl: 'http://localhost:4723',
  platformName: 'Android',
  deviceName: 'emulator-5554',
  automationName: 'UiAutomator2',
}

export function AppiumConfigModal({ onSave, onCancel, initial }: AppiumConfigModalProps) {
  const [config, setConfig] = useState<AppiumConfig>(initial ?? DEFAULT_CONFIG)

  const set = <K extends keyof AppiumConfig>(key: K, value: AppiumConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'platformName') {
        next.automationName = value === 'iOS' ? 'XCUITest' : 'UiAutomator2'
      }
      return next
    })
  }

  const handleSave = () => {
    localStorage.setItem('appium_config', JSON.stringify(config))
    onSave(config)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.heading}>Configurar Appium</h2>

        <label className={styles.label}>Servidor Appium</label>
        <input
          className={styles.input}
          placeholder="http://localhost:4723"
          value={config.serverUrl}
          onChange={(e) => set('serverUrl', e.target.value)}
        />

        <label className={styles.label}>Plataforma</label>
        <select
          className={styles.input}
          value={config.platformName}
          onChange={(e) => set('platformName', e.target.value)}
        >
          <option value="Android">Android</option>
          <option value="iOS">iOS</option>
        </select>

        <label className={styles.label}>Device Name</label>
        <input
          className={styles.input}
          placeholder="emulator-5554"
          value={config.deviceName}
          onChange={(e) => set('deviceName', e.target.value)}
        />

        <label className={styles.label}>Automation Name</label>
        <input
          className={styles.input}
          value={config.automationName}
          readOnly
        />

        <label className={styles.label}>
          Platform Version <span className={styles.optional}>(opcional)</span>
        </label>
        <input
          className={styles.input}
          placeholder="Ex: 14.0"
          value={config.platformVersion ?? ''}
          onChange={(e) => set('platformVersion', e.target.value || undefined)}
        />

        <label className={styles.label}>
          UDID <span className={styles.optional}>(opcional — dispositivo real)</span>
        </label>
        <input
          className={styles.input}
          placeholder="Deixe vazio para emulador"
          value={config.udid ?? ''}
          onChange={(e) => set('udid', e.target.value || undefined)}
        />

        <div className={styles.actions}>
          <button className={styles.btnCancel} onClick={onCancel}>Cancelar</button>
          <button className={styles.btnSave} onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
