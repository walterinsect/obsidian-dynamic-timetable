# Dynamic Timetable (VS Code)

English | [日本語](https://github.com/walterinsect/obsidian-dynamic-timetable/blob/vscode-port/README.ja.md)

A VS Code extension that builds a timetable from the estimates in a Markdown task list.
It is a port of [L7Cy/obsidian-dynamic-timetable](https://github.com/L7Cy/obsidian-dynamic-timetable) (MIT).

```markdown
---
startTime: 09:00:00
---
- [ ] Prepare design review ; 30 #work
- [ ] Lunch ; 45 @ 12:00 #life
- [ ] Implementation ; 90 #work
```

- The value after `;` is the estimate: minutes (`90`), or `45m`, `2h`, `2h20m`, `1.5h`. The time after `@` is an explicit start time, and `#` marks a category.
- Open **Dynamic Timetable** in the Activity Bar to see the timetable (Timetable) and the per-category totals (Statistics) for the active Markdown file.
- Statistics shows a stacked bar per `#category`: actual (completed) and remaining (estimated). Colors are shared with the Timetable.
- Commands: Show Timetable / Show Statistics / Complete Task / Interrupt Task / Refresh / Pin Current File / Open Settings
- The status bar shows task progress, e.g. `3/8 (38%)`: recognized tasks, completed tasks and the completion rate. It counts the same tasks the timetable shows, updates as you edit, and opens the timetable when clicked. Turn it off with `dynamicTimetable.showProgressInStatusBar`.
- Complete and Interrupt rewrite the file and update `startTime` to the current time. By default the file is also saved.

## Timestamps (Created)

`dynamicTimetable.enableTimestamps` (**on by default**) records a creation time `(@created: …)` on the task line, and writes the actual start time of a completed line with its date (`@ YYYY-MM-DD HH:mm`). Both use the `YYYY-MM-DD HH:mm` format by default. Completing a task adds no stamp. When the setting is off, no stamps are written and the start time is written as `@ HH:MM`, as before. The legacy forms `@ HH:MM`, `@ HHMM` and `@ YYYY-MM-DDTHH:mm` can still be read.

```markdown
- [ ] Implementation ; 60 #work (@created: 2026-10-21 09:12)                       <- created from a template
- [x] Implementation ; 37m (est 1h) @ 2026-10-21 09:12 #work (@created: 2026-10-21 09:12)   <- after Complete (no stamp is added)
```

| Action | What is recorded |
|---|---|
| Create a task from a template | `(@created: creation time)` |
| Complete | nothing is added. An existing Created is kept |
| Interrupt | `(@created: interrupt time)` on the remaining task (the original Created is not carried over); nothing on the completed line |

- The format is `dynamicTimetable.timestampFormat` (default `YYYY-MM-DD HH:mm`; tokens `YYYY MM DD HH mm ss`; `)` is not allowed). It does not affect the format of the actual start time, which is always `YYYY-MM-DD HH:mm`.
- Created is never added to hand-written tasks.
- `(@done: …)` was written by versions before 0.8.0. It is no longer written, but it is still read, ignored for the name/estimate/categories, and kept as it is when a line is rewritten.
- Stamps do not affect how the task name, estimate or categories are read. Turning the feature off does not remove existing stamps.

## Estimate vs. actual

Completing a task keeps **both** numbers on the line, written as hours and minutes so you can read the duration at a glance:

```markdown
- [ ] Implementation ; 2h #work                                   <- before
- [x] Implementation ; 2h20m (est 2h) @ 2026-10-21 09:12 #work    <- after Complete
```

- After `;` is the **actual** time; `(est …)` is the **original estimate**. Minutes are zero-padded after hours (`1h05m`), whole hours are `2h`, and under an hour it is `45m`.
- Interrupt splits the task: the finished part gets the elapsed time (no `(est …)`, since the task is not finished), and the remainder carries on as a normal estimate.
- Where the difference (actual − estimate) is shown: the Timetable (a badge such as `+20m` in red when over, `-10m` in green when under, with a tooltip), the Statistics view (per category and in the total, completed tasks that have `(est …)`), and the editor (`(est …)` is highlighted with the estimate color).
- `dynamicTimetable.durationFormat`: `hm` (default, `2h20m`) or `minutes` (`140 (est 120)`). Both forms are always readable.
- Tags stay where you wrote them. `- [ ] #work title ; 2h` becomes `- [x] #work title ; 2h20m (est 2h) @ …`: only the estimate and start-time parts of the line are rewritten, and tags are no longer copied to the end of the line.
- Lines completed by earlier versions have no `(est …)`; they are left as they are and simply show no difference.

## Settings UI

Settings are grouped into Display, Task syntax, Categories, Behavior, Timestamps and Task templates. The command **Dynamic Timetable: Open Settings** opens the Settings UI filtered to this extension.

Settings that are arrays of objects (`taskTemplates`, `categoryColors`) only show an "Edit in settings.json" link in the VS Code Settings UI. For that reason there are also key/value settings that can be edited directly in the UI:

| Setting editable in the UI | Content | If a name exists in both |
|---|---|---|
| `dynamicTimetable.taskTemplateMap` | template name -> one-line task (snippet syntax) | `taskTemplates` wins |
| `dynamicTimetable.categoryColorMap` | category name -> color (`#4caf50`) | `categoryColors` wins |

Write multi-line templates in `taskTemplates` (settings.json) as before.

## Highlighting in the editor

On the task lines the timetable recognizes (checkbox lines with an estimate, up to `showUntilRegex`), the extension adds a light background to the parts it understands, and dims completed tasks. It is built on the editor's decoration API, so it follows your delimiter settings and updates as you type. Other lines are never touched.

| Part | Example | Color |
|---|---|---|
| Tag | `#work` | the category color (same as the Timetable and Statistics) |
| Estimate | `; 30` | `dynamicTimetable.estimateBackground` |
| Start time | `@ 09:15`, `@ 2026-10-21 09:12` | `dynamicTimetable.startBackground` |
| Created | `(@created: …)` | `dynamicTimetable.createdBackground` |
| Completed task | `- [x] …` | the whole line is dimmed (`completedTaskOpacity`, default 0.55) |

Settings (section **Highlight**):

- `dynamicTimetable.enableHighlight` (default on) turns everything off or on.
- `dynamicTimetable.highlightOpacity` (default 0.2) is the strength of the backgrounds. It applies to tag colors and to `highlightColors` written as `#RRGGBB`.
- `dynamicTimetable.highlightColors` sets the colors of `estimate`, `start` and `created` as `#RRGGBB` or `#RRGGBBAA`. Keys that are not set use the theme colors above.
- `dynamicTimetable.completedTaskOpacity` (default 0.55; 1 = do not dim).
- Tag colors follow the category colors, so change them with `categoryColorMap` / `categoryColors`.
- The theme colors can also be changed per theme with `workbench.colorCustomizations`:

```jsonc
"workbench.colorCustomizations": { "dynamicTimetable.createdBackground": "#14b8a655" }
```

## Inserting task templates

Define templates in `dynamicTimetable.taskTemplates`. `body` uses **VS Code snippet syntax** (tab stops such as `${1:30}` and variables such as `$CURRENT_HOUR` work).

```jsonc
"dynamicTimetable.taskTemplates": [
  { "name": "break",  "body": "- [ ] Break ; 15 #life" },
  { "name": "review", "body": ["- [ ] ${1:Target} review ; ${2:30} #work", "- [ ] Address feedback ; 20 #work"] }
]
```

- Commands: **Dynamic Timetable: Insert Task Template** (pick from a list) and **Insert Task Template 1–5** (insert the Nth template directly).
- The template is inserted **at the cursor**: on a new line below the line the cursor is on (a line is never split), or in place if the cursor is on a blank line.
- If the cursor is not usable (inside the YAML front matter), or the editor of the target file is not visible, the template goes on the line after the current task (the first uncompleted task). With no current task it goes after the last task line, or at the end of the file if there are no tasks. In the not-visible case it is inserted with default values and without tab stops.
- When timestamps are enabled, each inserted task gets `(@created: …)`.

No keybindings are assigned by default. Assign them in `keybindings.json`:

```jsonc
[
  // Pick from a list
  { "key": "ctrl+alt+t", "command": "dynamicTimetable.insertTaskTemplate", "when": "editorLangId == markdown" },
  // A specific template by name
  { "key": "ctrl+alt+b", "command": "dynamicTimetable.insertTaskTemplate", "args": { "template": "break" }, "when": "editorLangId == markdown" },
  // The 2nd template in the settings
  { "key": "ctrl+alt+2", "command": "dynamicTimetable.insertTaskTemplate2", "when": "editorLangId == markdown" }
]
```

### Manual checks in a real VS Code (automated tests cannot cover these)

Snippet expansion is a VS Code feature, so please check the following in the real editor:

1. The cursor lands in tab stops such as `${1:30}`, and Tab moves to the next one.
2. In a multi-line template, the second and later lines are indented to match the current task line.
3. One Undo reverts the whole insertion.
4. In a CRLF file, line endings are not mixed.
5. The keybinding `args` (selection by name) works.
6. Highlight: the backgrounds are visible but not harsh in your light, dark and high-contrast themes, and completed lines look dimmed.

## Differences from the original plugin

- Dictionary-file integration (various-complements) is not ported.
- Statistics uses a built-in bar chart instead of chart.js (tasks without a category are not counted; only their number is shown).
- `customUrlScheme` is honored only in user settings (it is ignored in workspace settings).

## License and attribution

MIT License. This extension is derived from the Obsidian plugin [Dynamic Timetable](https://github.com/L7Cy/obsidian-dynamic-timetable) by L7Cy (Copyright (c) 2023 L7Cy); see [LICENSE.md](LICENSE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (including the Codicons CC BY 4.0 attribution).
