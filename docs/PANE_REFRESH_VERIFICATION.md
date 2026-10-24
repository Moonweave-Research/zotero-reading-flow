# Pane refresh verification — 2026-10-24

Native personal Zotero review observed Checking PDF availability after sidenav
navigation until another scroll. A repeated synchronous body render resets the
facts, while Zotero schedules/deduplicates asynchronous section hooks separately.
The failing regression reproduces the reset without a second async callback.

The section now starts read-only PDF-target resolution whenever its body is
rebuilt. It no longer depends on a visibility-triggered async hook. Existing
item/generation guards reject stale results; mutation refresh awaits that same
render instead of starting a duplicate lookup. No tracking or writer changes.

RED: the new rerender-without-scroll test failed with Checking PDF availability.
GREEN: all 24 pane tests pass, including stale selection/destroy, queued writes,
failed saves and no-write viewing. Full npm run verify: 287 tests passed, no skips
or failures; typecheck/build/XPI validation passed.

Native acceptance: Zotero 10.0.6 with an isolated test profile and the exact
built XPI (SHA-256 b7c5ceab6b796f2658086baaa18bf9cb6c2a2114393228ad23948ee42756a49a).
After native sidenav book-icon navigation, with no extra scrolling, the panel
showed Read (manual), Important, 2026-10-24 14:34, saved 3/10, farthest 9/10.
Switching to a PDF-less item and back also resolved facts without a scroll.
Native screenshots/AX evidence are retained locally in outputs/zotero-issue-16/
pane-refresh. The tool initially returned stale captures/noWindowsAvailable;
after the user foregrounded the test window, the actual capture succeeded.
Test Extra records matched their baseline after viewing; test DB was restored.

Deterministic ORRO single shell-lane replay and proofcheck passed with no errors;
this is local replay evidence, not an independent reviewer/trust anchor.
Current source/test bytes match the passing replay. Only documentation was
updated with these results afterward. Personal installation is recorded locally
after PR/CI merge. No release/tag, model, permission, schema or
preference changes. The local patch retains internal version 1.3.6.
