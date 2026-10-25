<div align="center">

<img src=".github/assets/zotero-reading-flow-mark-512.png" alt="Reading Flow logo" width="72">

# Zotero Reading Flow

**Keep your place, even when you skip ahead.**

[![Latest release](https://img.shields.io/github/v/release/Moonweave-Research/zotero-reading-flow?label=release)](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest) [![Verify](https://github.com/Moonweave-Research/zotero-reading-flow/actions/workflows/verify.yml/badge.svg)](https://github.com/Moonweave-Research/zotero-reading-flow/actions/workflows/verify.yml) [![Zotero](https://img.shields.io/badge/Zotero-9%20%7C%2010-blue)](https://www.zotero.org/download/) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Install](#install) · [Try it](#try-it) · [Reading statistics](#reading-statistics) · [Questions](#questions) · [Build from source](#build-from-source)

</div>

Reading Flow helps you return to the page you meant to keep. Leave a **reading bookmark**, browse another section, and come back without losing your place. See that bookmark, your last viewed page, and your chosen reading status directly in Zotero.

> [!IMPORTANT]
> **Screenshots show 1.3.7, currently available from source.** The latest published release is **1.3.6** as of October 25, 2026. For **Bookmark here** and the workflow below, [build the current source](#build-from-source) until a 1.3.7+ release is available.

![Actual Zotero Reading Statistics window showing a reading bookmark at page 4 of 10, last viewed at page 8 of 10, and an independently chosen Read status](docs/assets/reading-bookmarks-statistics.jpg)

*You marked page 4, then looked at page 8. Your bookmark stays at page 4. Screenshots use a separate test library; click an image to inspect it at full size.*

## Install

1. Download **`zotero-reading-flow.xpi`** from the [latest published release](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest), or [build the current source](#build-from-source).
2. In Zotero, open **Tools → Plugins**.
3. Open the gear menu, choose **Install Plugin From File…**, and select the `.xpi`.
4. Restart Zotero after installing or updating.

Supports **Zotero 9 and 10**. The latest screenshots were verified on **Zotero 10.0.6 for macOS**. Use Zotero's plugin installer when updating so both the package and its registered version are updated.

## Try it

### 1. Keep the page you want to return to

Open a PDF and choose **Bookmark here** in the **upper-right PDF toolbar, near Aa**. This saves a reading bookmark at the current page. No reading mode or timer needs to be switched on.

![Actual Zotero PDF reader with the Bookmark here button in the upper-right toolbar and the PDF open at page 4](docs/assets/reading-bookmark-button.jpg)

### 2. Browse freely

Jump to the references, inspect a figure, or look at another page. Reading Flow updates **Last viewed (automatic)** while keeping your reading bookmark in place.

| What you see | What it means |
| --- | --- |
| **Reading bookmark** | A page you deliberately saved. Only a bookmark action changes it. |
| **Last viewed (automatic)** | The most recently displayed PDF page, including a brief visit. |
| **Status** | Your chosen stage, or **Reading (automatic)** when a bookmark or recorded PDF activity exists without a manual stage. |

**Neither a bookmark nor an automatic position measures pages read.** Visiting the last page does not mark a paper **Read**. Page numbers refer to positions in the PDF file; printed page labels may differ.

### 3. Continue from your bookmark

Return to the library, select the paper, and click the **book-shaped Reading Flow icon** on the right. You can also right-click the paper and choose **Reading Flow → View Reading Flow**.

Choose **Continue from bookmark** to return to your marked page. **Open last viewed** takes you to the automatic position instead. Without a bookmark, the primary action continues from the last viewed position, or opens the PDF when no saved position is available.

<details>
<summary>See the Reading Flow panel</summary>

![Actual Zotero Reading Flow panel showing a reading bookmark at page 4 of 10, an automatic position at page 8 of 10, activity dates, and separate actions for each location](docs/assets/reading-bookmark-panel.jpg)

*The panel and statistics show the same bookmark at page 4 and automatic position at page 8. Continuing from the bookmark opens page 4, as shown in the reader capture.*

</details>

**Changed your mind?** Use **Undo** after setting a bookmark, or **Remove bookmark** in the panel. Undo is available during the current app session and does not overwrite a newer bookmark change from another client.

## Organize your reading

- **Choose a stage:** `To Read`, `Reading`, `Skimmed`, or `Read`. Set it in the panel or the paper's **Reading Flow** context menu. **Important** is a separate flag, so a paper can be both **Read** and **Important**.
- **Keep automatic status:** choose **Clear Manual Status (Use Automatic)** in the context menu to remove your manual override. Untouched items remain **Unassigned**.
- **Scan the library:** use Zotero's native column chooser to show **Bookmark / Last Viewed**, **Status**, **Last PDF Activity**, or the optional combined **Reading Flow** column. Column visibility and layout stay under Zotero's control.
- **Choose a density:** in **Settings → Zotero Reading Flow**, **Compact** shows a status icon with position and activity date; **Icons** keeps the status icon with full information in its tooltip. This changes only the optional combined column.
- **Create a reading list:** **Settings → Zotero Reading Flow → Add to Left Sidebar** creates one native **Reading Flow — Tracked Papers** Saved Search per selected editable library.
- **Set a default for new items:** **Status for newly added papers** starts at **Unassigned**. Choosing a default affects eligible items added afterward; it does not rewrite the existing library.

## Reading statistics

Open **Tools → Reading Statistics**, or right-click a paper and choose **Reading Flow → View Current View Statistics**.

The dashboard brings together **reading bookmarks, automatic positions, last PDF activity, and status**. Its calendar shows days with recorded PDF page changes. Select an active day to inspect the matching papers; **Show in Zotero** selects a paper, and the PDF action opens the displayed bookmark or saved position.

- **Check Scope first.** A newly opened dashboard starts at **Current View**. Choose **Selected Library** for the whole active library. Reopening an existing statistics window preserves its filters.
- **Use the activity period for activity.** Current status and position describe the item now. The period controls which retained activity is shown.
- **Treat Marked Read as your judgment.** It counts papers explicitly marked **Read**, not papers that reached the last page.
- **Expand details when needed.** **Position history** contains available daily farthest-position comparisons and reset counts. **Status and saved positions** contains the optional breakdowns.

**Last activity** means recorded PDF activity, not a bookmark edit. **First recorded** is the earliest surviving activity date, not necessarily the day you started reading. Detailed daily history retains at most **366 days**; older or legacy activity may be missing.

## Questions

### Does it decide whether I actually read a page?

No. It records navigation and a bookmark you explicitly choose. A short visit counts as an automatic position update; time spent on a page does not prove that you read it. Set **Read** yourself.

### Will it change my PDFs or replace my existing records?

PDF files are not modified. Reading Flow keeps its data in one `ReadingFlow:` line in the parent item's **Extra** field and preserves unrelated Extra content. Existing automatic positions are not converted into reading bookmarks. Disabling or uninstalling the plugin leaves its metadata in place.

### Does it sync between devices?

The Extra record follows Zotero's metadata sync. Bookmarks identify attachments by Zotero key, so they do not depend on the same local numeric item ID. The PDF must also be available on the other device.

Use **1.3.7 or newer on every device that needs to read or edit bookmark records**. The tested previous client refuses changes to the new record format rather than discarding its bookmark. Actual device-to-device delivery has **not yet been verified**; attachment-key resolution, supported-client round trips, and previous-writer refusal have been tested.

### What if a paper has several PDFs, or a file is missing?

A bookmark belongs to its specific PDF. The panel distinguishes that file from the automatically tracked PDF when they differ. A missing bookmarked file is reported as unavailable; its page is not silently applied to another attachment. With several open PDFs for one paper, use **Bookmark here** inside the intended PDF.

### What does Reset tracked PDF positions clear?

**Reading Flow → Advanced → Reset tracked PDF positions** clears automatic current and maximum positions. It preserves the reading bookmark, manual status, Important flag, last PDF activity, and retained history. To clear the bookmark, use **Remove bookmark** in the panel.

### Where is Bookmark here? Why are my columns missing?

**Bookmark here** appears inside the PDF reader, not the library toolbar. Check that **1.3.7 or newer** is installed and restart after updating. For hidden columns, use the library's native column chooser. The optional combined **Reading Flow** column must be enabled manually.

Position tracking supports **PDFs**. Manual status and Important also work for items without a PDF; EPUB positions are not tracked. For other problems, see [Troubleshooting](docs/TROUBLESHOOTING.md) or [report an issue](https://github.com/Moonweave-Research/zotero-reading-flow/issues).

## Build from source

Requires **Node.js 22**, npm, Git, `zip`, and `unzip`. Clone with history: verification uses a pinned previous client to check that old writers preserve new bookmark records.

```bash
git clone https://github.com/Moonweave-Research/zotero-reading-flow.git
cd zotero-reading-flow
npm ci
npm run verify
```

Install the resulting **`zotero-reading-flow.xpi`** through **Tools → Plugins → Install Plugin From File…**, then restart Zotero. Verification runs TypeScript checks, unit tests, the XPI build, package/update-manifest checks, and previous-writer compatibility checks. Generated artifacts are ignored by Git.

For maintainers: [release process](docs/RELEASE.md) · [release notes](CHANGELOG.md) · [test-profile checker](scripts/check-release-profile.js). Reading Flow has no separate reading-data upload service; plugin updates use its declared GitHub release channel. Zotero's own sync and network behavior are separate.
