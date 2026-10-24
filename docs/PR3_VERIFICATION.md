# PR3 verification — 2026-10-24

Scope: approved PR3 only, following the 2026-10-24 authority supersession and
completed PR1/2 source. PR4 was not started. No real profile, model/permission
configuration, push, merge, public PR or release was changed or performed.

## Implemented semantics

`ReadingStatus` contains only manual stages. `important` is independent;
Read + Important survives changes to either value, manual-status clearing,
PDF observation and position reset. Mark/Clear Important use the common queued
DataStore and menu batch path, with parent deduplication and editability checks.
Importance alone creates no activity, history, first completion or PDF position.
Zotero tags are untouched; DataStore writes only its namespaced Extra line.

Legacy `s=important` is interpreted as a flag with no manual stage. Previous
manual Read is unknowable. Genuine PDF evidence can derive Reading, labelled
PDF activity based in columns and dashboard rows. Neither progress nor old
completion markers restore manual Read. Legacy historical Important rollups
and existing completion metadata remain in their original history schema.

Version 3 adds only an `important` boolean, with manual stage/null in `s`.
Reads, startup and no-op commands do not migrate metadata. An explicit importance
change, or a manual-stage mutation needing to retain legacy importance,
transitions that item to v3. A same-value importance command is a no-op.
Background PDF updates and position-only resets keep legacy importance encoding
until an explicit transition. Existing v3 remains v3 on subsequent supported
writes, including importance=false. There is no bulk migration or new
completion/history schema. Malformed, duplicate and unsupported records remain
unavailable and unwritable rather than being converted into empty records.

Status, Compact and Icons columns show stage and importance together, with full
ARIA/tooltip text. Column IDs, registration defaults, layout ownership and native
sorting contracts are preserved. The dashboard has disjoint stage buckets,
a separate matching importance count, and an independent Important only
checkbox that intersects the existing status/scope/dataset/range. The same
filtered selection bounds history and the activity-day cache. New-item status
settings omit Important; an existing legacy Important default is inactive
without rewriting that preference.

## Actual pinned old-writer experiment

Reproduce with `node scripts/verify-pr3-compatibility.js`. This is also executed
by `test/pr3Importance.test.ts` in the normal unit suite.

The script retrieves unmodified `dataStore.ts`, `flowData.ts`, `lruCache.ts`,
`Logger.ts` and `preferences.ts` via `git show` from immutable baseline
`9afa71f5b75872e8e9f4acd490eeba7eb2d94c2f`, confirms its package version is
1.3.6, and bundles/executes that actual old DataStore separately from current
source. Temporary sources are removed afterwards. Only synthetic in-memory
Zotero items are used; there is no profile or network access.

Current source creates Read + Important v3 records and then both true and false
flag variants. Copying exact Extra strings models metadata delivery between
clients. Each old operation runs against a fresh item/store after old-client
read access:

- `updateData`, `setStatus`, `clearManualStatus`, `resetProgress`;
- `restartAsToRead`, `initializeStatusIfUnowned`, `recordProgress`,
  `recordProgressUnlessResetAfter`.

Result: **16/16 refusals**, returning false, with **zero Extra setters, zero
saves, exact byte retention**, and correct stage/flag after a supported client
reads the result. Thus this proves writer refusal, not merely new-parser
compatibility. A v2 positive control proves the old writer is operational.
A guard-sensitivity control changes only v3 to v2: the SAME old status writer
then succeeds and drops importance, proving why the guard is required. Supported
new-client status/PDF round trips retain v3 and both boolean values.

This is evidence for the pinned v1.3.6 baseline only. It does not prove old-client
display correctness, actual Zotero sync transport, conflict resolution outside
these DataStore APIs, or safety of unknown ancient writers. All clients that
need full functionality must upgrade to the coherent v3-capable release.
Unknown old writers must be upgraded or disabled; a demonstrated baseline can
only refuse v3 mutations. Never downgrade the metadata version to bypass the
guard. `docs/RELEASE.md` records these upgrade and release conditions.

## Exact checks

- `npm ci` — exit 0; dependency installation only, no manifest/lockfile edits.
- Final `npm run verify` — exit 0; TypeScript passed; **257 tests passed,
  0 failed, 0 skipped**; build passed; `verify-xpi: OK (12 files)`.
- `node scripts/verify-pr3-compatibility.js` — exit 0, 16 refusals plus both
  positive controls and supported-client round trips.
- `xmllint --noout addon/dashboard.xhtml addon/prefs.xhtml` — exit 0.
- Extracted final XPI XHTML into ignored `tmp/pr3-xhtml/`, asserted byte equality
  against source, and ran `xmllint --noout` on both packaged XHTML files — exit 0.
- `git diff --check` — exit 0, including final documentation.
- Final local XPI SHA-256:
  `fd8bde91f707aed2e76f980471bfd2545db824ef29ca21d63fd23010bd79ddeb`.

Regression coverage includes independent status/importance changes and clears,
legacy Important with/without PDF evidence, no read-time writes, no-op writes,
legacy background encoding retention, history preservation, unknown/future/bad
records, importance-only reading-set enrollment, stage/flag count intersection,
filtered activity-cache rows, queued mutations, read-only writes, tags/unrelated
Extra preservation, menu parent deduplication, all column densities and ARIA,
dashboard refresh/stale labels and PDF-based row explanations. Existing bulk
confirmation/concurrent Extra/PR1/PR2 regressions remain green.

## Ordinary user scenario review and fixes

Performed source and executable synthetic-fixture walkthroughs, not participant
testing or native visual acceptance:

| User action | Observed fixture result / fix |
| --- | --- |
| Mark an already Read item Important, then clear importance | Read and saved positions survive both changes; flag is independent. |
| Change/clear the status of an Important item | Flag survives; automatic Reading is explicitly PDF activity based. |
| Inspect legacy Important with no PDF evidence, or only a maximum endpoint | No read writes, no restored Read; Unassigned or evidence-based Reading. |
| Inspect an importance-only item | Visible star plus accessible Unassigned/Important; compact text says no PDF activity recorded. |
| Find Read items that are Important | Separate checkbox intersects Read; stage chart remains disjoint; history/day detail use that same subset. |
| Refresh while Important only is selected, then fail refresh | Exactly one listener/request per change; stale snapshot names its actual importance filter. A repeated-listener defect found during implementation was fixed. |
| Use native context menu/reset | Importance commands were grouped separately from manual stages. Reset confirmation explicitly says importance is preserved. |
| Edit a read-only/unsupported item, or use a pinned old writer | No write; supported source does not erase unknown metadata. Pinned old-writer refusal is demonstrated above. |

No code reads or writes Zotero user tags for importance, and fixture tag arrays
remain unchanged. No source/model/permission configuration changes or profile
operations were used to make these checks pass.

## Pending release acceptance

No disposable native Zotero session, real sync pair or human task study was run.
Native menu rendering, real item-tree layout/sort and star visibility at narrow
widths, keyboard/VoiceOver, 200% zoom/dark appearance, group-library read-only
behavior, restart/reload, and sync between supported clients and the demonstrated
refusing baseline still require release acceptance. PR1/2 native/human gates
also remain pending. These are public release gates, not blockers to the
completed authorized PR3 source implementation. PR4 remains unimplemented.
