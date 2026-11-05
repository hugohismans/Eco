import { defineConfig } from 'vite';

// Le jeu est publié sur GitHub Pages dans le sous-chemin du dépôt :
// https://hugohismans.github.io/Eco/
export default defineConfig({
  base: '/Eco/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
