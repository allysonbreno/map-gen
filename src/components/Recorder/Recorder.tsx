import { useState } from 'react'
import { useScreenRecorder } from '../../hooks/useScreenRecorder'
import { useAppiumRecorder } from '../../hooks/useAppiumRecorder'
import { AppiumConfigModal } from '../AppiumConfigModal/AppiumConfigModal'
import type { RecordingMode, AppiumConfig } from '../../types'
import styles from './Recorder.module.css'

interface RecorderProps {
  onRecordingComplete: (frames: string[]) => void
}

export function Recorder({ onRecordingComplete }: RecorderProps) {
  const [mode, setMode] = useState<RecordingMode>('desktop')
  const [showAppiumConfig, setShowAppiumConfig] = useState(false)
  const [appiumConfig, setAppiumConfig] = useState<AppiumConfig | null>(() => {
    const saved = localStorage.getItem('appium_config')
    return saved ? JSON.parse(saved) : null
  })

  const desktop = useScreenRecorder()
  const appium = useAppiumRecorder()

  const isRecording = mode === 'desktop' ? desktop.isRecording : appium.isRecording
  const currentFrames = mode === 'desktop' ? desktop.frames : appium.frames
  const isBusy = isRecording || appium.connecting

  const handleStart = async () => {
    if (mode === 'desktop') {
      desktop.start()
    } else {
      if (!appiumConfig) {
        setShowAppiumConfig(true)
        return
      }
      await appium.start(appiumConfig)
    }
  }

  const handleStop = () => {
    if (mode === 'desktop') {
      desktop.stop()
      onRecordingComplete(desktop.frames)
    } else {
      appium.stop()
      onRecordingComplete(appium.frames)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${mode === 'desktop' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('desktop')}
          disabled={isBusy}
        >
          Desktop
        </button>
        <button
          className={`${styles.modeBtn} ${mode === 'appium' ? styles.modeBtnActive : ''}`}
          onClick={() => setMode('appium')}
          disabled={isBusy}
        >
          Mobile (Appium)
        </button>
      </div>

      {mode === 'appium' && !isBusy && (
        <div className={styles.configArea}>
          {appiumConfig ? (
            <span className={styles.configSummary}>
              {appiumConfig.platformName} — {appiumConfig.deviceName}
            </span>
          ) : (
            <span className={styles.configSummary}>Nenhum dispositivo configurado</span>
          )}
          <button className={styles.btnConfig} onClick={() => setShowAppiumConfig(true)}>
            Configurar
          </button>
        </div>
      )}

      {appium.error && (
        <p className={styles.error}>{appium.error}</p>
      )}

      <div className={styles.status}>
        {isRecording && <span className={styles.dot} />}
        {appium.connecting && <span className={styles.spinner} />}
        <span>
          {appium.connecting
            ? 'Conectando ao Appium...'
            : isRecording
              ? `Gravando... ${currentFrames.length} frames`
              : 'Pronto para gravar'}
        </span>
      </div>

      {!isBusy ? (
        <button className={styles.btnStart} onClick={handleStart}>
          Iniciar Gravacao
        </button>
      ) : (
        <button className={styles.btnStop} onClick={handleStop} disabled={appium.connecting}>
          Parar e Analisar
        </button>
      )}

      {showAppiumConfig && (
        <AppiumConfigModal
          initial={appiumConfig}
          onSave={(cfg) => {
            setAppiumConfig(cfg)
            setShowAppiumConfig(false)
          }}
          onCancel={() => setShowAppiumConfig(false)}
        />
      )}
    </div>
  )
}
