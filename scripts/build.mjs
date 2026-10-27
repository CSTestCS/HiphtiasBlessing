// Bundles the game into dist/ (index.html, style.css, bundle.js).
import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/bundle.js',
  sourcemap: false,
  logLevel: 'info',
});
copyFileSync('src/index.html', 'dist/index.html');
copyFileSync('src/style.css', 'dist/style.css');
