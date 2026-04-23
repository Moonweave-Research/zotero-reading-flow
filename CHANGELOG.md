# Changelog

## 1.1.1 - 2026-04-23

### Fixed

- Fixed progress/status/last-read column layout so custom cell contents scale with the Zotero item-tree column width.
- Removed fixed/static custom-column widths to allow user resizing without distorting the progress bar.

## 1.1.0 - 2026-04-23

### Added

- Added normalized Reading Flow data handling in `src/flowData.ts`.
- Added recent-attachment-aware progress display.
- Added `Progress`, `Status`, and `Last Read` item-tree columns.
- Added the `Reading Flow` item context menu for status changes and progress reset.
- Added packaged Fluent locale strings.
- Added unit tests for flow data normalization, merge behavior, status inference, and relative date formatting.
- Added `npm run verify` with typecheck, unit tests, build, and XPI/update validation.
- Added `updates.json` generation during build.

### Changed

- Replaced the legacy `prefs.html` packaging path with `prefs.xhtml`.
- Removed the runtime dependency on `zotero-plugin-toolkit`.
- Constrained Zotero compatibility to `9.0.*` until newer versions are tested.
- Hardened startup and shutdown paths for Zotero 9.

### Fixed

- Fixed progress display for multi-attachment items by preferring the most recently read attachment.
- Fixed reset behavior so progress can be intentionally cleared.
- Fixed release packaging checks to reject missing locale files, mismatched versions, stale hashes, source files, and removed Zotero APIs.

## 1.0.0 - Private build

- Initial local prototype for Zotero 9 reading progress and visual organization.
