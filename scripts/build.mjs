// Bundles the game into dist/ (index.html, style.css, bundle.js).
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync, existsSync, statSync } from 'fs';

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

// bundled models
mkdirSync('dist/models', { recursive: true });
for (const f of readdirSync('assets/models')) {
  const src = 'assets/models/' + f;
  const dst = 'dist/models/' + f;
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
}
