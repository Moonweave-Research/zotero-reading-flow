# Promotion checklist — Priorities 1 & 2

Goal: get listed in the Zotero plugin directory and turn the GitHub repo into a self-explaining landing page. Order matters — finish each block before starting the next.

## Block A — Capture media (manual, ~30 min)

You can't skip this. Without screenshots, both the README and the forum post look unfinished, and the directory wiki entry has nothing to point at.

- [ ] Set up a clean test library with 4–6 papers in mixed reading states (`To Read`, `Reading`, `Skimmed`, `Read`).
- [ ] Capture `docs/assets/columns.png` — the three columns in the item tree.
- [ ] Capture `docs/assets/menu.png` — the right-click `Reading Flow` submenu expanded.
- [ ] Capture `docs/assets/hero.gif` — 10–15s: right-click → Resume Reading → reader opens on saved page. Keep under 4 MB.
- [ ] Spot-check the README on GitHub after committing — confirm all three render inline.

See `docs/assets/README.md` for framing/sizing details.

## Block B — Polish the GitHub side (Priority 2)

- [ ] Commit the asset files and the README placeholders together so GitHub never shows broken images.
- [ ] On the GitHub repo page (Settings → top of repo): set a one-line **About** description — copy the README headline ("Pick up your papers exactly where you left off — without re-scrolling.").
- [ ] Add topics: `zotero`, `zotero-plugin`, `zotero-9`, `pdf`, `reading`, `research-tools`. Topics drive GitHub search.
- [ ] Pin the repo on your GitHub profile.
- [ ] Optional: enable GitHub **Discussions** so users have a place to ask questions without filing issues.

## Block C — Forum announcement (Priority 1, step 1)

- [ ] Sign in to https://forums.zotero.org/ with the same account you'd want plugin-listed under.
- [ ] Open `docs/announce/zotero-forum-post.md` and paste the title + body into a new discussion.
- [ ] Post. Watch the thread for the first 48 hours and reply to any compatibility/install questions promptly — first responses set the tone.

## Block D — Directory listing (Priority 1, step 2)

The official plugin directory at https://www.zotero.org/support/plugins is a community-maintained wiki. The standard path:

- [ ] Wait until the forum thread has at least one substantive reply (shows the plugin is alive).
- [ ] Reply on your own thread or send a short message asking that the plugin be added to https://www.zotero.org/support/plugins, with these fields ready:
  - **Name:** Reading Flow
  - **Description (one line):** Resume Zotero PDFs at the last read page; adds Progress / Status / Last Read columns and a Reading Flow context menu.
  - **Repo:** https://github.com/Moon-python/zotero-reading-flow
  - **Compatibility:** Zotero 9.0–9.0.*
  - **Author:** Moon-python
- [ ] If a wiki edit invitation comes back, add the entry yourself; otherwise wait for a contributor to add it. This step is informal and may take days.

## Block E — Verify in 1 week

- [ ] Confirm the plugin appears at https://www.zotero.org/support/plugins with the correct repo link.
- [ ] Check the GitHub release download counter (the README badge surfaces it) — first-week downloads is the strongest signal of whether the post landed.
- [ ] If the forum thread got bug reports, file them as GitHub issues with reproductions and link back to the forum post.

## What is intentionally NOT in this list

- Reddit / Twitter / blogs / Threads / Instagram — you said you'll handle these on your personal accounts. Do them after Block B at the earliest, so people who click through find a polished repo.
- Paid promotion, plugin-of-the-week submissions, academic newsletters — premature for v1.1.x. Revisit after 100+ downloads.
