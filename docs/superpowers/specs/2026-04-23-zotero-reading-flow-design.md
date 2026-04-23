# Final Mission-Critical Design Spec: Zotero Reading Flow (v1.1.0)

**Project:** Zotero Reading Flow
**Target:** Zotero 9.0+ (ESM, Firefox 140+ ESR)
**Integrity Level:** High (Edge-case hardened)
**Date:** 2026-04-23

---

## 1. Executive Summary
A ultra-stable, performance-optimized plugin for Zotero 9. It focuses on **Reading Progress, Semantic Row Coloring, and Quick Peek Popovers**. This version includes explicit handling for edge cases such as multi-PDF items, field-overflow, and synchronization race conditions.

---

## 2. Feature Specification & Edge-Case Strategy

### 2.1 Smart Progress Column (ItemTree Integration)
*   **Trigger:** `Zotero.Reader` events (`page-change`, `scroll`).
*   **Calculation Logic:** `Math.min(1.0, Math.max(0.0, currentPage / totalPages))`.
*   **UI Hook:** `Zotero.ItemTreeManager.registerColumns`.
*   **Rendering (DOM-based):** 
    *   Use imperative DOM manipulation inside `renderCell` (required by Zotero 9's virtualized tree).
    *   **Edge Case - Multi-PDF Items:** If an item has 3 PDFs, track progress for all 3 in the `extra` field. Display the progress of the *most recently opened* attachment in the main list.
    *   **Edge Case - Recycle Buffer:** Explicitly clear `element.textContent = ''` before rendering to prevent "ghost content" during high-speed scrolling.

### 2.2 Semantic Color & Badge System
*   **Coloring Logic:** Inject a CSS variable `--reading-flow-row-color` into the row's style.
*   **Badge Mapping:** `todo` (⏳), `urgent` (🔥), `done` (✅), `complex` (🧠), `none` (null).
*   **Edge Case - Data Sync Conflicts:** 
    *   Implement a "Last Write Wins" strategy using a `ts` (timestamp) field in the JSON.
    *   Example: `ReadingFlow: {"p":0.8, "c":"#ff0", "ts":1713859200}`.
*   **Edge Case - Field Overflow:** If the `extra` field is nearly full (Zotero limit), prioritize `ReadingFlow` data by trimming other non-essential tags or alerting the user.

### 2.3 Quick Peek Popover (Debounced Recall)
*   **Trigger:** `mouseover` with a 400ms debounce.
*   **Data Aggregation:**
    *   `Abstract`: Clean HTML tags from the abstract to prevent XSS.
    *   `Annotations`: Fetch top 3 highlights. If 0 highlights, show "No annotations yet".
*   **Edge Case - Window Boundary:** Calculate viewport size before rendering. If the popover would go off-screen (bottom or right), flip its anchor position to the top or left of the cursor.

---

## 3. Technical Implementation Details

### 3.1 Data Model (The "Extra" Field Protocol)
To ensure sync and zero-config, we use the `extra` field with a strict schema:
```text
ReadingFlow: {"v":1,"p":{"att_id":0.8},"c":"#hex","s":"tag","ts":123456789}
```
*   **Validation:** Use a Zod-like schema validator before writing to prevent database corruption.
*   **Migration:** If the schema version `v` increases, auto-migrate old data on first load.

### 3.2 UI Integration (Performance First)
*   **CSS Injection:** Use `UITool.registerCSS` to ensure styles are cleaned up when the plugin is disabled.
*   **Event Listeners:** All listeners (Reader, ItemTree) must be tracked and removed in the `shutdown()` phase of `bootstrap.js` to prevent memory leaks (critical for Zotero's "no-restart" plugin architecture).

---

## 4. Final Implementation Phases (Agent Instructions)

### Phase 1: Foundation (Stability Setup)
1. Initialize with ESM support.
2. Setup `manifest.json` with strict versioning.
3. Implement `Logger` and `ErrorHandler` modules.

### Phase 2: Data Core (The Engine)
1. Implement `ExtraFieldStore`: Robust read/write for the JSON payload.
2. Implement `AttachmentResolver`: Correctly identifying which PDF to track progress for.

### Phase 3: UI Layer (Visuals)
1. Register `ItemTree` columns.
2. Implement the `ProgressRenderer` (DOM).
3. Implement `PopoverManager` with collision detection (viewport-aware).

---

## 5. Risk Mitigation & Validation
*   **Race Condition:** Use a semaphore/lock when writing to the `extra` field if multiple updates happen simultaneously.
*   **Performance:** Profile `renderCell` execution time; must remain under 2ms.
*   **Compatibility:** Verify on both dark and light Zotero themes.
