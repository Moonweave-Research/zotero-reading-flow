# Troubleshooting

## The add-on installs but columns do not appear

Open Zotero's item-tree column picker and enable:

- `Progress`
- `Status`
- `Last Read`

If the columns are still missing, restart Zotero and check the debug log for `readingflow@moon.com`.

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

Do not manually edit this line unless you are debugging. Invalid JSON is ignored and logged.

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

Prefer installing through `Tools` -> `Add-ons` -> `Install Add-on From File`.

If you are doing local development and must force a rescan:

1. Quit Zotero.
2. Back up `extensions.json` and `addonStartup.json.lz4` from the Zotero profile.
3. Remove those cache files.
4. Start Zotero.
5. Re-enable add-ons if Zotero marks sideloaded add-ons as disabled.

This is for development only. Normal users should install the release XPI from the Add-ons UI.

## Reinstall cleanly

1. Uninstall Zotero Reading Flow from Zotero Add-ons.
2. Restart Zotero.
3. Install the release XPI again.
4. Restart Zotero if prompted.

Existing `ReadingFlow:` lines in item `Extra` fields are not automatically removed by uninstalling the add-on.
