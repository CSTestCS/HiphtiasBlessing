// Bundles the game into dist/ (index.html, style.css, bundle.js).
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync, existsSync, statSync } from 'fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: process.env.NOMIN !== '1',
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/bundle.js',
  sourcemap: false,
  logLevel: 'info',
});
copyFileSync('src/index.html', 'dist/index.html');
copyFileSync('src/style.css', 'dist/style.css');
copyFileSync('src/favicon.png', 'dist/favicon.png');

// bundled models
mkdirSync('dist/models', { recursive: true });
for (const f of readdirSync('assets/models')) {
  const src = 'assets/models/' + f;
  const dst = 'dist/models/' + f;
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
}

// fonts (Comic Neue, SIL Open Font License)
mkdirSync('dist/fonts', { recursive: true });
for (const f of readdirSync('assets/fonts')) copyFileSync('assets/fonts/' + f, 'dist/fonts/' + f);

// underwear overlays
mkdirSync('dist/underwear', { recursive: true });
copyFileSync('assets/underwear/union.png', 'dist/underwear/union.png');
for (const sub of ['panties', 'bras', 'patterns']) {
  mkdirSync('dist/underwear/' + sub, { recursive: true });
  for (const f of readdirSync('assets/underwear/' + sub)) {
    const dst = 'dist/underwear/' + sub + '/' + f;
    if (!existsSync(dst)) copyFileSync('assets/underwear/' + sub + '/' + f, dst);
  }
}
