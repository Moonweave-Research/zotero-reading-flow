# Product contract

Current published release: **1.3.10** (October 26, 2026). Explicit reading-start timestamps shipped in 1.3.9; 1.3.10 isolates sidebar width and wraps controls. The [Windows issue #39 reporter confirmed normal behavior after updating](https://github.com/Moonweave-Research/zotero-reading-flow/issues/39#issuecomment-6405504991); that is user confirmation, not our direct Windows desktop test. Passing checks, observed Zotero behavior, publication, and real device-to-device sync are separate facts. Real device-to-device sync remains unverified.

## Reading meaning

- A reading bookmark is a deliberate user choice for one PDF attachment and page. Navigation never moves it. Setting, removing, and undoing a bookmark are explicit actions.
- Last viewed is the most recently displayed PDF page, including a brief visit. It can move backward. Historical farthest positions are optional navigation history, never measured reading coverage.
- Neither reaching the final page nor spending time on a page proves reading or completion. Do not label automatic positions as pages read, reading percentage, or completion.
- Manual stages are To Read, Reading, Skimmed, and Read. Without a manual stage, a bookmark or recorded PDF activity can derive Reading; otherwise the item is Unassigned.
- Important is independent of the stage. Clearing either preserves the other. Legacy Important does not recover a lost earlier manual stage.

## Surfaces and actions

The library, item pane, context menu, and statistics share conservative position/status interpretation. Unknown or ambiguous legacy values stay unknown. Show page positions rather than completion percentages.

- The PDF toolbar offers Bookmark here. The library's book-shaped icon opens the Reading Flow section.
- Continue from bookmark opens the bookmarked attachment and page. Open last viewed opens the automatic target. With no known position, say Open PDF.
- A bookmark identifies its PDF by Zotero attachment key. Never apply one PDF's page to another attachment. Report missing files and revalidate the target before opening.
- Reset tracked PDF positions clears automatic current/maximum positions and preserves the bookmark, status, Important, reading start date, last PDF activity, and retained history. Remove bookmark is separate.
- Preserve selection/generation guards, read-only access, queued writes, and unrelated Extra content. Refresh position facts when the section is rebuilt; no extra scroll should be required.

## Dates and statistics

Reading started is recorded when the status changes to Reading, including a configured default for new items, and updates when Reading starts again. Never infer or backfill it from PDF history. Last PDF activity is the latest saved PDF page position, not proof that the page was read. Display local dates consistently, using YYYY-MM-DD and minute precision where appropriate.

Detailed daily history retains at most 366 days. Brief page visits count as activity; status changes and resets alone do not. Period filters select retained activity; current status and saved positions still describe the item now. Marked Read counts manual Read choices. Missing legacy history must not be reconstructed as a reading judgment.

## Persistence and compatibility

One ReadingFlow: JSON line in the parent item's Extra field holds plugin metadata. PDFs, annotations, user tags, and unrelated Extra lines are preserved. Unsupported, malformed, or duplicate namespaces must not be silently overwritten.

The current source writes v5 records when it first records Reading started, supports v4 bookmarks, and reads earlier supported formats. No bulk startup migration or inferred completion dates. Bookmark clients require 1.3.8 or newer; v5 reading-start records require 1.3.9 or a later compatible release. Older writers must refuse unsupported records without changing their bytes. Keep the pinned previous-writer checks and their positive controls. Do not lower schema versions to work around refusal.

Actual delivery between two devices remains unverified. Metadata sync transport belongs to Zotero. Every editing client must support the stored format; do not generalize tested refusal to arbitrary old releases.

## Preferences and scope

Zotero owns column visibility/layout. Compact and Icons affect only the optional combined column. Unassigned is the default for newly added items and writes nothing; an opted-in stage affects only future eligible additions. The sidebar list is one native, library-scoped Saved Search for tracked papers, not a status-derived folder.

Product changes must preserve personal data and settings. Do not alter models, permissions, VoiceOver, IDE settings, or unrelated system preferences as part of Reading Flow work.

## Maintenance

Use English for maintained documentation, new commit subjects, and pull requests. Preserve existing Git history. Historical implementation plans and one-off verification reports are recoverable from Git history; they are not active instructions.

See [verification](VERIFICATION.md), [release process](RELEASE.md), and [troubleshooting](TROUBLESHOOTING.md).
