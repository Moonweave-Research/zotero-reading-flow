# Zotero forum announcement — copy/paste source

Post this in the **Zotero forums** (https://forums.zotero.org/). Plugin-related announcements typically go in the general discussion area; staff/community will move it if a more specific category fits. Title and body lead with a reproducible value claim, not a feature dump.

---

## Title

> [Plugin] Reading Flow — `Progress` / `Status` / `Last Read` columns for Zotero 9 reading workflows

## Body

Hi all,

I wrote this plugin during my PhD research and have been using it in my own Zotero workflow. Some older reading/progress workflow plugins or snippets no longer fit the current Zotero 9 add-on environment, so I wanted a small Zotero 9-compatible version that I can keep extending.

**What it does**

- Adds three columns to the library item tree: `Progress`, `Status` (`To Read` / `Reading` / `Skimmed` / `Read` / `Important`), and `Last Read`.
- Adds a **Reading Flow** submenu to the item right-click menu for quick status updates, **Resume Reading**, and **Reset Reading Progress**.
- Tracks the last page you read per item, so the row reflects current reading progress and Resume Reading can reopen the tracked PDF near that page.
- Stores all reading state in the item's `Extra` field as a single namespaced `ReadingFlow:` line — no external database, round-trips through Zotero sync unchanged.

**Why it exists**

If you read PDFs across many projects, the hard part is not just opening a paper again; it is knowing which papers are unread, in progress, important, or finished before opening each one. Reading Flow turns the Zotero item list into a lightweight reading dashboard.

This is still intentionally small, but I plan to keep improving it as Zotero 9 settles and as users report real workflow gaps.

**Compatibility**

- Built for Zotero 9.
- Tested on Zotero `9.0.1` on macOS ARM64.
- Because Zotero 9 is still new, please report issues with your Zotero version and OS if something behaves differently.
- Plugin ID: `readingflow@moon.com`.
- No external services, no telemetry, no PDF modification.

**Install**

XPI download (latest):
https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest/download/zotero-reading-flow.xpi

Auto-update manifest (for Tools → Add-ons auto-update):
https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest/download/updates.json

**Repository (source, screenshots, issues)**

https://github.com/Moonweave-Research/zotero-reading-flow

Feedback welcome — especially on edge cases with multi-attachment items or unusual reader page-count metadata. Bug reports are most useful with the Zotero version and a short console snippet.

Thanks!
