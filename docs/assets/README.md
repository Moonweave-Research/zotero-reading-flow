# Media assets for the README

Three files are referenced by `README.md` and the forum announcement. Capture them once, drop them in this folder, and both the README and the announcement render correctly.

| File | What to capture | Recommended size |
|---|---|---|
| `hero.gif` | 10–15s screen capture: library view → right-click an item → **Reading Flow → Resume Reading** → reader opens on the saved page. End on the reader so the payoff is obvious. | 1200–1400 px wide, ≤ 4 MB |
| `columns.png` | Library item tree with `Progress`, `Status`, and `Last Read` columns visible on 4–6 papers in mixed states (`Reading`, `Skimmed`, `Read`). Crop to the columns area. | 1200 px wide, PNG |
| `menu.png` | Right-click context menu opened on a tracked item, **Reading Flow** submenu expanded so all entries are visible (`Resume Reading`, `Mark as ...`, `Reset Reading Progress`). | 800–1000 px wide, PNG |

## Capture tips

- Use a clean library: 4–6 paper titles in English, no personal notes visible.
- Hide the toolbar/sidebar that isn't relevant — the eye should land on the columns.
- macOS GIF capture: [Kap](https://getkap.co) or `Cmd+Shift+5` → record region → convert with `gifski`.
- Keep `hero.gif` under 4 MB so it loads inline on GitHub. If it's larger, host on the GitHub release page and link instead of embedding.
- Avoid showing real DOIs or unpublished titles you don't want indexed — GitHub README content is publicly searchable.
