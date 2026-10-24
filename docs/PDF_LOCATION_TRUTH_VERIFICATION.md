# PDF location truth — 2026-10-24

Baseline: PR23 / 65a75eb. Corrected the two review reproductions in the native
item pane. Inaccessible/no-accessible-target says PDF unavailable; the optional
disclosure no longer repeats an unscoped original-PDF maximum for an alternative
PDF. The resolved PDF maximum uses page positions when page counts are known.
Ambiguous maxima stay unknown, including raw 1 without a known page count.
Unknown-count fractions use an explicitly approximate PDF position, floored so
a value below one never appears as 100%. This is display only.

Verification recipe: demonstrate failures against baseline, focused pane tests,
full npm run verify, diff check, deterministic observed replay/proofcheck, actual
Zotero disposable-profile captures of saved/max positions and error cases,
then PR checks/merge and same-XPI personal installation with at-rest file/count
integrity checks. Native results follow; personal installation remains separate from source checks.


## Verified results

- Baseline substitution of the original pane failed seven assertions (16/23
  passed), including the two reported exceptions, page-position summary and
  sub-100 rounding. The original malformed v3 fixture was corrected to include
  its required Important field before this baseline run.
- Candidate: focused pane 23/23, full verification 282/282 tests, zero skips or
  failures; typecheck, build, XPI verification and diff checks passed.
- Actual Zotero 10.0.6 disposable profile, XPI SHA256
  c0f4b8cfc9bdb5717cb4ebc9b9e435ae94f18702c85c2975ef0240aaee7f519f:
  attached PDF with its local file temporarily withheld and no record displayed
  PDF unavailable (not No PDF). A separate saved-position record with missing
  bytes displayed Unavailable with an explicit accessibility reason.
- A synthetic old attachment ID with 37% and an accessible alternative PDF
  displayed Unknown and Open PDF, and the expanded disclosure did not contain
  the old maximum. The old original value remained in Extra; viewing did not
  rewrite the fixture.
- An end-position fixture displayed Page 10 / 10 for saved and farthest
  positions, with Reading (automatic), Important, and the PDF-position
  qualification. The pane contained no 100% value. Resume opened the same
  synthetic PDF at page 10 / 10, verified in the native Reader page field.
- Original full native JPG captures and unretouched crops are retained locally
  in task outputs/zotero-issue-16/position-truth: test-missing-no-record,
  test-alternative-details, test-end-position, test-resume-end. Test profile
  records and the withheld PDF were restored after normal quit. No personal
  metadata was changed for these tests.
- ORRO deterministic replay completed; wrapper proofcheck decision=pass,
  error_count=0, one shell lane, followed by handoff. Candidate source/test
  hashes equal replay. This is self-signed local evidence, not independent
  review or native attestation. This results section was added after replay.

Scope remains the native item pane. Existing statistics/column maximum-position
metrics retain their separate explicit PDF-position labels; their persistence
and calculations are unchanged. No actual-reading/understanding/completion
inference was added. This bounded trial is not participant comprehension,
VoiceOver/dark-mode/200%-zoom or cloud-sync certification. No public release/tag.
Personal installation after merge updates only the pre-existing add-on XPI and
compares at-rest database, prefs.js, profiles.ini and record counts before the
personal app is relaunched. Existing add-on backup is retained locally.
