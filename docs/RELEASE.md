# Release Process

This document describes the release process for Zotero Reading Flow.

## Release Gate

Run the full local verification command before creating or updating a release:

```bash
npm ci
npm run verify
```

Expected final output:

```text
verify-xpi: OK (12 files)
```

The command verifies:

- TypeScript compiles with `tsc --noEmit`.
- Unit tests pass.
- `zotero-reading-flow.xpi` is rebuilt.
- `updates.json` is regenerated.
- The XPI contains required files.
- The XPI does not contain source files, `node_modules`, macOS metadata, or removed Zotero APIs.
- `manifest.json`, `package.json`, and `updates.json` agree on version and Zotero compatibility.
- `updates.json` contains the sha256 hash of the built XPI.

## Version Update

For a new release:

1. Update `package.json`.
2. Update the root and package entries in `package-lock.json` (normally with `npm version <version> --no-git-tag-version`).
3. Update `addon/manifest.json`.
4. Update `CHANGELOG.md` and release-facing README content.
5. Run `npm ci` and `npm run verify`.
6. Confirm the packed manifest and `updates.json` agree with the source version, URL, and XPI hash.

The expected update link format is:

```text
https://github.com/Moonweave-Research/zotero-reading-flow/releases/download/v<version>/zotero-reading-flow.xpi
```

## GitHub Release

Before creating a release, confirm that the exact merge commit's GitHub **Verify** check has passed. Create the release as a draft first, then:

1. Create a GitHub release named `v<version>`.
2. Upload `zotero-reading-flow.xpi`.
3. Upload `updates.json`.
4. Publish the release.

Both files must be release assets. Do not rely on source archives for plugin installation.

Publishing triggers the `verify-public-release-assets` job. It rebuilds the tagged source and compares the public XPI and update metadata with that exact build. Treat the release as complete only after this job passes.

## Post-Release URL Checks

After publishing the release, verify the exact public artifacts (not only their HTTP status):

```bash
npm run verify:release-assets -- --tag v<version>
```

This checks the public XPI hash, the update metadata hash and link, the add-on version, and the Zotero compatibility range against the tagged source build.

## Manual Zotero Smoke Test

Use a clean or disposable Zotero profile when possible.

1. Install `zotero-reading-flow.xpi`.
2. Restart Zotero.
3. Confirm the add-on appears as enabled.
4. Confirm the existing `Progress`, `Status`, and `Last Read` layout remains unchanged.
5. Use Zotero's native column chooser to enable the optional `Reading Flow` column, then show and hide it again without changing the existing columns.
6. In **Settings → Zotero Reading Flow**, switch **Reading Flow column density** between **Compact** and **Icons** and confirm only that column's contents change.
7. Confirm Compact shows the correct status icon with progress/date, Icons shows only the icon, and an untouched item is visually blank with an accessible `Unassigned` meaning.
8. Confirm tooltip/accessibility text retains status, progress, and last-read meaning, and the optional column sorts recently read items first with never-read items last.
9. Open a PDF attachment.
10. Change pages and wait at least 5 seconds.
11. Return to the library item tree and confirm progress appears.
12. Right-click a regular item and confirm the `Reading Flow` menu appears.
13. Set a manual status, choose **Clear Manual Status (Use Automatic)**, and confirm a status-only item returns to no Reading Flow metadata while a progressed item keeps progress and derives its status automatically. Confirm the Status/Reading Flow tooltip identifies manual versus automatic state.
14. Confirm **Reset Progress (Keep Manual Status)** preserves the current manual status, does nothing on an item with no progress/resume position, and **Restart as To Read** clears progress while explicitly setting `To Read`.
15. Multi-select regular items and PDF attachments, including one read-only item, and confirm parent deduplication plus the changed/not-changed/skipped/failed summary. Cancel a 100-item operation at its confirmation and verify no writes occur.
16. Keep **Status for newly added papers** at `Unassigned` and confirm a new paper receives no Reading Flow metadata. Then opt into one status and confirm only papers added after activation are initialized; historical sync items, attachments, read-only items, and every pre-existing Reading Flow namespace must remain unchanged. Confirm initialization does not change `dateModified` or create history.
17. In Settings, confirm the sidebar card immediately reports whether the selected library has the list. Add **Reading Flow — Tracked Papers**, confirm one native Saved Search appears under **Saved Searches** in that library's left sidebar, click Add again to confirm no duplicate, create a separate list in a second editable library, and confirm removal affects only the currently selected library. Confirm read-only libraries are rejected and no tags or status-specific folders are created.
18. Open **Tools → Reading Statistics** and confirm `Current View`, `Selected Library`, `Reading Flow items`, `All papers (inventory)`, `Unassigned`, status, history range, and Refresh work.
19. Open the dashboard from the item context menu and confirm it focuses the same window; close it and confirm it can reopen.
20. Select an active calendar date and confirm its detail lists only matching papers from the displayed scope, dataset, status filter, and range; clear it by selecting the same date again.
21. Select a Recent Progress or calendar-detail row and confirm `Show in Zotero` selects it while `Resume` opens that paper through the saved-page Reader path.
22. Change PDF pages and immediately quit Zotero or disable the plugin without waiting five seconds. Reopen Zotero and confirm the last pending page was persisted and no Reading Flow bootstrap error appears in the debug log.

For local automation, run:

```bash
ZOTERO_TEST_PROFILE="/path/to/profile-dir" \
ZOTERO_DATA_DIR="/path/to/zotero-data-dir" \
npm run check:release-profile -- \
  --itemKey "<item-key>" \
  --attachmentKey "<attachment-key>" \
  --attachmentPath "/path/to/zotero-data-dir/<pdf-file-path>" \
  --json
```

## Current Release Notes

For `v1.3.6`, the release should be described as compatible with Zotero `9.0.x` and `10.0.*`, with explicit unassigned/default-status control, safer bulk status operations, shutdown progress flushing, Zotero 10 selected-library fixes, and an opt-in tracked-papers Saved Search in the left sidebar.

### v1.3.6 summary

- Untouched papers remain unassigned instead of appearing as `To Read`; users can clear a manual status back to automatic behavior or restart explicitly as `To Read`.
- A prospective default status can be chosen for newly added eligible papers without rewriting existing or synced items.
- Large multi-item status changes confirm scope and report changed, unchanged, skipped, and failed items.
- Settings can add `Reading Flow — Tracked Papers` under the selected library's Saved Searches and report whether it exists; plugin-owned legacy searches are renamed automatically.
- Zotero 10 selected-library statistics, PDF progress normalization, concurrent Extra-field writes, and immediate-shutdown progress persistence are hardened.

### v1.3.6 local release checks

- `npm run verify`
- Install the generated XPI into the target Zotero profile and confirm the installed version is `1.3.6`.
- Confirm a tracked legacy `Reading Flow Metadata` Saved Search becomes `Reading Flow — Tracked Papers` without changing its conditions.
- Complete the manual acceptance checklist above before publication.

Attach these generated release assets to GitHub release `v1.3.6`:

- `zotero-reading-flow.xpi`
- `updates.json`

The sections below retain the prior `v1.3.5` release record.

For `v1.3.5`, the release was described as compatible with Zotero `9.0.x` and `10.0.*`, with safer Reader API degradation and public release-asset verification.

### v1.3.5 summary

- Safely skips progress tracking when a Reader registry is unavailable.
- Limits automatic tracking to PDFs, avoiding ambiguous EPUB or snapshot page values.
- Verifies published XPI and update metadata against the exact tagged build after release.
- Does not change the stored Reading Flow schema or modify PDF or annotation content.

### v1.3.5 local release checks

```bash
npm ci
npm run verify
git diff --check
npm audit --omit=dev
sha256sum zotero-reading-flow.xpi updates.json docs/assets/reading-flow-display-modes.png
unzip -t zotero-reading-flow.xpi
```

Attach these generated release assets to GitHub release `v1.3.5`:

- `zotero-reading-flow.xpi`
- `updates.json`
