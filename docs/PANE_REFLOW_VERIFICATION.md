# Narrow pane font reflow verification — 2026-10-24

Actual Zotero 10.0.6 with the installed PR26 XPI, native dark mode, 320 CSS px
item pane and font scale 2.00 showed an activity date on three lines and PDF
positions on two. Normal-size dark mode retained readable two-column facts.
The horizontal scrollbar of the whole native item pane is not attributed to
Reading Flow without isolating its other native sections.

Each fact now groups its semantic dt/dd pair in a wrapping flex row. Labels and
values share a row when their inherited-font widths fit, and use separate lines
when they do not. The paired rows cannot interleave facts at wider widths.
PDF filename ellipsis retains its full accessible text/title. No values,
metadata writers, selection guards, lifecycle or actions change.

The native baseline capture is retained locally at
outputs/zotero-issue-16/acceptance-followup/dark-200-panel.jpg.
Engineering: npm run verify passed all 287 tests with no skips or failures,
TypeScript, XPI build and package validation. The existing pane regressions
retain no-write viewing, exact values, stale-target handling and actions.
Native candidate acceptance passed at font scale 2.00: every activity date and
PDF position occupied one full line beneath its label. Manual Read, Important,
2026-10-24 14:34, first recorded 2026-10-18, saved 3/10 and farthest 9/10
remained unchanged; Resume was keyboard-reachable with its exact filename/page.
At font scale 1.00, the same 320 CSS px pane retained readable two-column facts
and the Resume button. Actual captures: reflow-200-facts.jpg and
reflow-normal-panel.jpg under the same local evidence directory. These are
native Zotero font-size tests, not browser page zoom or VoiceOver speech tests.

Test Extra records matched the untouched fixture after normal shutdown. Personal
database, preferences, profile selection and installed XPI hashes remained
unchanged throughout test isolation. Only the test profile had theme/font/window
preferences changed. The capture transport initially returned stale content;
AX section collapse, keyboard focus and native window zoom recovered fresh
actual pixels. No crash or data mutation was inferred from transport errors.

Deterministic ORRO single shell-lane replay and Depone proofcheck passed with
one lane and zero errors. Source bytes match that replay; only this verification
note was extended afterward. This is local replay evidence, not independent
review or a trust anchor. No public release/tag. VoiceOver speech, actual
multi-client sync and unrelated native item-pane overflow remain outside this
bounded acceptance. Personal installation is recorded locally after PR/CI merge.
