# Changelog

English | [日本語](https://github.com/walterinsect/obsidian-dynamic-timetable/blob/vscode-port/vscode-port/CHANGELOG.ja.md)

All notable changes to the VS Code port of Dynamic Timetable. The original Obsidian plugin is by L7Cy (MIT).

## 0.9.0
### Added
- **Estimate and actual are both kept** on a completed line: `; 2h20m (est 2h) @ …`. After `;` is the actual time, `(est …)` is the original estimate. Interrupt writes only the elapsed time on the finished part.
- **Readable durations**: elapsed and estimated times are written as `45m`, `2h`, `1h05m`, `2h20m` (minutes zero-padded after hours). New setting `durationFormat` (`hm` default, or `minutes`).
- **Variance (actual − estimate) is shown** in the Timetable (colored `+20m` / `-10m` badge with a tooltip), in Statistics (per category and total) and in the editor (`(est …)` is highlighted).
- The estimate after `;` accepts `45m`, `2h`, `2h20m`, `1.5h` as well as plain minutes.

### Changed
- Statistics durations use the same zero-padded style (`1h` instead of `1h0m`, `1h05m` instead of `1h5m`).

### Compatibility
- Lines completed by earlier versions are not converted; they have no `(est …)` and show no variance. A hand-written `; 2h` used to mean 2 minutes and now means 2 hours.

## 0.8.0
### Removed
- **The `(@done: …)` stamp is no longer written.** Complete and Interrupt add nothing to the completed line; the only stamp written is `(@created: …)` (template-created tasks and the remaining part of an interrupted task).
- The `done` highlight color: theme color `dynamicTimetable.doneBackground` and the `done` key of `highlightColors`.

### Compatibility
- `(@done: …)` stamps already in your files are still read (ignored for names, estimates and categories) and are kept when a line is rewritten. They are no longer highlighted.

## 0.7.0
### Added
- **Editor highlighting** on the task lines the timetable recognizes (built on the decoration API; follows your delimiter settings and updates as you type):
  - Tags use the category colors, the same as the Timetable and Statistics.
  - Estimates, start times, `(@created)` and `(@done)` get light backgrounds, using theme colors `dynamicTimetable.{estimate,start,created,done}Background`.
  - Completed tasks are dimmed.
- Settings (new **Highlight** section, all on by default): `enableHighlight`, `highlightOpacity` (0.2), `highlightColors` (`estimate` / `start` / `created` / `done` as `#RRGGBB` or `#RRGGBBAA`), `completedTaskOpacity` (0.55; 1 = off).

## 0.6.0
### Added
- **Task progress in the status bar** (left side, next to the pinned-file item): `$(checklist) done/total (percent%)`, e.g. `3/8 (38%)`.
  - Counts the tasks the timetable recognizes (same rules: bullets, indentation, `showUntilRegex`, date delimiters), including completed ones.
  - The percentage is rounded to an integer; a file without tasks shows "No tasks" instead of 0%.
  - Updates on edits (debounced), when the active file changes, on settings changes, and after Complete/Interrupt. Hidden when there is no target Markdown file.
  - Tooltip shows the counts and file name; clicking opens the timetable.
  - New setting `dynamicTimetable.showProgressInStatusBar` (default on).

## 0.5.0
### Changed
- **Task templates are now inserted at the cursor** instead of always after the current task.
  - Cursor on a line: the template goes on a new line below it (the line is never split). Indentation follows that line.
  - Cursor on a blank line: the template is inserted in place, without an extra newline.
  - Cursor inside the YAML front matter, or target editor not visible: falls back to the previous behavior (after the current task).
- The template picker placeholder now reads "Insert a task template at the cursor".

## 0.4.0
### Added
- Marketplace metadata: 128×128 PNG icon, categories (Productivity, Other), keywords, gallery banner, `bugs` and `homepage` links.
- `CHANGELOG.md`.

## 0.3.2
### Added
- Settings UI is now grouped into six sections: Display, Task syntax, Categories, Behavior, Timestamps and Task templates.
- GUI-editable key/value settings:
  - `dynamicTimetable.taskTemplateMap` maps a template name to a one-line task in snippet syntax.
  - `dynamicTimetable.categoryColorMap` maps a category name to a color.
  - If the same name appears in the array settings (`taskTemplates`, `categoryColors`), the array wins.
- Command `Dynamic Timetable: Open Settings`, which opens the Settings UI filtered to this extension.

### Why
Arrays of objects (`taskTemplates`, `categoryColors`) are not editable in the VS Code Settings UI. They only show an "Edit in settings.json" link.

## 0.3.1
### Changed
- **Timestamps are on by default** (`enableTimestamps: true`). This reverses the earlier "off by default" decision.
- The actual start time written on a completed line now includes the date, as `@ YYYY-MM-DD HH:mm`.
  - It always uses this fixed format, regardless of `timestampFormat`.
  - With timestamps off, it stays `@ HH:MM`.
- `(@created: …)` and `(@done: …)` use `YYYY-MM-DD HH:mm` by default and now appear without any configuration.

### Fixed
- The parser reads `@ YYYY-MM-DD HH:mm` correctly. Previously `2026` would have been taken as 20:26.
- Legacy forms (`@ HH:MM`, `@ HHMM`, `@ YYYY-MM-DDTHH:mm`) still parse.

## 0.3.0
### Added
- Timestamps at the end of the task line:
  - Complete writes `(@done)`.
  - Interrupt writes `(@done)` on the finished part and `(@created)` (the interrupt time) on the remaining task.
  - Tasks created from a template get `(@created)`.
  - Hand-written tasks are not backfilled.
- Task templates:
  - `Insert Task Template` command with a QuickPick.
  - Slot commands 1–5 for keybindings; no default keybindings are shipped.
  - Templates use VS Code snippet syntax and are inserted after the current task line.
  - If the target editor is not visible, the template is inserted with default values and no tab stops.
- Settings `enableTimestamps`, `timestampFormat` and `taskTemplates`.

## 0.2.0
### Added
- Statistics view: category performance, with category colors shared with the timetable view.

## 0.1.0
### Added
- Initial port of the Obsidian plugin to VS Code.
  - Timetable webview.
  - Complete and Interrupt commands.
  - Pin/unpin target file.
  - Settings mapped to `contributes.configuration`.
- Architecture: a VS Code-independent core (`src/core`, `src/host`) with thin VS Code adapters (`src/ext`), and a strict-CSP React webview.

### Fixed (bugs found in the original plugin)
- CRLF front matter was not handled.
- The `---` YAML match was unanchored.
- Complete/Interrupt skipped tasks written with ISO start times, indentation, or `*` / `+` bullets.
- The start-time delimiter was hard-coded as `@` when writing.
- Stamps could end up between the task name and `;`.
- An interrupted task's remaining part inherited the original Created stamp.
- Seconds and milliseconds leaked into parsed start times.

### Testing
- 288 tests, run under six time zones (Asia/Tokyo, UTC, America/New_York, Pacific/Auckland, Pacific/Kiritimati, America/Los_Angeles).
- Integration tests run the production bundle on a mocked VS Code API.
- A CSP end-to-end test runs in Chromium.
- Mutation checks and a clean `npm ci` reproduction.
- Not verified in a real VS Code: snippet tab stops, Undo, CRLF behavior and keybinding arguments. These are listed in the README as a manual checklist.
