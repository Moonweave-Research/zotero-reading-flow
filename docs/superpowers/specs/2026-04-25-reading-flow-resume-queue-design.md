# Reading Flow Resume and Queue Design

## Goal

Make Zotero Reading Flow useful at the moment a user returns to their library.
The next release should not only show reading metadata; it should help users
decide what to read next and resume with one action.

The user-facing promise is:

> Open Zotero, see what is in progress, and continue reading without hunting for
> the PDF or remembering the last page.

## User Value

Reading Flow already records progress, status, last read time, last attachment,
and last page. The highest-value next step is to turn that passive metadata into
an action:

- Resume a partially read PDF from the last tracked page.
- Identify papers that are currently in progress.
- Surface papers that have been left unfinished for too long.
- Keep the workflow local, lightweight, and compatible with Zotero sync.

This should feel useful to a first-time user without requiring AI keys,
external services, Obsidian, Notion, or a custom dashboard.

## Recommended Scope

The first iteration combines two small but high-impact features:

1. Resume Reading
2. Reading Queue

Annotation-aware status is intentionally deferred. It is valuable, but it
depends on annotation API behavior and can be added after the core action loop is
stable.

## Feature 1: Resume Reading

Add a `Resume Reading` action to the Reading Flow item context menu.

Behavior:

- If the selected item is a regular parent item, use its `lastAttachmentId`.
- If the selected item is a PDF attachment, use that attachment directly.
- Open the PDF in Zotero's reader.
- If `lastPage` exists and is positive, try to open near that page.
- If page navigation fails, still open the PDF and do not block the user.
- If no tracked attachment exists, disable the menu item or show no action.

The action should be conservative. It should never mutate reading data merely by
opening the PDF.

## Feature 2: Reading Queue

Add lightweight queue classification based on existing Reading Flow data.

Queue categories:

- `Continue Reading`: explicit status is `reading`, or implicit status inference
  resolves to `reading`. This keeps the queue aligned with the existing Status
  column, which treats implicit progress at 95% or above as `Read`.
- `Nearly Done`: percent progress is between 80% and below 95%.
- Page-style fallback progress values greater than 1 count as `Continue
  Reading` when status inference resolves to `reading`, but do not count as
  `Nearly Done`.
- `Stale Reading`: explicit status is `reading` or inferred reading, and
  `lastReadAt` is at least 7 days old.

First implementation UI:

- Add menu actions under `Reading Flow` that can apply to the current item
  selection or current collection view.
- Prefer low-risk integration with existing Zotero views over a custom
  dashboard.
- If a custom queue view is needed later, treat it as a separate design.

The queue should be computed from existing data at runtime. It should not add
new permanent fields in the first iteration.

## Data Model

Use the existing `ReadingFlow` line in Zotero Extra:

```text
ReadingFlow: {"v":1,"p":{"12345":0.72},"c":null,"s":"reading","ts":1776945900,"lastAttachmentId":"12345","lastPage":18,"lastReadAt":1776945900000}
```

No new stored fields are required for this iteration.

Field usage:

- `p`: progress map used for queue classification.
- `s`: explicit status; user choice takes precedence over inferred status.
- `lastAttachmentId`: target attachment for Resume Reading.
- `lastPage`: target page for Resume Reading.
- `lastReadAt`: stale reading calculation.

## Architecture

Add small, testable units rather than expanding UI code with embedded rules.

Suggested components:

- `readingQueue.ts`: pure functions for queue classification.
- `resumeReader.ts`: Zotero integration for opening a PDF and navigating to a
  page when possible.
- `menuManager.ts`: add menu entries and wire them to the new services.

`flowData.ts` remains responsible for normalization and status inference.
`dataStore.ts` remains responsible for reading and writing the `ReadingFlow`
line. Resume Reading should read data only.

## Error Handling

Failures should degrade silently or with debug logging:

- Missing attachment: menu action unavailable or no-op with warning log.
- Missing page: open PDF without page navigation.
- Page navigation API unavailable: open PDF and log debug warning.
- Corrupt stored data: rely on existing normalization and avoid throwing from
  menu actions.

The user should not see modal errors for routine missing-data cases.

## Testing

Unit tests:

- Classifies `Continue Reading` from explicit `reading` status.
- Classifies `Continue Reading` from implicit `reading` status inference.
- Classifies `Nearly Done` from percent progress between 80% and below 95%.
- Classifies `Stale Reading` from old `lastReadAt`.
- Does not classify completed items as in-progress.
- Keeps explicit user status precedence.
- Keeps implicit 95% or greater progress aligned with existing `Read` inference.
- Handles page-style fallback progress values greater than 1.
- Resolves parent item plus `lastAttachmentId` to the expected attachment.
- Falls back safely when `lastAttachmentId` or `lastPage` is missing.

Manual verification:

- Right-click a tracked parent item and choose `Resume Reading`.
- Right-click a tracked PDF attachment and choose `Resume Reading`.
- Confirm PDF opens when `lastPage` is absent.
- Confirm no data is changed by Resume Reading alone.
- Confirm existing Progress, Status, and Last Read columns still render.
- Run `npm run verify`.

## Non-Goals

The first iteration will not include:

- AI summary or PDF chat.
- Obsidian, Notion, or Markdown export.
- A custom dashboard.
- Automatic annotation-tag synchronization.
- Reading goals, streaks, or gamification.
- New persistent metadata fields.

## Success Criteria

The feature is successful when a user can:

- Return to Zotero and immediately identify unfinished reading.
- Resume the last tracked PDF without manually locating the attachment.
- Trust that the feature does not alter existing metadata unexpectedly.
- Use the feature without configuration or external accounts.

The release message should be simple:

> Continue reading where you left off, directly from Zotero.
