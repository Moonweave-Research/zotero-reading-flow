# Verification

## Repeatable checks

Run npm ci and npm run verify from a full-history checkout with Node.js 22. CI runs the same gate for branches, PRs, and main. Release-asset checks run only on published-release events; a skipped release job is not an asset-validation pass.

| Area | Regression coverage |
| --- | --- |
| Manual/automatic status, independent Important, legacy data | flowData, dataStore, pr1Semantics, pr3Importance tests |
| Bookmark persistence, Undo, missing/multiple PDFs, peer records | readingBookmark, resumeReader tests |
| List/pane/statistics agreement and activity periods | columnManager, itemPaneManager, statistics, statisticsScope, dashboard tests |
| Lifecycle, invalidation, shutdown writes | bootstrap, notifierManager, readerTracker, dashboardManager tests |
| Native menus, settings, sidebar search | menuManager, preferences, sidebarSearchManager tests |
| Package integrity and old-writer refusal | build/releaseProfileContract tests, verify-xpi.js, verify-bookmark-compatibility.js |

The pinned v1.3.6 writer is tested through real mutation methods against v4 records, with unchanged bytes, zero saves, and a writable v3 positive control. The released v1.3.8 writer is also tested against v5 records and refuses six mutation methods with exact byte retention; its v4 positive control remains writable. The released v1.3.9 v5 writer round-trips both the explicit start timestamp and bookmark. Its `npm run verify` passed: typecheck, 309 tests, XPI validation, and compatibility checks. The release-triggered GitHub verify and public asset comparison also passed. These checks are not proof of real Zotero cloud delivery. The older v3 transition can be checked separately with scripts/verify-pr3-compatibility.js.

## Observed native behavior

In a separate Zotero 10.0.6 test profile on macOS, changing the QA paper from **Read** to **Skimmed** refreshed its selected-library row immediately; the test then restored **Read**. The row showed the shorter `Bookmark 4/10 · Last 4/10` value, while the column header and item pane preserved the full distinction between the explicit bookmark and automatic last-viewed location. In a separate QA item with no PDF attachment, setting **Reading** displayed a recorded **Reading started** timestamp while **Last PDF activity**, **Reading bookmark**, and **Last viewed (automatic)** remained unrecorded. This verifies the native item-pane distinction, not PDF tracking, statistics, or cross-device sync. The 1.3.7 captures document the prior bookmark workflows; current captures and their scope are listed in [assets/README.md](assets/README.md).

Do not claim real multi-device sync, VoiceOver certification, or universal Zotero/platform coverage from these bounded observations. VoiceOver settings are outside this workflow. [Release acceptance](RELEASE.md) remains separate from unit checks and screenshots.

## New-item refresh check — 1.3.10

On October 26, a new Journal Article was created through the native New Item menu in an isolated English Zotero 10.0.6 for macOS running released Reading Flow 1.3.10. With that new item kept selected, its status changed from Unassigned to To Read, then Reading. The library row updated after each saved change without restarting or selecting another item; Important also appeared in the selected row when enabled. Reading started was recorded, while Last PDF activity and both positions stayed unrecorded for the item without a PDF. [Actual result](assets/workflows/new-item-reading-important.jpg).

An October 25 capture session had observed stale blank rows for newly created items. That symptom was not reproduced in this check; no speculative application-code patch was added. The screen-capture transport returned older frames, so current accessibility values and the later native image were checked separately. Bringing the library window forward through its native Window menu recovered the image stream; this did not refresh or restart the library. This bounded result does not cover all import, sync, or platform scenarios.

## Documentation checks

Check local links and heading anchors, screenshot identity/aspect ratio, current UI terms, English maintained text, and absence of personal information. Render the README on GitHub and inspect images at their displayed size. A passing source test cannot substitute for this review.

One-off implementation reports and superseded proposals were removed from the current tree during the October25 documentation cleanup. Their original evidence remains in Git history before this change; use historical records as evidence of that revision, not as current operating instructions.
