# Reading Flow PR1–4 integration assessment — 2026-10-24

All four approved changes are implemented and verified in source/synthetic
fixtures as one unreleased change set. Native Zotero and human acceptance are
pending. The authority remains `READING_FLOW_AUTHORITY.md`; this document is a
verification result, not a second implementation plan.

## Per-PR result

| PR | Engineering result | Evidence |
| --- | --- | --- |
| PR1: status and PDF locations | Pass: no automatic Read; manual judgment wins; current and maximum locations differ; unavailable records are excluded from classifiable status denominators; activity dates share their local-day interpretation. | `PR1_VERIFICATION.md`, `pr1Semantics.test.ts`, flow/statistics/column/dashboard tests rerun. |
| PR2: predictable PDF actions/reset | Pass: shared file/page/action resolution and execution revalidation; no guessed Resume page; reset preserves manual status, importance, actual last activity and history. Unavailable metadata now explicitly says its saved page cannot be read. | `PR2_VERIFICATION.md`, resume/menu/dashboard regressions and pane cross-entrypoint fixture. |
| PR3: independent importance | Pass: Read and Important coexist; independent changes/clear/reset preserve the other property; legacy importance does not restore unknown manual stages; v3 writing is guarded. | `PR3_VERIFICATION.md`, `pr3Importance.test.ts`, actual pinned writer experiment rerun. |
| PR4: native item-pane implementation | Pass in source/fixtures: official lifecycle hooks, same-section menu entry, direct independent controls, evidence-only dates, read-only review, target and selection-race safeguards. Native/human acceptance pending. | `PR4_VERIFICATION.md`, `itemPaneManager.test.ts`. |

## Ordinary tasks and contradiction review

| User task / boundary | Result established by executable fixtures and source review |
| --- | --- |
| Jump to the end and return | Automatic Reading only; the last saved page returns to page 1 while the maximum stays at 100%; no completion date is fabricated. |
| Mark an item Read after reading selected parts | Manual Read appears in column, pane and statistics even at an early page. Basic dashboard does not claim remaining reading work or first completion. Existing historical fields are preserved. |
| Mark a Read item Important; clear either property | Stage and flag stay independent. Status buckets remain disjoint; Important only intersects the chosen stage. Direct pane changes update actual column provider and dashboard bridge results. |
| Return to a displayed PDF | Menu, dashboard and pane produce the same filename, page and label through ResumeReader. The displayed action is revalidated before explicit opening. Rendering and selection do not open anything. |
| Delete one of multiple PDFs | A stale displayed target fails closed. A refreshed alternative is Open PDF without borrowing the deleted PDF's saved page. |
| Reset positions | Confirmation explains scope; current/max locations clear while manual stage, importance, activity date and retained history survive. Opening changes to Open when the plugin no longer knows the page. |
| Inspect absent versus unreadable records | No-record is distinct from damaged/duplicate/unsupported metadata. Invalid data is not rewritten, migrated, counted as Unassigned or presented as editable. Shared Open reason acknowledges an unreadable saved page. |
| Find a first activity date | Earliest retained activity day or genuine legacy last activity; never container creation, manual status, reset or an invented timestamp. The date is visibly qualified as surviving evidence with a 366-day/legacy limitation. |
| Open a legacy Important record | Flag remains; unknown previous manual stage is not reconstructed. Pane explains this limitation; genuine PDF evidence alone can derive Reading. |
| Use an older writer | Actual pinned baseline refuses canonical v3 for both flag values across eight mutation APIs, retaining bytes. v2 and version-downgrade positive controls establish guard sensitivity. This does not prove every unknown old client safe. |
| Inspect a book/EPUB/read-only item | Book parent may hold manual stage/importance. EPUB positions are explicitly unsupported. Read-only items can be inspected/opened, with setters/saves blocked. |
| Switch items during lookup, edit or opening | Generation/item guards discard stale UI results and detached-control changes. Shared target execution rechecks identity and attachment association. |

All existing reset/batch-confirmation/concurrent-Extra-writer/default-status,
activity-cache/filter/scope/day-detail, density/layout and read-only regressions
were included in the complete suite. No duplicated metadata writer, attachment
resolver, user-tag system, completion/reread schema, AI, timer or score was
added. Activity container timestamps remain unrelated to actual reading start.

The actionable review fixes are recorded in PR4 verification. No unresolved
source-level contradiction was found in these inspected scenarios. This is a
bounded engineering assessment based on mocks, deterministic fixtures and
source review; it is not proof of native integration or user comprehension.

## Final verification and limits

`npm run verify` passed: TypeScript, 270 tests, XPI build and package verifier.
The standalone pinned old-writer experiment passed its 16 refusal checks and
positive controls. Baseline Git history is available; parent CI fetch-depth 0
is retained. Source/packaged XHTML validation, package/source equality and
diff whitespace checks passed. No push, merge or release was attempted.

Public release remains blocked on disposable native acceptance across all four
PRs, actual supported-client sync acceptance, and human task/legibility checks
including keyboard/VoiceOver, narrow panels, 200% zoom and dark mode. Unknown
old writing clients must be upgraded or disabled; the pinned refusal result is
not a blanket compatibility claim. No real profile/configuration/model or
permission changes, file-browser preview or browser-sandbox bypass occurred.
