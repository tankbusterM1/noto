import { defineConfig } from 'vitest/config';

// Pure-logic tests only (node env, no React Native runtime). Test files mock the
// store + native bridge, so nothing here loads Expo/RN native modules.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
