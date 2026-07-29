<div align="center">

<img src=".github/assets/zotero-reading-flow-mark-512.png" alt="Zotero Reading Flow mark" width="96">

</div>

# Zotero Reading Flow

> **Stop opening every PDF just to remember where you left off.**
> Reading Flow turns your Zotero library into a reading dashboard — see progress, status, and last-read time directly in the item tree.

[![Latest](https://img.shields.io/github/v/release/Moonweave-Research/zotero-reading-flow?label=Latest%20Release)](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Moonweave-Research/zotero-reading-flow/latest/zotero-reading-flow.xpi?label=Downloads%20%28latest%29)](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest/download/zotero-reading-flow.xpi)
[![Zotero](https://img.shields.io/badge/Zotero-9.0%20%7C%209.0.*-blue)](https://www.zotero.org/download/)
[![License](https://img.shields.io/github/license/Moonweave-Research/zotero-reading-flow)](LICENSE)

![Reading Flow columns in the library](docs/assets/columns.png)

Best for **literature researchers, thesis students, and anyone who manages many PDFs across projects** and wants Zotero to show what is unread, in progress, important, or finished — without opening a single file.

---

## Table of Contents

- [Why Reading Flow](#why-reading-flow)
- [Quick demo](#quick-demo)
- [Install (30 seconds)](#install-30-seconds)
- [Features](#features)
- [Compatibility](#compatibility)
- [How it stores data](#how-it-stores-data)
- [FAQ](#faq)
- [Build and verification](#build-and-verification)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why Reading Flow

- **Scan your reading workload at a glance.** Progress, status, and last-read time are visible directly in the item tree.
- **Manage reading stages.** Mark papers as `To Read`, `Reading`, `Skimmed`, `Read`, or `Important`.
- **Find what needs attention.** Spot unfinished, recently touched, and completed papers without opening each PDF.
- **Handle messy PDFs.** Works with items that have multiple attachments under one parent record.
- **Resume where you left off.** Reopen the tracked PDF near its saved page from the Reading Flow menu.
- **Review your reading history.** Open **Tools → Reading Statistics** to see current-scope status, progress, remaining pages, activity days, first completions, and retained per-paper changes.
- **Return from the dashboard.** Choose a paper in `Recent Progress` and click `Resume` to use the same saved-page Reader path; the dashboard shows the eight most recent rows first and can expand to all matching papers.

## Quick demo

Open **Reading Statistics** to review the selected scope, reading-set filters, current summary, and recent reading pulse:

![Reading Statistics dashboard](docs/assets/reading-statistics-dashboard.jpeg)

Read a PDF, return to the library, and the row updates itself:

![Progress and last-read updating live](docs/assets/hero.gif)

## Install (30 seconds)

1. Download **`zotero-reading-flow.xpi`** from the [latest release](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest).
2. In Zotero, open **Tools → Add-ons**.
3. Click **Install Add-on From File...** and select the `.xpi`.
4. Restart Zotero if prompted.
5. Open your library — `Progress`, `Status`, and `Last Read` columns appear automatically on first run.

The auto-update URL is:

```text
https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest/download/updates.json
```

### Use it

- Right-click a paper → **Reading Flow → Mark as ...** to set its status.
- Open a PDF and read as usual — progress and last-read time update on the parent item.
- **Reading Flow → Resume Reading** to reopen the tracked PDF from its saved page.
- **Reading Flow → Reset Reading Progress** to restart tracking for an item.
- Open **Tools → Reading Statistics** from anywhere in Zotero. The selected view is reflected by `Current View`; use `Entire Library` when you want the whole active library.
- Keep `Tracked papers` for the intentional Reading Flow set, or choose `All papers` for a broader inventory. Status and history-range filters refine that same paper set.
- You can also right-click a paper and choose **Reading Flow → View Current View Statistics**. Both entries reuse the same modeless dashboard window.
- In `Recent Progress`, use `Show in Zotero` to select a paper or `Resume` to reopen that selected paper in the Zotero Reader. Resume is always user-invoked; it does not choose a next paper automatically.

If the columns are hidden later (e.g. after a layout change), open the library column menu and re-enable `Progress`, `Status`, and `Last Read`.

## Features

| Column / Action | What it does |
| --- | --- |
| **Progress** | Latest tracked position for each paper, at a glance. |
| **Status** | Reading state (`To Read`, `Reading`, `Skimmed`, `Read`, `Important`), kept in sync with library changes. |
| **Last Read** | Human-friendly timestamp (`now`, `5m`, `3h`, `2d`, or a date). |
| **Reading Flow menu** | Fast status updates, **Resume Reading**, and **Reset Reading Progress**. |
| **Reading Statistics** | Modeless, read-only dashboard for the tracked reading set or all papers, with scope metrics, status/progress distribution, remaining-page coverage, bounded history, and user-selected Recent Progress actions. |
| **Auto behavior** | First-run columns are enabled, reader page totals are preferred when available, and menu labels are robust across Zotero UI paths. |

## Compatibility

- Zotero `9.0` through `9.0.*`
- Tested with Zotero `9.0.6` on macOS ARM64
- Plugin ID: `readingflow@moon.com`

## How it stores data

Reading Flow stores progress in the parent item's `Extra` field as one namespaced line:

```text
ReadingFlow: {"v":2, ...}
```

Version 1 metadata remains readable. When historical tracking is available, version 2 adds at most 366 retained local-calendar daily rollups with progress, status, reset, and first-completion markers. Existing current progress remains separate from retrospective history: the dashboard never invents past activity from an old timestamp. Reading Flow preserves unrelated `Extra` metadata and only updates this plugin's own `ReadingFlow:` line. Your PDFs are never modified.

## FAQ

**How do I know it's actually working?**
Read one PDF, return to the library, and confirm the row shows updated `Progress`, `Status`, or `Last Read` values.

**Can I use it on Zotero 8?**
No. The current update channel targets Zotero `9.0` through `9.0.*`.

**Does it modify my PDFs?**
No. Reading metadata is stored only in Zotero item metadata.

**Where is my data?**

In each item's `Extra` field, on a single `ReadingFlow:` line. It syncs with your normal Zotero sync. Detailed history is bounded to the retained window; `All time` keeps lifetime first-completion totals but does not imply that pruned daily detail is available.

## Build and verification

```bash
npm ci
npm run verify
```

`npm run verify` runs:

- TypeScript typecheck
- Unit tests
- XPI build
- Update manifest validation

### Automated test-profile check

Run a reproducible runtime smoke check against a local Zotero profile:

```bash
ZOTERO_TEST_PROFILE="/path/to/profile-dir" \
ZOTERO_DATA_DIR="/path/to/zotero-data-dir" \
npm run check:release-profile -- \
  --itemKey "<item-key>" \
  --attachmentKey "<attachment-key>" \
  --attachmentPath "/path/to/zotero-data-dir/<pdf-file-path>" \
  --json
```

The script verifies:

- XPI existence and manifest metadata alignment
- Add-on loaded/enabled state from `extensions.json`
- `columnsInitialized` + `treePrefs.json` column visibility
- Optional Zotero DB sample row checks (`itemKey` / `attachmentKey` / `attachmentPath`)

## Troubleshooting

- **Columns missing?** Restart Zotero once and check the library column chooser.
- **Context menu actions missing?** Make sure a regular item is selected (or a PDF attachment for `Resume Reading`).
- **Internal warnings in the Zotero log?** Item-tree or add-on initialization warnings are usually harmless as long as columns and menu items appear. If they block normal use, file an issue with your Zotero version and a short error snippet.
- For full help, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Release notes

See [CHANGELOG.md](CHANGELOG.md) for user-facing changes and [docs/RELEASE.md](docs/RELEASE.md) for the release process.

## Contributing

Issues and pull requests are welcome. If you're filing a bug, please include your Zotero version, OS, and (if possible) a short reproducer.

## License

MIT License. Copyright (c) 2026 Moon-Young Choi.

The "Reading Flow" name and project branding should not be used to imply official endorsement by the original author.
