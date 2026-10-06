import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['**/*.integration.ts'],
  },
});
