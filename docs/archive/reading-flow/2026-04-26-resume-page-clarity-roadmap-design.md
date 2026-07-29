# Resume Page Clarity and Reading Flow Roadmap Design

> **Status: STALE / HISTORICAL ONLY — DO NOT EXECUTE**
>
> Superseded on 2026-07-28 by the sole active authority:
> [Reading Flow Authoritative Design and Implementation Plan](../../READING_FLOW_AUTHORITY.md).
> Preserve this file only as historical context. Agents must not execute its
> phases or use it to override the authoritative plan.

## Goal

Make `Resume Reading` understandable and useful from a researcher's point of
view. The current behavior opens the last tracked PDF page, but the label
promises more than the feature actually does. Users can reasonably expect exact
scroll-position restoration or percent-position restoration.

The first improvement should make the action explicit:

> Resume at Page 4 / 9

This sets the correct expectation before the click and makes the Reading Flow
metadata more actionable in real library use.

## User Scenario

A graduate student is reading many papers across multiple projects. They open
Zotero after a day or a week and need to answer three questions quickly:

- Which papers are currently in progress?
- Where did I stop?
- Can I reopen the right PDF without hunting through attachments?

Progress percentage alone is not enough. `11%` is useful as a scan signal, but
`Page 1 / 9` is easier to trust when deciding whether to resume a paper.

## Phase 0: Implementation Spike

Phase 0 is mandatory before Phase 1 implementation. Two assumptions need live
verification in the target Zotero version.

### Menu Label Update Path

Zotero 9's `MenuManager` context exposes `setL10nArgs`, `setEnabled`,
`setVisible`, `setIcon`, and `menuElem`. It does not expose `setLabel`, and the
registered menu data type does not officially include a `label` field.

Spike tasks:

- Verify that calling `context.setL10nArgs(JSON.stringify(args))` during
  `onShowing` updates the visible native menu label before the user clicks.
- If it does not update the already-rendered label, verify a fallback using
  `context.menuElem?.setAttribute('label', fallbackLabel)`.
- Keep `l10nID` as the primary localization mechanism and use direct DOM label
  mutation only as a fallback for the currently shown menu.

Implementation should not begin until one of these paths is confirmed in the
live Zotero UI.

### Page Count Source

The current code can read total pages from active Reader/PDF.js state, but the
Reader is normally closed when the library context menu opens. Attachment
metadata such as `numPages` is not reliable enough as the only `/ N` source.

Spike tasks:

- Confirm how often existing PDF attachments expose `numPages`, `pages`,
  `numPagesRaw`, or `pageCount` without opening the reader.
- Confirm that the existing Reader tracking path can save a reliable page count
  while the PDF is open.
- Use this to validate the Phase 1 page-count cache described below.

## Phase 1: Page-Based Resume Clarity

Phase 1 is the implementation scope for the next release.

### Behavior

- Replace the static submenu label `Resume Reading` with a dynamic label when a
  resume target is available.
- If `lastPage` and total page count are both known, show:

```text
Resume at Page 4 / 9
```

- If `lastPage` is known but total page count is unknown, show:

```text
Resume at Page 4
```

- If a resumable PDF exists but no page has been tracked, disable the menu
  item. This keeps Reading Flow focused on resuming a known reading position
  rather than duplicating Zotero's built-in open-PDF actions.
- If no resumable PDF can be resolved, disable the menu item.
- Keep the command behavior page-based. Do not claim or imply scroll-position
  restoration.

### Data Source

Use the existing `ReadingFlow` metadata:

- `lastAttachmentId`: attachment to open.
- `lastPage`: one-based page number to show and open.
- `p`: progress map, still used for percentage display.

Add a backward-compatible best-effort page-count cache:

```ts
pageCount?: { [attId: string]: number };
```

Field behavior:

- `readerTracker.ts` should write `pageCount[attachmentId]` when it already has
  a reliable PDF page count while the reader is open.
- `resumeReader.ts` should use `pageCount[lastAttachmentId]` for `/ N`.
- If cached page count is unavailable, fall back to reliable attachment
  metadata when present.
- If no total page count is available, omit `/ N`.
- Invalid or unreasonable page counts should be ignored during normalization.
- This is an additive cache, not a required source of truth. Older records
  without `pageCount` remain valid.

### Architecture

Keep the implementation small and testable:

- Extend `resumeReader.ts` with a public method that returns a display target
  for an item, for example:

```ts
type ResumeDisplayTarget = {
  canResume: boolean;
  attachmentId?: number;
  lastPage?: number | null;
  totalPages?: number | null;
  l10nArgs?: string;
  fallbackLabel?: string;
};
```

- `menuManager.ts` should call this method in `onShowing`, call
  `context.setL10nArgs()` with the returned args, and set enabled state.
- If the Phase 0 spike shows that `setL10nArgs()` does not update the visible
  label quickly enough, `menuManager.ts` should mutate
  `context.menuElem?.setAttribute('label', fallbackLabel)` as the runtime
  fallback.
- `resumeReader.ts` remains responsible for resolving parent items, direct PDF
  attachments, tracked attachment IDs, and safe fallback behavior.
- `flowData.ts` should normalize the additive `pageCount` cache.

### Localization

Use Fluent localization for dynamic labels. Do not hard-code English-only menu
labels as the primary path.

Define one dynamic menu message with selector-style variants:

```ftl
reading-flow-resume-reading =
    .label =
        { $mode ->
            [page-total] Resume at Page { $page } / { $total }
           *[page] Resume at Page { $page }
        }
```

The code should pass `l10nArgs` as a JSON string because Zotero's
`MenuManager` warns that object args are deprecated.

### Error Handling

- Missing attachment: disable the menu item.
- Missing total page count: show page-only label.
- Missing last page: disable the menu item.
- Resolver failures should keep the existing safe behavior:
  `resolveTargetSafely()` logs a warning and returns no resumable target.
- Do not show user-facing modal errors.

### Testing

Unit tests should cover:

- Parent item with `lastPage=4` and `totalPages=9` returns
  `Resume at Page 4 / 9`.
- Parent item with `lastPage=4` and unknown total returns
  `Resume at Page 4`.
- Parent item with a PDF but no `lastPage` disables the resume menu.
- Direct PDF attachment uses parent reading data when available.
- Direct PDF attachment uses cached page count when available.
- No resumable PDF disables the menu.
- Multi-select keeps the fallback label and disabled state.
- Reopening the same menu after reading progress changes does not show a stale
  page label.
- Deleted or missing `lastAttachmentId` disables the menu without throwing.
- Parent item plus `lastAttachmentId` command behavior remains unchanged.
- Existing resume command behavior remains unchanged.
- Dynamic menu labels use `l10nID` plus `setL10nArgs()` first, with a
  `menuElem.setAttribute('label', fallbackLabel)` fallback only if the spike
  proves it is needed.

Manual verification should cover:

- Right-click an in-progress parent item and confirm the label includes page
  context.
- Click the action and confirm Zotero opens that page.
- Right-click a PDF attachment and confirm the label is still accurate.
- Read to a later page, return to the library, reopen the menu, and confirm the
  page label updates.
- Confirm `Progress`, `Status`, and `Last Read` columns still render.
- Run `npm run verify`.

## Phase 2: Column and Tooltip Context

Phase 2 should improve scanability without adding visual clutter.

Recommended behavior:

- Add hover/title text to the Progress cell:

```text
11% read, Page 1 / 9, last read 8h ago
```

- Keep the visible Progress cell compact.
- Implement this with the `title` attribute on the element returned by
  `columnManager.ts` `renderCell`.
- Do not add another default-visible column unless users ask for it.

User value:

- The library list explains the percentage.
- Researchers can decide whether a paper is worth resuming without opening the
  PDF.

## Phase 3: Scroll-Position Resume

Phase 3 is intentionally deferred.

Goal:

- Restore the approximate vertical reading position within a PDF page, not just
  the page number.

Risks:

- Zotero Reader and PDF.js scroll state may be more fragile than page tracking.
- Incorrect scroll restoration is worse than page restoration because it makes
  the user distrust the feature.
- This may require runtime Reader integration beyond the current stable data
  model.

Success criteria before implementing:

- Spike target: inspect Zotero Reader/PDF.js state around
  `_internalReader._primaryView._iframeWindow.PDFViewerApplication` and related
  `pdfViewer` position APIs.
- A reliable way to read current PDF scroll state.
- A reliable way to reopen to the same scroll state.
- Fallback to page-only resume when scroll state is unavailable.
- Manual tests across short PDFs, long PDFs, zoom changes, and reopened tabs.

## Non-Goals

- AI summaries or PDF chat.
- Reading streaks, gamification, or notification reminders.
- A custom dashboard.
- Required schema migrations in Phase 1.
- Exact scroll-position restoration in Phase 1.

## Success Criteria

Phase 1 is successful when a user sees a Reading Flow submenu action and
immediately understands what will happen:

- `Resume at Page 4 / 9` opens page 4.
- `Resume at Page 4` opens page 4 even when total pages are unknown.
- The menu is disabled when no page has been recorded.
- The label never implies precision that the plugin does not provide.

The release message should be:

> Resume Reading now shows the page it will open.
