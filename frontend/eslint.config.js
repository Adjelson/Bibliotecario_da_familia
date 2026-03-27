import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['./src/**/*.{js,ts,jsx,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
   // tailwind.config.js
theme: {
  extend: {
    colors: {
      brand: {
        yellow: '#FFD700', // Amarelo vibrante, alegria e leitura
        orange:  '#FFA500', // Destaque acolhedor, chama ação
        red:     '#FF4500', // Chama atenção em CTA e erros
        black:   '#000000',
        white:   '#FFFFFF',
      }
    }
  }
}

  }
])
