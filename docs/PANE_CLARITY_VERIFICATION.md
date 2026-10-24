# Compact Reading Flow pane — 2026-10-24

Baseline: 935364b / PR22. Actual native screenshots showed repeated caveats,
locale-mixed dates and a selected Automatic (clear manual status) option that
mixed the current state and an action. This follow-up is scoped to the pane.

The default summary groups state/Important, date facts, validated location and
maximum, PDF and action. Automatic choices name the derived state; manual
choices explicitly say manual. Dates use local YYYY-MM-DD HH:mm / YYYY-MM-DD.
Legacy loss, retention and PDF-only support explanations are in About this
record; critical unavailable/read-only/target reasons stay visible. A short
position/history qualification stays beside the facts. The PDF filename uses
ellipsis with its full title and action accessibility name intact.

RED: the compact-summary regression failed against the old Automatic label.
GREEN: 277 tests passed, including compact legacy display with zero saves,
ambiguous-maximum handling, manual/automatic transitions, unavailable/read-only
records, attachment changes, stale selection, target execution and lifecycle.
Typecheck, build and XPI package verification passed. Bounded native results follow below; publication and personal installation
are separate from these checks. No persistence/writer or
tracking policy change is part of this work.

## Actual Zotero acceptance

Zotero 10.0.6, disposable profile, exact XPI SHA256
`387b58e5f5dc914a7c599e73b5e0dbd1c82faf840bc488b581d6ba56e81e0060`.
The actual native capture shows state/Important together, aligned date and
position facts, file identity, short Resume, and collapsed explanations in one
screen. Saved position Page 3 / 10 and maximum 90% remain distinct.

Selecting Reading (automatic) committed s=null; selecting Read (manual)
committed s=read. Important=true, lastPage=3, p[2]=0.9, pageCount[2]=10,
lastReadAt and first activity 2026-10-18 survived both changes. Resume opened
that PDF at page 3 / 10. After normal quit a read-only SQLite query confirmed
those stored values. No personal record was used for mutation tests.

Original native captures are retained locally under the task outputs:
pane-clarity/test-panel.jpg, test-automatic.jpg and test-resume.jpg, with an
unaltered crop test-panel-closeup.png. An initial stale screen transport and
noWindowsAvailable failure was resolved by user foregrounding the test pane;
stale captures were not counted as acceptance. Native option activation was
verified through the exposed menu and stored Extra value, not a preview label.

Deterministic ORRO replay passed the full verification. Wrapper proofcheck:
pass, error_count=0; handoff produced. Replay source and test SHA256s match the
candidate. This is self-signed local evidence, not independent review or native
attestation. This verification record was completed after replay (docs only).

This is a bounded macOS native trial, not a participant comprehension study,
VoiceOver/200%/dark-mode certification or cloud-sync release approval. No public
release or tag is requested. Only the existing add-on XPI is to be updated in
the personal profile after the authorized PR merge, with at-rest integrity
checks against the personal baseline.
