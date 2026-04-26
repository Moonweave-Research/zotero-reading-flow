# Resume Page Clarity and Reading Flow Roadmap Design

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

- If a resumable PDF exists but no page has been tracked, show:

```text
Open PDF
```

- If no resumable PDF can be resolved, disable the menu item.
- Keep the command behavior page-based. Do not claim or imply scroll-position
  restoration.

### Data Source

Use the existing `ReadingFlow` metadata:

- `lastAttachmentId`: attachment to open.
- `lastPage`: one-based page number to show and open.
- `p`: progress map, still used for percentage display.

Total page count should be best-effort:

- Prefer reliable Zotero attachment metadata if available.
- If no total page count is available without opening the reader, omit `/ N`.
- Do not add new persistent fields for Phase 1.

### Architecture

Keep the implementation small and testable:

- Extend `resumeReader.ts` with a public method that returns a display target
  for an item, for example:

```ts
type ResumeDisplayTarget = {
  canResume: boolean;
  label: string;
  attachmentId?: number;
  lastPage?: number | null;
  totalPages?: number | null;
};
```

- `menuManager.ts` should call this method in `onShowing` and update the native
  menu label through the Zotero context object or menu object fallback.
- `resumeReader.ts` remains responsible for resolving parent items, direct PDF
  attachments, tracked attachment IDs, and safe fallback behavior.
- `flowData.ts` should not grow new fields in this phase.

### Error Handling

- Missing attachment: disable the menu item.
- Missing total page count: show page-only label.
- Missing last page: show `Open PDF` if a PDF can be opened.
- Any resolver failure: log a warning and disable the menu item.
- Do not show user-facing modal errors.

### Testing

Unit tests should cover:

- Parent item with `lastPage=4` and `totalPages=9` returns
  `Resume at Page 4 / 9`.
- Parent item with `lastPage=4` and unknown total returns
  `Resume at Page 4`.
- Parent item with a PDF but no `lastPage` returns `Open PDF`.
- Direct PDF attachment uses parent reading data when available.
- No resumable PDF disables the menu.
- Existing resume command behavior remains unchanged.
- Menu labels keep direct native `label` fallback to prevent blank submenu rows.

Manual verification should cover:

- Right-click an in-progress parent item and confirm the label includes page
  context.
- Click the action and confirm Zotero opens that page.
- Right-click a PDF attachment and confirm the label is still accurate.
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

- A reliable way to read current PDF scroll state.
- A reliable way to reopen to the same scroll state.
- Fallback to page-only resume when scroll state is unavailable.
- Manual tests across short PDFs, long PDFs, zoom changes, and reopened tabs.

## Non-Goals

- AI summaries or PDF chat.
- Reading streaks, gamification, or notification reminders.
- A custom dashboard.
- Persistent schema changes in Phase 1.
- Exact scroll-position restoration in Phase 1.

## Success Criteria

Phase 1 is successful when a user sees a Reading Flow submenu action and
immediately understands what will happen:

- `Resume at Page 4 / 9` opens page 4.
- `Resume at Page 4` opens page 4 even when total pages are unknown.
- `Open PDF` opens the tracked PDF when no page has been recorded.
- The label never implies precision that the plugin does not provide.

The release message should be:

> Resume Reading now shows the exact page it will open.
