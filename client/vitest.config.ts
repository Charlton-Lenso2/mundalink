import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Pinned test environment so tests behave the same regardless of the
    // developer's local .env (live-API mode with a deterministic base URL).
    env: {
      VITE_API_BASE_URL: 'http://mundalink.test/api',
      VITE_USE_MOCK_API: 'false',
      VITE_FIREBASE_API_KEY: 'test-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test-project',
      VITE_FIREBASE_APP_ID: 'test-app-id',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
    },
  },
})