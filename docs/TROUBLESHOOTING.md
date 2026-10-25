# Troubleshooting

This guide covers Reading Flow 1.3.8. To use bookmark controls, install 1.3.8 or newer from the [latest release](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest) and restart Zotero. Check the installed add-on version first.

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

## Status changes do not apply

Use the Reading Flow panel or item context menu. Read-only items cannot be changed. Bulk changes normalize PDF selections to their parent and report unchanged, skipped, or failed items. Unsupported, duplicate, or malformed ReadingFlow records are protected rather than overwritten. Do not delete their Extra line as a repair shortcut.

During current test-profile capture work, newly created items could retain a stale blank library status after a saved manual change. The panel and persisted record were correct; restarting refreshed the list. This remains a known display-refresh limitation, not evidence that the save was lost.

Important is independent of status. Clear Manual Status (Use Automatic) removes only the manual stage. Existing activity or a bookmark may still derive Reading; untouched items remain Unassigned.

## Continue opens an unexpected file or page

Reading bookmarks and automatic locations are separate. Check the displayed PDF name and action. Continue from bookmark uses the marked PDF; Open last viewed uses the automatic target. With no known page the action opens the PDF normally. A missing bookmarked file must not silently reuse its page on another PDF. PDF file positions may differ from printed page labels.

## Reset did not remove my bookmark or dates

That is expected. Advanced → Reset tracked PDF positions clears automatic positions while preserving the bookmark, status, Important, reading start date, last PDF activity, and history. Use Remove bookmark for the deliberate bookmark.

## Data and sync

Metadata lives in a ReadingFlow: JSON line in the parent item's Extra field. Do not edit it manually for routine use. Unrelated Extra content, PDFs, and annotations are preserved; uninstalling does not remove this metadata.

Use compatible clients (1.3.8 or newer) for bookmark records on every editing device. Records with the new Reading started date use v5 and require this patch or a later v5-compatible release on every device. Version 1.3.8 safely preserves v5 records but shows them as unsupported, without their details or editing controls. The PDF must be available there too. Actual device-to-device delivery has not been verified. Never lower a record's schema version to make an old writer accept it.

## An update still shows an old version

Install the XPI through Tools → Plugins → gear menu → Install Plugin From File… and restart normally. Manually replacing an XPI can leave stale add-on registration. Do not delete extension caches or reset the profile as a first step.

Zotero 9 and 10 are supported. The manifest's 8.999 minimum is a version-comparison sentinel for Zotero 9 source builds; Zotero 8 itself is unsupported.

## Report a problem

Include the Zotero version, Reading Flow version, operating system, reproduction steps, and what you expected. Use a small test item when possible. Obtain debug output through Zotero's Help → Debug Output Logging controls, and inspect it for private library information before sharing. Do not post full profiles, databases, credentials, or personal PDFs.

[Report an issue](https://github.com/Moonweave-Research/zotero-reading-flow/issues).
