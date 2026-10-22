// 実際に生成する Webview HTML を、厳格な CSP のまま Chromium で動かす(VS Code 外のプレビューモード)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { renderWebviewHtml } = require('../out/host/html.js');

let chromium;
try {
  const root = require('child_process').execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(root, 'playwright')));
} catch { /* playwright 無し */ }

for (const [name, bundle, selector] of [['timetable', 'timetable.js', '.dt-task-row'], ['statistics', 'statistics.js', '.st-row']]) {
test(`${name} webview HTML runs under the strict CSP: renders, styles apply, no violations`, { skip: !chromium && 'playwright not available' }, async () => {
  // HTML とアセットは同一オリジンから配信する(別オリジンだとフォントが CORS で落ち、CSP の検証にならない)
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
  let html = '';
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
    const f = path.join('dist', path.basename(req.url.split('?')[0]));
    if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream');
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  html = renderWebviewHtml({ cspSource: origin, nonce: 'abc123', scriptUri: `${origin}/${bundle}`, styleUris: [`${origin}/codicon.css`, `${origin}/webview.css`] });
  const htmlServer = server;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(String(e)));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI)));
    await page.goto(origin + '/');
    await page.waitForSelector(selector, { timeout: 5000 });
    const r = await page.evaluate(async ({ selector, name }) => {
      await document.fonts.ready;
      const row = document.querySelector(selector);
      const styled = name === 'timetable'
        ? getComputedStyle(row).backgroundColor                       // React が CSSOM で当てるカテゴリ色
        : getComputedStyle(row.querySelector('.st-seg')).backgroundColor; // 棒の色
      return {
        font: document.fonts.check('16px codicon'),
        styled,
        cssLoaded: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)' || getComputedStyle(document.body).fontFamily !== '',
        sharedCss: name === 'timetable' ? getComputedStyle(document.querySelector('.dt-button-container')).display === 'flex' : getComputedStyle(row).display === 'grid',
      };
    }, { selector, name });
    assert.deepEqual(problems, []);
    if (name === 'timetable') assert.equal(r.font, true, 'codicon font'); // 統計ビューはアイコン無し(フォントは遅延読込)
    assert.notEqual(r.styled, 'rgba(0, 0, 0, 0)', 'inline style must survive the CSP');
    assert.equal(r.sharedCss, true, 'webview.css applied');
  } finally {
    await browser.close(); server.close();
  }
});
}
