# PR4 verification — 2026-10-24

## Final native acceptance — 2026-10-24

Supersedes earlier pending-native notes below. Actual Zotero 10.0.6 ran with a
separate disposable profile/data directory and synthetic ten-page PDF. Personal
library data was not edited; model and permission settings were unchanged.

Observed: pane registration; manual Read independent of Important; clearing
manual state yields Reading even at maximum 100%; unsupported v99 disables
editing without rewriting; legacy Important remains without invented prior
state; Reader page 10 to 2 updates current page while retaining maximum 100%;
Resume opens the displayed file at page 2; normal restarts retain data.
Native review exposed stale Reader opening state, a blank Fluent menu label,
layout/date verbosity and false idempotent-save warnings; all were corrected.

The user executed Advanced > Reset tracked PDF positions on the disposable
fixture because native menu dispatch in the automation tool was unreliable.
Agent observation and read-only SQLite inspection after normal quit confirmed
empty positions, null last attachment/page, Important true, automatic Reading,
unchanged lastReadAt 1792811086288 and retained activity history. The pane
changed Resume to Open PDF with the correct explanation. Manual Read was not
set during this native reset; its preservation is covered by regression tests.
The test instance was normally closed after inspection.

Final executable code: 5a2ba1c027e76368fe36dfad8ecdb662bb0b99f1.
Local verify: TypeScript, 272 tests (0 failed/skipped), build, 12 packaged files;
XHTML and whitespace checks passed. GitHub verify checks passed on this head.
Test XPI SHA256: a07665495d2adbd4a738ae4f721d9e39fc53b63741167172442e3987b32d0fa5.
Manifest remains 1.3.6; this is a manual test build, not a public update.

Not certified: real multi-client cloud sync/group-library writes, spoken
VoiceOver/comprehensive keyboard-only use, native 200%/dark acceptance and
independent user comprehension. Multi/deleted PDFs and read-only behavior have
fixture coverage, not a complete native acceptance pass. These remain public
release gates; the four changes may merge as an unreleased coherent set under
the user's explicit merge authorization. No release/tag is authorized here.

## Earlier implementation evidence (historical)

PR4 is implemented in source and synthetic fixtures. Native Zotero and human
acceptance have not been performed. No public release, push or merge occurred.

## Implementation and API evidence

Read `docs/READING_FLOW_AUTHORITY.md`, including its approved 2026-10-24
supersession. Inspected the supplied read-only installed Zotero
`installed-itemPaneManager.js` and `installed-itemDetails.js` under
`/Users/choemun-yeong/Documents/Codex/2026-10-23/x20/work/zotero-issue16/`.
The installed API defines section register/unregister, init/destroy,
item-change, synchronous render and asynchronous render hooks. `onInit`
provides `refresh`; the installed item-details implementation uses
`scrollToPane`. No `ItemPaneManager.refreshSection` or invented focus API is
called.

`src/itemPaneManager.ts` owns only UI lifecycle and read projections. Startup
registers one section; shutdown unregisters it and all per-instance item
observers. Destroy invalidates pending results. Native menu entry scrolls to
that same section and rejects multiple/unsupported selections. Item-change
updates eligibility without rendering in that hook; synchronous rendering
builds controls, and asynchronous rendering obtains the shared PDF target.

The direct HTML select and labelled independent checkbox inherit native font,
colors and focus behavior; the English body explicitly sets `lang=en`. No
fixed height, custom colors or popup is introduced. Keyboard, screen-reader,
dark-theme and zoom behavior still need native acceptance.

Status/importance mutations use the existing queued DataStore APIs and their
editability/concurrency protections. The UI also checks hook editability,
parent eligibility and record availability, disables controls while saving,
and reports failed/refused changes in a status region. Stale controls and
async target results cannot affect a newly selected item. PDF actions use
ResumeReader's shared display and execution contract, including its final
target/selection validation. No attachment resolver or persistence layer was
added to the pane.

## Focused and integration evidence

`test/itemPaneManager.test.ts` exercises the actual registered hooks against a
small DOM fixture and the real DataStore/ResumeReader:

- Repeated registration, destroy/unregister/re-register, observer cleanup,
  notifier refresh, same-section menu focus and multiple-selection rejection.
- Repeated viewing with zero Extra setters, zero saves and zero Reader opens.
- Direct status and importance edits; independent Read + Important; endpoint
  jump/return; current versus maximum location; preserved activity/history on
  reset; automatic Reading after clearing the manual stage.
- Menu, pane and dashboard use the same filename/page/action; the actual column
  status provider and dashboard status/importance filters follow pane changes.
- Absent, damaged, unsupported and duplicate records remain unchanged. Invalid
  records disable edits and distinguish reasons; unknown saved-page reasons
  do not claim that a saved page is absent.
- Read-only inspection/opening without writes; a book with EPUB only retains
  manual controls and explicitly states the PDF-only tracking boundary.
- Multiple/deleted attachments, explicit alternate Open PDF without transferring
  the deleted file's page, rejected stale displayed targets, delayed selection
  results, detached controls, destroy during lookup and plain save errors.
- First activity DATE comes from actual activity days or a genuine legacy last
  activity timestamp. Status/reset-only days and `history.startedAt` never
  supply it. A real write prunes old evidence; read-only inspection does not.
  The date changes to the earliest surviving evidence and the original
  `startedAt` remains intact. Retention and legacy limitations are beside it.

Review found and fixed stale detached-control handling, invalid-record control
presentation, attachment-notifier refresh coverage, save-time notifier/control re-enabling and a shared PR2 reason:
when metadata is unavailable, Open PDF now says the saved page cannot be read,
rather than asserting there is no saved page. This reason is shared by menu,
dashboard and pane. No completion/reread/history schema was introduced.

## Executed checks

- `npm ci --offline`: passed; no manifest/lockfile changes.
- `npm run verify`: passed; TypeScript, 270 unit/integration tests, build and
  `verify-xpi` (12 packaged files).
- `node scripts/verify-pr3-compatibility.js`: passed against unmodified pinned
  baseline `9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f`: 16 old-writer refusals,
  zero setters/saves and exact bytes; functioning v2 writer, version-guard
  sensitivity and supported-client round-trip controls passed.
- Baseline object is locally available (`git cat-file -t` returns `commit`).
  Both parent CI checkouts retain `fetch-depth: 0`; no history fetch is needed
  during the experiment. CI itself was not run from this workspace.
- Source and extracted packaged dashboard/preferences XHTML passed `xmllint`;
  packaged XHTML equals source. Packaged bootstrap contains the pane section
  registration, and packaged locale contains its header/sidenav/menu labels.
- `git diff --check`: passed.

## Unrun acceptance

The repository's release-profile script checks an explicitly supplied profile;
it is not a disposable native UI launch/acceptance harness. No supported safe
disposable native workflow was established in this session. No real profile,
configuration, model or permissions were changed. No browser preview was
attempted, including file URLs, localhost rerouting or alternate-browser
workarounds for the previously rejected preview/Chromium sandbox failure.

Native restart/reload, actual item-pane selection transitions and multi-PDF
behavior, group read-only libraries, keyboard/VoiceOver, narrow widths, 200%
zoom and dark theme remain release gates. Human tasks must establish whether
users understand manual status, file/page targets and retained activity dates.
Fixture success does not constitute those acceptance results.

Native follow-up: actual Zotero showed detached Important label, verbose date notes and a misleading no-op save warning. Corrected block/flex layout, moved detailed qualifications into disclosure while keeping retention cue beside date, and suppress failure feedback only if requested stored state is already achieved. Added regression. Native recheck remains required.

Native PDF finding: Reader showed page 2 and Zotero reader-state pageIndex=1 while FlowData stayed page 10. Installed Zotero reader.js updates getAttachmentLastPageIndex before pageChange, whereas Reader._state may retain opening state. Tracker now prioritizes that updated public attachment value; the old misleading fixture is corrected to cached Reader index 399/current attachment index 1. Native retest required.

Native PDF follow-up: asynchronous SyncedSettings can remain stale at notification time; use PDFViewer currentPageNumber before attachment setting and cached Reader state. Regression models both stale values. Native PDF finding: Reader showed page 2 and Zotero reader-state pageIndex=1 while FlowData stayed page 10. Installed Zotero reader.js updates getAttachmentLastPageIndex before pageChange, whereas Reader._state may retain opening state. Tracker now prioritizes that updated public attachment value; the old misleading fixture is corrected to cached Reader index 399/current attachment index 1. Native retest required.
