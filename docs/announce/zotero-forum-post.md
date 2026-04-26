# Zotero forum announcement — copy/paste source

Post this in the **Zotero forums** (https://forums.zotero.org/). Plugin-related announcements typically go in the general discussion area; staff/community will move it if a more specific category fits. Title and body are kept under 1200 chars and lead with a reproducible value claim, not a feature dump.

---

## Title

> [Plugin] Reading Flow — Resume PDFs at the last read page, with `Progress` / `Status` / `Last Read` columns (Zotero 9.0)

## Body

Hi all,

I wrote this plugin during my PhD research and have been using it daily for several months. Sharing it here in case it's useful to others.

**What it does**

- Adds three columns to the library item tree: `Progress`, `Status` (`To Read` / `Reading` / `Skimmed` / `Read` / `Important`), and `Last Read`.
- Adds a **Reading Flow** submenu to the item right-click menu: **Resume Reading**, quick status updates, and **Reset Reading Progress**.
- Remembers the last page you read per item and reopens the reader there automatically.
- Stores all reading state in the item's `Extra` field as a single namespaced `ReadingFlow:` line — no external database, round-trips through Zotero sync unchanged.

**Why it exists**

If you read PDFs across many projects, you've probably opened a paper, scrolled for thirty seconds to find where you stopped, and lost the thread before you started. This is the smallest possible fix for that.

**Compatibility**

- Zotero `9.0` through `9.0.*` (tested on `9.0.1`, macOS ARM64).
- Plugin ID: `readingflow@moon.com`.
- No external services, no telemetry, no PDF modification.

**Install**

XPI download (latest):
https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/zotero-reading-flow.xpi

Auto-update manifest (for Tools → Add-ons auto-update):
https://github.com/Moon-python/zotero-reading-flow/releases/latest/download/updates.json

**Repository (source, screenshots, issues)**

https://github.com/Moon-python/zotero-reading-flow

Feedback welcome — especially on edge cases with multi-attachment items or unusual reader page-count metadata. Bug reports are most useful with the Zotero version and a short console snippet.

Thanks!
