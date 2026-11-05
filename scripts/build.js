'use strict';
// Bundles the extension and copies the font into media/. Run: npm run build
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fontDir = path.join(root, 'media', 'fonts');
fs.mkdirSync(fontDir, { recursive: true });
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const vazirmatn = path.join(root, 'node_modules', 'vazirmatn');
fs.copyFileSync(path.join(vazirmatn, 'fonts', 'webfonts', 'Vazirmatn[wght].woff2'), path.join(fontDir, 'Vazirmatn-Variable.woff2'));
fs.copyFileSync(path.join(vazirmatn, 'OFL.txt'), path.join(fontDir, 'OFL.txt'));

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'extension.js')],
  outfile: path.join(root, 'dist', 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  minify: true,
});
console.log('built dist/extension.js');
