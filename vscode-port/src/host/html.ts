export interface HtmlOptions {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUris: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Webview の HTML。inline script/style 無し・nonce 付き script のみ許可する厳格な CSP。
 * ('unsafe-inline' は付けない。React のスタイル適用は CSSOM 経由なので CSP に抵触しない)
 */
export const renderWebviewHtml = (o: HtmlOptions): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${o.cspSource}; font-src ${o.cspSource}; script-src 'nonce-${o.nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${o.styleUris.map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('\n')}
<title>Dynamic Timetable</title>
</head>
<body>
<div id="root"></div>
<script nonce="${o.nonce}" src="${esc(o.scriptUri)}"></script>
</body>
</html>`;
