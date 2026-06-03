import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // base relative → fonctionne servi depuis https://<user>.github.io/<repo>/
  base: './',
  plugins: [svelte()],
})
