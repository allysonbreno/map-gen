import { useState, useRef, useCallback } from 'react'
import { createAppiumSession, takeAppiumScreenshot, deleteAppiumSession } from '../services/appium'
import type { AppiumConfig } from '../types'

function pngToJpeg(base64Png: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const jpeg = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      resolve(jpeg)
    }
    img.src = `data:image/png;base64,${base64Png}`
  })
}

export function useAppiumRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const configRef = useRef<AppiumConfig | null>(null)
  const busyRef = useRef(false)

  const start = useCallback(async (config: AppiumConfig) => {
    setError(null)
    setFrames([])
    setConnecting(true)
    configRef.current = config

    try {
      const capabilities: Record<string, unknown> = {
        platformName: config.platformName,
        'appium:deviceName': config.deviceName,
        'appium:automationName': config.automationName,
      }
      if (config.platformVersion) capabilities['appium:platformVersion'] = config.platformVersion
      if (config.app) capabilities['appium:app'] = config.app
      if (config.noReset) capabilities['appium:noReset'] = config.noReset
      if (config.udid) capabilities['appium:udid'] = config.udid

      const sessionId = await createAppiumSession(config.serverUrl, capabilities)
      sessionIdRef.current = sessionId
      setConnecting(false)
      setIsRecording(true)

      intervalRef.current = setInterval(async () => {
        if (busyRef.current) return
        busyRef.current = true
        try {
          const pngBase64 = await takeAppiumScreenshot(config.serverUrl, sessionId)
          const jpegBase64 = await pngToJpeg(pngBase64)
          setFrames((prev) => (prev.length < 20 ? [...prev, jpegBase64] : prev))
        } catch {
          // skip failed screenshots
        } finally {
          busyRef.current = false
        }
      }, 1000)
    } catch (err) {
      setConnecting(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const stop = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    if (sessionIdRef.current && configRef.current) {
      try {
        await deleteAppiumSession(configRef.current.serverUrl, sessionIdRef.current)
      } catch {
        // best-effort cleanup
      }
      sessionIdRef.current = null
    }
    setIsRecording(false)
    setConnecting(false)
  }, [])

  return { isRecording, connecting, frames, error, start, stop }
}
