# Zotero Reading Flow

Zotero Reading Flow is a Zotero 9 plugin for tracking PDF reading progress directly in the Zotero item tree.

It adds compact reading workflow columns, stores progress in Zotero item metadata, and provides a right-click menu for manual reading status updates.

## Compatibility

- Zotero: `9.0` through `9.0.*`
- Tested locally with Zotero `9.0.1` on macOS ARM64
- Plugin ID: `readingflow@moon.com`
- Current version: `1.1.0`

The compatibility range is intentionally limited to Zotero 9 until newer Zotero versions are tested.

## Features

- `Progress` column: shows reading progress for the most recently read attachment when available.
- `Status` column: shows an explicit status badge or derives status from progress.
- `Last Read` column: shows compact relative time for the latest tracked read event.
- Library item context menu: right-click selected items and use `Reading Flow` to mark status or reset progress.
- Multi-attachment aware storage: progress is stored per attachment ID under a single parent item.
- Zotero sync-friendly storage: data is stored in the parent item's `Extra` field as a `ReadingFlow: {...}` line.

## Data Stored in Extra

Reading Flow stores one line in the parent item's `Extra` field:

```text
ReadingFlow: {"v":1,"p":{"12345":0.72},"c":null,"s":"reading","ts":1776945900,"lastAttachmentId":"12345","lastPage":18,"lastReadAt":1776945900000}
```

The plugin preserves other `Extra` lines and rewrites only its own `ReadingFlow:` line.

## Install

1. Download `zotero-reading-flow.xpi` from the GitHub release.
2. Open Zotero.
3. Go to `Tools` -> `Add-ons`.
4. Choose `Install Add-on From File`.
5. Select `zotero-reading-flow.xpi`.
6. Restart Zotero if Zotero asks for it.

After installation, enable the item-tree columns from Zotero's column picker if they are not visible by default.

## Use

Open a PDF attachment in Zotero's reader. Reading Flow listens for reader page-change events and writes progress after a short debounce.

In the library item tree:

- Show `Progress` to see the current tracked reading progress.
- Show `Status` to see `To Read`, `Reading`, `Skimmed`, `Read`, or `Important`.
- Show `Last Read` to see when progress was last updated.

To manually update status:

1. Select one or more regular Zotero items.
2. Right-click the selection.
3. Open `Reading Flow`.
4. Choose a status or `Reset Reading Progress`.

## Build

```bash
npm ci
npm run verify
```

`npm run verify` runs:

- TypeScript typecheck
- Unit tests for the data model
- XPI build
- XPI/update manifest validation

## Release Files

Each release should attach both files:

- `zotero-reading-flow.xpi`
- `updates.json`

The manifest update URL points to:

```text
https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/updates.json
```

## Known Warnings

Zotero 9.0.1 may log `ItemTreeColumnManager` deprecation warnings during custom column registration. The plugin has been observed to load and register successfully despite those warnings.

Other installed plugins may emit `ChromeUtils.import()` warnings. Reading Flow's packaged `bootstrap.js` is checked to reject that removed API.

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Release Checklist

See [docs/RELEASE.md](docs/RELEASE.md).
