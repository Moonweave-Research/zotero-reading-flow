# Reading Flow Authoritative Design and Implementation Plan

> **Status: AUTHORITATIVE**
>
> **Last updated:** 2026-08-23
> **Released baseline:** Zotero Reading Flow v1.3.1
> **Active planning target:** Slice K — Opt-In Reading Display Density
> **Execution surface:** ORRO (`scout -> flowplan -> proofrun -> proofcheck -> handoff`)

## Authority and Document Routing

This is the sole active Reading Flow product-design and implementation-plan
authority. Read it before changing Reading Flow product code, UX, data
semantics, or user-facing behavior.

Precedence is:

1. Current runtime behavior, source code, tests, and release metadata define
   what is shipped now.
2. This document defines the only approved next changes and their order.
3. User feedback, forum discussion, and closed GitHub issues are motivation and
   evidence, not executable implementation plans.
4. Historical documents explain earlier decisions only.

Only this file may contain an active Reading Flow roadmap, slice plan, or
agent instruction. Do not create a second active PRD, backlog, roadmap, or
forum-post source for Reading Flow.

| Document class | Location | Rule |
| --- | --- | --- |
| Active product authority | `docs/READING_FLOW_AUTHORITY.md` | Execute only the active slice named here. |
| User documentation | `README.md` | Describe shipped behavior only; it does not authorize future work. |
| Release operations | `docs/RELEASE.md` | Release checklist only; it does not define product direction. |
| Historical Reading Flow records | `docs/archive/reading-flow/` | `HISTORICAL ONLY`; never merge or execute. |

The archived Attention, Priority, Next Action, early-dashboard, and v1.3.0
promotion records are deliberately non-authoritative. They must not broaden
this plan or reintroduce a recommendation, priority, or task-management
product.

## Released Baseline

GitHub issue #6, *Reading statistics dashboard and progress history*, is
completed and closed in v1.3.0. The v1.3.1 baseline provides:

- `Progress`, `Status`, and `Last Read` columns plus the existing Reading Flow
  item menu.
- A modeless `Reading Statistics` window from the global Tools menu and the
  Reading Flow item context menu. Repeated entry reuses the same window;
  close/reopen is supported.
- `Current View` and `Entire Library` scopes. `Current View` follows the
  Zotero collection, saved search, or tag-filtered view already selected by
  the user.
- `Reading set (tracked)` as the intentional reading set and `All papers
  (inventory)` as the explicit audit view.
- Current status/progress/known-remaining-page summaries, bounded daily
  reading history, an activity calendar, first completions, and Recent
  Progress.
- User-selected `Show in Zotero` and `Resume` actions in Recent Progress.
  Resume delegates to the existing saved-page Reader path and never chooses a
  paper automatically.
- An activity-calendar day drill-down that reveals only the matching papers
  from the displayed scope, dataset, status filter, and range. Its `Show in
  Zotero` and `Resume` actions remain explicitly user-invoked.

The dashboard is a review surface, not a separate reading application. The
Zotero item list and Reader remain the primary places to start reading.

## Product Philosophy

Reading Flow exists to help a researcher recover context after looking away
from a library. Its loop is:

1. The user chooses a Zotero collection, search, or tag-filtered view.
2. The user reads normally; Reading Flow records current position and bounded
   prospective history.
3. The user reviews actual state and recent changes in Reading Statistics.
4. The user deliberately chooses one paper to inspect or resume.

The dashboard must answer observed questions, in this order:

1. What is the current state of this intentionally chosen reading set?
2. What progress updates actually occurred in the selected period?
3. Which paper does the user want to return to now?

Do not turn these facts into a productivity score, obligation, prediction, or
recommendation. A short or inactive day is not a verdict on a user's reading.
Longer windows are context, not a streak system.

## Hard Product Boundaries

The following remain out of scope unless this authority is explicitly revised:

- Raw or unlimited `ReadingEvent[]` persistence.
- Exact reading-time, focus-time, speed, difficulty, retention, or completion
  forecasts. A PDF being open does not prove it was read.
- Goals, streaks, deadlines, a task manager, kanban board, priority queue, or
  a chosen “next paper”.
- Automatic PDF opening, background Resume, ranking, or reordering that implies
  recommendation.
- Cloud analytics, accounts, telemetry, external databases, or servers.
- PDF or annotation mutation.
- AI summaries, chat, RAG, or semantic analysis.
- A new dashboard tag/saved-search filter. The existing `Current View` already
  inherits Zotero's collection, search, and tag context.
- A schema-version-3 migration that separates `Important` from reading stage.

## Runtime and Data Truth

### Paper, scope, and dataset

A paper is one non-deleted top-level regular Zotero item; attachments, notes,
and annotations are never counted separately.

The dashboard resolves one scope, then one dataset, then status and history
filters in this order:

1. `Current View` or `Entire Library`.
2. `Reading set (tracked)` or `All papers (inventory)`.
3. Current status filter.
4. History range.

`Reading set (tracked)` contains papers with a valid `ReadingFlow:` metadata
line. `All papers (inventory)` also includes untracked regular items, which
are represented as `To Read` only for inventory reporting. The inventory view
must never be framed as a user's active commitment.

### Stored state and history

Each parent item stores one namespaced `ReadingFlow:` line in its Zotero
`Extra` field. Version-1 records remain readable. Version 2 adds bounded local
calendar-day rollups only when prospective history is first written.

```ts
interface DailyReadingRollup {
  activity: boolean;
  lastReadAt: number | null;
  progress: Record<string, number>;
  status: ReadingStatus | null;
  reset: boolean;
  completed: boolean;
}

interface ReadingHistory {
  startedAt: number;
  completedAt: number | null;
  activeDaysTotal: number;
  days: Record<string, DailyReadingRollup>;
}
```

Invariants:

- Keys are local calendar dates in `YYYY-MM-DD` form.
- Retain at most 366 detailed days; prune during a successful Reading Flow
  write, never on a read-only dashboard refresh.
- `activity` means a persisted reading-progress update. Status-only and
  reset-only changes do not count as reading activity.
- A daily `progress` value is the maximum successfully persisted value for its
  attachment on that day. It is a recorded location, not necessarily a
  reconstructable page-by-page delta.
- `completedAt` records first completion and survives reset/reread.
- Existing `Extra` content outside the namespaced line, PDFs, and annotations
  remain unchanged.

The dashboard must state coverage whenever it reports remaining pages or
history. Unknown page counts are not zero; pruned days are not available
history.

## Prioritized Next Work

### Completed — Slice J: Activity Calendar Drill-down (v1.3.1)

#### User problem

The calendar proves that activity occurred, but it cannot yet answer the
natural follow-up: “which papers changed on this date, and which one do I want
to return to?” A calendar that ends at a colored day is a dead end.

#### Decision

Add a user-selected day detail to the existing dashboard. This is a drill-down
from an observed day to the papers that recorded a progress update that day;
it is not a recommendation, daily score, or planner.

#### Interaction contract

1. A calendar cell is interactive only when the filtered snapshot contains a
   real `activity: true` progress update for that local day.
2. Activating one day selects it and reveals a labelled detail region, for
   example `Progress updates on 2026-08-03`.
3. The detail region lists every matching paper from the already selected
   scope/dataset/status/range. It discloses the number displayed and never
   silently truncates rows.
4. Each row shows the paper title, that day's recorded location using existing
   normalized progress rules, current status, and last recorded update time.
   It must not claim a same-day “delta” unless a future authority defines a
   deterministic reset-safe calculation.
5. Existing row-level `Show in Zotero` and `Resume` remain independently
   user-invoked. Neither action runs because a day was selected.
6. Selecting a day requests detail only for that day from the immutable
   in-memory snapshot cache described below. It does not perform a full
   dashboard refresh, write metadata, change filters, reorder Recent Progress,
   or open a Reader.
7. Selecting the same day again clears the detail. A range with no qualifying
   activity has no interactive cells and keeps its existing honest empty state.

#### Data and UX rules

- The dashboard snapshot carries an opaque `snapshotId`. The bridge retains
  the normalized papers and query identity for that one snapshot only. A
  direct day activation calls `getActivityDayDetail(snapshotId, day)`; the
  bridge asks the pure statistics module to project only that day's matching
  rows from the cached papers. This keeps the normal snapshot compact instead
  of serializing every paper-day combination.
- The day-detail result is serializable and contains only `day`, `itemID`,
  `title`, normalized recorded location (or unknown), current status, and the
  day's last recorded update. The result carries the same `snapshotId`; a
  mismatch, eviction, or closed dashboard cache produces `unavailable` and
  asks the user to refresh rather than silently querying a changed scope.
- The cache is private to the open dashboard lifecycle, is replaced on a new
  full snapshot, and is discarded when the dashboard closes. It is not
  persisted, synced, or reused as a recommendation list.
- Do not add persistence, raw events, a new schema, or a second Zotero scope
  query for this slice.
- `All time` may show only retained detailed days and must retain the existing
  retention wording.
- Reuse the statistics normalizer for page/percentage display. Missing or
  incomparable page data is shown as unknown, not fabricated.
- Use semantic buttons with visible focus, `aria-pressed`, and a labelled
  detail region. Color alone may not signal that a date is selectable.
- Keep the default white dashboard hierarchy and its dark-mode tokens; do not
  add a chart dependency.

#### Write region

`docs/READING_FLOW_AUTHORITY.md`, `src/statistics.ts`, `src/dashboard.ts`,
`src/bootstrap.ts`, `addon/dashboard.xhtml`, `addon/dashboard.css`,
`addon/locale/en-US/reading-flow.ftl`, and focused statistics/dashboard tests.
Do not modify `flowData.ts`, `dataStore.ts`, Reader tracking, package files,
or user data for this slice.

#### Required proof

- Pure statistics tests cover scope/dataset/status/range filtering, local-day
  boundaries, multiple papers on one date, no activity for status/reset-only
  days, unknown progress display, and no dropped matching papers.
- Bridge and dashboard tests prove snapshot-cache replacement/eviction,
  unavailable detail, and that a direct calendar activation alone
  selects/clears the detail. Render, refresh, filtering, sorting, scope
  changes, and calendar selection never invoke Resume.
- Existing Recent Progress expansion, stale-snapshot, keyboard/focus, and
  Resume tests remain green.
- `npm run verify`, source/packaged XHTML validation, and `git diff --check`
  pass.
- In a disposable Zotero profile or equivalent fixture, direct runtime evidence
  shows a selected calendar date, the exact matching rows, `Show in Zotero`,
  `Resume`, and close/reopen behavior without writes to the user profile.

### Priority 1 — Slice K: Opt-In Reading Display Density

#### User problem

The released `Progress`, `Status`, and `Last Read` columns are independently
useful, but together consume too much horizontal space in narrow Zotero item
trees. Users need a denser scan surface without an update silently replacing
their established library layout.

#### Decision

Keep the released three-column layout as the detailed, default presentation and
register one new, user-managed `Reading Flow` composite column. The composite
column is hidden/default-neutral and becomes visible only when the user chooses it in
Zotero's native column chooser. The plugin preference controls only the
composite column's internal presentation; it does not control column visibility,
order, width, or sorting.

| Display density surface | User-controlled surface | Intended use |
| --- | --- | --- |
| Detailed columns | Existing `Progress`, `Status`, and `Last Read` columns | Full independent detail and sorting |
| Compact Reading Flow | User-shown `Reading Flow` column rendered with a status icon, micro progress bar, and short last-read label | Preserve title width while retaining the main scan signals |
| Icons only | User-shown `Reading Flow` column rendered as a status icon | The narrowest library layouts; full state remains available through accessible text |

Upgrades never change any existing column layout, including visibility, width,
order, or sort direction. New installs retain the released Detailed columns;
the new composite column is hidden until the user explicitly chooses it in
Zotero. Existing user layout state remains untouched. There is no plugin-driven
show/hide, reorder, width, or sort mutation, no layout snapshot, and no private
`_columnPrefs` transaction. The three density surfaces remain available through
Zotero's existing columns, the user-shown Compact composite column, or the
user-shown Icons-only composite column.

#### Interaction and data contract

- Zotero's native column chooser owns `Reading Flow` visibility. The plugin
  preference changes rendering inside that column only: Compact versus Icons.
  Changing the preference must not show, hide, reorder, resize, or sort any
  column.
- The compact and icon-only presentations are display-only. Hover/focus text,
  tooltip text, and the accessible name must state the full reading state:
  status, progress (or no progress recorded), and last-read value (or never read).
  Color alone is never the signal.
- `Important` remains the released `ReadingStatus` value. This slice must not
  reinterpret it as a separate priority system or introduce a schema migration.
- Detailed columns keep their independent native sorting. The composite
  `Reading Flow` column has one documented sort: most recently read first, with
  never-read items last. It must not imply that it preserves separate status,
  progress, and last-read sorts.
- Visibility is reversible through Zotero's native chooser. This slice makes no
  promise of reconstructing a prior Detailed arrangement and must not alter the
  user's current arrangement while changing density.
- This slice does not create, remove, rename, or synchronize Zotero tags; it
  does not add a sidebar, dashboard control, new metadata field, or background
  action.

#### Write region and proof

The implementation design must prove that registering the hidden/default-neutral
composite column and rendering its two presentations do not mutate existing
user layout state. The expected write region is this authority,
`src/columnManager.ts`, the preferences UI and locale strings, plus focused
column/preference tests. Add other files only after updating this authority.
The implementation must use Zotero's public/native column registration and
chooser contract; it must not write private layout state.

Required proof includes: an upgrade fixture whose existing Detailed column
layout is byte-for-byte/layout-equivalent before and after the update; a new
install retaining Detailed columns with `Reading Flow` hidden; native chooser
show/hide of the composite column; Compact/Icons preference changes that alter
rendering only; independent Detailed sorting; composite recent-first sorting
with never-read last; full accessible text including no progress recorded and
not started states; and disposable Zotero verification at normal and 200% zoom.
Verification must exercise the real Zotero item tree, not only an HTML prototype,
and must not retain profile changes after the run.

### Priority 2 — Slice L: User-Initiated Snapshot Copy

#### User problem

Researchers often need to share a concise progress update with an advisor,
lab notebook, or project note. Copying values manually is slow, while a broad
analytics export leaks more library detail than the situation requires.

#### Decision

Add one explicit `Copy summary` action after the released Slice J baseline. It copies a
plain-text, scope-labelled snapshot only. It is a reporting aid, not automatic
logging or telemetry.

#### Copy contract

The copied text includes the snapshot timestamp, scope label, dataset, status
filter, history range, paper count, in-progress count, read count, known
remaining pages with coverage, and—when retained history exists—active days,
papers with progress activity, and first completions. It must include a short
retention/coverage qualifier where relevant.

It excludes paper titles, attachment paths, item IDs, raw `Extra` metadata,
and inferred reading time by default. `Copy summary` runs only after an
explicit activation, reports success or failure in dashboard action status,
and never writes item metadata or contacts a service.

#### Write region and proof

The dashboard builds the deterministic plain text from its rendered snapshot,
then calls one bridge `copyText(text)` method on explicit activation. Limit the
slice to this authority, `src/dashboard.ts`, `src/bootstrap.ts`, dashboard
XHTML/CSS/locale, and focused dashboard/bootstrap tests unless a proven
clipboard boundary requires one small adapter. Test exact copied text for
current/no-history/retained-history/unknown-page states, a failed clipboard
path, and the absence of metadata writes. Verify the packaged dashboard in a
disposable profile.

CSV export, detailed-title export, scheduled reports, and PDF export are not
part of Slice L. Reconsider them only after real users ask for a specific
reporting format.

### Priority 3 — Deferred Discovery: Recurring Views

Do not add a new tag picker, saved-search picker, dashboard-specific saved
views, or persisted filter preference yet. `Current View` already gives users
Zotero-native collections, searches, and tag filters without duplicating
Zotero's organization model.

After Slice K and Slice L have runtime acceptance and real feedback,
measure whether users repeatedly need a dashboard-only way to re-enter a
specific view. If so, write a new authority decision first. The default answer
is to improve scope labelling or use Zotero's existing saved searches, not to
create a second collection system.

### Priority 4 — Deferred Discovery: Tag Mirror and Sidebar

These are not rejected ideas. They are deliberately separate from display
density because they respectively change user data and introduce a persistent
work surface.

#### Tag Mirror

A future opt-in tag mirror may map Reading Flow states to clearly
Reading-Flow-owned emoji tags. It requires a new authority decision that fixes
the exact tag names, ownership marker, add/remove rules, behavior after manual
tag edits, sync-conflict behavior, migration/disable cleanup, and the complete
write path. It must be off by default and may never claim ownership of an
unprefixed user tag. Do not add it as a side effect of status, progress, or
display-mode work.

#### Sidebar

A future sidebar needs evidence that a Zotero-supported placement can preserve
selection, focus, lifecycle, and accessibility across the library and Reader.
It must be an optional companion to the item list and Reader, not a replacement
reading application or a source of next-paper recommendations. It may reuse
the user-selected `Current View`, but must not duplicate Zotero's tag,
saved-search, or collection system. Prototype the interaction against real
Zotero before authorizing implementation.

## Explicitly Deferred Ideas

These ideas may be useful in other tools but are not approved Reading Flow
work:

| Idea | Decision | Reason |
| --- | --- | --- |
| Daily workload or finish-date forecast | Do not implement | PDF effort and reading speed are not observed reliably. |
| Time-read charts | Do not implement | Open-reader duration is not reading time. |
| Goals, streaks, productivity scores | Do not implement | They turn observational feedback into pressure and false judgment. |
| Next-paper recommendation | Do not implement | It violates the user-selected return-path principle. |
| Tags/saved-search controls inside dashboard | Hold | `Current View` already inherits Zotero's native scope. |
| Automatic emoji-tag mirror | Hold as a separate opt-in slice | It writes synchronized library metadata and needs explicit ownership rules. |
| Persistent sidebar workspace | Hold pending real-Zotero prototype and feedback | It is a second work surface, not a column-density adjustment. |
| CSV/PDF/detailed export | Hold after Slice L | First validate whether a concise private summary solves the real reporting need. |

## Architecture Boundaries

- `statistics.ts` remains the pure snapshot and aggregation module. It owns
  the Slice J day-detail projection and must not call Zotero APIs or the DOM.
- `statisticsScope.ts` remains the sole adapter for Zotero active-view and
  library resolution.
- `dashboard.ts` consumes serializable snapshots and owns local selection,
  rendering, accessibility, and explicit action wiring.
- `bootstrap.ts` owns the bridge to Zotero and delegates Resume to the existing
  `ResumeReader`. Dashboard code must not resolve attachment/page state itself.
- `DataStore` remains the sole persistence transition module. Slice J and K
  are read-only with respect to Reading Flow metadata.
- `DashboardManager` remains the single-window lifecycle owner.

## ORRO Execution Contract

Run one bounded ORRO flow per implementation slice. Do not begin Slice K until
the released Slice J baseline has a passing proofcheck and runtime acceptance.
Before writing,
fix the exact write region from this document; if new files are needed, stop
and update this authority first.

```bash
orro flow "Implement Slice J from docs/READING_FLOW_AUTHORITY.md only" \
  --write-scope "<exact approved paths>" \
  --adapter codex \
  --json
```

Every slice prompt must say:

```text
Read docs/READING_FLOW_AUTHORITY.md first. It is the sole active Reading Flow
design and implementation authority. Do not execute historical documents.
Implement only the named slice, preserve unrelated changes, run the slice
gates, and stop on unresolved runtime or product decisions.
```

Required evidence is `scout`, `flowplan`, `proofrun`, `proofcheck`, and
`handoff`, with a passing proofcheck verdict before calling a slice
ship-ready. Source tests or an XPI hash alone are not direct Zotero runtime
acceptance.

## Documentation Lifecycle

When a slice closes:

1. Update this file's released baseline, active target, and accepted behavior.
2. Update `README.md` only for user-visible shipped behavior.
3. Update `docs/RELEASE.md` only for release verification behavior.
4. Move superseded plans or one-time promotion records into
   `docs/archive/reading-flow/` with `HISTORICAL ONLY` at the top, or delete
   them when they have no explanatory value.
5. Never leave a current-looking checklist, alternate roadmap, or stale UI
   label outside this authority.

## Release Gate for a Future Slice

No future slice is release-ready until its focused tests, `npm run verify`,
source and packaged XHTML validation, `git diff --check`, and direct disposable
Zotero runtime evidence pass. A human must additionally confirm that the UI is
legible at normal and 200% zoom, scope and retention language is unambiguous,
no interaction acts automatically, and no user data was changed by dashboard
review actions.
