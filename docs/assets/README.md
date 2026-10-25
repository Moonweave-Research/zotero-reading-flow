# Screenshot provenance

All screenshot sources are actual English Zotero 10.0.6 for macOS running released Reading Flow 1.3.8 or 1.3.9 in separate test profiles. The reading-start, settings, statistics, and additional-workflow images have been refreshed using the 1.3.9 XPI. None are generated UI mockups or contain personal library records. Window layout changes and sample status choices were confined to isolated test profiles. Version 1.3.9 is available from the [latest release](https://github.com/Moonweave-Research/zotero-reading-flow/releases/latest).

| File | Feature shown | Capture context |
| --- | --- | --- |
| reading-status-library.jpg | Four manual stages, unassigned + Important, compact positions, and the item panel | QA sample library; bookmark 4/10; last viewed 8/10; Read + Important |
| reading-bookmark-button.jpg | Bookmark here in the upper-right PDF toolbar | QA PDF reader at page 4/10 |
| reading-bookmark-panel.jpg | Distinct bookmark and automatic-position actions, status, dates | 1.3.8 labels: First recorded and Last activity; bookmark 4/10; last viewed 8/10 |
| reading-bookmarks-statistics.jpg | Activity calendar, manual Marked Read count, separate position columns | 1.3.9; bookmark 4/10; last viewed 8/10; Reading automatic + Important; Marked Read 0 |
| reading-flow-settings.jpg | Sidebar controls, column density, prospective new-item default | 1.3.9; Compact and Unassigned shown; test-profile settings only |
| reading-list-sidebar.jpg | Native, selected tracked-papers Saved Search and concise positions | QA sample library; five items with status metadata |
| reading-started-qa-v1.3.9.png | Manual Reading status, explicit Reading started date, separate Last PDF activity, bookmark, and automatic last-viewed fields | English 1.3.9 XPI in an isolated profile; no PDF attached, so PDF activity and positions are not recorded |

## Detail views

### English 1.3.9 workflow captures

The files in `workflows/` are new, real English Zotero 10.0.6 captures using Reading Flow 1.3.9 in a separately identified QA app, profile, and data folder. The library contains only synthetic papers and two generated ten-page sample PDFs. No personal library records are shown. Display-density and column-layout changes were confined to that QA profile. Full-window captures are JPEG exports of the original PNG observations; detail PNGs crop the original observations without relabeling controls.

| File | Observed behavior |
| --- | --- |
| workflows/batch-menu.jpg | Three selected synthetic papers and the Reading Flow context submenu |
| workflows/batch-result.jpg | All three selected papers now show To Read; the existing Reading item is unchanged |
| workflows/density-compact.jpg | Combined column showing symbols, bookmark 4/10, automatic position 8/10, and PDF activity date |
| workflows/density-icons.jpg | The same rows and data in Icons mode; the separate Status column is unchanged |
| workflows/bookmark-undo.jpg | PDF reader at page 4 immediately after Bookmark here, showing Undo and Saved |
| workflows/status-manual-before.jpg | Read manual with Important, retained dates, bookmark 4 in Sample paper.pdf, last viewed 3 in Supplement.pdf |
| workflows/status-automatic-after.jpg | After clearing the manual stage: Reading automatic, with the same flag, dates, bookmark, and automatic position |
| workflows/statistics-filters.jpg | Selected Library, Reading, and Important only leave one matching paper |
| workflows/statistics-day.jpg | Selected activity day shows recorded page 8, current Reading automatic + Important, and bookmark action page 4 |
| workflows/multiple-pdfs.jpg | Distinct Bookmark PDF and Last viewed PDF names and page-opening actions |
| workflows/missing-bookmarked-pdf.jpg | Missing bookmarked file explicitly labeled Unavailable; independent last-viewed action remains |

| Detail PNG | Original observation | Crop (`x, y, width, height`) |
| --- | --- | --- |
| workflows/batch-result-detail.png | batch-result | 410, 155, 1515, 420 |
| workflows/density-compact-detail.png | density-compact | 1035, 160, 875, 370 |
| workflows/density-icons-detail.png | density-icons | 1035, 160, 875, 370 |
| workflows/bookmark-undo-detail.png | bookmark-undo | 1320, 75, 460, 85 |
| workflows/status-manual-detail.png | status-manual-before | 1295, 155, 620, 500 |
| workflows/status-automatic-detail.png | status-automatic-after | 1295, 155, 620, 500 |
| workflows/statistics-filters-detail.png | statistics-filters | 115, 175, 1540, 285 |
| workflows/statistics-day-detail.png | statistics-day | 635, 800, 1020, 410 |
| workflows/multiple-pdfs-detail.png | multiple-pdfs | 1295, 440, 620, 445 |
| workflows/missing-bookmarked-pdf-detail.png | missing-bookmarked-pdf | 1295, 440, 620, 520 |

Native checks also exercised Undo (bookmark changed to page 6, then restored to page 4), the disabled general bookmark button with two loaded PDF readers, statistics-window reopening, and restoration of the temporarily unavailable QA PDF with its original SHA-256. The early QA session did not open the statistics window; after a normal QA-only restart, opening and reopening the window through the context menu succeeded. The cause of that early-session failure is not established, and no application-code fix is claimed by this documentation change.

### Earlier workflow details

These PNGs are rectangular crops of the original English 1.3.8 screenshots above. Their controls and labels have not been redrawn or relabeled. The README displays them at readable widths; they are existing capture details, not new runtime verification. The book-symbol key beside the Status crop is a written legend verified against `src/columnManager.ts`, not a screenshot of the combined column.

`detail-reading-icons.svg` enlarges the same Unicode book symbols used by the combined column (`📙` for To Read and `📖` for Reading). It is an explanatory illustration; its caption and SVG description identify it as an icon key rather than a Zotero capture. Emoji artwork depends on the viewer's operating system.

Crop coordinates use the original image's top-left origin, in pixels (`x, y, width, height`). Original full-window images remain available.

| Detail | Original | Crop rectangle |
| --- | --- | --- |
| detail-status-stages.png | reading-status-library.jpg | 1760, 150, 210, 350 |
| detail-bookmark-button.png | reading-bookmark-button.jpg | 2520, 65, 370, 100 |
| detail-panel-shortcut.png | reading-status-library.jpg | 2934, 635, 90, 75 |
| detail-bookmark-actions.png | reading-bookmark-panel.jpg | 2315, 470, 630, 410 |

Screens represent separate moments in their sample workflows, not one simultaneous snapshot. The original 1.3.8 library/panel captures and refreshed 1.3.9 statistics show bookmark page 4 and automatic page 8. Later 1.3.9 multi-PDF captures show bookmark page 4 in Sample paper.pdf and automatic page 3 in Supplement.pdf. The reading-start example has no PDF and makes no claim about PDF activity or pages read.

The sample titled QA — Unsupported record retains a legacy Important record after earlier compatibility testing; the title is a fixture label, not a current parser-error diagnosis. Its Unassigned + Important display demonstrates that the flag does not imply a reading stage.

The sidebar name can be truncated by Zotero's native sidebar width; its full name is Reading Flow — Tracked Papers, as shown in Settings. Native window captures keep original aspect ratios and full context. No UI text was relabeled in an image. Superseded screenshots were removed from the current tree; originals remain in Git history.

For new captures, use non-sensitive sample items, preserve the original pixels, and update captions when the UI changes. Never publish personal paper titles, notes, paths, or library metadata.
