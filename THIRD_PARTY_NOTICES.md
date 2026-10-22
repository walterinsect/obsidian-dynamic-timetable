# Third-Party Notices

Dynamic Timetable for VS Code is released under the MIT License (see [LICENSE.md](LICENSE.md)).
This file lists the upstream work it is derived from and the third-party components bundled in the extension.

## 1. Original plugin: Dynamic Timetable for Obsidian

This extension is a port of the Obsidian plugin **Dynamic Timetable** by L7Cy
(<https://github.com/L7Cy/obsidian-dynamic-timetable>), via the fork
<https://github.com/walterinsect/obsidian-dynamic-timetable>.

Substantial portions of the task parser (`src/core/TaskParser.ts`), the color utilities
(`src/core/ColorUtils.ts`) and parts of the timetable / statistics UI logic and React components
are derived from the original plugin (version 4.6.1). The original MIT notice is reproduced below
and in [LICENSE.md](LICENSE.md):

```
MIT License

Copyright (c) 2023 L7Cy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. Bundled components

| Component | Version | License | Copyright |
| --- | --- | --- | --- |
| [react](https://github.com/facebook/react) | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [react-dom](https://github.com/facebook/react) | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [scheduler](https://github.com/facebook/react) | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| [@vscode/codicons](https://github.com/microsoft/vscode-codicons) (code) | 0.0.46-24 | MIT | Copyright (c) Microsoft Corporation. |
| [@vscode/codicons](https://github.com/microsoft/vscode-codicons) (icon font `codicon.ttf`) | 0.0.46-24 | CC BY 4.0 | Copyright (c) Microsoft Corporation. |

### MIT License (react, react-dom, scheduler, @vscode/codicons code)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Codicons icon font (CC BY 4.0)

The icons in the UI are rendered with the Codicons icon font by Microsoft Corporation
(<https://github.com/microsoft/vscode-codicons>), licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
The font is bundled unmodified as `dist/codicon.ttf`.
