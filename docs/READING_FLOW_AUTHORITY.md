# Reading Flow Authoritative Design and Implementation Plan

> **Status: AUTHORITATIVE**
>
> **Last updated:** 2026-10-24
> **Released baseline:** Zotero Reading Flow v1.3.5
> **Active implementation target:** Approved PR1–4 — source/tests and bounded native trial passed; broader accessibility/sync/human release gates remain; no public release
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
completed and closed in v1.3.0. The v1.3.5 baseline provides:

- `Progress`, `Status`, and `Last Read` columns plus the existing Reading Flow
  item menu.
- A modeless `Reading Statistics` window from the global Tools menu and the
  Reading Flow item context menu. Repeated entry reuses the same window;
  close/reopen is supported.
- `Current View` and `Selected Library` scopes. `Current View` follows the
  Zotero collection, saved search, or tag-filtered view already selected by
  the user.
- `Reading Flow items` as the intentional reading set and `All papers
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

1. `Current View` or `Selected Library`.
2. `Reading Flow items` or `All papers (inventory)`.
3. Current status filter.
4. History range.

`Reading Flow items` contains papers with meaningful Reading Flow state:
an explicit status, observed progress/resume state, or observed history. A
syntactically valid but empty `ReadingFlow:` line does not enroll a paper.
`All papers (inventory)` also includes untracked regular items, which are
represented as `Unassigned`, never as an implied reading commitment.

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

### Priority 1 — Slice M: Explicit Status and Safe Library Triage

#### User problem and decision

Large existing libraries must not become an automatic `To Read` queue merely
because the add-on is installed. Status is either an explicit user choice or
an automatic interpretation of observed PDF progress. Untouched papers remain
`Unassigned` and render as an empty item-tree status surface with an accessible
description.

#### Interaction and data contract

- The stored `s` value is a manual override. `Clear Manual Status (Use Automatic)` clears
  only that override. On a status-only item it removes the namespaced line; on
  a progressed item it preserves progress, resume data, and history.
- Clearing an already-unassigned untouched item is a strict no-op: no save,
  timestamp, history record, or reading-set enrollment.
- `Reset Progress (Keep Manual Status)` clears current progress/resume position while
  preserving the manual status. `Restart as To Read` is the separate explicit
  command that clears progress and sets `To Read`.
- A manual `Read` label does not fabricate measured progress, remaining-page
  coverage, reading activity, or first completion. First completion is created
  only by persisted normalized progress at the completion threshold.
- Context-menu status operations accept top-level papers and normalize selected
  PDF attachments to their deduplicated parent papers. Read-only and unsupported
  items are skipped. Batches of 100 or more require confirmation; mixed or
  multi-item operations show changed, unchanged, skipped, and failed counts.
- The new-item default is `Unassigned` and therefore writes nothing. A user may
  opt into a manual default status. Activation is prospective: it applies only
  to editable top-level regular items whose `dateAdded` is at or after the
  preference activation time. Historical sync items are skipped. Any existing
  `ReadingFlow:` namespace wins, including malformed, duplicate, reset-only, or
  future-version data. Initialization creates no reading history and preserves
  Zotero's `dateModified`.
- Writes serialize per parent item. If unrelated `Extra` changes during a save,
  the write recomposes against that content with a bounded retry. If the
  `ReadingFlow:` line itself changes concurrently, preserve it and report the
  requested mutation as not changed rather than overwriting it.
- Page-based legacy progress and fractional progress use one normalized resolver
  across columns, automatic status, statistics, remaining pages, and completion history.

#### Deliberate boundary

Slice M does not register a private collection-tree node, create tags, or mirror
automatic status into Zotero metadata. Settings may create or remove one
user-invoked native Saved Search named `Reading Flow — Tracked Papers` per selected
library. It matches top-level bibliographic items whose `Extra` field contains
the Reading Flow namespace, including preserved unsupported metadata; it is not
identical to the dashboard's valid tracked-item set. Exact automatic-status folders remain out
of scope because Zotero Saved Search conditions cannot derive status from the
plugin's JSON progress state.

#### Required proof

Focused tests must cover untouched display, manual/automatic precedence,
status-only and progressed clearing, reset/restart separation, completion
provenance, attachment-parent deduplication, read-only and large-batch behavior,
new-item defaults, and competing `Extra` writers. Closeout still requires the
full release gate and direct disposable-profile inspection before release.

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

### Completed — Slice K: Opt-In Reading Display Density (v1.3.2)

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


## 2026-10-24 user-authorized implementation supersession

The user authorized implementing the four reviewed PRs in order, testing and reviewing each, then verifying cross-feature consistency. The following contract supersedes conflicting Slice M and deferred sidebar/status/Important semantics above. The four PRs form one coherent public release; implementation and source checks do not constitute native or human acceptance. No model or permission configuration changes are authorized.

# Reading Flow 기능 정돈 — 최종 제안 PR 목록

2026-10-24 · 검토 3차 수렴 · **PR1–4 소스/테스트 구현 완료 / 네이티브·사람 인수 미실행 / 실제 PR 미생성**

## 결론

사용자는 자료를 골라 현재 상태를 보고, 원하는 PDF의 저장 위치로 돌아가며, 읽었는지와 중요한지를 직접 정할 수 있어야 한다. 자동화는 위치와 활동 기록을 맡고, 완독을 대신 판정하지 않는다. 이를 네 개 PR로 나누어 검토하되, 사용자에게는 의미가 일치하는 한 버전으로 함께 릴리스한다.

검토 대상은 main `9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f`의 소스와 합성 데이터 재현이다. 이번 조사에서 원격 main이 같은 SHA임을 확인했다. 실제 이용자 라이브러리, 이슈 작성자의 데이터, 사람 대상 사용성 테스트 결과는 아니다.

[이슈 #16](https://github.com/Moonweave-Research/zotero-reading-flow/issues/16)은 개별 자료의 시작일·최근 기록·상태를 쉽게 확인하고 싶다는 요청이다. 자동 완독에 대한 불만을 명시하지 않았다. 자동 완독과 기능 모순 정리는 이번 사용자 요청으로 확장된 별도 제품 개선이며, 이슈 작성자의 의도로 단정하지 않는다.

이 문서는 Incubator 제안의 검토 산출물이다. 저장소의 단일 실행 권위는 `docs/READING_FLOW_AUTHORITY.md`이다. 향후 구현 첫 PR에서 현재 Slice M과 충돌하는 정책 및 순서를 그 문서에 반영한다. 여기서 저장소 권위 문서나 제품 코드를 변경하지 않았다.

## 실제로 확인한 모순

| 동작 | 현재 소스 재현 결과 | 사용자가 오해할 수 있는 점 |
|---|---|---|
| 100쪽 PDF의 98쪽으로 이동한 뒤 20쪽으로 돌아옴 | 자동 Read, 최근 위치 20쪽, 최대 진행률 98%, 최초 완료 1회 | 페이지 이동을 읽었다는 확인으로 취급 |
| 30쪽 위치에서 직접 Read 선택 | Read 1개인데 남은 페이지 70쪽, 최초 완료 0회 | 사용자의 완료 판단과 통계가 서로 다른 뜻 |
| 위 자료에 Important 선택 | Read가 Important로 대체되고 Read 집계에서 빠짐 | 중요 표시가 읽기 상태를 지움 |
| 정확히 100쪽에 도달한 뒤 1쪽으로 돌아옴 | 최대 진행률이 100%에서 1%로 덮임. 상태는 Reading이지만 최초 완료 1회는 남음 | 위치·상태·이력이 동시에 다른 이야기를 함 |
| 저장 위치 없는 PDF를 열기 | 진입 경로마다 Resume 가능 여부와 실제 열기 경로가 다름 | 같은 버튼 이름으로 다른 약속 |

앞선 ‘100%까지 가면 최대치가 남는다’는 일반화는 정정한다. 98% 사례와 달리 정확히 100%인 값에는 기존 숫자 형식 해석 문제가 있다. 재현 근거는 `consistency-probe.json`이며 실제 라이브러리는 수정하지 않았다.

## 사용자가 배우면 되는 규칙

| 질문 | 제품의 일관된 답 |
|---|---|
| 어디까지 열어 봤나? | PDF 파일명과 마지막 저장 위치, 예: `37 / 120쪽`. 가장 멀리 간 위치는 상세 정보로 분리 |
| 읽었나? | 읽음은 사용자가 표시. 자동 상태가 필요하면 실제 PDF 활동 근거가 있는 Reading까지만 사용하고 근거 표시 |
| 중요한가? | 읽기 상태와 별도 표시. Read와 Important가 공존 |
| 언제 읽기 시작했나? | 확인 가능한 첫 PDF 활동 기록만 표시. 실제 독서 시작일이라고 단정하지 않으며, 모르면 이유 표시 |
| 다시 이어 보려면? | 파일과 저장 위치가 맞으면 Resume, 위치가 없으면 Open PDF, 열 수 없으면 이유 표시 |
| 기록이 비어 있으면? | ‘기록 없음’. 손상되거나 지원하지 않는 기록은 ‘표시할 수 없음’. 둘 다 ‘안 읽음’으로 단정하지 않음 |
| 상태를 바꾸면 위치도 사라지나? | 아니오. 위치 초기화는 별도 고급 동작이며 무엇을 지우는지 명시 |

자동 Reading은 독서나 이해를 증명하는 지표가 아니다. `startedAt`, 상태 변경 시각, 초기화만으로 생긴 기록을 PDF 활동으로 인정하지 않는다. 수동 상태가 있으면 우선한다. 자동 Read였던 항목은 새 해석에서 Reading으로 보일 수 있으므로 업데이트 안내에 설명하며, 기존 수동 Read는 유지한다.

## 제안 PR 1 — 페이지를 넘긴 것과 읽은 것을 구분한다

**사용자 효과:** 목록·필터·통계·설명이 같은 뜻의 상태를 보여 준다. 스크롤만으로 완독 표시가 생기지 않는다.

- 공통 상태 해석에서 자동 Read를 제거한다. 수동 Read와 기존 명시적 상태를 보존한다.
- `% read`, `never read`, 95% 기반 완료 색상·버킷·설명을 정리한다. 기본 표시를 PDF 위치로 바꾸고 현재 위치와 최대 위치를 섞지 않는다. 열 ID, 사용자 열 순서·너비·표시·정렬 설정은 유지한다.
- ‘최초 완독’, ‘남은 읽을 페이지’ 카드는 기본 통계에서 제외한다. 기존 `completedAt` 및 이력 원본은 보존한다. 필요하다면 고급 정보에서 과거 ‘95% 위치 도달 기록’으로만 설명한다. 새로운 완독 이력 체계는 만들지 않는다.
- 읽기 결과를 기록 없음 / 해석 가능 / 표시 불가로 공통 분류한다. 손상·중복·미지원 기록을 비어 있는 데이터로 바꿔 집계하거나 덮어쓰지 않는다.
- 통계 범위의 전체 T = 분류 가능 K + 표시 불가 U. 기록 없는 정상 항목은 K의 미지정 상태에 포함하고, 상태 비율의 분모는 K라고 명시한다. 상태 필터로 좁힌 결과 수와 원래 범위 전체 수는 구분한다.
- 최대 위치 100% → 1% 덮어쓰기를 수정한다. 단, 근거 있는 메타데이터로 구분되는 경우만 해석한다. 과거 raw `1`이 1%인지 100%인지 불명확하면 추측 복원하지 않는다.
- ‘Last Read’를 실제 데이터가 증명하는 최근 PDF 활동으로 설명하고 표시·정렬 기준과 현지 날짜를 일치시킨다. 대시보드의 범용 자료는 Papers 대신 Items 등 실제 범위에 맞게 표현한다.

**주요 경계:** `flowData.ts`, `dataStore.ts`, `columnManager.ts`, `statistics.ts`, `dashboard.ts`, `addon/dashboard.xhtml`, 관련 문구·테스트·권위 문서.

**통과 조건:** 빠른 끝 이동과 되돌아오기에도 자동 Read 없음; 수동 Read 우선; 100% 최대 위치 유지; 모호한 과거 값은 미확인; malformed/unsupported/duplicate 데이터는 U로 분리; 목록·필터·통계의 동일 데이터 결과 일치; 날짜 표시와 정렬 일치; 기존 열 설정 유지. 데이터 해석만으로 원본 저장 내용이 바뀌지 않아야 한다.

PR1 implementation write region (2026-10-24, user-approved directory expansion):
`src/flowData.ts`, `src/dataStore.ts`, `src/columnManager.ts`, `src/statistics.ts`,
`src/dashboard.ts`, `addon/dashboard.xhtml`, `addon/prefs.xhtml`,
`addon/locale/en-US/reading-flow.ftl`, directly matching `test/*.test.ts`, this
file, and `docs/PR1_VERIFICATION.md`. Preferences XHTML changes remove obsolete
completion wording/controls only; stored preference values and live user
configuration are not changed. PR1 source/tests are complete; native/human release acceptance is not a prerequisite for PR2 implementation.

## 제안 PR 2 — 이어 보기와 위치 초기화를 예측 가능하게 한다

**사용자 효과:** 버튼에 적힌 파일·페이지가 실제로 열리고, 상태 변경이나 초기화로 예상 밖의 기록이 사라지지 않는다.

- 메뉴·대시보드·향후 패널에 동일한 대상 결정 결과를 사용한다: PDF 식별자, 해당 파일의 저장 페이지, 접근 가능 여부, Resume / Open / 불가.
- 페이지를 모르면 Open PDF라고 표시한다. Zotero가 자체적으로 어디를 열지는 별개이며 플러그인이 저장 페이지를 안다고 주장하지 않는다.
- 여러 PDF, 삭제된 첨부, PDF가 아닌 첨부, 선택 변경, 비동기 결과 지연을 처리한다. 다른 파일의 페이지를 새 PDF에 대입하지 않는다.
- 고급 메뉴의 초기화를 `Reset tracked PDF positions`로 명확히 한다. 선택한 자료의 현재·최대 저장 위치를 지우고 수동 상태·최근 활동 시각·이력은 유지한다고 실행 전에 설명한다.
- 단순 상태 변경은 위치를 지우지 않는다. 기존 ‘Restart as To Read’ 복합 동작은 일반 메뉴에서 빼고, 실제 첫 페이지 열기 없이 ‘처음부터 다시 읽기’를 약속하지 않는다.
- 초기화 이후에도 남아 있는 진짜 PDF 활동 근거는 유효하다. 근거가 없는데 날짜나 상태를 새로 만들어 보충하지 않는다. 보기/열기와 쓰기 권한 경로를 분리한다.

**선행:** PR 1. **주요 경계:** `resumeReader.ts`, `menuManager.ts`, `dataStore.ts`, `dashboard.ts`, 관련 테스트.

**통과 조건:** 모든 진입점이 같은 대상·이름·페이지를 사용; 저장 위치 없는 PDF는 Open; 실행 직전 삭제/선택 변경에 다른 자료가 열리지 않음; 초기화 후 수동 상태·최근 활동 표시/정렬·이력 보존; 읽기 전용 자료에서는 조회 가능하되 쓰기는 차단. 새 ‘재독 회차’ 모델은 추가하지 않는다.

PR2 implementation status (2026-10-24): complete in source and regression tests.
The common serializable `ResumeDisplayTarget` and `executeTarget` API is used
by the native menu and both dashboard row surfaces and is available for the
future panel. Unknown page means Open; changed/deleted displayed targets fail
closed. Read-only viewing is separate from mutation eligibility. The Advanced
reset confirms current/maximum position removal and preserves manual status,
genuine last activity and retained history. Status changes preserve positions;
the common Restart action is removed. No PR3/4 model or panel work is included.

Approved PR2 write region includes `src/resumeReader.ts`, `src/menuManager.ts`,
`src/dataStore.ts`, `src/dashboard.ts`, `src/bootstrap.ts` (shared dashboard
bridge), matching tests, locale strings, this authority and
`docs/PR2_VERIFICATION.md`. Verification: `npm run verify` passed (244 tests),
source/packaged XHTML and diff checks passed. See the verification record for
exact evidence and unrun native/human gates. This status does not authorize
public release. The subsequent user instruction separately authorized PR3 implementation;
PR4 was outside that completed PR2 task; the subsequent user instruction authorized PR4.

## 제안 PR 3 — 중요 표시가 읽기 상태를 지우지 않게 한다

**사용자 효과:** 읽은 자료도 중요 표시할 수 있고, 중요 자료를 읽음으로 바꿔도 중요 표시가 남는다.

- Important를 읽기 상태 enum에서 독립 플래그로 분리한다. Zotero 사용자 태그는 변경하지 않는다.
- 기존 `s=important`는 중요 표시 근거로만 사용한다. 그 전에 사용자가 Read였는지는 복원할 수 없다. 진행률로 과거 수동 Read를 재구성하지 않는다.
- 실제 활동에 따른 자동 Reading이 표시되면 ‘PDF 활동 기반’이라고 설명한다. 복원된 수동 상태처럼 보이지 않게 한다.
- 시작·조회 시 일괄 마이그레이션하지 않는다. 명시적인 변경 시에만 버전이 있는 호환 가능한 저장 전환을 수행한다.
- 구버전 writer가 새 필드를 지우지 않는지 입증하거나, 호환되지 않는 버전의 쓰기를 안전하게 거부하는 운영 조건을 마련한다. 단순히 새 코드가 과거 형식을 읽는다는 이유로 혼합 버전 쓰기까지 안전하다고 하지 않는다. 안전한 거부를 기술적으로 보장할 수 없으면 그 방법은 통과로 인정하지 않는다.
- 구버전 화면에서도 독립 중요 표시를 지원한다고 약속하지 않는다. 호환되지 않는 클라이언트 업그레이드 조건을 릴리스 문서에 명시한다. 호환성 게이트가 실패하면 릴리스하지 않는다.

**선행:** PR 1의 공통 해석; PR 2 이후 순서대로 검토. **주요 경계:** 상태/메타데이터 모델, 파서·writer, 메뉴·열·필터·통계 및 호환성 테스트.

**통과 조건:** Read + Important 동시 유지; 각각 변경/해제해도 다른 값 유지; legacy Important와 손상 기록의 무손실 조회; 사용자 태그 불변; 지원 버전 간 동기화와 이전 버전 writer 왕복에서 손실 없음 또는 검증된 안전한 거부. 완료 날짜 등 별도 이력 스키마 확장은 제외한다.

이 PR은 #16에 끼워 넣는 추가 기능이 아니다. 이번 ‘기능 모순 정리’ 요청에 따라 별도 검토하는 호환성 변경이다.

PR3 implementation status (2026-10-24): complete in source and regression tests.
The completed PR3 task implemented PR3 only. The subsequent user instruction authorized PR4; neither task authorizes public release.
The version-3 representation adds only `important: boolean`; `s` contains a
manual reading stage or null. Existing history, including historical
`status: important` rollups and completion timestamps, remains in its existing
schema. No new completion/history model is introduced.

- Legacy `s=important` resolves to `important=true`, `s=null`. Its previous
  manual stage is unknowable. Only genuine PDF evidence may derive Reading,
  explicitly described as PDF activity based; progress never restores Read.
- Reads, startup, dashboard review and no-op commands perform no item writes or
  bulk migration. An explicit importance change writes v3; an explicit manual
  stage change on a legacy importance item also writes v3 to retain both values.
  Unchanged legacy importance commands remain no-ops. Background PDF writes and
  position-only reset retain legacy importance encoding until that explicit
  transition. Once v3, subsequent supported writes retain v3 and the boolean,
  including false. Importance changes alone do not create history or activity.
- Mark/Clear Important are independent menu commands using the existing parent
  deduplication, editability, batch confirmation and mutation serialization.
  Clear Manual Status and position reset preserve importance. Zotero user tags
  are never created, removed, renamed or synchronized.
- Status and Compact/Icons columns show the stage plus a separate star and full
  accessible importance text without changing column IDs/layout/sort contracts.
  Dashboard status buckets are disjoint stages; the independent Important only
  checkbox intersects status/dataset/scope/range and bounds the activity cache.
  A separate matching importance count and row text do not count importance as
  a reading stage. New-item status settings no longer offer Important; an
  existing legacy Important default is inactive without rewriting preferences.
- `scripts/verify-pr3-compatibility.js` executes the unmodified DataStore and
  its dependencies from pinned v1.3.6 source
  `9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f`. Its eight mutation APIs refuse
  canonical new-writer v3 Extra with both flag values, with zero setters/saves
  and exact byte retention (16 refusals). Supported-v2 and version-downgrade
  controls demonstrate a functioning writer and dependence on the guard.
  Supported new-client round trips preserve the flag. This proves refusal for
  that pinned baseline, not every unknown ancient writer or old-client display.

Approved PR3 write region: `src/flowData.ts`, `src/dataStore.ts`,
`src/menuManager.ts`, `src/columnManager.ts`, `src/statistics.ts`,
`src/dashboard.ts`, `src/bootstrap.ts`, `src/dashboardManager.ts`,
`src/preferences.ts`, `src/notifierManager.ts`, dashboard XHTML/CSS,
preferences XHTML, locale strings, directly matching regression tests,
`scripts/verify-pr3-compatibility.js`, this authority,
`docs/PR3_VERIFICATION.md` and `docs/RELEASE.md` (upgrade/release gates).
Verification: `npm run verify` passed (257 tests), source/packaged XHTML and
diff checks passed. See `docs/PR3_VERIFICATION.md` for the exact checks and
engineering scenario review.
Native/human acceptance remains a release gate, not a source implementation
blocker. All writing clients must support v3 or be explicitly demonstrated to
refuse it; unknown old writers must be upgraded or disabled before using the
new format. Never manually downgrade v3 metadata to permit an old writer.

## 제안 PR 4 — 개별 자료의 읽기 정보를 한곳에서 확인하고 바꾼다

**사용자 효과:** Extra를 해독하거나 통계창을 뒤지지 않고, 선택한 자료에서 필요한 정보를 확인하고 바로 이어 본다.

- 공식 Item Pane API로 Reading Flow 섹션을 제공하고 우클릭 진입도 같은 섹션을 가리킨다. 기존 Zotero 패널의 글자·배율·다크 테마 관례를 따른다.
- 기본 구성은 상태 선택, 독립 중요 표시, 최근 PDF 활동, 첫 PDF 활동 기록, 파일명·저장 위치·Resume/Open 묶음이다. 세부 이력만 접고 현재 상태 해석에 필요한 오류/누락 이유는 숨기지 않는다.
- 자동 Read를 제거한 대신 상태를 패널에서 바로 선택할 수 있게 한다. 숨은 하위 메뉴를 여러 번 열게 하지 않는다. 명시적인 변경만 공통 쓰기 경로로 연결하고 단순 열람은 데이터 쓰기 0회여야 한다.
- 첫 기록은 이슈의 핵심 요구이므로 남긴다. `history.startedAt`를 실제 독서 시작일로 재해석하지 않는다. 기록 보존 기간, 과거 형식, 누락 등의 한계를 해당 값 옆에 평이하게 설명한다.
- 미지원 버전과 손상 기록의 안내를 구분하고, 원인이 확인된 경우에만 업데이트 등 다음 행동을 제시한다. 자동 복구·삭제하지 않는다.
- 현재 추적은 PDF에 한정한다. 책 유형의 부모 자료도 다루되 EPUB까지 추적한다고 광고하지 않는다. PDF 없는 자료의 수동 상태와 PDF 위치 추적 가능 여부를 혼동하지 않는다.
- 자동으로 파일을 열거나 완독 확인 팝업을 띄우지 않는다. 타이머·점수·연속 기록·AI 판정은 넣지 않는다.

**선행:** PR 1–3. **주요 경계:** 새 네이티브 패널 모듈, 등록/해제 lifecycle, 메뉴 연결, 공통 상태·Resume API, 지역화, 통합 테스트.

**통과 조건:** 실제 Zotero에서 선택 전환·다중 PDF·삭제·읽기 전용·재시작·확장 재로드 검증; 단순 조회 쓰기 0회; 상태/중요 표시 변경 결과가 목록·통계와 일치; 키보드·VoiceOver·좁은 패널·200% 확대·다크 확인. HTML 시안 성공을 네이티브 통과로 대신하지 않는다.

## 사용자 과제별 최종 인수 기준

| 과제 | 성공 기준 |
|---|---|
| 마지막 쪽을 잠깐 보고 돌아오기 | 읽었다고 표시되지 않으며 마지막 위치와 가장 먼 위치가 구분됨 |
| 필요한 부분만 읽고 Read로 정하기 | 위치와 무관하게 수동 Read 유지, ‘읽을 것 70쪽 남음’ 같은 상충 주장 없음 |
| 읽은 자료를 중요 표시하기 | Read 유지. 중요 표시 해제도 읽기 상태에 영향 없음 |
| 다음 날 이어 보기 | 표시된 PDF의 표시된 쪽으로 이동. 저장 쪽이 없으면 Open이라고 예고 |
| 첨부 두 개 중 하나가 삭제됨 | 다른 PDF의 같은 쪽으로 몰래 대체하지 않음. 열 수 있는 대안은 명시적으로 제시 |
| 저장 위치만 초기화하기 | 범위가 실행 전에 이해되고 수동 상태·활동 날짜·이력이 남음 |
| 기록 없는 자료와 읽을 수 없는 기록 비교 | 둘을 구분하며 손상 기록이 Unassigned로 집계되지 않음 |
| 첫 기록 날짜 찾기 | 존재하면 쉽게 찾고, 없으면 실제 시작일을 지어내지 않고 이유 설명 |
| 기존 Important 자료 열기 | 중요 표시 보존. 알 수 없는 과거 수동 상태를 임의 복원하지 않음 |
| 오래된 클라이언트와 동기화 | 필드 손실 없음 또는 입증된 안전한 거부. 불명확하면 릴리스 보류 |
| 책/EPUB/읽기 전용 자료 보기 | 지원 범위와 가능한 행동이 명확하고, 볼 수 있다는 이유로 기록을 쓰지 않음 |
| 키보드와 화면낭독기로 사용하기 | 상태를 바꾸고 위치를 이해하고 열 수 있음. 숨은 마우스 동작에 의존하지 않음 |

실제 사람에게는 설명을 먼저 가르치지 않고 ‘이 숫자가 무엇인지’, ‘이 자료를 읽었다고 표시하려면’, ‘어느 파일이 열릴지’를 과제로 확인한다. 오해와 실패 경로를 기록해 수정한다. 아직 참가자 테스트를 실행하지 않았으므로 직관성이나 성공률을 실증했다고 하지 않는다.

## 세 차례 검토에서 수렴한 내용

1. **첫 검토:** 자동 완독만 제거하면 통계·필터·남은 페이지·Important가 모순을 남긴다는 점을 반영했다. #16의 패널과 상태 의미 변경을 분리했다.
2. **둘째 검토:** 통계 분모에서 표시 불가 기록을 분리하고, 상태 변경/초기화 시각을 활동 근거에서 제외했다. 위치 초기화 뒤 최근 활동 보존, raw `1`의 모호함, Important 구버전 writer 조건을 추가했다.
3. **최종 검토:** 수정된 네 PR 경계와 단일 공개 릴리스 조건에서 독립 검토자가 새로운 차단성 설계 모순을 찾지 못했다. 구현 검토·네이티브 동작·사람 대상 이해도 검증은 별도 게이트로 남겼다.

의견 차이도 정리했다. Important 분리는 #16 밖으로 분리하되 이번 넓어진 기능 정돈 범위에는 포함한다. 기존 완료/남은 페이지 카드는 이름만 바꿔 계속 앞에 두기보다 기본 화면에서 제외한다. 원본 기록은 지우지 않는다. 이는 사용자의 판단을 대신하는 지표를 줄이려는 설계 판단이며, 사용자 실험 결과는 아니다.

## 배포 및 검증 경계

- 각 PR에 그 변경을 검증하는 회귀·통합 테스트를 포함한다. 마지막에 검증 전용 PR을 몰아 만들지 않는다.
- 의존 순서는 1 → 2 → 3 → 4. 네 개를 별도로 리뷰하고 하나의 일관된 사용자 버전으로 공개한다. 중간 상태를 공개 릴리스하지 않는다.
- 의미/호환성/네이티브 인수 기준 중 하나라도 실패하면 공개 릴리스를 보류한다. 구현 중 새 차단 문제가 나오면 해당 설계를 다시 열어야 한다.
- 현재 완료: PR1–4 제품 소스 구현, 회귀·통합 fixture 검증, 고정 구버전 writer 실험 및 패키지 검사. 미실행: 실제 Zotero 네이티브 인수, 사람 대상 테스트, PR 생성·병합·릴리스.
- 이전 HTML 모형과 이미지는 배치 검토 자료다. 이 문서의 새 상태·중요 표시·통계 의미를 구현한 화면이 아니며, 현재 기능 명세로 사용하지 않는다.
- 보류: 체류 시간 기반 읽기율, AI 이해도 추정, 재독 회차, EPUB 추적, 과거 시작일/완독일 소급 복원, 새 대시보드. 스크롤 대신 시간을 재는 것만으로 실제 독서를 증명할 수 있다고 가정하지 않는다.

## 소스 근거

- [상태 및 진행률 해석](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/src/flowData.ts)
- [기록 저장·초기화·이력](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/src/dataStore.ts)
- [PDF 페이지 이벤트 추적](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/src/readerTracker.ts)
- [통계 집계](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/src/statistics.ts)
- [Resume 대상 결정](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/src/resumeReader.ts)
- [제품 실행 권위](https://github.com/Moonweave-Research/zotero-reading-flow/blob/9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f/docs/READING_FLOW_AUTHORITY.md)

PR3 verification support includes `.github/workflows/verify.yml`: fetch Git history for the pinned baseline writer experiment; do not change token permissions or models.


## PR4 implementation status — 2026-10-24

PR4 is implemented in source with synthetic lifecycle and cross-feature tests.
The installed read-only `installed-itemPaneManager.js` and
`installed-itemDetails.js` were inspected before implementation. The pane uses
`registerSection`/`unregisterSection`, documented init/destroy/item-change/render/
async-render hooks, the init `refresh` callback and item notifier cleanup.
The native menu enters this same section using the installed `item-details`
`scrollToPane` API. No invented section refresh/focus API is used.

Direct status and independent Important controls call the existing queued
DataStore methods. Viewing, section refresh, menu entry and target lookup do
not persist data. The shared ResumeReader supplies the file, page, action and
reason, and revalidates before opening. Selection generations invalidate stale
results, detached controls and pending open actions. Read-only and unavailable
records disable mutation; books without PDFs retain manual status support.

First recorded PDF activity is the earliest retained activity day or genuine
legacy last-activity date. It never uses `history.startedAt`, manual status or
reset timestamps. Retention/legacy limits are visible beside the date. No
actual-start, completion or reread schema is added. Current and maximum PDF
positions remain distinct; maximum location is in expandable detail.

Approved PR4 write region: `src/itemPaneManager.ts`, `src/bootstrap.ts`,
`src/menuManager.ts`, `src/resumeReader.ts` (shared unavailable-record reason),
English locale strings, `test/itemPaneManager.test.ts`,
this authority, `docs/PR4_VERIFICATION.md` and
`docs/INTEGRATION_VERIFICATION.md`. Shared persistence and target resolution
remain in PR1–3 modules. Parent CI `fetch-depth: 0` is retained and the pinned
baseline object is available locally. See the verification documents for exact
checks, scenario results and unrun native/human release gates. No native or
human acceptance is claimed; all four PRs remain one unreleased change set.

## Native trial update — 2026-10-24

Bounded disposable-profile native checks passed with executable code 5a2ba1c.
See PR4_VERIFICATION.md for observed results, user-operated reset and exact
package hash. Integration checks passed 272 tests. The native tracker, labels
and layout findings were fixed. Personal data/model/permissions unchanged.
Broader sync/accessibility/human gates remain before public release; approved
PR1–4 can merge as one unreleased change set.

## Approved native follow-up — statistics clarity and pane entry (2026-10-24)

The user authorized correcting the observed statistics/wording/layout findings,
verifying actual Zotero, then PR merge and installation into the personal
profile while preserving library data, preferences, models and permissions.
This focused follow-up supersedes prior completion notes for these findings.

- View Reading Flow explicitly expands a collapsed native item pane before
  rendering and scrolling; repeated entry must leave an open pane open.
- Current PDF position says Saved at page. A brief page visit is automatically
  recorded; it does not establish pages read, attention or understanding.
- Farthest position change uses first/latest retained activity days inside the
  selected period for one PDF, shown as endpoints. One day, resets, mixed PDFs
  or non-normalized legacy values yield no comparison. Viewing writes nothing.
- Keep native controls, scope/dataset/status/importance filters, calendar and
  actions. Put activity and recent PDFs before optional distributions. Disclose
  detailed filters and denominator explanations on demand; keep active filters
  and the automatic-position qualification visible. Preserve full file identity
  and target revalidation while shortening visible action labels.
- No persistence/schema/default-preference/tracker policy changes. Actual cloud
  sync/accessibility certification and public release remain separate gates.

Approved scope: src/{itemPaneManager,flowData,statistics,dashboard}.ts;
addon/dashboard.{xhtml,css}; English locale; their regression tests; this
contract and docs/STATISTICS_CLARITY_VERIFICATION.md. Build outputs are declared
for observed deterministic ORRO execution, not committed release artifacts.

## Approved panel readability follow-up — 2026-10-24

After inspecting actual personal Zotero captures, the user authorized reducing
explanatory prose and making status/dates/position immediately scannable,
followed by native capture verification, PR merge and personal installation.

Default surface: resolved automatic or manual status and independent Important,
aligned last activity/first recorded dates using YYYY-MM-DD with local minute
precision for the recent activity, validated saved position and matching-PDF
maximum, explicit PDF identity and Resume/Open. Keep a short qualification that
positions are not pages read and older activity may be missing. Move legacy
status/retention/support explanations into About this record; keep damaged,
unsupported, read-only and actionable target failures visible. Unknown maxima
remain unknown. Existing selection/generation guards, queued mutations and
shared target revalidation remain unchanged. No persisted schema, writer,
tracking policy, preferences, model or permission changes.

Scope: src/itemPaneManager.ts, test/itemPaneManager.test.ts, this authority and
docs/PANE_CLARITY_VERIFICATION.md; generated build/test artifacts are allowed
only for deterministic observed ORRO verification, not as committed outputs.


## Approved PDF location truth follow-up — 2026-10-24

The user authorized correcting unavailable-file wording, eliminating the
original-file maximum from an alternative PDF disclosure, and removing the
completion-like 100% value from the item pane, followed by native screenshots,
PR merge and personal installation while preserving existing data/settings,
models and permissions. Display known maxima as PDF page positions; ambiguous
records stay unknown. An unknown page count must not imply the PDF end, and
fractional positions must not round up to 100%. The selected/resolved PDF is the
only file whose position can appear in the pane; no second unscoped maximum in
the disclosure. Inaccessible files say PDF unavailable, not No PDF.
Scope: src/itemPaneManager.ts, test/itemPaneManager.test.ts, this authority,
docs/PDF_LOCATION_TRUTH_VERIFICATION.md. No writer, tracker, schema, model or
permission change; no public release/tag. Generated verification outputs only
are allowed for deterministic ORRO replay.


## Approved cross-surface consistency patch — 2026-10-24

The user authorized patching the observed statistics/list inconsistencies.
Use one conservative interpretation of ambiguous historical values in daily
and period views; unknown is not 100%. Show PDF positions as pages when counts
are known, including list accessibility/tooltip and daily/period statistics.
Distinguish first/latest daily maxima from an accumulated maximum. Display
activity timestamps in local YYYY-MM-DD HH:mm across the pane/list/statistics;
retain explicit missing timestamps and current status/manual source labels.
Scope: src/{flowData,itemPaneManager,columnManager,statistics,dashboard}.ts,
their regression tests, addon/dashboard.xhtml and the English dashboard heading
locale, this authority and docs/SURFACE_CONSISTENCY_VERIFICATION.md. No writer,
tracker, schema, preference, model or permission changes. Verify native captures,
PR merge and personal add-on update under the existing installation contract.
Generated build/test outputs are allowed only for observed ORRO verification.


## Approved pane refresh fix — 2026-10-24

The user authorized fixing the native pane that remains at Checking PDF
availability after sidenav navigation until an extra scroll. Every rebuilt
Reading Flow body must resolve its PDF facts without depending on another
visibility callback. Preserve selection/generation invalidation, write queues,
status/position/date semantics and read-only rendering. Scope:
src/itemPaneManager.ts, test/itemPaneManager.test.ts, this authority and
verification documentation. Run RED/GREEN, full verification, deterministic
ORRO replay and native test-profile captures, then PR/CI merge and the exact
verified XPI update in personal Zotero. Preserve data/settings/models/permissions;
no public release or tag. Generated build/test outputs only for verification.
