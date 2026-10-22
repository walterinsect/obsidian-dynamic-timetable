# 変更履歴

[English](https://github.com/walterinsect/obsidian-dynamic-timetable/blob/vscode-port/vscode-port/CHANGELOG.md) | 日本語

Dynamic Timetable の VS Code 移植版の主な変更点です。元の Obsidian プラグインは L7Cy 作(MIT)です。

## 0.7.0
### 追加
- **エディタ上のハイライト**(Timetable が認識するタスク行が対象。Decoration 機能で実現し、区切り文字の設定に追従、入力に合わせて更新):
  - タグは Timetable・Statistics と共通のカテゴリ色。
  - 見積り・開始時刻・`(@created)`・`(@done)` に薄い背景色(テーマ色 `dynamicTimetable.{estimate,start,created,done}Background`)。
  - 完了したタスクを薄く表示。
- 設定(新しい **Highlight** セクション。既定はすべてオン): `enableHighlight`、`highlightOpacity`(0.2)、`highlightColors`(`estimate` / `start` / `created` / `done` を `#RRGGBB` または `#RRGGBBAA` で指定)、`completedTaskOpacity`(0.55。1 で薄くしない)。

## 0.6.0
### 追加
- **ステータスバーにタスクの進捗を表示**(左寄せ、ピン留め表示の隣): `$(checklist) 完了数/認識数 (完了率%)`(例 `3/8 (38%)`)。
  - Timetable が認識するタスク(同じルール: 箇条書き、インデント、`showUntilRegex`、日付区切り)を、完了済みも含めて数える。
  - 完了率は四捨五入した整数。タスクが無いファイルは 0% ではなく「No tasks」と表示。
  - 編集時(デバウンス)、アクティブファイルの切り替え、設定変更、Complete/Interrupt の後に更新。対象の Markdown が無いときは非表示。
  - ツールチップに件数とファイル名を表示。クリックで Timetable を開く。
  - 新しい設定 `dynamicTimetable.showProgressInStatusBar`(既定はオン)。

## 0.5.0
### 変更
- **定型タスクを、常に現在のタスクの次の行ではなく、カーソル位置に挿入**するように変更。
  - カーソルが行上にあるとき: その行の下に新しい行として挿入(行は割らない)。インデントはその行に合わせる。
  - カーソルが空行にあるとき: 余分な改行なしでその位置に挿入。
  - カーソルが YAML front matter 内、または対象エディタが見えていないとき: 従来どおり現在のタスクの次の行に挿入。
- テンプレート選択のプレースホルダーを「Insert a task template at the cursor」に変更。

## 0.4.0
### 追加
- Marketplace 用メタデータ: 128×128 の PNG アイコン、カテゴリ(Productivity, Other)、キーワード、ギャラリーバナー、`bugs` / `homepage` リンク。
- `CHANGELOG.md`。

## 0.3.2
### 追加
- 設定画面を Display / Task syntax / Categories / Behavior / Timestamps / Task templates の 6 セクションに整理。
- 設定画面で直接編集できるキー/値形式の設定:
  - `dynamicTimetable.taskTemplateMap`: テンプレート名 → 1 行のタスク(スニペット構文)。
  - `dynamicTimetable.categoryColorMap`: カテゴリ名 → 色。
  - 配列形式の設定(`taskTemplates`, `categoryColors`)に同名があれば、配列が優先。
- コマンド `Dynamic Timetable: Open Settings`: この拡張の設定だけを絞り込んで設定画面を開く。

### 理由
オブジェクトの配列(`taskTemplates`, `categoryColors`)は VS Code の設定画面では編集できず、「settings.json で編集」のリンクだけが表示されるため。

## 0.3.1
### 変更
- **打刻を既定でオン**に変更(`enableTimestamps: true`)。以前の「既定オフ」を覆しています。
- 完了行に書く実績開始時刻に日付を含めるようにした(`@ YYYY-MM-DD HH:mm`)。
  - `timestampFormat` に関係なく、常にこの固定書式。
  - 打刻をオフにしたときは従来どおり `@ HH:MM`。
- `(@created: …)` / `(@done: …)` は既定で `YYYY-MM-DD HH:mm` 形式となり、設定なしで出力されるようになった。

### 修正
- パーサが `@ YYYY-MM-DD HH:mm` を正しく読むようにした(以前は `2026` を 20:26 と誤読する恐れがあった)。
- 旧形式(`@ HH:MM`, `@ HHMM`, `@ YYYY-MM-DDTHH:mm`)も引き続き読み取れる。

## 0.3.0
### 追加
- タスク行末尾の打刻:
  - Complete は `(@done)` を記録。
  - Interrupt は完了した行に `(@done)`、残りのタスクに `(@created)`(中断時刻)を記録。
  - テンプレートから作成したタスクには `(@created)` を付与。
  - 手書きのタスクには後付けしない。
- 定型タスク:
  - QuickPick を使う `Insert Task Template` コマンド。
  - キー割り当て用のスロットコマンド 1〜5(既定のキーバインドは同梱しない)。
  - テンプレートは VS Code のスニペット構文で、現在のタスク行の次の行に挿入。
  - 対象エディタが見えていないときは、既定値のままタブ停止なしで挿入。
- 設定 `enableTimestamps`, `timestampFormat`, `taskTemplates`。

## 0.2.0
### 追加
- Statistics ビュー: カテゴリ別の実績。色は Timetable ビューと共通。

## 0.1.0
### 追加
- Obsidian プラグインの VS Code への初回移植。
  - Timetable の Webview。
  - Complete / Interrupt コマンド。
  - 対象ファイルの固定 / 解除。
  - 設定を `contributes.configuration` に対応付け。
- 構成: VS Code に依存しないコア(`src/core`, `src/host`)、薄い VS Code アダプタ(`src/ext`)、厳格な CSP の React Webview。

### 修正(元プラグインで見つけた不具合)
- CRLF の front matter を扱えなかった。
- `---` の YAML 判定が先頭に固定されていなかった。
- Complete / Interrupt が、ISO 形式の開始時刻・インデント付き・`*` / `+` 箇条書きのタスクを更新しなかった。
- 書き込み時の開始時刻の区切り文字が `@` に固定されていた。
- 打刻がタスク名と `;` の間に入ることがあった。
- 中断後の残りタスクが元の Created を引き継いでいた。
- 開始時刻の解釈で秒・ミリ秒が混入していた。

### テスト
- 288 件のテストを 6 つのタイムゾーン(Asia/Tokyo, UTC, America/New_York, Pacific/Auckland, Pacific/Kiritimati, America/Los_Angeles)で実行。
- 統合テストは、モックした VS Code API 上で本番バンドルを動かす。
- CSP の E2E テストを Chromium で実行。
- 変異確認と、クリーンな `npm ci` からの再現確認。
- 実際の VS Code では未検証: スニペットのタブ停止、Undo、CRLF の挙動、キーバインドの `args`。README に手動チェックリストとして記載。
