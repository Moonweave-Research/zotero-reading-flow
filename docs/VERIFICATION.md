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

The pinned v1.3.6 writer is tested through real mutation methods against v4 records, with unchanged bytes, zero saves, and a writable v3 positive control. The released v1.3.8 writer is also tested against v5 records and refuses six mutation methods with exact byte retention; its v4 positive control remains writable. The current v5 writer round-trips both the explicit start timestamp and bookmark. The unreleased reading-start patch passed `npm run verify` locally: typecheck, 309 tests, XPI validation, and compatibility checks. These checks are not proof of real Zotero cloud delivery. The older v3 transition can be checked separately with scripts/verify-pr3-compatibility.js.

## Observed native behavior

In a separate Zotero 10.0.6 test profile on macOS, changing the QA paper from **Read** to **Skimmed** refreshed its selected-library row immediately; the test then restored **Read**. The row showed the shorter `Bookmark 4/10 · Last 4/10` value, while the column header and item pane preserved the full distinction between the explicit bookmark and automatic last-viewed location. In a separate QA item with no PDF attachment, setting **Reading** displayed a recorded **Reading started** timestamp while **Last PDF activity**, **Reading bookmark**, and **Last viewed (automatic)** remained unrecorded. This verifies the native item-pane distinction, not PDF tracking, statistics, or cross-device sync. The 1.3.7 captures document the prior bookmark workflows; current captures and their scope are listed in [assets/README.md](assets/README.md).

Do not claim real multi-device sync, VoiceOver certification, or universal Zotero/platform coverage from these bounded observations. VoiceOver settings are outside this workflow. [Release acceptance](RELEASE.md) remains separate from unit checks and screenshots.

## Known native limitation

During the October25 screenshot preparation, newly created sample items saved their manual stages correctly (confirmed in the panel and persisted records), but their existing library rows continued to show the earlier blank state until Zotero restarted. The captures show the reloaded persisted state. Immediate library refresh for those new-item status changes remains unresolved; these screenshots must not be used to claim that behavior passed.

## Documentation checks

Check local links and heading anchors, screenshot identity/aspect ratio, current UI terms, English maintained text, and absence of personal information. Render the README on GitHub and inspect images at their displayed size. A passing source test cannot substitute for this review.

One-off implementation reports and superseded proposals were removed from the current tree during the October25 documentation cleanup. Their original evidence remains in Git history before this change; use historical records as evidence of that revision, not as current operating instructions.
