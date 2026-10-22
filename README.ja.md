# Dynamic Timetable (VS Code)

[English](https://github.com/walterinsect/obsidian-dynamic-timetable/blob/vscode-port/vscode-port/README.md) | 日本語

Markdown のタスクリストから、見積り時間に基づくタイムテーブルを作る VS Code 拡張です。
[L7Cy/obsidian-dynamic-timetable](https://github.com/L7Cy/obsidian-dynamic-timetable)(MIT)の移植版です。

```markdown
---
startTime: 09:00:00
---
- [ ] 設計レビューの準備 ; 30 #work
- [ ] 昼休み ; 45 @ 12:00 #life
- [ ] 実装 ; 90 #work
```

- `;` の後ろが見積り(分)、`@` の後ろが明示的な開始時刻、`#` がカテゴリです。
- アクティビティバーの **Dynamic Timetable** を開くと、アクティブな Markdown ファイルのタイムテーブル(Timetable)とカテゴリ別の集計(Statistics)が表示されます。
- Statistics は `#カテゴリ` ごとの実績(完了)と残り(見積り)を積み上げ棒で表示します。色は Timetable と共通です。
- コマンド: Show Timetable / Show Statistics / Complete Task / Interrupt Task / Refresh / Pin Current File / Open Settings
- ステータスバーにタスクの進捗(例: `3/8 (38%)` = 完了数/認識数と完了率)を表示します。Timetable に表示されるタスクと同じ範囲を数え、編集に合わせて更新され、クリックすると Timetable を開きます。`dynamicTimetable.showProgressInStatusBar` でオフにできます。
- Complete / Interrupt はファイルを書き換え、`startTime` を現在時刻に更新します(既定で保存まで行います)。

## 打刻(Created)

`dynamicTimetable.enableTimestamps`(**既定はオン**)により、タスク行へ作成時刻 `(@created: …)` を記録し、完了行の実績開始時刻を日付付き(`@ YYYY-MM-DD HH:mm`)で書きます。どちらも既定で `YYYY-MM-DD HH:mm` 形式です。Complete では打刻を追記しません。オフにすると打刻は行われず、開始時刻は従来どおり `@ HH:MM` で書かれます。`@ HH:MM` / `@ HHMM` / `@ YYYY-MM-DDTHH:mm` の旧形式も引き続き読み取れます。

```markdown
- [ ] 実装 ; 60 #work (@created: 2026-10-21 09:12)                       ← テンプレートで作成
- [x] 実装 ; 37 @ 2026-10-21 09:12 #work (@created: 2026-10-21 09:12)   ← Complete(打刻は追記されない)
```

| 操作 | 記録 |
|---|---|
| テンプレートでタスクを作成 | `(@created: 作成時刻)` |
| Complete | 何も追記しない。既存の Created は保持 |
| Interrupt | 残りのタスクに `(@created: 中断時刻)`(元の Created は引き継ぎません)。完了行には何も追記しない |

- 書式は `dynamicTimetable.timestampFormat`(既定 `YYYY-MM-DD HH:mm`、トークン `YYYY MM DD HH mm ss`、`)` は使えません)。実績開始時刻の書式には影響せず、こちらは常に `YYYY-MM-DD HH:mm` です。
- 手書きのタスクに Created は後付けしません。
- `(@done: …)` は 0.8.0 より前のバージョンが書いていました。今は書きませんが、読み取りは行い、名前・見積り・カテゴリの解釈には影響させず、行を書き換えるときもそのまま残します。
- 刻印はタスク名・見積り・カテゴリの解釈には影響しません。無効にしても既存の刻印は消えません。

## 設定画面(GUI)

設定は「Display / Task syntax / Categories / Behavior / Timestamps / Task templates」に分けて設定画面に表示されます。コマンドパレットの **Dynamic Timetable: Open Settings** でこの拡張の設定だけを開けます。

オブジェクトの配列(`taskTemplates`, `categoryColors`)は VS Code の設定画面では「settings.json で編集」としか出ないため、GUI で直接編集できるキー/値形式の設定を追加しています。

| GUIで編集できる設定 | 内容 | 同名の扱い |
|---|---|---|
| `dynamicTimetable.taskTemplateMap` | テンプレート名 → 1行のタスク(スニペット構文) | `taskTemplates` が優先 |
| `dynamicTimetable.categoryColorMap` | カテゴリ名 → 色(`#4caf50`) | `categoryColors` が優先 |

複数行のテンプレートは従来どおり `taskTemplates`(settings.json)に書きます。

## エディタ上のハイライト

Timetable が認識するタスク行(見積りのあるチェックボックス行。`showUntilRegex` まで)の、拡張が理解できる部分に薄い背景色を付け、完了したタスクを薄く表示します。エディタの装飾(Decoration)機能で実現しているので、区切り文字の設定に追従し、入力に合わせて更新されます。それ以外の行には手を加えません。

| 部分 | 例 | 色 |
|---|---|---|
| タグ | `#work` | カテゴリ色(Timetable・Statistics と共通) |
| 見積り | `; 30` | `dynamicTimetable.estimateBackground` |
| 開始時刻 | `@ 09:15`, `@ 2026-10-21 09:12` | `dynamicTimetable.startBackground` |
| 作成の打刻 | `(@created: …)` | `dynamicTimetable.createdBackground` |
| 完了したタスク | `- [x] …` | 行全体を薄く表示(`completedTaskOpacity`、既定 0.55) |

設定(**Highlight** セクション):

- `dynamicTimetable.enableHighlight`(既定オン): ハイライト全体のオン/オフ。
- `dynamicTimetable.highlightOpacity`(既定 0.2): 背景の濃さ。タグの色と、`#RRGGBB` で書いた `highlightColors` に適用されます。
- `dynamicTimetable.highlightColors`: `estimate` / `start` / `created` の色を `#RRGGBB` または `#RRGGBBAA` で指定。未指定のキーは上のテーマ色を使います。
- `dynamicTimetable.completedTaskOpacity`(既定 0.55。1 で薄くしない)。
- タグの色はカテゴリ色に従うため、`categoryColorMap` / `categoryColors` で変更します。
- テーマ色は `workbench.colorCustomizations` でテーマごとに変更することもできます:

```jsonc
"workbench.colorCustomizations": { "dynamicTimetable.createdBackground": "#14b8a655" }
```

## 定型タスクの挿入

`dynamicTimetable.taskTemplates` にテンプレートを定義します。`body` は **VS Code のスニペット構文**です
(`${1:30}` のタブ停止、`$CURRENT_HOUR` などの変数が使えます)。

```jsonc
"dynamicTimetable.taskTemplates": [
  { "name": "break",  "body": "- [ ] 休憩 ; 15 #life" },
  { "name": "review", "body": ["- [ ] ${1:対象}レビュー ; ${2:30} #work", "- [ ] 指摘対応 ; 20 #work"] }
]
```

- コマンド: **Dynamic Timetable: Insert Task Template**(一覧から選択)/ **Insert Task Template 1〜5**(設定の N 番目を直接挿入)
- 挿入位置は **カーソル位置**です。カーソルのある行の下に新しい行として挿入します(行の途中は割りません)。カーソルが空行にあるときは、その位置にそのまま挿入します。
- カーソルが使えないとき(YAML front matter の中)や、対象ファイルのエディタが見えていないときは、現在のタスク(最初の未完了タスク)の次の行に挿入します。現在のタスクが無ければ最後のタスク行の後、タスクが無ければファイル末尾です。エディタが見えていない場合は、タブ停止なし(既定値のまま)で挿入します。
- 打刻が有効なら、挿入した各タスクに `(@created: …)` が付きます。

ショートカットキーは既定では割り当てていません。`keybindings.json` で割り当ててください。

```jsonc
[
  // 一覧から選ぶ
  { "key": "ctrl+alt+t", "command": "dynamicTimetable.insertTaskTemplate", "when": "editorLangId == markdown" },
  // 特定のテンプレートを名前で指定
  { "key": "ctrl+alt+b", "command": "dynamicTimetable.insertTaskTemplate", "args": { "template": "break" }, "when": "editorLangId == markdown" },
  // 設定の 2 番目のテンプレート
  { "key": "ctrl+alt+2", "command": "dynamicTimetable.insertTaskTemplate2", "when": "editorLangId == markdown" }
]
```

### 実機で確認してほしい項目(自動テストでは検証できません)

スニペットの展開は VS Code 本体の機能のため、次の点は実機で確認してください。

1. `${1:30}` などのタブ停止にカーソルが入り、Tab で次へ進める。
2. 複数行のテンプレートで、2 行目以降のインデントが現在のタスク行に揃う。
3. 挿入を 1 回の Undo で戻せる。
4. CRLF のファイルで改行が混在しない。
5. キーバインドの `args`(名前指定)が動く。
6. ハイライト: ライト・ダーク・ハイコントラストの各テーマで、背景が見えて、かつ目立ちすぎない。完了行が薄く見える。

## 元プラグインとの違い

- 辞書ファイル連携(various-complements)は未移植です。
- Statistics は chart.js を使わない自前の棒グラフです(カテゴリ無しのタスクは集計対象外で、件数のみ表示します)。
- `customUrlScheme` はユーザー設定のみ有効です(ワークスペース設定では無効)。
