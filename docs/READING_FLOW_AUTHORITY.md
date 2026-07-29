# Reading Flow Authoritative Design and Implementation Plan

> **Status: AUTHORITATIVE**
>
> **Last updated:** 2026-07-29
> **Target:** GitHub issue #6, `Reading statistics dashboard and progress history`
> **Current installed build:** Zotero Reading Flow v1.3.0
> **Execution surface:** ORRO (`scout -> flowplan -> proofrun -> proofcheck -> handoff`)

## Authority and Precedence

This is the sole active product-design and implementation-plan authority for
the next Reading Flow feature track. Agents must read this file before changing
product code for issue #6.

Precedence is:

1. Current runtime behavior, source code, tests, and release metadata define
   what is shipped now.
2. This document defines what may change next and in which order.
3. GitHub issue #6 is user input and motivation, not an executable plan.
4. Older design and plan documents are historical context only.

If an older document conflicts with this file, this file wins. Do not execute
checklists from the superseded documents.

Superseded documents:

- [Resume Page Clarity and Reading Flow Roadmap Design](archive/reading-flow/2026-04-26-resume-page-clarity-roadmap-design.md)
- [Reading Flow Attention Column PRD](archive/reading-flow/2026-05-12-reading-flow-attention-column-prd.md)
- [Reading Flow Attention Column Implementation Plan](archive/reading-flow/2026-05-12-reading-flow-attention-column.md)
- [Reading Flow Next Action Column Implementation Plan](archive/reading-flow/2026-06-04-reading-flow-next-action-column.md)

Those files may explain historical decisions or shipped behavior, but they are
not allowed to broaden or redirect issue #6 work.

## Executive Decision

Issue #6 is implemented as a Zotero-native feedback loop for an intentional
reading set, not as an inventory report over every item in a library. Earlier
local source, test, and packaged-XPI evidence for the version-1.3.0 dashboard
is retained as historical context, but current Zotero runtime usability must be
proven from the Slice F evidence and must not be inferred from those earlier
records. Publishing a release, commit, push, or PR remains a separate operator
action.

The default dashboard dataset is `Tracked papers`: top-level regular items that
contain a valid `ReadingFlow:` metadata line. `All papers` remains available for
library-wide inventory questions. Current metrics and retained history use the
same ordered filter pipeline.

The next approved correction is a human-loop hardening slice, not a new
analytics feature. It must make the intentional reading set, inventory view,
retained-history coverage, and snapshot freshness legible. It may return a
paper explicitly chosen by the user from Recent Progress to Zotero's item list.
It must not rank papers, infer priorities, choose a next paper for the user,
open a PDF automatically, or change stored Reading Flow data. A later,
explicitly user-invoked Resume action may reopen only the paper the user chose;
that is a return-path action, not an automatic recommendation or launch.

Do not implement the issue's proposed unbounded `ReadingEvent[]`. Raw page-change
events would grow continuously, amplify Zotero sync conflicts, and make reset
and multi-device behavior difficult to reason about.

The approved historical model is a bounded daily rollup stored with the parent
item's existing `ReadingFlow:` metadata. Reading Flow must not add a remote
service, telemetry, user account, PDF mutation, or a separate external database.

## Product Goal

Turn Reading Flow from a current-position indicator into a useful reading
feedback loop while retaining its local-first, Zotero-native character.

For the selected reading set, the user should be able to answer:

- How many papers are not started, in progress, skimmed, read, or important?
- How is reading progress distributed across the active scope?
- How many known pages remain?
- On which recent days did reading activity occur?
- How many unique papers were completed over time?
- Which papers recorded progress activity during the retained history window,
  and what was each paper's retained change?
- What changed recently, and how can I return to that explicitly chosen paper
  in Zotero without manually searching for it?

## Non-Goals

- Raw or unlimited event logging.
- Exact reading-time measurement or session-duration claims.
- Retrospective reconstruction of activity before historical tracking exists.
- A changing-cohort aggregate progress trajectory. It is not a stable trend and
  must not be presented as one.
- Cloud analytics, accounts, telemetry, or a Reading Flow server.
- PDF or annotation mutation.
- AI summaries, chat, RAG, recommendations, or semantic analysis.
- Automatic ranking, prioritization, or selection of a "next" paper.
- Replacing Zotero collections, saved searches, tags, or item metadata.
- A kanban board, task manager, deadline planner, or priority system.
- Reintroducing the superseded `Attention`, `Priority`, or `Next Action` column
  plans.
- A schema-version-3 migration that separates `Important` from reading stage.

## Current Runtime Truth

Reading Flow stores one normalized record on each parent item in a single
namespaced `Extra` line. Legacy records remain version 1:

```text
ReadingFlow: {"v":1,...}
```

The version-1 snapshot contains attachment progress, known page counts, current
status, the last attachment and page, and the last-read timestamp. The installed
version-1.3.0 preview writes schema version 2 only after a prospective history
transition and keeps the bounded rollup in that same line.

`ReaderTracker` records a page-change snapshot after a five-second debounce.
`DataStore` rewrites the complete namespaced line and Zotero syncs that item
metadata. Existing UI surfaces are the `Progress`, `Status`, and `Last Read`
columns plus the Reading Flow item context menu.

Consequences:

- Current-state statistics remain feasible without writing or migrating data.
- Historical activity before schema-version-2 capture cannot be reconstructed.
- A dashboard creates a new multi-item scan path and must not run inside item
  tree cell rendering.
- Historical writes increase metadata size and sync contention and therefore
  require bounded storage and deterministic merge rules.

## Product Definitions

### Paper

A paper is one non-deleted, top-level regular Zotero item. Child attachments,
notes, and annotations are never counted as separate papers.

### Scope

The dashboard supports two scopes in the first release:

- **Current View:** the regular parent items resolved by Zotero's active library
  view at refresh time. This naturally respects the selected collection, saved
  search, tag filter, and Zotero's own recursive-collection behavior.
- **Entire Library:** all non-deleted, top-level regular items in the currently
  selected Zotero library.

The Zotero-specific retrieval logic must live behind one scope adapter so that
private or version-sensitive APIs do not leak into statistics calculation or UI
rendering.

### Dataset

After Zotero scope resolution, apply one of two reading-set datasets:

- **Tracked papers (default):** top-level regular items containing a valid
  `ReadingFlow:` metadata line. An explicit `to-read` item is tracked because
  the metadata line records intentional Reading Flow use.
- **All papers:** every top-level regular item in the resolved Zotero scope,
  including items with no Reading Flow metadata.

The read adapter distinguishes metadata presence from normalized default
values. Normalizing an item with no `ReadingFlow:` line to a default `to-read`
state must not make that item tracked.

Apply filters in this exact order for current metrics and retained history:

1. Zotero scope (`Current View` or `Entire Library`).
2. Dataset (`Tracked papers` or `All papers`).
3. Current status filter.
4. History range.

The history range limits retained days; it must not select a different paper
cohort from the current metrics above it.

### Status

Use the same status rule as the existing Status column:

1. An explicit Reading Flow status wins.
2. Otherwise progress at or above 95% is `read`.
3. Otherwise positive progress is `reading`.
4. Otherwise the paper is `to-read`.

Within `All papers`, a paper without a `ReadingFlow:` line is counted as
`to-read`, matching current column behavior. Such a paper is excluded from the
default `Tracked papers` dataset.

### Display Attachment

Count a parent paper once. When a paper has multiple attachments, use the same
display-attachment rule as the current Progress column:

1. Use `lastAttachmentId` when it points to recorded progress.
2. Otherwise use the attachment with the greatest recorded progress.

### Progress Distribution

Use these stable buckets:

| Bucket | Meaning |
| --- | --- |
| Not started | no positive normalized progress |
| 1-24% | positive progress below 25% |
| 25-49% | progress from 25% through 49% |
| 50-74% | progress from 50% through 74% |
| 75-94% | progress from 75% through 94% |
| Complete | explicit `read` or progress at or above 95% |
| Unknown | legacy page value without a usable page count |

When a legacy progress value is greater than `1`, convert it to a percentage
only when the same attachment has a valid page count. Otherwise classify it as
`Unknown`; never invent a percentage.

### Remaining Pages

Remaining pages are calculated only for the display attachment:

- Explicit or inferred `read`: `0` remaining pages.
- Fractional progress plus page count: `ceil(pageCount * (1 - progress))`.
- Legacy page number plus page count: `max(pageCount - pageNumber, 0)`.
- Missing or invalid page count: unknown.

The dashboard must show both the total known remaining pages and its coverage,
for example `842 pages across 37 of 52 papers`. Unknown page counts must not be
silently treated as zero.

### Historical Activity

Historical activity means a persisted reading-progress update. Manual status
changes and resets are recorded as state transitions but do not count as a
reading-active day by themselves. Reading Flow does not claim active minutes or
reading duration because the runtime does not observe those quantities.

`Papers with progress activity` is the count of unique papers with retained
positive progress activity in the selected range. It is not called `Papers
advanced`, because the retained rollup does not prove a positive delta when the
same progress value is observed again.

### Completion

A paper is completed when it first becomes explicit or inferred `read` after
historical tracking is enabled. Record the first `completedAt` timestamp and do
not count the same paper twice after a reset or reread.

## Dashboard UX Contract

The dashboard is a modeless, resizable Zotero window backed by a packaged XHTML
document opened through the main Zotero window. Keep the existing Reading Flow
item-context shortcut and add `Reading Statistics` to a stable Zotero 9 global
Tools/View-family menu. Both entry points use the same `DashboardManager`, reuse
one open window, focus it on repeated open, and permit close then reopen. If no
stable Zotero 9 global-menu API is proven, do not guess: record runtime spike
evidence and block that slice.

The UI adapter stays isolated so a later Zotero tab implementation can replace
it without changing statistics logic.

The dashboard contains:

1. Header with scope, dataset, status, history-range, refresh, and last-updated
   controls.
2. Summary cards for papers, in progress, read, and known remaining pages.
3. Reading pulse with active days, papers with progress activity, first
   completions, and the activity calendar when retained history exists.
4. Status-composition and progress-distribution visualizations.
5. One semantic Recent Progress table as the authoritative per-paper history
   surface.

### Human-Loop Corrective Contract

The dashboard has two deliberately different views:

- **Reading set (tracked):** the default. It contains papers that already have
  Reading Flow data because the user recorded progress or set a Reading Flow
  status. This is the normal reading-feedback surface.
- **All papers (inventory):** an audit view that includes untracked papers. It
  must be labelled as inventory so a large unread library is not mistaken for
  the user's active reading commitment.

If the selected reading set is empty, say that no papers are tracked yet and
explain that recording progress or setting a Reading Flow status adds a paper.
Do not imply that data is missing or that historical activity was lost.

Recent Progress is a bounded *display*, not a silently truncated result. Show
the number displayed and the total number of papers with retained progress in
the selected range. A user may expand the in-memory table to see all entries;
this does not add persistent storage or alter retained history limits. Label
the table's values as `Current progress`, `Change in range`, and `Last update`
so current state is not confused with a historical period-end value.

Each Recent Progress row may provide `Show in Zotero`. It acts only after a
user chooses a row, selects that parent paper through the active Zotero pane,
and focuses the main Zotero window. It does not change the active dataset,
write metadata, open a reader, or claim that the chosen paper is recommended.

### User-Selected Re-entry Design

The dashboard is a deliberate review surface, not the daily reading launcher.
The Zotero item list and Reader remain the primary places to begin or continue
reading. The dashboard closes a different loop: after an interruption or a
review of a research collection, it helps the user recover one paper that they
personally chose to continue.

The product loop is:

1. The user selects a Zotero collection, saved search, or tag-filtered view.
2. The user reads normally in Zotero; Reading Flow records current progress and
   bounded history.
3. The user opens Reading Statistics to review the selected scope's current
   state and recent actual changes.
4. The user chooses a row in Recent Progress.
5. The user may either show that item in Zotero or explicitly resume it at the
   already recorded attachment and page.

This flow must never infer which paper is best, reorder rows as a priority
queue, auto-open a PDF, create a reading goal, score a streak, or persist a
separate focus list. "Recent" is an auditable sort order, not a recommendation.

#### Scope and Feedback Language

When `Current View` is active, the dashboard must name that it is reviewing the
currently selected Zotero view and preserve the user's collection/search/tag
context. `Reading set (tracked)` is the normal intentional-reading surface;
`All papers` is an inventory audit and must stay visibly distinct so a large
unread library is not experienced as a daily obligation.

The dashboard should express only observed facts, in this order:

1. current state of the selected reading set;
2. actual progress-update activity in the selected period;
3. a user-selected path back to one paper.

Do not add productivity scores, inferred reading time, goals, streaks, or a
changing-cohort progress trajectory. Keep page-count coverage next to remaining
pages and keep history language limited to recorded progress updates.

#### Resume Interaction Contract

`Resume` appears only as an action on a paper row the user has explicitly
chosen. It is not displayed as a global "next paper" card and it must not run
as a consequence of opening the dashboard, refreshing, filtering, sorting, or
selecting a scope.

On an explicit Resume activation:

1. The dashboard calls a bridge method with the selected top-level item ID.
2. The bridge resolves the current Zotero item and delegates to the existing
   `ResumeReader` path.
3. `ResumeReader` uses only the already stored `lastAttachmentId` and
   `lastPage`, with its existing safe fallback when a saved location is no
   longer usable.
4. The dashboard reports success or an actionable unavailable/failure message.
5. The action must not write Reading Flow metadata, alter status, alter scope,
   or choose another paper.

`Show in Zotero` remains available independently. A user who wants to inspect
metadata or choose a different attachment can use it without opening a Reader.

The dashboard may show a compact scope line such as `Reading this collection:
<name>` when the Zotero adapter can provide a reliable active-view label. It
must fall back to `Current View` rather than inventing a collection name.

The item-context entry opens the same aggregate dashboard as the global entry,
so its label must state `Current View` rather than imply paper-level
statistics. Global `Reading Statistics` remains the neutral entry point.

The dashboard is an on-demand snapshot. It refreshes on open, filter change,
and explicit Refresh; it does not poll in the background. Make this visible as
`Snapshot updated …`; after a failed refresh, retain the last successful values
only when they are visibly marked stale. A successful refresh clears the stale
state.

For a selected history period with retained history but no progress update,
state that no progress update occurred in the selected range without implying
where the retained history occurred. Do not make a user infer this from
zero-valued cards. Name
activity after what is actually observed: a day or paper with a **progress
update**, not a duration or reading-time claim.

Known remaining pages must show both the known count and the unknown-paper
count. A large known-page number must not visually imply that all papers have
page coverage.

Initial refresh behavior is explicit: calculate on open and when the user
selects `Refresh`. Do not add a background polling loop. A future debounced
notifier refresh may be added only after runtime evidence shows it is needed.

Use platform DOM, CSS, and small SVG or CSS bars. Do not add a runtime charting
dependency for the first release. Labels, counts, and keyboard access must not
depend on color alone.

The default light appearance uses a clean white canvas with white controls and
panels. Preserve hierarchy with subtle neutral borders and restrained shadows,
not gray panel fills. Keep semantic reading-state colors for data and honor the
system dark appearance with explicit dark tokens.

If historical data does not exist, keep current statistics visible, hide the
historical detail panels, and display one compact onboarding callout:

> Reading history starts after this feature records its first reading update.
> Existing current progress is included in current statistics but is not
> presented as past activity.

Do not repeat the same empty-state message in multiple panels. Do not render a
`Retained progress trajectory`; averaging only the papers updated on each day
creates a changing cohort and cannot support a trajectory claim.

Percentages greater than zero but below one percent render as `<1%`, not `0%`.
Reuse Reading Flow's semantic status colors while preserving text labels and
numbers. Recent Progress uses a real table with `Paper`, `Progress`, `Change`,
`Status`, and `Reset` columns. The layout reflows at narrow widths and 200% zoom
without horizontal scrolling of primary controls or metrics.

## Data Design

### Phase A: Current-State Dashboard

Phase A does not change `FlowData`, `DataStore`, or stored item metadata. It is
read-only and computes a snapshot on demand.

The statistics module must accept plain normalized records and return one
serializable statistics snapshot. It must not call Zotero APIs or touch the DOM.

### Phase B: Historical Schema

Historical tracking introduces schema version `2` only when history is first
written. Version `1` remains readable. Existing current fields retain their
meaning and older metadata must round-trip without data loss.

Approved logical types:

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

- Day keys use the local calendar date at the event timestamp in `YYYY-MM-DD`
  form.
- Keep at most 366 calendar days of detailed daily rollups.
- Prune detailed days older than the retention window during a successful
  Reading Flow write, not on read.
- `activeDaysTotal` increases once when a newly observed day receives a real
  progress update. It is a lifetime summary, not a substitute for retained
  daily evidence.
- Progress within one day and attachment is the maximum successfully persisted
  progress, except that a reset marker starts a new current-state trajectory.
- `completedAt` is the first completion timestamp and survives reset.
- Reset clears current progress exactly as it does now, sets the day's reset
  marker, and preserves history.
- Status changes update the day's final status but do not set `activity` unless
  the same day also receives a progress update.
- Normalize malformed or oversized history away without breaking current
  snapshot rendering.
- Never synthesize historical days from existing `lastReadAt` or `ts` values.

Per-paper retained changes are available for the retained 366-day window. The
`All time` view uses lifetime totals and each paper's first `completedAt`; it
must not imply that pruned daily detail is still available. The dashboard must
not derive a changing-cohort aggregate trajectory.

### Deferred Status-Model Decision

`Important` is an importance attribute, not a mutually exclusive reading stage.
The current schema keeps it in the existing status model for compatibility.
This corrective release does not introduce schema version 3 or migrate user
metadata. Separating reading stage from importance requires a future authority
decision, compatibility plan, and runtime migration evidence.

### Write Interface

Deepen `DataStore` into the single transition interface. Add explicit methods
for progress, status, and reset transitions instead of making callers assemble
history patches:

```ts
recordProgress(item, input)
setStatus(item, status, at)
resetProgress(item, at)
```

`ReaderTracker` observes Zotero reader state and calls `recordProgress`.
`ReadingFlowMenuManager` calls status and reset methods. Snapshot and history
must be merged into one item save so the plugin never performs a second history
write for the same transition.

Within one device, deterministic daily-key union and maximum-progress rules
reduce lost updates. Zotero item-level sync remains last-writer/conflict based;
the plugin must document that simultaneous edits to the same item on multiple
devices can still produce a Zotero metadata conflict.

## Architecture

### Deep Modules

- `statistics.ts`: pure metric definitions and aggregation. Interface accepts
  normalized paper records and options; implementation owns status, progress,
  remaining-page, and history calculations.
- `statisticsScope.ts`: Zotero scope adapter. Interface returns regular parent
  items for `current-view` or `library`; implementation contains all Zotero
  collection/search/view details.
- `dashboardManager.ts`: dashboard lifecycle adapter. Interface opens, focuses,
  refreshes, and closes one dashboard window.
- `dashboard.ts`: DOM rendering and user input. It consumes a serializable
  statistics snapshot and does not interpret raw `Extra` text.
- `DataStore`: the sole persisted transition module. Callers do not construct
  history rollups directly.

### Expected File Changes

Current-state implementation may create or modify:

- `src/statistics.ts`
- `src/statisticsScope.ts`
- `src/dashboardManager.ts`
- `src/dashboard.ts`
- `src/bootstrap.ts`
- `src/menuManager.ts`
- `addon/dashboard.xhtml`
- `addon/dashboard.css`
- `addon/locale/en-US/reading-flow.ftl`
- `build.js`
- `scripts/verify-xpi.js`
- focused tests under `test/`

Historical implementation may additionally modify:

- `src/flowData.ts`
- `src/dataStore.ts`
- `src/readerTracker.ts`
- `src/notifierManager.ts` only if dashboard cache invalidation is introduced
- their focused tests

Do not add a framework, database, backend, telemetry package, or charting
package unless this authority document is explicitly revised first.

## ORRO Implementation Plan

Program status: Slices A through E are recorded as historically passed on
2026-07-29. Slice F has a local
implementation and packaged-build pass, but is **not ship-ready**: its ORRO
proofcheck is blocked by an empty runner receipt and its dashboard action needs
a direct Zotero runtime confirmation. The separate evidence and blocked verdict
are recorded in
`.witnessd/audits/reading-flow-human-loop-2026-07-29/FINAL_HANDOFF.md`. The
white-light-appearance follow-up passed runtime review in
`.witnessd/audits/reading-flow-white-theme-2026-07-29/VERDICT.md`. Slice G has
a local implementation and package-verification pass, but is also **not
ship-ready** until the newly built XPI is opened and exercised in Zotero; the
ORRO runner's proofcheck remains blocked by incomplete runner artifacts rather
than a source-test failure. Slice H direct runtime acceptance is now recorded
as **PASS** on 2026-07-29 in
`.witnessd/runs/slice-i-gate-20260729/slice-h-runtime-acceptance-pass.md`:
the user directly activated both dashboard entry points, observed the
packaged dashboard, and confirmed the close/reopen lifecycle. Slice I
implementation and direct runtime acceptance are recorded as **PASS** in
`.witnessd/runs/slice-i-implementation-20260729-v2/` and
`.witnessd/runs/slice-i-runtime-20260729/FINAL_RUNTIME_EVIDENCE.md`.
The ORRO proofcheck and handoff also passed. This records the implementation
and evidence decision; commit, push, and release remain separate operator
actions.

Each slice is a separate bounded ORRO run. A passing slice does not authorize
the next slice automatically; the operator reviews its proofcheck verdict and
visible result first.

### Slice A: Authority Correction

Write region: `docs/READING_FLOW_AUTHORITY.md` only.

Gate:

- Exactly one design/implementation document has `Status: AUTHORITATIVE`.
- Every superseded document remains `STALE` and links here.
- The tracked dataset, metric truth, no-history behavior, global entry, and
  deferred `Important` decision do not contradict another active section.
- `git diff --check` passes.

### Slice B: Metric Truth

Write region: `src/statistics.ts`, `test/statistics.test.ts`, and only a minimal
type definition when required.

Implement explicit `read` as `Complete`, rename `papersAdvanced` to
`papersWithProgressActivity`, apply dataset and status filters to the same paper
set used by history, and remove changing-cohort `averageProgress` from product
metrics. Preserve remaining-page rules and version-1/version-2 compatibility.

Gate: typecheck, focused statistics tests, and the full unit suite pass. Tests
cover explicit read with absent/partial progress, explicit to-read at 90%,
tracked/all and status combinations, history filtering, multi-attachment
deduplication, and unknown page counts.

### Slice C: Dataset and Entry Integration

Write region: `src/dataStore.ts`, `src/statisticsScope.ts`, `src/bootstrap.ts`,
`src/menuManager.ts`, `src/dashboardManager.ts`, related focused tests, and the
locale file.

Expose read-only Reading Flow metadata presence, carry the tracked flag through
the dashboard bridge, connect the dataset selector, and route context/global
entries through one window lifecycle. Do not mutate user items, `Extra`, PDFs,
or annotations.

Gate: tracked/all combines with both scopes; both entries reuse/focus one
window; listeners do not duplicate; and the Zotero 9 global-menu API has runtime
evidence. An unproven global-menu path blocks the slice.

### Slice D: UI, Empty State, and Accessibility

Write region: `addon/dashboard.xhtml`, `addon/dashboard.css`, the locale file,
`src/dashboard.ts`, and `test/dashboard.test.ts`.

Use the control, summary, reading-pulse, semantic-color, Recent Progress table,
single onboarding callout, narrow reflow, and accessibility contracts above.
Remove the duplicate history summary and changing-cohort trajectory.

Gate: focused DOM tests pass; normal, narrow, no-history, and populated-history
renders are captured; keyboard/focus and 200% reflow are inspected; and artifact
QA is at least acceptable for the next gate.

### Slice E: Package, Install, and Runtime Acceptance

Write region: packaging output and `.witnessd` evidence only unless a proven
defect requires returning to its owning earlier slice. Package metadata and the
separate `package.json`/`package-lock.json` security update are not changed by
this corrective slice.

Gate:

- Typecheck, all unit tests, build, XPI verification, source and packaged XHTML
  validation, and `git diff --check` pass.
- The XPI contains required runtime resources and no TypeScript/development
  files; source and installed XPI hashes match.
- Add-on `readingflow@moon.com` version 1.3.0 is active after a recoverable
  backup, normal Zotero shutdown, install, and restart.
- Global/context entry, focus reuse, close/reopen, both scopes, both datasets,
  status/range filters, refresh, and no-history onboarding pass in real Zotero.
- Populated history is tested only in a disposable profile or bounded synthetic
  bridge. The live user library receives no test history.
- User `Extra`, PDFs, and annotations remain unchanged, and the dashboard is
  left open for user acceptance.

### Slice F: Human-Loop Correction

Write region: `docs/READING_FLOW_AUTHORITY.md`, archived superseded Reading
Flow plans/specs, `src/statistics.ts`, `src/dashboard.ts`, `src/bootstrap.ts`,
`src/menuManager.ts`, `addon/dashboard.xhtml`, `addon/dashboard.css`,
`addon/locale/en-US/reading-flow.ftl`, and their focused tests.

Implement only the Human-Loop Corrective Contract above:

1. Frame tracked papers as the reading set and All papers as inventory; explain
   an empty reading set.
2. Preserve every Recent Progress entry in the in-memory snapshot, show an
   explicit initial subset and total, and support user-controlled expansion.
3. Label current state, in-range change, and last retained update distinctly.
4. Add an explicit user-invoked `Show in Zotero` action for a Recent Progress
   row through a small dashboard bridge backed by the observed Zotero 9
   `ZoteroPane.selectItem()` API.
5. Surface snapshot/stale semantics, no-progress-in-range semantics, honest
   page coverage, and progress-update terminology.
6. Rename the aggregate context-menu entry to state its Current View scope.
7. Archive—not merely mark—the four superseded Reading Flow plans/specs so
   agents do not discover active-looking executable checklists.

Do not modify stored Reading Flow schema or data, add persistence, dependencies,
polling, recommendation logic, PDF opening, or an `Important` migration.

Gate:

- Focused statistics, dashboard, and menu tests cover the contracts above.
- Full `npm run verify` and `git diff --check` pass.
- Packaged XHTML contains the updated controls and strings.
- Zotero 9 runtime confirms global/context entry wording, tracked/inventory
  framing, expansion, Show in Zotero selection, snapshot refresh, reuse, and
  close/reopen. If a runtime action cannot be observed, record it as blocked;
  do not call the slice ship-ready.

### Slice G: Correctness Hardening

This follow-up slice closes correctness defects found during the full
implementation and human-use review. It is intentionally limited to behavior
that can make an otherwise usable dashboard report the wrong progress, hide
the onboarding state, present an unlabelled stale snapshot, or expose a menu
entry whose runtime cannot open.

Write region: `src/dataStore.ts`, `src/statistics.ts`, `src/dashboard.ts`,
`src/bootstrap.ts`, `src/menuManager.ts`, `README.md`, and their focused tests.

Implement only:

1. Compare legacy page-number progress with a known page count before applying
   the monotonic-progress rule; preserve the stored legacy value when a new
   observation is behind it, but normalize history rollups to a comparable
   fraction.
2. Count history coverage only for real progress activity or explicit
   completion. Status-only and reset-only transitions must not suppress the
   no-history onboarding state.
3. Preserve the identity of the last successful dashboard query and label a
   stale snapshot with that scope, dataset, status, and range.
4. If dashboard chrome registration fails, keep Reading Flow's existing item
   actions available while omitting dashboard menu entries that cannot work.
5. Keep README menu wording aligned with the runtime label.

Do not modify the stored schema, package security files, dependencies, polling,
telemetry, PDF behavior, or annotations. Runtime installation and direct
Zotero observation remain a separate human-loop gate; a local pass does not
make the runtime slice ship-ready.

Gate:

- Focused regression tests cover all five corrections above.
- Typecheck, the full unit suite, XPI verification, source and packaged XHTML
  validation, and `git diff --check` pass.
- `package.json` and `package-lock.json` retain their pre-existing user-owned
  security update and receive no changes from this slice.
- If direct Zotero runtime evidence is still unavailable, the handoff remains
  `blocked` for runtime acceptance even when local verification passes.

### Slice H: Packaged Dashboard Runtime Path

Runtime evidence found that the active 1.3.0 add-on exposes both statistics
menu entries but a direct menu invocation does not reliably surface the
dashboard. The dashboard assets remain packaged under the add-on `rootURI`, but
the `openDialog()` window boundary requires a runtime `chrome://` content
registration that maps back to those assets. The same runtime check showed that
the menu callback's deferred timer can be discarded before it calls
`DashboardManager.open()`; opening must occur synchronously from the command
callback.

Write region: `docs/READING_FLOW_AUTHORITY.md`, `src/bootstrap.ts`,
`src/dashboardManager.ts`, `src/menuManager.ts`, and focused dashboard-manager
and menu-manager tests.

Implement only:

1. Register one `chrome://readingflow/content/` route from the packaged add-on
   `rootURI`, then open `dashboard.xhtml` through that route.
2. Retain and destroy the registration handle during shutdown so the runtime
   route cannot outlive the add-on.
3. Add a regression test for the exact registered dashboard URL and retain lifecycle
   coverage for reuse and close/reopen.
4. Invoke `DashboardManager.open()` directly from both statistics menu command
   callbacks; do not defer it through a timer whose lifecycle is outside the
   menu command.
5. Resolve the registration service from Zotero's bootstrap `Cc`/`Ci` globals
   (with `Components` only as a compatibility fallback). If registration fails,
   do not register either dashboard menu entry point.

Do not change dashboard controls, data calculations, stored Reading Flow data,
package dependencies, security files, PDFs, annotations, or telemetry.

Gate:

- Typecheck, focused dashboard-manager tests, full unit suite, build, XPI
  verification, and `git diff --check` pass.
- After a recoverable backup and restart, the installed XPI hash matches the
  build and both `Reading Statistics` and `View Current View Statistics` open
  the packaged dashboard. Repeated open reuses/focuses it; close/reopen creates
  it again.
- A menu label alone is not runtime acceptance evidence.

### Slice I: User-Selected Resume Bridge

Prerequisite: Slice H runtime acceptance has passed. A visible menu label,
source test, or installed-XPI hash alone does not satisfy this prerequisite.

Write region: `docs/READING_FLOW_AUTHORITY.md`, `src/bootstrap.ts`,
`src/dashboard.ts`, `addon/dashboard.xhtml`, `addon/dashboard.css`,
`addon/locale/en-US/reading-flow.ftl`, `test/dashboard.test.ts`, and only the
focused `ResumeReader` tests required to lock an observed bridge contract.

Implement only:

1. Extend the dashboard bridge with an explicit `resumeItem(itemID)` action
   that delegates to the existing `ResumeReader`; do not duplicate page or
   attachment resolution in dashboard code.
2. Add a `Resume` action to Recent Progress rows. It must execute only after a
   direct user activation on that row and coexist with `Show in Zotero`.
3. Report a concise success, unavailable, or failure state in the dashboard
   without hiding the row or mutating its statistics.
4. Preserve the current scope/dataset/status/range controls and refresh model.
5. Add a reliable active-view scope label only if the existing scope adapter
   can expose it without reaching into unbounded Zotero UI internals; otherwise
   retain the explicit `Current View` label.

Do not add a global continue card, a next-paper recommendation, ranking,
goals, streaks, a focus-list schema, a database, telemetry, automated opening,
or any new Reading Flow persistence. Do not modify PDFs, annotations, item
metadata, existing status semantics, `package.json`, or `package-lock.json`.

Required tests:

- Resume calls the bridge once with the row's item ID only after explicit user
  activation.
- Render, refresh, filter, scope, sort, and `Show in Zotero` never invoke
  Resume.
- An unavailable or failed Resume keeps the dashboard usable and explains the
  outcome without a metadata write.
- The bridge delegates through `ResumeReader` and retains its saved-page and
  no-location fallback behavior.
- Existing Recent Progress expansion, focus, stale snapshot, and accessibility
  contracts remain green.

Gate:

- Typecheck, focused dashboard and resume tests, full unit suite, build, XPI
  verification, source and packaged XHTML validation, and `git diff --check`
  pass.
- In a disposable Zotero profile or equivalent non-user-data fixture, a user
  selects a Recent Progress row, activates Resume, and the existing reader path
  opens that paper at its recorded page or documented safe fallback.
- The same runtime run proves no Resume occurs on dashboard open, refresh, or
  filter changes.
- The installed XPI hash matches the verified build. If runtime evidence is not
  pass, the slice remains blocked and is not ship-ready.

Known baseline: the worktree contains a separate `esbuild` security dependency
update in `package.json` and `package-lock.json`. Issue #6 work must not absorb,
revert, reinterpret, or claim that change.

## ORRO Execution Contract

For each slice, the operator supplies the exact slice goal and exact write
scope from this document. ORRO must not infer or broaden write scope.

The original repository remains uncommitted and unpushed. If ORRO requires a
Git-HEAD snapshot, copy the current tree to an external temporary repository,
excluding `.git`, `.witnessd`, `node_modules`, and personal runtime state. The
temporary repository may contain a local verification-only commit. Preserve a
SHA-256 manifest proving the verification snapshot matches the original target
files; never modify the original repository's index, refs, or commits.

Canonical pattern:

```bash
orro flow "Implement Slice N from docs/READING_FLOW_AUTHORITY.md only" \
  --write-scope "<explicit path or glob>" \
  --adapter codex \
  --json
```

The ORRO runner prompt must include:

```text
Read docs/READING_FLOW_AUTHORITY.md first. It is the sole active design and
implementation authority. Do not execute checklists from documents marked
STALE. Implement only the named slice, preserve unrelated worktree changes,
run the slice gates, and stop on unresolved runtime or product decisions.
```

Required ORRO evidence for an implementation slice:

- `repo-profile.json` and `context-pack.json` from scout.
- `verification-recipe.json` before implementation.
- `team-ledger.json` and `team-ledger-verdict.json` from observed execution.
- `proofcheck-verdict.json` with the Depone decision.
- `orro-handoff.json` only after a passing bound proofcheck verdict.

Scout output, a model transcript, skill text, MCP output, or handoff prose alone
is not completion evidence.

## Verification Strategy

### Deterministic Gates

Use focused tests during each slice and the repository gate at integration:

```bash
npm run typecheck
npm run test:unit
npm run build
node scripts/verify-xpi.js
npm run verify
git diff --check
```

Tests must exercise public module interfaces and visible/stored behavior rather
than private implementation details.

### Runtime Gates

Build success is not dashboard proof. Use a disposable Zotero 9 profile and
record:

- installed and enabled add-on version
- dashboard open/focus/close behavior
- screenshots for current, empty, unknown-page, and historical states
- controlled fixture inputs and displayed metric outputs
- before/after parent-item `Extra` values
- preservation of unrelated `Extra` lines
- reset and completion-history behavior
- clean shutdown without Reading Flow errors

The feature is blocked, not passed, when the runtime cannot be inspected.

### Human Review Gates

Before release, a human must confirm:

- the dashboard answers the issue's motivating questions without explanation
- scope and date labels are unambiguous
- remaining-page coverage is honest
- unknown and unavailable history are not rendered as zero
- charts remain readable without relying on color alone
- the feature still feels like Zotero rather than a separate analytics product

## Acceptance Criteria

Issue #6 is complete only when:

- Current View and Entire Library statistics work in a real Zotero 9 profile.
- Status composition, progress distribution, and remaining-page coverage match
  controlled fixtures.
- Historical activity starts prospectively and uses bounded storage.
- Activity calendar, unique completions, papers with progress activity, and the
  Recent Progress per-paper table are accurate for controlled histories.
- Explicit `read` is always represented in the `Complete` progress bucket.
- `Tracked papers` is the default dataset and `All papers` remains selectable.
- The Reading set/inventory distinction and empty reading-set onboarding are
  unambiguous.
- No-history users see one onboarding callout rather than repeated empty panels.
- Recent Progress never silently hides entries; current state and in-range
  change are distinguished, and a user can return an explicitly chosen row to
  Zotero.
- Snapshot, stale failure, no-progress-in-range, and page-coverage semantics
  are visible rather than inferred from raw counts.
- Both global and context-menu entries reuse the same dashboard window.
- Existing Progress, Status, Last Read, Resume Reading, status updates, and
  Reset Reading Progress behavior remain intact.
- Version-1 metadata remains compatible and unrelated `Extra` text is preserved.
- Full repository and runtime gates pass.
- ORRO proofcheck returns a passing verdict for every shipped implementation
  slice and a handoff is bound to the final passing verdict.

Until all criteria pass, report the exact completed slice and remaining gate;
do not describe the full issue as implemented.
