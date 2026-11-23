# Troubleshooting

This guide covers Reading Flow 1.3.10. To use bookmark controls, install 1.3.8 or newer from the [latest release](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest) and restart Zotero. Check the installed add-on version first.

## Find the controls

- **Bookmark here:** upper-right toolbar inside an open PDF, near Aa.
- **Reading Flow panel:** select a library item and click the book-shaped icon on the right, or use Reading Flow → View Reading Flow in the item menu. Expand the section if collapsed.
- **Columns:** enable Bookmark / Last Viewed, Status, and Last PDF Activity with Zotero's native column chooser. The optional combined Reading Flow column must be enabled manually. Compact/Icons changes its contents, not visibility.
- **Statistics:** Tools → Reading Statistics, or the item's Reading Flow → View Current View Statistics. If a window is already open, its filters are preserved; check Scope and Activity period.

## A brief visit changed the page

Last viewed is automatic navigation tracking. A brief visit counts and can move it backward. Save a reading bookmark for the page you intend to return to. Set Read yourself; neither a bookmark nor the last PDF page proves completion.

## Positions do not update

Use Zotero's built-in PDF reader, change pages, and allow the pending save to complete (normally within five seconds). Tracking belongs to the regular parent item with a child PDF. Check write access and whether an unsaved Extra edit is blocking a safe update. EPUB and snapshot positions are not tracked.

The book-shaped icon should resolve saved positions without another scroll. If it remains at Checking PDF availability, report the plugin/Zotero versions and reproducible steps.

## Optional automatic Read

Both options are off by default and apply only to items using Automatic. A loaded PDF tab must close on its live final visible page; another reader for that parent must not remain open. Visiting the end and returning to an earlier page is insufficient. The separate snapshot option requires 15 continuous seconds in the active snapshot tab and the end in view at close. Another open reader for the same item prevents either rule. External reader windows, EPUBs, and app shutdown do not trigger completion. Allow the five-second save delay. Manual To Read/Reading/Skimmed/Read stays unchanged until you clear that override yourself.

The pane shows Automatic (Read) and its timestamp. Use Clear automatic Read to remove the mark without resetting PDF positions/history, bookmarks, snapshot activity or manual stages. Turning the setting off does not remove existing marks. Statistics show Automatic Read separately from the manual-only Marked Read count. v7 records need 1.3.16 or a later v7-capable client; released 1.3.15 refuses their edits without changing bytes. Do not downgrade the record version.

## Status changes do not apply

Use the Reading Flow panel or item context menu. Read-only My Library items cannot be changed; read-only groups allow private Reading Flow changes. Bulk changes normalize PDF selections to their parent and report unchanged, skipped, or failed items. Unsupported, duplicate, or malformed ReadingFlow records are protected rather than overwritten. Do not delete their Extra line as a repair shortcut.

An earlier capture session observed stale blank library rows for newly created items. A fresh native check of released 1.3.10 on macOS created a paper and changed it to To Read, then Reading, and toggled Important: the selected row updated without restarting or selecting another item. That earlier symptom did not recur in this check. If it occurs in your workflow, report the exact creation/import steps and versions; do not delete the saved record or reset your library.

Important is independent of status. Clear Manual Status (Use Automatic) removes only the manual stage. Existing activity or a bookmark may still derive Reading; untouched items remain Unassigned.

## Continue opens an unexpected file or page

Reading bookmarks and automatic locations are separate. Check the displayed PDF name and action. Continue from bookmark uses the marked PDF; Open last viewed uses the automatic target. With no known page the action opens the PDF normally. A missing bookmarked file must not silently reuse its page on another PDF. PDF file positions may differ from printed page labels.

## Reset did not remove my bookmark or dates

That is expected. Advanced → Reset tracked PDF positions clears automatic positions while preserving the bookmark, status, Important, reading start date, last PDF activity, and history. Use Remove bookmark for the deliberate bookmark.

## Statistics tag filter (1.3.18)

Expand Filter items and select Tag. Names match exactly, including case; manual and automatic tags on parent items are included. Tags on a child PDF do not tag its parent for these statistics. The list comes from the current view/library before Items, Status or Important filtering. Choose All tags to clear it. If the selected tag is absent after changing scope, it stays selected with “not in this scope” and returns no matches.

For a saved search or collection, select it in Zotero, choose Current View in the dashboard and Refresh. Selected Library includes the whole active library. A tag-loading failure keeps the last successful snapshot with a stale notice; its old tag is shown with those figures. Try Refresh after resolving the load error.

## Data and sync

Snapshot support in 1.3.15 records Last snapshot opened after the internal reader loads, with the same five-second save delay as PDF tracking. Opening a snapshot in an external browser does not count. Choose Automatic in the status control to remove a manual override. To mark Read when closing a snapshot, enable the separate snapshot completion option and meet its viewing criteria. EPUB tracking is unchanged. Snapshot-only items appear in the tracked set but do not add PDF calendar activity or page counts.

A snapshot opening needs v6 or newer metadata. A new-item To Read default uses v8, which remains after the default clears. Use Reading Flow 1.3.20 or later on each device that edits those records. Older versions, including 1.3.19, show v8 records as unavailable and preserve their contents.

My Library metadata lives in a ReadingFlow: JSON line in the parent item's Extra field. Do not edit it manually for routine use. Unrelated Extra content, PDFs, and annotations are preserved; uninstalling does not remove this metadata.

Use compatible clients (1.3.8 or newer) for bookmark records on every editing device. Records with Reading started use v5 and require 1.3.9 or a later v5-compatible release on every editing device. Version 1.3.8 safely preserves v5 records but shows them as unsupported, without their details or editing controls. The PDF must be available there too. Actual device-to-device delivery has not been verified. Never lower a record's schema version to make an old writer accept it.

## Group-library records (1.3.17)

Group reading data is private to the current Zotero profile and is not synced to other devices or members. The shared Extra line is ignored without changing it. Read-only group items can still have private status, bookmarks and activity. An existing shared Read status therefore does not become your personal Read status automatically.

The file `reading-flow-private.json` is in the profile directory (Help → Show Data Directory opens the separate data directory). Back up the profile file too. Uninstalling, deleting an item or leaving a group does not delete private records. Use Reading Statistics with Tracked papers in the selected group; an Extra-based saved search cannot find private records. A storage warning disables group changes while leaving My Library available. Preserve the file and report the error; do not overwrite it or move shared metadata into it manually.

## An update still shows an old version

Install the XPI through Tools → Plugins → gear menu → Install Plugin From File… and restart normally. Manually replacing an XPI can leave stale add-on registration. Do not delete extension caches or reset the profile as a first step.

Zotero 9 and 10 are supported. The manifest's 8.999 minimum is a version-comparison sentinel for Zotero 9 source builds; Zotero 8 itself is unsupported.

## Report a problem

Include the Zotero version, Reading Flow version, operating system, reproduction steps, and what you expected. Use a small test item when possible. Obtain debug output through Zotero's Help → Debug Output Logging controls, and inspect it for private library information before sharing. Do not post full profiles, databases, credentials, or personal PDFs.

[Report an issue](https://github.com/Moonweave-Research/zotero-reading-flow/issues).
