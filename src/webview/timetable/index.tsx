import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { vscodeApi } from '../vscodeApi';
import { buildSampleMessage } from '../sample';

createRoot(document.getElementById('root')!).render(<App />);

// VS Code 外(preview/*.html)では静的サンプルを流し込む
if (!vscodeApi) setTimeout(() => window.postMessage(buildSampleMessage(), '*'), 100);
