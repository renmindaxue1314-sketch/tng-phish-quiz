import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: change 'base' to '/<your-repo-name>/' before pushing to GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: '/tng-phish-quiz/'
})
