import { useState, useRef, useCallback } from 'react'

export function useScreenRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    })

    streamRef.current = stream
    setFrames([])
    setIsRecording(true)

    const video = document.createElement('video')
    video.srcObject = stream
    video.play()
    videoRef.current = video

    // Captura 1 frame por segundo
    intervalRef.current = setInterval(() => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0)
        // JPEG 70% reduz drasticamente o tamanho do payload
        const frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
        setFrames((prev) => (prev.length < 20 ? [...prev, frame] : prev))
      }
    }, 1000)

    stream.getVideoTracks()[0].onended = () => stop()
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setIsRecording(false)
  }, [])

  return { isRecording, frames, start, stop }
}
