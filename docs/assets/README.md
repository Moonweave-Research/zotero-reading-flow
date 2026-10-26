# Screenshot provenance

All 32 raster images in this directory and `workflows/` were refreshed from actual **English Zotero 10.0.6 for macOS running released Reading Flow 1.3.10**. Captures use an isolated QA app, profile, and data folder containing six synthetic papers and two generated ten-page PDFs. No personal library records are shown or modified. The released XPI SHA-256 is `910518b0139ed474f3edbe9b7b9cd0c7aa501cf7062c5ed2f94b4fd1495db971`.

These are native application captures, not generated UI mockups. Full views preserve the captured JPEG pixels; PNG details are rectangular crops, with no controls redrawn or text relabeled. The library overview and panel examples are also crops. Source observation names and crop coordinates below refer to the original captures; coordinates are top-left `x, y, width, height` in pixels. Full workflow views remain linked from the visual guide.

## What each workflow demonstrates

- **Library, Compact, and panel:** manual Reading + Important, bookmark 4/10 and automatic last viewed 8/10 in Sample paper.pdf. The library includes all four manual stages and Unassigned + Important. Icons shows the same saved data with a different selected row; only combined-column density differs.
- **Reading started:** a manually started item with no PDF. Its start date is present; PDF activity and positions are not recorded.
- **PDF toolbar:** Bookmark here at page 4; the later capture shows the actual Undo and Saved feedback.
- **Batch change:** three selected papers are changed to To Read; Important remains independent, and other papers retain their stages. No PDF activity is invented by a status change.
- **Manual to automatic:** Read (manual) becomes Reading (automatic), retaining Important, dates, bookmark page 4 in Sample paper.pdf, and automatic page 3 in Supplement.pdf.
- **Multiple and missing PDFs:** the panel names the two PDF identities. Only the synthetic bookmarked file was temporarily renamed for the unavailable-file capture, then restored with identical SHA-256. Its bookmark is retained and the independent automatic location remains available.
- **Statistics:** after returning to Sample paper.pdf, the current bookmark is 4 and last viewed is 8; Reading (automatic) + Important matches the filters and Marked Read is 0. The selected day has activity in two PDFs, so Recorded location is Unknown rather than an invented single page. Current status and the bookmark action are separate from the historical record.
- **Settings and sidebar:** Compact density, Unassigned new-item default, and the native tracked-papers Saved Search. Settings changes were confined to the QA profile.

The images show separate moments in these workflows, not one simultaneous state. Page positions do not measure pages read. These macOS captures do not verify Windows rendering or device-to-device delivery. The statistics window was successfully opened through Reading Flow's context menu in this QA session; this documentation update claims no application-code fix.

## Image sources

| Published file | Original observation | Crop rectangle (full if blank) |
| --- | --- | --- |
| `reading-status-library.jpg` | `library` | 0, 0, 2500, 1050 |
| `reading-bookmark-button.jpg` | `reader` | Full |
| `reading-bookmark-panel.jpg` | `library` | 1788, 175, 625, 825 |
| `reading-bookmarks-statistics.jpg` | `statistics-filters` | Full |
| `reading-flow-settings.jpg` | `settings` | Full |
| `reading-list-sidebar.jpg` | `sidebar` | Full |
| `reading-started.png` | `started` | 1788, 670, 625, 620 |
| `detail-status-stages.png` | `started` | 985, 155, 190, 415 |
| `detail-bookmark-button.png` | `reader` | 2025, 75, 430, 85 |
| `detail-panel-shortcut.png` | `library` | 2427, 635, 73, 80 |
| `detail-bookmark-actions.png` | `library` | 1790, 455, 625, 410 |
| `workflows/batch-menu.jpg` | `batch-menu` | Full |
| `workflows/batch-result.jpg` | `batch-result` | Full |
| `workflows/bookmark-undo.jpg` | `bookmark-undo` | Full |
| `workflows/status-manual-before.jpg` | `status-manual-before` | Full |
| `workflows/status-automatic-after.jpg` | `status-automatic-after` | Full |
| `workflows/statistics-filters.jpg` | `statistics-filters` | Full |
| `workflows/statistics-day.jpg` | `statistics-day` | Full |
| `workflows/multiple-pdfs.jpg` | `multiple-pdfs` | Full |
| `workflows/missing-bookmarked-pdf.jpg` | `missing-bookmarked-pdf` | Full |
| `workflows/density-compact.jpg` | `library` | Full |
| `workflows/density-icons.jpg` | `started` | Full |
| `workflows/batch-result-detail.png` | `batch-result` | 400, 155, 1380, 420 |
| `workflows/density-compact-detail.png` | `library` | 980, 155, 790, 420 |
| `workflows/density-icons-detail.png` | `started` | 980, 155, 790, 420 |
| `workflows/bookmark-undo-detail.png` | `bookmark-undo` | 1840, 75, 500, 85 |
| `workflows/status-manual-detail.png` | `status-manual-before` | 1788, 675, 625, 960 |
| `workflows/status-automatic-detail.png` | `status-automatic-after` | 1788, 675, 625, 960 |
| `workflows/statistics-filters-detail.png` | `statistics-filters` | 115, 170, 1540, 300 |
| `workflows/statistics-day-detail.png` | `statistics-day` | 635, 430, 1020, 400 |
| `workflows/multiple-pdfs-detail.png` | `multiple-pdfs` | 1788, 930, 625, 650 |
| `workflows/missing-bookmarked-pdf-detail.png` | `missing-bookmarked-pdf` | 1788, 930, 625, 670 |

## Illustrations and future updates

`detail-reading-icons.svg` is an explicitly labeled icon-key illustration, verified against `src/columnManager.ts`, rather than a screenshot. It explains the Unicode book symbols used by the combined column; emoji artwork depends on the viewer's operating system. `icon.svg` is the project icon.

For future captures, use non-sensitive sample items, preserve the original pixels, and update captions when the UI changes. Never publish personal paper titles, notes, paths, or library metadata. Superseded captures remain available in Git history.
