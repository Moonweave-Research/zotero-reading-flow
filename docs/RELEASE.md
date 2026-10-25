# Release process

The add-on version is recorded in `package.json` and `addon/manifest.json`. A merged PR does not publish a release or update installed clients; use the GitHub Releases page as the authority for the latest published version.

## Verify the candidate

Use Node.js 22, npm, Git with full history, zip, and unzip:

```bash
npm ci
npm run verify
git diff --check
```

Verification runs TypeScript checks, unit tests, the XPI build, package/update-manifest validation, and a pinned previous-writer compatibility check. Missing baseline Git objects are failures; do not substitute a parser-only test. See [verification](VERIFICATION.md).

Generated files (`addon/bootstrap.js`, `addon/dashboard.js`, `updates.json`, the XPI, and tmp/) stay out of Git. Never commit profile databases, personal screenshots, debug logs, credentials, or local paths.

## Check in a disposable Zotero profile

1. Install the XPI with Tools → Plugins → gear menu → Install Plugin From File…, then restart. Confirm the active version.
2. Show Bookmark / Last Viewed, Status, and Last PDF Activity through the native column chooser. Confirm the optional combined column and its Compact/Icons modes.
3. Choose each manual stage; check Important independently. Clear the manual stage and verify the automatic/Unassigned fallback. Status changes must not fabricate activity or completion.
4. Bookmark page 4, browse to page 8, and confirm the bookmark stays at 4 in the list, pane, and statistics. Continue from bookmark must open page 4 in the correct PDF. Remove and Undo must update the visible controls and preserve unrelated fields.
5. Reset tracked PDF positions. Confirm the bookmark, manual stage, Important, activity date, and history survive. Test missing/multiple PDFs and read-only records.
6. Open Reading Statistics from the item menu. Check scope, filters, calendar detail, manual Marked Read counts, shared dates, and displayed page targets. Reopen an existing window without losing filters.
7. Check narrow, enlarged-text, and dark layouts. Check keyboard labels without changing system accessibility preferences.
8. Verify bookmark persistence after restart and pending automatic-position persistence on immediate shutdown.
9. Check the prospective new-item default and the library-scoped sidebar list without changing pre-existing data.

Real synchronization across two devices is a separate acceptance step. Report it as unverified until observed; local round trips do not prove delivery. Use compatible clients on every device. The previous writer tested against v4 refuses edits; arbitrary old versions are not certified safe. Never strip metadata or downgrade its schema to enable an older writer.

## Prepare a release

1. Update package.json, both version entries in package-lock.json, addon/manifest.json, CHANGELOG.md, and the README version notice together.
2. Run verification and scan for secrets. Open an English PR; wait for checks on its exact head, review scope, and merge.
3. Build the exact merged revision and verify its GitHub Verify check.
4. Create a draft release, attach zotero-reading-flow.xpi and updates.json, and check their hashes, version, compatibility range, and download URLs.
5. Publish only when release publication is authorized and the acceptance limitations are disclosed.
6. Run the public asset check and require the release-triggered verify-public-release-assets job to pass:

```bash
npm run verify:release-assets -- --tag v<version>
```

The release check rebuilds the tagged source and compares the actual public XPI and update metadata. An HTTP 200 alone is not sufficient. Historical release notes belong in [CHANGELOG.md](../CHANGELOG.md).
