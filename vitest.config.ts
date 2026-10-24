import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { obsidian: decodeURIComponent(new URL('./tests/mock-obsidian.ts', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1') } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
