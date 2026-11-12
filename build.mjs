import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/app.js', target: 'es2022' });
await Promise.all(['index.html', 'style.css', 'favicon.svg'].map(file => copyFile(`src/${file}`, `dist/${file}`)));
console.log('Built The End of Time.');
