import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.flowdoc.app',
  appName: 'FlowDoc',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
