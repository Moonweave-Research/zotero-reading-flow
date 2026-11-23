# Product contract

Source version: **1.3.20** (November 21, 2026). The [GitHub Releases page](https://github.com/Moonweave-Research/zotero-reading-flow/releases) is the authority for the currently published version. Explicit reading-start timestamps shipped in 1.3.9; 1.3.10 isolates sidebar width and wraps controls. The [Windows issue #39 reporter confirmed normal behavior after updating](https://github.com/Moonweave-Research/zotero-reading-flow/issues/39#issuecomment-6405504991); that is user confirmation, not our direct Windows desktop test. Passing checks, observed Zotero behavior, publication, and real device-to-device sync are separate facts. Real device-to-device sync remains unverified.

The #43 reader-opening fix is included in 1.3.11. Published 1.3.10 only observes page changes for automatic position tracking.

Snapshot support in 1.3.15: opening a loaded web snapshot derives automatic Reading and records `snapshotOpenedAt` in v6 metadata. Manual stages take precedence. Closing a snapshot does not mark Read. The pane labels this timestamp Last snapshot opened; PDF activity dates, positions, bookmarks, explicit reading-start dates, and the PDF activity calendar remain independent. Snapshot opening alone creates no PDF activity history.

Only a snapshot opening upgrades its parent record to v6. New-item default provenance uses v8 as described below. Released 1.3.14 refuses v6 mutations without changing the stored bytes. All editing devices need 1.3.15 or a later snapshot-capable client for upgraded items. No bulk migration or automatic schema downgrade is performed.

## Reading meaning

Optional completion in 1.3.16 (#43): `autoComplete` defaults to false. When enabled, closing a loaded PDF tab on its live final page can store `automaticRead: { attachmentKey, at }` in v7 and derive Read with an automatic source. Manual stages always take precedence. Do not use a persisted/farthest position or metadata page-count fallback to infer completion. Another open reader for that parent, a non-PDF, missing initialization/key/page count, disabled tracking, or app shutdown prevents completion. Capture the live PDF page in the tab's close callback. Zotero can deliver the close notification after the PDF view has been removed.

Optional snapshot completion (#50): `autoCompleteSnapshot` defaults to false independently of the PDF rule. Capture the selected snapshot before Zotero switches tabs. Require 15 continuous seconds in the active window and the end in view at close. A background close, a tab merely restored at startup, or a host unload does not qualify. Use the same completion metadata and manual-status safeguards as for PDF completion.

No completion history or manual Read counts are fabricated. Show Automatic Read separately in current statistics. Clear automatic Read removes only the completion marker, preserves every independent fact and prevents an older pending completion from restoring it. Disabling the option stops future marks without modifying existing records. A v7 record needs 1.3.16 or a later compatible client on every editing device; the pinned released 1.3.15 writer must refuse edits with exact byte retention. Preserve the existing v1–v6 read/write path for records without automatic completion. No bulk migration or schema downgrade.

- A reading bookmark is a deliberate user choice for one PDF attachment and page. Navigation never moves it. Setting, removing, and undoing a bookmark are explicit actions.
- Last viewed is the most recently displayed PDF page, including a brief visit. It can move backward. Historical farthest positions are optional navigation history, never measured reading coverage.
- Neither reaching the end of a document nor spending time on a page proves reading or completion. Do not label automatic positions as pages read, reading percentage, or completion.
- Manual stages are To Read, Reading, Skimmed, and Read. Without a manual stage, a bookmark or recorded PDF activity can derive Reading; otherwise the item is Unassigned. A loaded PDF opening records its visible position even when it matches the previously saved page. Manual stages remain unchanged; by default, reaching the end or closing a tab never marks Read.
- Important is independent of the stage. Clearing either preserves the other. Legacy Important does not recover a lost earlier manual stage.

## Surfaces and actions

The library, item pane, context menu, and statistics share conservative position/status interpretation. Unknown or ambiguous legacy values stay unknown. Show page positions rather than completion percentages.

- The PDF toolbar offers Bookmark here. The library's book-shaped icon opens the Reading Flow section.
- Continue from bookmark opens the bookmarked attachment and page. Open last viewed opens the automatic target. With no known position, say Open PDF.
- A bookmark identifies its PDF by Zotero attachment key. Never apply one PDF's page to another attachment. Report missing files and revalidate the target before opening.
- Reset tracked PDF positions clears automatic current/maximum positions and preserves the bookmark, status, Important, reading start date, last PDF activity, and retained history. Remove bookmark is separate.
- Preserve selection/generation guards, read-only access, queued writes, and unrelated Extra content. Refresh position facts when the section is rebuilt; no extra scroll should be required.

## Dates and statistics

Statistics tag filter in 1.3.18 (#6): match one exact, case-sensitive parent-item tag (manual or automatic). Load tags before projecting a snapshot. Available tags come from all live parents in the selected scope, independent of dataset/status/Important. Apply the tag before current/history aggregation and activity-day caching; scope totals and denominators refer to the tag-matched scope. Current View honors the native collection/saved-search view; Selected Library uses the whole selected library. Child attachment tags are not inherited. Preserve a selected absent tag as an empty intersection. Stale and out-of-order responses must not relabel old figures or replace current tag options. Filtering never edits tags, metadata or private files.

Reading started is recorded when the status changes to Reading, including a configured default for new items, and updates when Reading starts again. Never infer or backfill it from PDF history. Last PDF activity is the latest saved PDF page position, not proof that the page was read. Display local dates consistently, using YYYY-MM-DD and minute precision where appropriate.

Detailed daily history retains at most 366 days. Brief page visits count as activity; status changes and resets alone do not. Period filters select retained activity; current status and saved positions still describe the item now. Marked Read counts manual Read choices. Missing legacy history must not be reconstructed as a reading judgment.

## Persistence and compatibility

For My Library, one ReadingFlow: JSON line in the parent item's Extra field holds plugin metadata. PDFs, annotations, user tags, and unrelated Extra lines are preserved. Unsupported, malformed, or duplicate namespaces must not be silently overwritten.

The current source writes v5 records when it first records Reading started, supports v4 bookmarks, and reads earlier supported formats. No bulk startup migration or inferred completion dates. Bookmark clients require 1.3.8 or newer; v5 reading-start records require 1.3.9 or a later compatible release. Older writers must refuse unsupported records without changing their bytes. Keep the pinned previous-writer checks and their positive controls. Do not lower schema versions to work around refusal.

Automatic PDF positions written by 1.3.12 use attachment keys. Legacy numeric references remain readable locally and are not bulk migrated. Actual delivery between two devices remains unverified. Metadata sync transport belongs to Zotero. Every editing client must support the stored format; do not generalize tested refusal to arbitrary old releases.

## Private group records (1.3.17, issue #17)

Group libraries use profile-local `reading-flow-private.json` (envelope v1), keyed by stable group ID and item key. Each value uses the same guarded ReadingFlow format as personal Extra. Load the private store before registering consumers, serialize durable writes across items, replace the file through IOUtils tmpPath with flush, and drain mutations before shutdown. Memory changes only after disk success. Unreadable/corrupt/future storage or unsupported records must remain untouched; never fall back to shared Extra.

Shared Extra is ignored, never imported or rewritten, even if editable. Read-only group metadata does not prevent private mutations. Existing deletion, parent-item, unsupported-data, queued-write, reset and generation guards still apply. Private records participate in columns, item panes, bookmarks, tracking and statistics. They do not sync or leave this profile, and uninstall/trash/group departure does not remove them. Shared metadata sync remains Zotero's responsibility and has no authority over private state. My Library retains the existing Extra path.

Do not create or automatically rename group Extra-based saved searches: they cannot represent private records. Explain this in preferences and use the statistics Tracked papers dataset instead.

## Preferences and scope

Zotero owns column visibility/layout. Compact and Icons affect only the optional combined column. Unassigned is the default for newly added items and writes nothing; an opted-in stage affects only future eligible additions. The sidebar list is one native, library-scoped Saved Search for tracked papers, not a status-derived folder.

A newly assigned To Read default is marked in v8 metadata. Opening a loaded snapshot in the foreground or selecting its loaded tab clears that default and derives Automatic (Reading). Background loads and session restore can record activity without clearing the default. Choosing a status, including To Read again, makes it explicit. The same rule applies to Restart as To Read. Existing To Read records have no provenance marker and are preserved. Snapshot openings preserve PDF positions and history. Older clients, including 1.3.19, leave v8 records untouched. Use Reading Flow 1.3.20 or later on every device that edits those items.

Product changes must preserve personal data and settings. Do not alter models, permissions, VoiceOver, IDE settings, or unrelated system preferences as part of Reading Flow work.

## Maintenance

Use English for maintained documentation, new commit subjects, and pull requests. Preserve existing Git history. Historical implementation plans and one-off verification reports are recoverable from Git history; they are not active instructions.

See [verification](VERIFICATION.md), [release process](RELEASE.md), and [troubleshooting](TROUBLESHOOTING.md).
