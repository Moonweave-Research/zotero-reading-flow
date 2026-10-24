# PR1 verification — 2026-10-24

Scope: proposed PR1 in the approved 2026-10-24 supersession of
`docs/READING_FLOW_AUTHORITY.md`. Baseline HEAD:
`9c98b8be999852c6f9f83170d781317a82751bfd`.
This is an implementation/verification record, not a second product authority.
PR2, PR3, and PR4 were not implemented. Nothing was pushed, merged, or released.

## Implemented contract

- Manual `s` values retain precedence, including Read and Important. Observed
  PDF activity can yield automatic Reading, never automatic Read. Status/reset
  timestamps and `history.startedAt` do not establish PDF activity.
- Shared availability distinguishes no record, interpretable state, and
  unavailable state. Malformed, duplicate, unsupported-version, invalid-status,
  damaged-history, and damaged-timestamp records remain unavailable; mutations
  refuse them. Namespace detection also protects damaged lines without the
  usual separator space. Read-only interpretation does not rewrite Extra.
- The original dataset scope reports T = K + U. Normal empty records and
  untracked inventory items belong to K/Unassigned. Status filters report their
  matching count separately from T; status percentages retain K as denominator.
  PDF-position percentages use classifiable matching items. Unavailable items
  have a dedicated filter and never enter Unassigned or position buckets.
- Detailed and composite columns distinguish the saved current PDF page from
  the maximum position. Missing current position is unknown even if a maximum
  exists. Page 1 without a page count is a page, never 100%. Column IDs,
  registration persistence keys, native visibility, and layout ownership stay
  intact; headers now say PDF Position and Last PDF Activity.
- Last PDF Activity display and sort keys share the latest persisted PDF
  observation timestamp, including retained daily activity evidence. Older
  date labels use the local calendar rather than UTC. Missing dates remain
  unknown instead of being called “never read”.
- Default dashboard remaining-page and first-completion cards/trend, calendar
  completion announcements, completion colors, and completion buckets are
  removed. Neutral position buckets run through 75–99% and 100% PDF position.
  Generic dashboard wording says Items. Preferences no longer promise automatic
  Read or offer obsolete position/completion color controls. Stored preference
  keys/values are retained; no live preference was changed.
- New PDF observations do not create completion history. Existing manual
  states, `completedAt`, day completion flags, and history are preserved; no
  schema migration or replacement completion system was introduced. Internal
  compatibility statistics still carry legacy completion/remaining fields;
  the default dashboard does not render them or claim they measure reading.
- A proven exact endpoint is stored as a page-based maximum when its page
  count supports that representation. 100% → page 1 preserves the maximum;
  98% → page 1 does too. An ambiguous legacy raw `1` remains unknown, including
  after a subsequent non-endpoint observation. Reaching a proven endpoint can
  establish a maximum without guessing the past.

## Regression and user-perspective review

New `test/pr1Semantics.test.ts` exercises real DataStore transitions and the
shared statistics projection. Existing column/dashboard/history tests were
updated for the approved semantics, retaining lifecycle, explicit-action,
keyboard, race, layout-ownership, and persistence safeguards.

| User task / failure path | Observed fixture result and review fix |
| --- | --- |
| Jump to 98% or 100%, then return to page 1 | Automatic Reading; saved page 1; maximum retained; no new completion |
| Mark selected sections Read | Manual Read survives later PDF activity; current position remains independent |
| Inspect old raw `1` | Maximum unknown; no guessed 1%/100% recovery; subsequent current position can be displayed separately |
| Compare untouched and unreadable records | Empty/Unassigned versus unavailable across statistics, filters, detailed columns, composite tooltip/ARIA |
| Filter a mixed T=7, K=3, U=4 scope to Read | One matching item; original scope retained; Read bar 1/3 (33%), not 1/7 |
| Inspect a saved page without a total | Page label with unknown count; no percentage bar, including page 1 |
| Inspect legacy To Read with missing current position/date | Unknown position/date remain explicit; a manual label does not hide them |
| Change a status or review reset history | No invented PDF activity date from status/reset timestamps; retained observations can supply the activity date |
| Inspect at a local date boundary | Asia/Seoul regression shows local 2026-10-02 for 2026-10-01T16:00Z |
| Open/refresh/filter/select a calendar day | Existing fixture tests retain explicit-only Show in Zotero/Resume behavior; no automatic action added |
| Inspect malformed data and attempt a write | Exact original Extra retained and save count zero |

The review caught and fixed completion claims in calendar ARIA/preferences,
missing-position fallbacks to maxima, unknown-total page-one percentages,
misleading To Read shortcuts, UTC date labels, and damaged history being
normalized into writable empty state. These are synthetic task/DOM checks,
not participant usability results.

## Machine gates

Environment: Node v22.23.2; npm 10.9.8. Dependencies installed with
`npm ci --ignore-scripts` (exit 0; 7 packages; package/lock files unchanged).

| Gate | Exact result |
| --- | --- |
| `npm run verify` | Exit 0; typecheck passed; 238 tests passed, 0 failed, 0 skipped, 0 cancelled; build passed; `verify-xpi: OK (12 files)` |
| Source XHTML | `xmllint --noout addon/dashboard.xhtml addon/prefs.xhtml` — exit 0 |
| Packaged XHTML | Extracted both XHTML files from the final XPI; `xmllint --noout` on both — exit 0 |
| Source/package identity | `cmp` for dashboard.xhtml and prefs.xhtml — both exit 0, byte-identical |
| `git diff --check` | Exit 0, no output |

Final verification log: local ignored `tmp/pr1-review/final-verify.log`.
Packaged XHTML evidence: local ignored
`tmp/pr1-review/packaged-dashboard.xhtml` and `packaged-prefs.xhtml`.
Final XPI SHA-256:
`f91e2151570d54138b82542667c8128429f2b733f7fbec43f77b955f4778a0c7`.
The built XPI and update manifest are local ignored build outputs, not a
published release. Earlier runs exposed stale assertions about old semantics
and an intermediate type error; these were corrected before this final run.

## Render attempt and acceptance limits

A disposable web fixture was generated from the actual dashboard XHTML, CSS,
compiled dashboard bundle, and pure statistics snapshots. Local fixture and
attempt scripts are in ignored `tmp/pr1-review/` (`make-fixture.cjs`,
`dashboard.html`, `render.py`). The intended views were light 1280×900,
200% equivalent (640×450 CSS viewport, device scale 2), and dark 1280×900.

Command attempted:
`/opt/homebrew/opt/python@3.14/bin/python3.14 tmp/pr1-review/render.py`.
It exited 1 before a browser window or screenshot existed. Playwright raised
`TargetClosedError`; Chromium reported
`bootstrap_check_in ... Permission denied (1100)` at
`base/apple/mach_port_rendezvous_mac.cc:155` (`SIGTRAP`). No rendered visual,
200% zoom, or dark-theme acceptance is claimed. Sandbox/permission settings
were not changed to bypass this failure.

No real Zotero profile, user library, configuration, model, or permission
settings were changed. No disposable native Zotero runtime inspection,
VoiceOver test, real item-tree layout/sort acceptance, human legibility check,
or participant test ran. Existing fixture layout/action checks and XHTML
validation cannot substitute for those gates. The artifact QA status is
**human acceptance required**. No release-readiness or native ORRO proofcheck
verdict is claimed. PR1 remains a reviewable local implementation; the
four-PR release contract remains in force.
