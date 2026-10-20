# Changelog

All notable changes to the VS Code port of Dynamic Timetable. The original Obsidian plugin is by L7Cy (MIT).

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
