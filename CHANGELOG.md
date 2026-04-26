# Changelog

## 1.1.8 - 2026-04-26

### Fixed

- Improved Resume Reading menu behavior: now shows the resumable page (and total pages when available) with localized menu labels, and falls back cleanly when no resumable state is available.
- Added best-effort page count capture from PDF metadata for menu context and saved flow data.
- Hardened Resume Reading menu label rendering across native menu paths with direct label and l10n fallback handling.

## 1.1.7 - 2026-04-26

### Fixed

- Added explicit native-menu label fallbacks for all `Reading Flow` submenu actions so labels render reliably in Zotero context menus.
- Made menu commands use Zotero's command context, preserving the selected item for resume, status, queue, and reset actions.

## 1.1.3 - 2026-04-25

### Fixed

- Fixed PDF progress tracking to prefer the live reader page index over stale saved page indices.
- Fixed Progress column rendering so the progress bar stays within the actual Zotero column width.

## 1.1.2 - 2026-04-25

### Fixed

- Fixed first-install column visibility so `Progress`, `Status`, and `Last Read` are shown automatically without manual column enabling.
- Hardened first-run column initialization against delayed `itemsView` startup timing and main-window load ordering.
- Added unit coverage for delayed `itemsView` availability and Zotero-window timer fallback during first-run initialization.

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
