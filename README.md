# Zotero Reading Flow

**Turn your Zotero library into a reading dashboard.**

[![Latest](https://img.shields.io/github/v/release/Moon-python/zotero-reading-flow?label=Latest%20Release)](https://github.com/Moon-python/zotero-reading-flow/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Moon-python/zotero-reading-flow/latest/zotero-reading-flow.xpi)](https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/zotero-reading-flow.xpi)
[![Zotero](https://img.shields.io/badge/Zotero-9.0%20%7C%209.0.*-blue)](https://www.zotero.org/download/)

![Reading Flow columns in the library](docs/assets/columns.png)

Zotero Reading Flow adds reading-focused columns to your library so you can see each paper's progress, reading status, and last-read time before opening the PDF.

> Best for: literature researchers, thesis students, and anyone who manages many PDFs across projects and wants Zotero to show what is unread, in progress, important, or finished.

## For researchers, in practice

- **Scan your reading workload:** progress, status, and last-read time are visible directly in the item tree.
- **Manage reading stages:** mark papers as `To Read`, `Reading`, `Skimmed`, `Read`, or `Important`.
- **Find what needs attention:** spot unfinished, recently touched, and completed papers without opening each PDF.
- **Handle messy PDFs:** works with items that have multiple attachments under one parent record.
- **Resume when useful:** open the tracked PDF near its saved page from the Reading Flow menu.

## Do this in 30 seconds

1. Install from the latest GitHub release.
2. Open Zotero and check the new `Progress`, `Status`, and `Last Read` columns.
3. Right-click a paper and set its reading state with **Reading Flow → Mark as ...**.
4. Open a PDF and read as usual; Reading Flow updates the library row as progress is tracked.
5. Use **Reading Flow → Resume Reading** when you want to reopen the tracked PDF from its saved page.

If this is your first use, columns appear automatically after install.

## Features

- `Progress`: shows the latest tracked position for each paper in one glance.
- `Status`: displays your reading state (`To Read`, `Reading`, `Skimmed`, `Read`, `Important`) and keeps it synced with library changes.
- `Last Read`: shows when this paper was last updated (`5 min ago`, `today`, `yesterday`, ...).
- `Reading Flow` menu: fast status updates, **Resume Reading**, and **Reset Reading Progress**.
- Auto behavior: first-run columns are enabled, reader page totals are preferred when available, and menu labels are robust across Zotero UI paths.

## Compatibility

- Zotero: `9.0` through `9.0.*`
- Tested with Zotero `9.0.1` on macOS ARM64
- Plugin ID: `readingflow@moon.com`

## Install

1. Download `zotero-reading-flow.xpi` from the latest GitHub release.
2. Open Zotero.
3. Go to **Tools → Add-ons**.
4. Click **Install Add-on From File...** and select the `.xpi`.
5. Restart Zotero if prompted.

The plugin update URL is:

```text
https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/updates.json
```

## Quick start

1. Use the item-tree columns to scan which papers are unread, in progress, important, or finished.
2. Right-click a regular item and use **Reading Flow → Mark as ...** for status updates.
3. Open and read PDFs in Zotero as usual; progress and last-read time update on the parent item.
4. Use **Reading Flow → Resume Reading** when you want to reopen the tracked PDF from its saved page.
5. Use **Reading Flow → Reset Reading Progress** when you want to restart tracking for an item.

If you want, keep your columns always visible:

1. In the library, open the column menu.
2. Enable `Progress`, `Status`, and `Last Read`.
3. They are auto-shown on first install, but this can help when the layout has changed.

## FAQ

- How do I know this is actually working?
  Read one PDF, return to the library, and confirm the row shows updated `Progress`, `Status`, or `Last Read` values.
- Can I use it on Zotero 8?
  The current update channel is configured for Zotero `9.0` to `9.0.*`.
- Does it modify my PDFs?
  No, it stores reading metadata only in Zotero item metadata.

## Data and sync behavior

Reading Flow stores progress in the parent item’s `Extra` field as one namespaced line:

```text
ReadingFlow: {"v":1, ...}
```

It preserves unrelated `Extra` metadata and only updates this plugin’s own `ReadingFlow:` line.

## Build and verification

Run the project checks before release or local release testing:

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

Run a quick reproducible runtime smoke check against a local Zotero profile:

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

- If columns are not visible, restart Zotero once and check the library column chooser.
- If context menu actions do not appear, verify that a regular item is selected (or a PDF attachment for `Resume Reading`).
- If you need full help, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Known Warnings

- Zotero may show occasional internal warnings related to item-tree or add-on initialization order in some environments.
- These are usually harmless if columns and menu items still appear; if they block normal use, include your Zotero version and a short error snippet in troubleshooting.

## Release notes

Use [docs/RELEASE.md](docs/RELEASE.md) for release process details.

## License

MIT License. Copyright (c) 2026 Moon-Young Choi.

The Reading Flow name and project branding should not be used to imply official endorsement by the original author.
