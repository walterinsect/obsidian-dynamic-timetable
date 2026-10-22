import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const prod = process.argv.includes('production');
mkdirSync('dist', { recursive: true });
const common = {
  bundle: true, target: 'es2020', sourcemap: !prod, minify: prod, logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
};

// Extension Host (Node)
await esbuild.build({
  ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js',
  platform: 'node', format: 'cjs', external: ['vscode'],
});

// Webview (browser)
await esbuild.build({
  ...common, entryPoints: { timetable: 'src/webview/timetable/index.tsx', statistics: 'src/webview/statistics/index.tsx' }, outdir: 'dist',
  platform: 'browser', format: 'iife', jsx: 'automatic',
});

copyFileSync('src/webview/styles.css', 'dist/webview.css');
copyFileSync('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicon.css');
copyFileSync('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicon.ttf');
