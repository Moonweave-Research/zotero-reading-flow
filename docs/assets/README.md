# Media assets for the README

These files support the README and forum announcement. The README should lead with the library-column view because that shows the plugin's main value: reading state directly in Zotero's item list.

| File | What to capture | Recommended size |
|---|---|---|
| `columns.png` | Primary README image. Library item tree with `Progress`, `Status`, and `Last Read` columns visible on several papers in mixed states (`To Read`, `Reading`, `Important`, `Read`). | 1200-1600 px wide, PNG |
| `hero.gif` | Optional demo GIF: library view with Reading Flow columns visible → status change or PDF progress update → row updates in the item tree. Avoid making Resume Reading the only payoff. | 1200-1400 px wide, <= 4 MB |
| `menu.png` | Optional secondary screenshot. Right-click context menu opened on a tracked item, **Reading Flow** submenu expanded with only shipped entries (`Resume Reading`, `Mark as ...`, `Reset Reading Progress`). | 800-1000 px wide, PNG |

## Capture tips

- Use a clean library: 4–6 paper titles in English, no personal notes visible.
- Hide toolbar/sidebar areas that are not relevant; the eye should land on the columns.
- macOS GIF capture: [Kap](https://getkap.co) or `Cmd+Shift+5` → record region → convert with `gifski`.
- Keep `hero.gif` under 4 MB so it loads inline on GitHub. If it's larger, host on the GitHub release page and link instead of embedding.
- Avoid showing real DOIs or unpublished titles you don't want indexed — GitHub README content is publicly searchable.
