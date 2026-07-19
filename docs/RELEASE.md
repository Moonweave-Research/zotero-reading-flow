# Release Process

This document describes the release process for Zotero Reading Flow.

## Release Gate

Run the full local verification command before creating or updating a release:

```bash
npm ci
npm run verify
```

Expected final output:

```text
verify-xpi: OK (9 files)
```

The command verifies:

- TypeScript compiles with `tsc --noEmit`.
- Unit tests pass.
- `zotero-reading-flow.xpi` is rebuilt.
- `updates.json` is regenerated.
- The XPI contains required files.
- The XPI does not contain source files, `node_modules`, macOS metadata, or removed Zotero APIs.
- `manifest.json`, `package.json`, and `updates.json` agree on version and Zotero compatibility.
- `updates.json` contains the sha256 hash of the built XPI.

## Version Update

For a new release:

1. Update `package.json`.
2. Update `addon/manifest.json`.
3. Update `CHANGELOG.md`.
4. Run `npm run verify`.
5. Confirm `updates.json` points at the same version tag.

The expected update link format is:

```text
https://github.com/Moonweave-Research/zotero-reading-flow/releases/download/v<version>/zotero-reading-flow.xpi
```

## GitHub Release

After the PR is merged:

1. Create a GitHub release named `v<version>`.
2. Upload `zotero-reading-flow.xpi`.
3. Upload `updates.json`.
4. Publish the release.

Both files must be release assets. Do not rely on source archives for plugin installation.

## Post-Release URL Checks

After publishing the release, verify these URLs in a browser or with `curl -I`:

```bash
curl -I https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest/download/updates.json
curl -I https://github.com/Moonweave-Research/zotero-reading-flow/releases/download/v1.1.14/zotero-reading-flow.xpi
```

Both should return a redirect or success response rather than `404`.

## Manual Zotero Smoke Test

Use a clean or disposable Zotero profile when possible.

1. Install `zotero-reading-flow.xpi`.
2. Restart Zotero.
3. Confirm the add-on appears as enabled.
4. Enable the `Progress`, `Status`, and `Last Read` columns.
5. Open a PDF attachment.
6. Change pages and wait at least 5 seconds.
7. Return to the library item tree and confirm progress appears.
8. Right-click a regular item and confirm the `Reading Flow` menu appears.
9. Mark the item as `Read`, then reset progress.
10. Quit Zotero and confirm no Reading Flow bootstrap error appears in the debug log.

For local automation, run:

```bash
ZOTERO_TEST_PROFILE="/path/to/profile-dir" \
ZOTERO_DATA_DIR="/path/to/zotero-data-dir" \
npm run check:release-profile -- \
  --itemKey "<item-key>" \
  --attachmentKey "<attachment-key>" \
  --attachmentPath "/path/to/zotero-data-dir/<pdf-file-path>" \
  --json
```

## Current Release Notes

For `v1.1.14`, the release should be described as tested with Zotero `9.0.1` and compatible with Zotero `9.0.*`.
