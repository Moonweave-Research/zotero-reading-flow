# Troubleshooting

## The add-on installs but columns do not appear

Open Zotero's item-tree column picker and enable:

- `Progress`
- `Status`
- `Last Read`

On first registration, Reading Flow enables these detailed columns in Zotero's clean default item-tree layout. Zotero owns saved and custom layouts, so those layouts may still require enabling the columns with the native picker. The optional `Reading Flow` composite column is always user-enabled through the same picker.

If the columns are still missing, restart Zotero and check the debug log for `readingflow@moon.com`.

## Reading Statistics opens with an unexpected scope or filter

The two dashboard entries share one modeless window. **Reading Flow → View Current View Statistics** selects `Current View` when it opens a new dashboard.

If that dashboard window is already open, either entry focuses the existing window without changing its current Scope, Papers, Status, or History range. Check Scope and the other controls before interpreting the results.

## Reading Flow sorting looks reversed

The first sort on the optional `Reading Flow` column is recent-first, with never-read items last. Each subsequent click on the header reverses the order through Zotero's native sorting.

## Progress does not update

Reading Flow updates progress from Zotero reader page-change events.

Check the following:

1. The PDF is opened in Zotero's built-in reader.
2. The parent item is a regular Zotero item with a child PDF attachment.
3. You changed pages and waited at least 5 seconds.
4. The parent item is not currently dirty in Zotero's item pane.
5. The `Extra` field can be edited.

Progress is stored on the parent item, not on the attachment item.

## Status changes do not apply

The context menu operates on selected regular Zotero items.

If nothing changes:

1. Select the parent bibliographic item rather than the PDF attachment row.
2. Right-click the selected item.
3. Choose `Reading Flow`.
4. Choose a status or `Reset Reading Progress`.

## Resume Reading opens the PDF but not the exact page

Resume Reading depends on two things: Zotero reader page-change events saving the last page, and Zotero's Reader API accepting page navigation when the PDF is reopened. If page navigation is unavailable, Reading Flow falls back to opening the PDF normally.

To check what Reading Flow saved, select the parent item and inspect the `Extra` field. Look for a `ReadingFlow:` line that includes `lastAttachmentId` and `lastPage`.

If `Resume Reading` is disabled, select exactly one tracked parent item or PDF attachment, then right-click and open `Reading Flow`.

## How to inspect stored data

Select the parent item and inspect the `Extra` field. A tracked item contains a line similar to:

```text
ReadingFlow: {"v":1,"p":{"12345":0.72},"c":null,"s":"reading","ts":1776945900,"lastAttachmentId":"12345","lastPage":18,"lastReadAt":1776945900000}
```

The `ReadingFlow:` line lives in the parent item's `Extra` field and follows Zotero's metadata sync behavior. Disabling or uninstalling Reading Flow does not remove it. Back up affected items before any manual removal; invalid JSON is ignored and logged.

Version 1.3.4 has no separate analytics or reading-data upload service. It declares a GitHub update URL for retrieving release metadata and the release package; Zotero's own sync and update behavior remains Zotero-controlled.

## How to collect Zotero debug output

On macOS:

```bash
/Applications/Zotero.app/Contents/MacOS/zotero -ZoteroDebugText 2>&1 | tee /tmp/zotero-readingflow-debug.log
```

Then search for Reading Flow entries:

```bash
rg "readingflow@moon.com|ReadingFlow|Reading Flow|Error running bootstrap|ReferenceError|TypeError" /tmp/zotero-readingflow-debug.log
```

## Expected warnings

The following warnings can appear in Zotero 9.0.1 and are not by themselves proof that Reading Flow failed:

- `ItemTreeColumnManager: The 'defaultIn' property is deprecated. Use 'enabledTreeIDs' instead.`
- `ItemTreeColumnManager: The 'disableIn' property is deprecated. Use 'enabledTreeIDs' instead.`
- `ChromeUtils.import() has been removed...` from other installed plugins.
- `Failed to load resource://services-settings/remote-settings.sys.mjs` from Zotero/Mozilla startup.

Reading Flow's packaged XPI is verified to reject `ChromeUtils.import()`.

## Add-on cache shows an old version

If you manually copy the XPI into the Zotero profile, Zotero can keep stale extension metadata in `extensions.json`.

Prefer installing through **Tools → Plugins → Install Add-on From File**.

If you are doing local development and must force a rescan:

1. Quit Zotero.
2. Back up `extensions.json` and `addonStartup.json.lz4` from the Zotero profile.
3. Remove those cache files.
4. Start Zotero.
5. Re-enable add-ons if Zotero marks sideloaded add-ons as disabled.

This is for development only. Normal users should install the release XPI through **Tools → Plugins**.

## Reinstall cleanly

1. Uninstall Zotero Reading Flow through **Tools → Plugins**.
2. Restart Zotero.
3. Install the release XPI again.
4. Restart Zotero if prompted.

Existing `ReadingFlow:` lines in item `Extra` fields are not automatically removed by uninstalling the add-on.

## Zotero reports the add-on as incompatible

Version 1.3.4 supports Zotero `9.0.x` and `10.0.x`, including compatible Zotero 9 source/self-built version strings. Its manifest uses `8.999` as Zotero's previous-major version-comparison sentinel for those Zotero 9 builds; Zotero 8 itself is not supported.
