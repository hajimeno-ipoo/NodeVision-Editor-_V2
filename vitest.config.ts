import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['packages/nvctl/src/index.ts', 'apps/**', 'scripts/**'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  },
  resolve: {
    alias: {
      '@nodevision/settings': path.resolve(__dirname, 'packages/settings/src'),
      '@nodevision/tokens': path.resolve(__dirname, 'packages/tokens/src'),
      '@nodevision/system-check': path.resolve(__dirname, 'packages/system-check/src')
    }
  }
});
