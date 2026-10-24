# Statistics clarity and native pane entry — 2026-10-24

The baseline d2c70ef had a native no-op when View Reading Flow called
scrollToPane on a collapsed pane. The installed Zotero 10.0.6 API explicitly
returns null in that case. The action now opens the pane, renders and uses the
actual scroll result. A regression models that native behavior and proves
zero metadata writes; calling it again leaves the pane open.

The range delta formerly subtracted only the last two active days. The new
comparison uses the first and last recorded active days within the selected
period, only for a single consistent PDF with normalized retained positions.
UI shows first → latest maximum endpoints; automatic page positions are never
presented as pages read. Single-day/reset/mixed-PDF/ambiguous comparisons show
an em dash. Reset-only days invalidate comparison without becoming activity.

RED: original code failed native collapsed-pane and three-day range tests.
GREEN: focused 31 tests passed; full verify 275 tests, typecheck, build and XPI
verification passed. Includes range-boundary/read-only, existing unsupported
metadata, retained activity, state/Important and shared file-target guards.
The mechanical UI detector reported no findings. Native follow-up and final
PR/publication results are recorded after execution; this is not yet native
acceptance. Existing historical acceptance limits remain in PR4 verification.

## Observed actual Zotero 10.0.6

A separate test profile and synthetic ten-page PDF were used. The real context
menu was operated through screenshot-derived coordinates. With the item pane
explicitly collapsed, View Reading Flow expanded it and displayed the correct
section. There was no personal-library mutation test.

A synthetic three-day fixture (10%, 40%, 90% maximum; current page 3/10;
manual Read; Important) displayed Saved at page 3/10, 10% → 90%, three active
days, one active item and one Marked Read. The old calculation would have
shown only the last two days' 50 percentage-point difference. Filter items
expanded normally; Important only updated the visible active-filter summary.
The new hierarchy and readable buttons were inspected in the actual native
window. Final follow-up verified Activity period/Last activity labels and the
same first→latest result. Resume opened the actual synthetic PDF at page 3.
Normal quit/restart retained manual Read, importance, positions and history.
Read-only SQLite inspection after viewing matched the synthetic fixture.
After the explicit Resume action, state/importance/page/maximum remained intact.

275 tests passed (zero failures/skips), including the two failing baseline
behaviors and a first→latest endpoint rendering regression. Final deterministic
ORRO replay proofcheck passed/error_count 0 (self-signed local; not independent
AI review or native-UI attestation). XHTML, package and whitespace checks
passed. No storage schema, persistence writer, tracker policy or default
preferences changed. No additional source-level blocker found in the focused
review of period boundaries, mixed attachments, resets, target revalidation,
selection/lifecycle guards and native entry.

A native resize attempt did not change the window dimensions, so narrow-window
acceptance is not claimed. Native dark/200%/VoiceOver and real cloud sync were
not re-certified by this follow-up. Existing broader public-release gates
remain; this PR and manual personal trial do not publish a release.
