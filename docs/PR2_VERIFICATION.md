# PR2 verification — 2026-10-24

Scope: approved PR2 only. PR1 source/tests were already complete. PR3/4,
profile/config/model/permission changes, push, merge and release were not performed.

Implemented one serializable Resume/Open/none target and validated execution
API for the menu, both dashboard row surfaces, and future panel reuse. Each
available action identifies its PDF and its own saved page; unknown pages use
Open PDF with an accessible explanation that Zotero chooses the position.
Execution revalidates source, PDF identity, parent association, deletion,
position, file availability when exposed by Zotero, and selection after async
resolution. A stale displayed target never silently opens its replacement.
Saved-page opening failure no longer retries an unspecified position.

Advanced → Reset tracked PDF positions explains and confirms the scope before
execution. Current and maximum tracked positions are cleared; manual status,
genuine last PDF activity, and historical rollups survive. Reset-only data
never fabricates activity. Existing bounded reset-history recording remains.
Status changes retain positions. The common Restart as To Read command is
removed. Read-only PDFs can be queried/opened while mutations are disabled and
also rejected by the mutation path.

## Exact checks

- `npm run verify` — exit 0: TypeScript passed; **244 tests passed, 0 failed,
  0 skipped**; build succeeded; `verify-xpi: OK (12 files)`.
- `xmllint --noout addon/dashboard.xhtml addon/prefs.xhtml` — exit 0.
- Extracted XHTML from the generated XPI into ignored `tmp/pr2-xhtml/`;
  `xmllint --noout tmp/pr2-xhtml/dashboard.xhtml tmp/pr2-xhtml/prefs.xhtml`
  — exit 0.
- `git diff --check` — exit 0 (rechecked after documentation updates).
- Local XPI SHA-256:
  `e9b095bbbc89302fb13ba35df438af46f4802634ae5b6d9f2de6ba3d4ddf1e59`.

Regression evidence includes same-parent PDFs without page borrowing, invalid/
missing/non-PDF/wrong-parent tracked attachment fallback, file-specific page
counts, deleted displayed targets, delayed resolution with selection change
and deletion, missing local files, read-only Open versus blocked mutations,
shared dashboard accessible labels and explicit-only execution, stale menu
selection, reset preserving activity/manual status/history, status preserving
positions, reset queue cutoffs and unrelated Extra conflict protection.
Older one-ID-only fixtures were expanded to model Zotero resolving both the
source item and the target attachment during execution validation.

## Ordinary user-perspective review

Performed a source and executable fixture walkthrough of “which file/page will
open?”, “no saved page”, “the attachment disappeared”, “selection changed”,
“view a read-only PDF”, “mark Read”, and “clear positions”. Findings fixed:
unknown position was disabled Resume in the menu; dashboard labels always said
Resume; saved-page failure silently opened without a location; reset removed
the activity timestamp; reset lacked a scope confirmation and Advanced grouping;
read-only status commands lacked disabled presentation. Regressions cover the
resulting behavior. No action occurs from rendering, refreshing, or resolving
a target; activation is required. This review is an engineering walkthrough,
not a participant study or native visual acceptance.

## Unrun acceptance gates

No disposable native Zotero profile was launched. Native MenuManager dynamic
labels/tooltips, file availability and Reader navigation, dashboard lifecycle,
real selection timing/deletion, group-library read-only behavior, reload and
restart still require direct native acceptance. No real user profile was touched.

Human task testing, VoiceOver/keyboard acceptance, normal/200% zoom, narrow
layouts and dark appearance remain unrun. No intuition/success-rate claim is
made. PR1's native/human gates also remain pending. These are public release
gates, not prerequisites to implementing the authorized PR2 source/tests.
