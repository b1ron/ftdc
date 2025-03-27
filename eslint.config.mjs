import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        window: true,
        document: true,
        console: true,
        fetch: true, // browser-specific globals
        localStorage: true,
        sessionStorage: true,
      },
    },
    rules: {
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'indent': ['error', 2],
      'no-unused-vars': 'warn',
      'no-restricted-globals': ['error', 'process', 'global', 'require'], // prevent Node.js globals
    },
  },
]);
