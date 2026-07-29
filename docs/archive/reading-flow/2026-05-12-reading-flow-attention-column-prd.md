# Reading Flow Attention Column PRD

> **Status: STALE / HISTORICAL ONLY — DO NOT EXECUTE**
>
> Superseded on 2026-07-28 by the sole active authority:
> [Reading Flow Authoritative Design and Implementation Plan](../../READING_FLOW_AUTHORITY.md).
> Preserve this file only as historical context. Agents must not use its product
> decisions to override the authoritative plan.

## Problem Statement

Researchers and graduate students often keep many papers in Zotero across
active projects, coursework, thesis work, and background reading. Reading Flow
already tracks progress, reading status, last-read time, and resume position,
but its scan surface is spread across multiple item-tree columns.

That creates a product problem: the plugin becomes more useful as it captures
more reading context, but Zotero's library table has limited horizontal space.
If every new concept becomes another column, users either lose space for normal
Zotero metadata or hide the plugin columns and lose the value of the feature.

The next product step should not be "more columns." It should be a compact
attention model that answers one practical question from the library view:

Which papers need my attention next?

## Solution

Add one compact Reading Flow scan column that combines progress, status,
priority, and stale-reading signals into a single visible value. Keep the
existing detailed columns available for users who want them, but treat them as
optional detail columns rather than the main control surface.

The new column should be called `Flow` or `Attention`. It should be optimized
for quick visual scanning and sorting, not for exposing every stored field. The
right-click Reading Flow menu remains the main control surface for changing
state.

Expected visible examples:

- `45% Reading`
- `High Stale 12d`
- `High To Read`
- `Important`
- `Read`
- `Skimmed`
- blank when the item has no useful Reading Flow signal

The tooltip should expose fuller context, such as reading status, priority,
last-read time, page position, and percent progress.

## User Stories

1. As a graduate student, I want one compact column that tells me which papers
   need attention, so that I do not have to keep several Reading Flow columns
   visible.
2. As a researcher using a narrow laptop screen, I want Reading Flow to avoid
   consuming too much item-tree width, so that normal Zotero metadata remains
   readable.
3. As a user with many papers in progress, I want stale in-progress papers to
   stand out, so that I can return to interrupted reading sessions.
4. As a user planning thesis reading, I want to mark a paper as high priority,
   so that it stays visible even if I have not opened it yet.
5. As a user triaging a new bibliography, I want to mark a paper as low
   priority, so that it does not compete with urgent reading.
6. As a user who already uses the existing Progress column, I want that column
   to remain available, so that my current workflow does not break.
7. As a user who already uses the existing Status column, I want that column to
   remain available, so that I can keep a status-focused layout if I prefer it.
8. As a user who already uses the Last Read column, I want that column to remain
   available, so that I can keep a time-focused layout if I prefer it.
9. As a new user, I want the default layout to be simple, so that I understand
   the plugin without immediately managing several columns.
10. As an existing user, I do not want an update to forcibly hide or rearrange
    columns I already chose, so that my Zotero layout remains under my control.
11. As a researcher, I want `Important` papers to remain easy to spot, so that
    critical references do not disappear among ordinary in-progress papers.
12. As a researcher, I want `Read` papers to look complete, so that they do not
    keep competing for attention.
13. As a researcher, I want `Skimmed` papers to remain distinguishable from
    fully read papers, so that I can decide whether deeper reading is needed.
14. As a user reading a PDF, I want the attention column to update after reading
    progress is saved, so that the library view reflects my latest session.
15. As a user resuming a paper, I want the tooltip to show page context when it
    is known, so that the compact label still has enough detail.
16. As a user with multiple attachments under one item, I want the attention
    signal to use the same tracked attachment logic as resume, so that the
    displayed state matches the PDF that will reopen.
17. As a user who changes a status manually, I want the attention label to
    respect that manual status, so that the plugin does not fight my judgment.
18. As a user who has no Reading Flow data on an item, I want the column to stay
    quiet, so that the library does not fill with meaningless labels.
19. As a user sorting the item tree, I want high-priority or stale papers to
    group predictably, so that sorting the column produces a useful work queue.
20. As a user who prefers explicit control, I want priority changes in the
    existing Reading Flow menu, so that I do not need a new dashboard or panel.
21. As a user who accidentally marks the wrong priority, I want to clear or
    reset the priority, so that the item returns to normal behavior.
22. As a user who already uses Reset Reading Progress, I want reset behavior to
    clear progress-related attention without losing unrelated Zotero metadata.
23. As a user syncing Zotero across machines, I want the new state to remain
    stored in the existing Reading Flow metadata line, so that sync behavior is
    consistent with the current plugin.
24. As a privacy-conscious researcher, I want the feature to stay local and not
    require accounts or telemetry, so that reading activity remains under my
    control.
25. As a user with a large library, I want attention calculation to be cheap, so
    that scrolling the Zotero item tree stays responsive.
26. As a user who dislikes clutter, I want no new floating panel, dashboard, or
    separate Reading Flow screen, so that the plugin stays inside normal Zotero
    workflows.
27. As a user evaluating the plugin quickly, I want the visible default to
    communicate value immediately, so that I understand what Reading Flow adds.
28. As a maintainer, I want the attention derivation to be isolated and tested,
    so that future changes to stale thresholds or display labels are safe.
29. As a maintainer, I want the stored metadata to remain backward compatible,
    so that old library records keep rendering.
30. As a maintainer, I want the feature to avoid broad runtime assumptions about
    Zotero internals, so that the plugin remains stable across Zotero 9 updates.

## Implementation Decisions

- Add a single compact scan column named `Flow` or `Attention`. The final label
  should favor the word users understand faster in Zotero's column menu.
- Keep `Progress`, `Status`, and `Last Read` as optional detailed columns. Do
  not remove them in this PRD.
- Do not add separate columns for priority, stale state, due dates, or reading
  queue position.
- Add a priority field to the existing Reading Flow metadata. Supported values
  are high, normal, low, and unset. Unset means the item has no explicit
  priority.
- Treat stale state as computed data, not stored data. It should be derived from
  reading status, progress, and last-read timestamp.
- Use a conservative default stale threshold for in-progress reading. Fourteen
  days is the default product decision for v1.2.
- Stale state applies only to items that are not complete. A fully read item
  should not become stale.
- Manual status should take precedence over inferred status for display.
- `Important` remains a status, not a priority. Priority answers "when should I
  look at this"; status answers "what reading stage is this in."
- High priority should be more visible than stale state when there is not enough
  width to show both.
- The compact column should expose fuller context through a tooltip instead of
  expanding visible text.
- The column data provider should produce a deterministic sort key so that
  attention sorting is useful. High-priority stale active items should sort
  ahead of ordinary in-progress items, and completed items should sort later.
- New installs should default toward the compact Flow or Attention column as
  the primary Reading Flow column.
- Existing users should not have their current column choices forcibly hidden or
  rearranged during upgrade.
- If an existing user has no visible Reading Flow columns, the compact column
  may be shown as a helpful default.
- Add priority controls under the existing Reading Flow context menu. The menu
  should support setting high, normal, low, and clearing priority.
- Do not add a toolbar, sidebar, dashboard, or preferences window in v1.2.
- Keep data storage in the existing namespaced metadata line on the parent item.
- Normalize unknown priority values away when reading old or malformed metadata.
- Reset Reading Progress should clear progress-derived state and last-read data.
  Priority clearing should be explicit, not an accidental side effect, unless
  the user chooses a full Reading Flow reset in a future release.
- Use the same item resolution model as existing reading progress and resume
  behavior. Parent items are the primary surface; PDF attachments should resolve
  through their parent when possible.
- Keep all display logic local and synchronous from already stored item data.
  The item-tree renderer should not open PDFs, inspect annotations, or perform
  expensive async work.

## Testing Decisions

- Tests should verify external behavior rather than implementation details.
  Good tests should ask what the user sees, what metadata is stored, and whether
  menu commands change the expected state.
- Add focused tests for priority normalization, including valid values,
  malformed values, and missing fields.
- Add focused tests for stale derivation, including recent reading, stale
  in-progress reading, completed reading, and no reading data.
- Add tests for compact display labels, including high priority, stale reading,
  important status, read status, skimmed status, no data, and narrow display
  fallbacks.
- Add tests for tooltip content, especially progress, status, priority,
  last-read time, and page context when available.
- Add tests for attention sort keys so that high-priority and stale items sort
  predictably.
- Add tests for menu priority actions: set high, set normal, set low, clear
  priority, and multi-item updates.
- Add tests that existing Progress, Status, and Last Read columns still render
  from the same stored data after the new field is present.
- Add tests that older metadata without priority remains valid.
- Add tests that malformed metadata does not break column rendering.
- Manual verification should cover Zotero library rendering, column chooser
  behavior, context-menu priority changes, progress updates after reading, reset
  behavior, and upgrade behavior from an existing profile.
- The repo verification gate remains the existing combined typecheck, unit test,
  build, and XPI validation command.

## Out of Scope

- AI summaries, annotation analysis, PDF chat, semantic ranking, or literature
  recommendations.
- A separate reading dashboard, kanban board, calendar, queue view, or sidebar.
- Cloud sync beyond Zotero's existing item metadata sync.
- User accounts, telemetry, or remote analytics.
- Configurable stale thresholds in v1.2.
- Due dates or deadline management in v1.2.
- Automatically hiding columns that an existing user already chose to show.
- Replacing Zotero collections, tags, saved searches, or native item metadata.
- Changing resume behavior beyond using already tracked Reading Flow context.
- Runtime PDF inspection from the item-tree column renderer.

## Further Notes

This PRD is intentionally focused on reducing column pressure. The product risk
is adding another visible field and making the problem worse. The implementation
should therefore be judged by whether a user can run Reading Flow with one main
plugin column visible.

The current repository does not expose a configured issue tracker vocabulary for
this PRD workflow. This document is issue-ready, but publication with a
`ready-for-agent` label should wait until the repo's issue tracker setup is
defined.
