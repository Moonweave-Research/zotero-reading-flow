# Verification

## Optional automatic completion in 1.3.16 (#43)

On November 15, 2026, `npm run verify` passed 393 tests with no failures or skips, type checking, XPI validation, and pinned writer compatibility. The new final-page close test failed before implementation. A second counterexample reproduced Clear automatic Read discarding a pending PDF position; the fix uses an independent completion-cancellation timestamp, and the regression now passes. Guards cover opt-in, all manual stages, current versus farthest page, focused split panes, other open readers, unknown locations, preference changes while queued or awaiting a dirty item, shutdown, unregister, read-only and malformed records. Existing PDF/snapshot/bookmark behavior remains covered.

The released 1.3.15 writer was executed against v7 records through eleven mutation paths and retained exact bytes without saving; its v6 positive control succeeded. The new writer preserved and cleared automatic completion while retaining bookmarks and snapshot facts. The Gecko pane harness passed six states at three widths and two font sizes with details collapsed/expanded (72 conditions), plus two PDF-toolbar save/Undo cases. The narrow automatic-Read panel was visually inspected for legible dates and an intact clear control.

In isolated Zotero 10.0.9 on macOS, an unmodified feature candidate passed 28 native checks using synthetic PDFs and HTML snapshots: default off, enabled partial/final-page close, manual To Read/Read, returning from the end before close, snapshot exclusion, automatic/manual statistics separation, and the production clear control. Native Tools-menu generation was exercised before dispatching the statistics command. After normal quit/restart, seven records retained identical Extra bytes and quitting while a PDF showed its final page had not completed that item.

A hardened candidate XPI (SHA-256 `57463b011bf9959a40e3953a12a11d2706ef3fa8e7effce37d2a758e985ce164`) was then installed in that isolated profile. It repeated final-page completion and production Clear automatic Read while a page-3 PDF save was pending; the page saved and the completion cleared without losing snapshot activity or Important. Installed and built archive hashes matched. A QA companion drove the real Reader and native controls; it and the synthetic library are excluded from the production archive. Personal profiles were not used. Windows, Zotero 9, actual cross-device sync and external reader-window closure are not claimed. The option defaults off and writes v7 only for new automatic completion. These checks identify pre-release feature candidates; their hashes are not the versioned 1.3.16 release archive.


A final review counterexample reproduced a tab closed under manual To Read being completed after the manual stage was cleared during the save delay. The close handler now checks the current supported, writable parent and Automatic status before scheduling, in addition to the queued-write guard. The regression passes. The final candidate SHA-256 `33deb2df03ce492c84999c9b556040714938a9f8f140a3dc6734833302f9eb8f` was installed unmodified and passed five native checks: manual To Read at close, clearing via the production control, no retroactive completion, successful later Automatic closure, and retention of independent facts. Installed and built hashes matched.

## Snapshot support in 1.3.15 (#50)

On November 15, 2026, `npm run verify` passed 366 tests with no failures or skips, type checking, XPI validation, and previous-writer compatibility checks. The snapshot opening test failed on the 1.3.14 baseline with Unassigned instead of Reading. Additional failing cases covered snapshot attachment selection in the pane and context menu. Regression coverage retains PDF locations/history, bookmarks, manual stages, explicit start dates, Important, unrelated Extra content, shutdown flushing, and unsupported/read-only record protection. The pinned released 1.3.14 writer refuses eight v6 mutation paths with byte retention; its v5 positive control succeeds.

The Gecko layout harness passed five states at three widths and two font sizes, with details collapsed and expanded (60 conditions), plus both PDF-toolbar save/Undo cases. The narrow snapshot panels were visually inspected; the timestamp wraps without horizontal overflow or clipped text. This is a synthetic Gecko host, not Windows desktop acceptance.

The unmodified candidate XPI was installed in an isolated Zotero 10.0.9 macOS profile with synthetic HTML attachments. A separate QA companion plugin drove the real Reader lifecycle and inspected stored metadata and the native pane. Automatic, manual To Read, and manual Read cases recorded snapshot openings without fabricating PDF activity; closing did not mark Read. Reopening advanced the timestamp, and the native pane displayed Last snapshot opened. After restarting, all three records retained identical Extra bytes. Adding a ten-page PDF to a v6 snapshot item still recorded page 3; the production toolbar saved and undid its bookmark while preserving the snapshot timestamp. The QA process then quit normally. Installed and built candidate XPI SHA-256 both matched `3f574b94377df3bafffeb93482153082a453dacc2e500e228dabb2f56f64ac73`.

The companion plugin and synthetic library are local test fixtures, excluded from the production archive. No personal profile was used for the tests. Windows, Zotero 9, external-browser snapshot openings, and real device-to-device sync were not tested. Snapshot records use v6; PDF-only records retain their existing schema. These checks covered the feature candidate before version 1.3.15 release preparation; the hash above identifies that earlier candidate, not the versioned release archive.

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

## Issue #43 — same-page opening

In a disposable Zotero 10.0.8 profile on macOS, the current DataStore and ReaderTracker modules were loaded into a plugin-equivalent sandbox and connected to the real Reader API, using a synthetic ten-page PDF. No personal library or settings were used.

Before the fix, opening at the attachment’s saved page left the record empty and the status Unassigned after the normal save delay. Navigating to the next page emitted pageChange and recorded automatic Reading: this was the positive control. After the fix, the loaded opening recorded page 1 without navigation. Manual To Read and Read remained unchanged after opening and navigating; completion was not inferred.

The 1.3.11 XPI was then installed through Zotero’s native plugin installer in the same disposable profile and verified active after restart. A separate host-API fixture runner exercised the installed package without importing or replacing its production modules. Five cases passed: automatic opening at page 1 without navigation; manual To Read and Read through opening, end-page navigation, and tab closure; bookmark page 4 preserved while the automatic position moved to page 10; and byte-preserving refusal of an unsupported record. Important and unrelated Extra content were preserved. The PDF toolbar bookmark control was present in the live reader. After a normal shutdown and restart, all five saved records matched their post-close values exactly.

These are installed-package runtime checks, not a new visual certification of every panel or statistics view. Menu dispatch and screen capture were unavailable during the final session. The issue’s requested automatic Read-on-close behavior is not implemented: reaching the end or closing the tab is not evidence of completion. The reporter’s exact environment, Windows behavior, Zotero 9, and real device-to-device sync remain unverified. Unit coverage also checks repeated toolbar rendering, all manual stages, closure during initialization, and unregister during initialization.

## Reading Flow 1.3.12

The five review regressions cover cancelled shutdown work, repeat statistics expansion and collapse, independent daily observations, a confirmed final page, and automatic resume after a local attachment ID changes. The pinned 1.3.11 writer also preserved a new keyed record and its history during a manual status edit.

The complete 1.3.12 XPI was exercised in an isolated Zotero 10.0.8 profile on macOS. The installed statistics window expanded and collapsed before and after refresh. The calendar showed page 1 for today's observation after a previous day reached page 8, and page 10 of 10 for a separate PDF. Keyed resume opened the expected PDF and page. Legacy numeric resume preserved its stored bytes. A pending page 6 survived normal quit and restart alongside the manual status and bookmark. The precise cancelled-timer race and changed local IDs were tested with fixtures. Windows, Zotero 9, and transfer between actual devices were outside this run.


## Private group records candidate (2026-11-15, issue #17)

Unreleased source build based on 1.3.16. No release or device-sync claim is implied.

- `npm run verify`: 402 tests passed, zero failures/skips; type checking, build, XPI validation and pinned previous-writer compatibility passed.
- `npm run test:layout`: 84 pane conditions (seven scenarios, three widths, two font sizes, collapsed/expanded details) plus two PDF-toolbar save/Undo cases. The new private-group notice and enabled controls fit the shared pane at 280px and 26px font; the rendered PNG was inspected.
- Seven private-store/integration cases cover shared Extra isolation, read-only groups, profile/group/item identity, durable reload, concurrent different-item saves, save failure recovery, corrupt/future file and record refusal, defaults, removal, completion/clear/reset guards, menu writes and statistics. Panel and sidebar tests cover private scope disclosure and avoiding misleading Extra-based group searches.
- Negative control: a temporary bundle routing groups through the old shared Extra path fails the privacy test (`read` from shared Extra versus private `null`). The production bundle passes; no mutation was left in source.
- Exact candidate XPI SHA-256: `3a386abb5d6e9ed092833da8eeb04896eeb1f72d947d2dfb1a2abd3b290155d6`.
- In an isolated macOS Zotero 10.0.9 profile, the exact candidate passed 35 native checks using synthetic groups/items/PDF/snapshot. Actual read-only group controls saved private status and Important, the real PDF toolbar captured a bookmark, PDF activity/history and snapshot openings were private, automatic completion stayed off until opted in, clearing kept a pending page-4 save and page-3 bookmark, another group remained independent, and My Library still used Extra. Shared Extra bytes and dateModified stayed unchanged on all three group parents. Native checks do not use a live account or change group permissions on the server.
- Windows, Zotero 9, live group-server sync and device-to-device sync were not exercised. Private group records intentionally have no sync transport, do not import prior shared Extra, and remain in the profile after uninstall, deletion or leaving a group.
