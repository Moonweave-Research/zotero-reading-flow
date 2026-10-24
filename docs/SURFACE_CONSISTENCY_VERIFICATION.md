# Cross-surface consistency verification — 2026-10-24

Baseline PR24. Actual personal Zotero review found an ambiguous historical raw
1 displayed as Unknown in the day detail but 100% in period endpoints. Native
panel/list/current values were consistent; statistics labels and date precision
were not. This patch uses common PDF-location and local activity-time formatting
across native pane, list and statistics. Daily maxima are conservatively
normalized for both day and period views; unknowns prevent a comparison.
Endpoint labels explicitly name daily positions, which may decrease on a later
day. Last-page bucket denotes a PDF location, not Read. Marked Read remains a
manual status, independent of PDF location. No data writer or tracking change.

Recipe: baseline RED for the ambiguous-one regression, focused and full tests,
typecheck/build/XPI/diff checks, deterministic ORRO replay/proofcheck, then actual
Zotero captures of list/pane/statistics with matched fixtures. Personal install
only after reviewed PR/CI merge, replacing only the existing XPI with at-rest
hash/count checks. Native results follow. Final personal installation is recorded locally after merge.


Verified results:
- Baseline RED: ambiguous raw-one history failed the period/day consistency regression.
- Final `npm run verify`: 286 tests passed, no failures or skips; TypeScript,
  build and packaged-XPI verification passed. `git diff --check` passed.
- Deterministic ORRO final replay/proofcheck passed with zero errors. This is
  locally signed replay evidence, not an independent trust anchor or UI attestation.
- Actual Zotero 10.0.6, isolated profile, final tested XPI SHA-256:
  `45057814c2ee8cb51ee28c78d39548d9137df3eea432baad2a361acf4c2e04fa`.
- QA reading: saved 3/10, farthest 9/10; Read (manual), Important,
  activity 2026-10-24 14:34 agreed across list, pane and statistics.
  Period endpoints showed Page 1/10 to Page 9/10; day detail showed Page 9/10.
- Ambiguous-history fixture: saved 10/10 remained Reading (automatic), Important,
  activity 2026-10-24 15:46. Day detail showed Unknown; period comparison showed
  an em dash. Current resume still correctly targeted page 10/10. No inference
  that the ambiguous historical raw-one meant a known last page was made.
- Distribution explicitly showed Last page of PDF; status composition separately
  showed one Reading and one Read. Distribution percentages are item shares.
- Native review found centered long dates could lose their leading year in narrow
  list columns. Left-aligned ellipsis now retains the year prefix and full date
  remains in tooltip/accessibility. Existing column widths were preserved; narrow
  user-selected columns still truncate visible text by design.
- Captures retained locally under outputs/zotero-issue-16/surface-consistency:
  test-statistics.jpg, test-statistics-day.jpg, test-statistics-distribution.jpg,
  test-list-panel.jpg, with accessibility snapshots. No mockups used.
- Test Zotero was quit normally and its disposable database restored from its
  pre-fixture backup. Personal data was not used for synthetic tests.
- No writer/schema migration, tracker threshold, model, permission, preference,
  release tag or public release change. This remains the 1.3.6 local build.
