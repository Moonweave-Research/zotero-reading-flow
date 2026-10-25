# Maintenance Scripts

This directory contains the repository's verification and release-profile helpers.

| Script | Purpose |
| --- | --- |
| `run-unit-tests.js` | Bundles and runs the TypeScript unit tests with Node's test runner. |
| `verify-xpi.js` | Checks the built Zotero add-on package and update manifest. |
| `verify-bookmark-compatibility.js` | Confirms older clients refuse bookmark records they cannot safely preserve. |
| `verify-release-assets.js` | Compares published release assets with the local package for a release tag. |
| `check-release-profile.js` | Checks an isolated Zotero profile against the expected add-on version and data paths. |

Run the standard local checks from the repository root with `npm run verify`. Release-asset checks require a built package and an existing published release tag.
