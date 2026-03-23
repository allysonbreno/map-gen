import { useScreenRecorder } from '../../hooks/useScreenRecorder'
import styles from './Recorder.module.css'

interface RecorderProps {
  onRecordingComplete: (frames: string[]) => void
}

export function Recorder({ onRecordingComplete }: RecorderProps) {
  const { isRecording, frames, start, stop } = useScreenRecorder()

  const handleStop = () => {
    stop()
    onRecordingComplete(frames)
  }

  return (
    <div className={styles.container}>
      <div className={styles.status}>
        {isRecording ? (
          <span className={styles.dot} />
        ) : null}
        <span>{isRecording ? `Gravando... ${frames.length} frames` : 'Pronto para gravar'}</span>
      </div>

      {!isRecording ? (
        <button className={styles.btnStart} onClick={start}>
          Iniciar Gravação
        </button>
      ) : (
        <button className={styles.btnStop} onClick={handleStop}>
          Parar e Analisar
        </button>
      )}
    </div>
  )
}
