# Reading Flow Resume and Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click Resume Reading and lightweight Reading Queue classification so users can continue unfinished papers from Zotero without hunting for the PDF or last page.

**Architecture:** Keep all classification logic pure in `src/readingQueue.ts`, keep Zotero PDF-opening integration isolated in `src/resumeReader.ts`, and wire both into the existing `ReadingFlowMenuManager`. The first iteration does not add persistent metadata or a custom dashboard.

**Tech Stack:** TypeScript, Zotero 9 plugin APIs, Node `node:test`, existing `npm run verify` build pipeline.

---

## File Structure

- Create `src/readingQueue.ts`: pure queue classification helpers using existing `FlowData`.
- Create `src/resumeReader.ts`: Zotero-facing service that resolves a target attachment and opens it at the last tracked page when possible.
- Modify `src/menuManager.ts`: add `Resume Reading` and queue-related menu entries, while preserving existing status/reset behavior.
- Modify `addon/locale/en-US/reading-flow.ftl`: add labels for new menu items.
- Create `test/readingQueue.test.ts`: unit coverage for classification rules.
- Create `test/resumeReader.test.ts`: unit coverage for attachment resolution and fallback behavior.
- Modify `docs/TROUBLESHOOTING.md`: add a short troubleshooting entry for Resume Reading fallback cases.
- Modify `README.md`: document the user-facing workflow after implementation.

## Task 1: Add Pure Reading Queue Classification

**Files:**
- Create: `src/readingQueue.ts`
- Create: `test/readingQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/readingQueue.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLOW_DATA, normalizeFlowData } from '../src/flowData';
import {
  getReadingQueueState,
  isContinueReading,
  isNearlyDone,
  isStaleReading,
  STALE_READING_MS
} from '../src/readingQueue';

const NOW = Date.UTC(2026, 3, 25);

test('classifies explicit reading status as continue reading', () => {
  const data = normalizeFlowData({ s: 'reading' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(isContinueReading(data), true);
});

test('classifies progress between 1% and 97% as continue reading', () => {
  const data = normalizeFlowData({ p: { '10': 0.45 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, false);
});

test('classifies progress between 80% and 97% as nearly done', () => {
  const data = normalizeFlowData({ p: { '10': 0.85 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, true);
  assert.equal(state.nearlyDone, true);
  assert.equal(isNearlyDone(data), true);
});

test('does not classify completed progress as in-progress', () => {
  const data = normalizeFlowData({ p: { '10': 1 }, lastAttachmentId: '10' });
  const state = getReadingQueueState(data, NOW);

  assert.equal(state.continueReading, false);
  assert.equal(state.nearlyDone, false);
  assert.equal(state.staleReading, false);
});

test('classifies old reading item as stale reading', () => {
  const data = normalizeFlowData({
    s: 'reading',
    lastReadAt: NOW - STALE_READING_MS - 1
  });

  assert.equal(isStaleReading(data, NOW), true);
  assert.equal(getReadingQueueState(data, NOW).staleReading, true);
});

test('does not classify recent reading item as stale', () => {
  const data = normalizeFlowData({
    s: 'reading',
    lastReadAt: NOW - STALE_READING_MS + 1
  });

  assert.equal(isStaleReading(data, NOW), false);
});

test('explicit non-reading status prevents progress-only continue reading', () => {
  const data = normalizeFlowData({
    s: 'to-read',
    p: { '10': 0.45 },
    lastAttachmentId: '10'
  });

  assert.deepEqual(getReadingQueueState(data, NOW), {
    continueReading: false,
    nearlyDone: false,
    staleReading: false
  });
});

test('empty flow data is not in any queue', () => {
  assert.deepEqual(getReadingQueueState({ ...DEFAULT_FLOW_DATA }, NOW), {
    continueReading: false,
    nearlyDone: false,
    staleReading: false
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `../src/readingQueue` does not exist.

- [ ] **Step 3: Implement the pure queue helpers**

Create `src/readingQueue.ts`:

```ts
import { FlowData, getDisplayProgress, inferStatus } from './flowData';

export const STALE_READING_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_IN_PROGRESS = 0.01;
const MAX_IN_PROGRESS = 0.97;
const MIN_NEARLY_DONE = 0.8;

export interface ReadingQueueState {
  continueReading: boolean;
  nearlyDone: boolean;
  staleReading: boolean;
}

export function getReadingQueueState(data: FlowData, now = Date.now()): ReadingQueueState {
  return {
    continueReading: isContinueReading(data),
    nearlyDone: isNearlyDone(data),
    staleReading: isStaleReading(data, now)
  };
}

export function isContinueReading(data: FlowData): boolean {
  if (data.s && data.s !== 'reading') return false;
  const progress = getDisplayProgress(data);
  return data.s === 'reading' || isInProgress(progress);
}

export function isNearlyDone(data: FlowData): boolean {
  if (data.s && data.s !== 'reading') return false;
  const progress = getDisplayProgress(data);
  return progress >= MIN_NEARLY_DONE && progress <= MAX_IN_PROGRESS;
}

export function isStaleReading(data: FlowData, now = Date.now()): boolean {
  if (!data.lastReadAt || !Number.isFinite(data.lastReadAt)) return false;
  if (!isContinueReading(data) && inferStatus(data) !== 'reading') return false;
  return now - data.lastReadAt >= STALE_READING_MS;
}

function isInProgress(progress: number): boolean {
  return progress >= MIN_IN_PROGRESS && progress <= MAX_IN_PROGRESS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit
```

Expected: PASS, with the new reading queue tests included.

- [ ] **Step 5: Commit**

```bash
git add src/readingQueue.ts test/readingQueue.test.ts
git commit -m "feat: classify reading queue states"
```

## Task 2: Add Resume Reader Service

**Files:**
- Create: `src/resumeReader.ts`
- Create: `test/resumeReader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/resumeReader.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DataStore } from '../src/dataStore';
import { ResumeReader } from '../src/resumeReader';

function makeItem(overrides: Record<string, any>) {
  return {
    id: overrides.id,
    parentID: overrides.parentID ?? null,
    isRegularItem: () => Boolean(overrides.regular),
    isPDFAttachment: () => Boolean(overrides.pdf),
    getBestAttachment: overrides.getBestAttachment,
    ...overrides
  };
}

test('resolves a parent item to the tracked last attachment and page', async () => {
  const parent = makeItem({ id: 20, regular: true });
  const attachment = makeItem({ id: 10, parentID: 20, pdf: true });
  const opened: any[] = [];

  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 10);
        return attachment;
      }
    },
    Reader: {
      open(itemID: number, location: any) {
        opened.push([itemID, location]);
      }
    }
  };

  const dataStore = {
    getData(item: any) {
      assert.equal(item, parent);
      return {
        v: 1,
        p: { '10': 0.4 },
        c: null,
        s: 'reading',
        ts: 1,
        lastAttachmentId: '10',
        lastPage: 3,
        lastReadAt: 100
      };
    }
  } as DataStore;

  const reader = new ResumeReader(dataStore);
  assert.equal(await reader.canResume(parent), true);
  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(opened, [[10, { pageIndex: 2 }]]);
});

test('resolves a PDF attachment directly without mutating data', async () => {
  const attachment = makeItem({ id: 10, parentID: 20, pdf: true });
  const parent = makeItem({ id: 20, regular: true });
  const opened: any[] = [];
  let getDataCalls = 0;

  (globalThis as any).Zotero = {
    Items: {
      get(id: number) {
        assert.equal(id, 20);
        return parent;
      }
    },
    Reader: {
      open(itemID: number, location: any) {
        opened.push([itemID, location]);
      }
    }
  };

  const dataStore = {
    getData(item: any) {
      getDataCalls++;
      assert.equal(item, parent);
      return {
        v: 1,
        p: { '10': 0.5 },
        c: null,
        s: null,
        ts: 1,
        lastAttachmentId: '10',
        lastPage: 5,
        lastReadAt: 100
      };
    }
  } as DataStore;

  const reader = new ResumeReader(dataStore);
  assert.equal(await reader.resume(attachment), true);
  assert.deepEqual(opened, [[10, { pageIndex: 4 }]]);
  assert.equal(getDataCalls, 1);
});

test('opens PDF without page location when last page is missing', async () => {
  const parent = makeItem({ id: 20, regular: true });
  const attachment = makeItem({ id: 10, parentID: 20, pdf: true });
  const opened: any[] = [];

  (globalThis as any).Zotero = {
    Items: {
      get() {
        return attachment;
      }
    },
    Reader: {
      open(itemID: number, location?: any) {
        opened.push([itemID, location]);
      }
    }
  };

  const dataStore = {
    getData() {
      return {
        v: 1,
        p: { '10': 0.5 },
        c: null,
        s: null,
        ts: 1,
        lastAttachmentId: '10',
        lastPage: null,
        lastReadAt: 100
      };
    }
  } as DataStore;

  const reader = new ResumeReader(dataStore);
  assert.equal(await reader.resume(parent), true);
  assert.deepEqual(opened, [[10, undefined]]);
});

test('returns false when no resumable attachment exists', async () => {
  const parent = makeItem({ id: 20, regular: true });

  (globalThis as any).Zotero = {
    Items: {
      get() {
        return null;
      }
    },
    Reader: {
      open() {
        throw new Error('should not open');
      }
    }
  };

  const dataStore = {
    getData() {
      return {
        v: 1,
        p: {},
        c: null,
        s: null,
        ts: 0,
        lastAttachmentId: null,
        lastPage: null,
        lastReadAt: null
      };
    }
  } as DataStore;

  const reader = new ResumeReader(dataStore);
  assert.equal(await reader.canResume(parent), false);
  assert.equal(await reader.resume(parent), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `../src/resumeReader` does not exist.

- [ ] **Step 3: Implement ResumeReader**

Create `src/resumeReader.ts`:

```ts
import { DataStore } from './dataStore';
import { Logger } from './Logger';

interface ResumeTarget {
  attachment: any;
  lastPage: number | null;
}

export class ResumeReader {
  constructor(private dataStore: DataStore) {}

  public async canResume(item: any): Promise<boolean> {
    return Boolean(await this.resolveTarget(item));
  }

  public async resume(item: any): Promise<boolean> {
    const target = await this.resolveTarget(item);
    if (!target) return false;

    const location = this.getLocation(target.lastPage);
    try {
      await this.openAttachment(target.attachment, location);
      return true;
    } catch (e) {
      if (location) {
        Logger.warn('Resume Reading page navigation failed; opening PDF without page', e);
        await this.openAttachment(target.attachment);
        return true;
      }
      Logger.error('Resume Reading failed', e);
      return false;
    }
  }

  private async resolveTarget(item: any): Promise<ResumeTarget | null> {
    if (!item) return null;

    if (item.isPDFAttachment?.()) {
      const parent = this.getParentItem(item);
      const data = parent?.isRegularItem?.() ? this.dataStore.getData(parent) : null;
      return {
        attachment: item,
        lastPage: data?.lastPage ?? null
      };
    }

    if (!item.isRegularItem?.()) return null;

    const data = this.dataStore.getData(item);
    const attachment = this.getTrackedAttachment(data.lastAttachmentId) ?? await this.getBestPDFAttachment(item);
    if (!attachment?.isPDFAttachment?.()) return null;

    return {
      attachment,
      lastPage: data.lastPage
    };
  }

  private getTrackedAttachment(lastAttachmentId: string | null): any | null {
    if (!lastAttachmentId) return null;
    const id = Number.parseInt(lastAttachmentId, 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    return Zotero.Items.get(id) ?? null;
  }

  private getParentItem(attachment: any): any | null {
    const parentID = attachment?.parentID;
    if (!parentID) return null;
    return Zotero.Items.get(parentID) ?? null;
  }

  private async getBestPDFAttachment(item: any): Promise<any | null> {
    const best = await item.getBestAttachment?.();
    return best?.isPDFAttachment?.() ? best : null;
  }

  private getLocation(lastPage: number | null): { pageIndex: number } | undefined {
    return typeof lastPage === 'number' && Number.isFinite(lastPage) && lastPage > 0
      ? { pageIndex: Math.max(0, Math.round(lastPage) - 1) }
      : undefined;
  }

  private async openAttachment(attachment: any, location?: { pageIndex: number }) {
    if (Zotero.Reader?.open) {
      await Zotero.Reader.open(attachment.id, location);
      return;
    }
    await ZoteroPane.openPDF?.(attachment.id, location);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit
```

Expected: PASS, including resume reader tests.

- [ ] **Step 5: Commit**

```bash
git add src/resumeReader.ts test/resumeReader.test.ts
git commit -m "feat: add resume reading service"
```

## Task 3: Wire Resume Reading and Queue Menu Actions

**Files:**
- Modify: `src/menuManager.ts`
- Modify: `addon/locale/en-US/reading-flow.ftl`
- Test: `test/readingQueue.test.ts`, `test/resumeReader.test.ts`

- [ ] **Step 1: Inspect current locale file**

Run:

```bash
sed -n '1,80p' addon/locale/en-US/reading-flow.ftl
```

Expected: Existing `reading-flow-menu`, status labels, and reset label are present.

- [ ] **Step 2: Add locale labels**

Modify `addon/locale/en-US/reading-flow.ftl` to include:

```ftl
reading-flow-resume-reading = Resume Reading
reading-flow-queue-continue = Continue Reading
reading-flow-queue-nearly-done = Nearly Done
reading-flow-queue-stale = Stale Reading
```

- [ ] **Step 3: Add constructor dependency and menu entries**

Modify `src/menuManager.ts` imports:

```ts
import { DataStore } from './dataStore';
import { ReadingStatus } from './flowData';
import { getReadingQueueState } from './readingQueue';
import { Logger } from './Logger';
import { ResumeReader } from './resumeReader';
```

Modify class fields and constructor:

```ts
export class ReadingFlowMenuManager {
  private registeredMenuID: string | false | null = null;
  private resumeReader: ResumeReader;

  constructor(private dataStore: DataStore) {
    this.resumeReader = new ResumeReader(dataStore);
  }
```

Add new menu items before status menus:

```ts
{
  menuType: 'menuitem',
  l10nID: 'reading-flow-resume-reading',
  onShowing: async (_event: Event, context: any) => {
    const selected = this.getSelectedItems();
    const canResume = selected.length === 1 && await this.resumeReader.canResume(selected[0]);
    context.setEnabled(canResume);
  },
  onCommand: () => this.resumeSelectedItem()
},
{
  menuType: 'separator'
},
{
  menuType: 'menuitem',
  l10nID: 'reading-flow-queue-continue',
  onShowing: (_event: Event, context: any) => {
    context.setChecked?.(this.selectedRegularItemsMatchQueue('continueReading'));
  },
  onCommand: () => this.logQueueSelection('continueReading')
},
{
  menuType: 'menuitem',
  l10nID: 'reading-flow-queue-nearly-done',
  onShowing: (_event: Event, context: any) => {
    context.setChecked?.(this.selectedRegularItemsMatchQueue('nearlyDone'));
  },
  onCommand: () => this.logQueueSelection('nearlyDone')
},
{
  menuType: 'menuitem',
  l10nID: 'reading-flow-queue-stale',
  onShowing: (_event: Event, context: any) => {
    context.setChecked?.(this.selectedRegularItemsMatchQueue('staleReading'));
  },
  onCommand: () => this.logQueueSelection('staleReading')
},
{
  menuType: 'separator'
},
```

Add helper methods:

```ts
  private async resumeSelectedItem() {
    const [item] = this.getSelectedItems();
    if (!item) return;
    try {
      await this.resumeReader.resume(item);
    } catch (e) {
      Logger.error(`resume reading failed for item ${item?.id}`, e);
    }
  }

  private selectedRegularItemsMatchQueue(queue: 'continueReading' | 'nearlyDone' | 'staleReading'): boolean {
    const items = this.getSelectedRegularItems();
    if (!items.length) return false;
    return items.some((item) => {
      const state = getReadingQueueState(this.dataStore.getData(item));
      return state[queue];
    });
  }

  private logQueueSelection(queue: 'continueReading' | 'nearlyDone' | 'staleReading') {
    const items = this.getSelectedRegularItems().filter((item) => {
      const state = getReadingQueueState(this.dataStore.getData(item));
      return state[queue];
    });
    Logger.log(`Reading queue ${queue}: ${items.map((item) => item.id).join(', ') || 'none'}`);
  }

  private getSelectedItems(): any[] {
    const pane = Zotero.getActiveZoteroPane?.();
    return pane?.getSelectedItems?.() ?? pane?.itemsView?.getSelectedItems?.() ?? [];
  }
```

Modify `getSelectedRegularItems()` to reuse `getSelectedItems()`:

```ts
  private getSelectedRegularItems(): any[] {
    return this.getSelectedItems().filter((item: any) => item?.isRegularItem?.());
  }
```

Important: This first menu wiring makes queue state visible via checked menu items and debug logging only. It does not create a dashboard or mutate item data.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/menuManager.ts addon/locale/en-US/reading-flow.ftl
git commit -m "feat: add reading flow resume menu"
```

## Task 4: Document User Workflow and Troubleshooting

**Files:**
- Modify: `README.md`
- Modify: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: Update README feature list**

Modify `README.md` feature list to include:

```md
- `Resume Reading`: right-click a tracked item or PDF attachment to reopen it near the last tracked page.
- `Reading Queue` hints: menu indicators for papers to continue, nearly finished papers, and stale reading.
```

- [ ] **Step 2: Update README use section**

Add after the manual status instructions:

```md
To resume reading:

1. Select a tracked Zotero item or PDF attachment.
2. Right-click the selection.
3. Open `Reading Flow`.
4. Choose `Resume Reading`.

If Reading Flow has a saved page number, it will try to reopen the PDF near that page. If page navigation is unavailable, it opens the PDF normally.
```

- [ ] **Step 3: Update troubleshooting**

Add to `docs/TROUBLESHOOTING.md`:

```md
## Resume Reading opens the PDF but not the exact page

Reading Flow stores the last tracked page when Zotero reader page-change events are available.
If Zotero's reader API does not accept page navigation in the current environment, Reading Flow falls back to opening the PDF normally.

Check that the item has a `ReadingFlow:` line with `lastAttachmentId` and `lastPage` in the parent item's `Extra` field.
```

- [ ] **Step 4: Run verification**

Run:

```bash
npm run verify
```

Expected: PASS with typecheck, unit tests, build, and XPI validation.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/TROUBLESHOOTING.md
git commit -m "docs: describe resume reading workflow"
```

## Task 5: Manual Zotero Verification

**Files:**
- No source files expected.
- Uses built XPI from `npm run verify`.

- [ ] **Step 1: Build final XPI**

Run:

```bash
npm run verify
```

Expected: PASS and `zotero-reading-flow.xpi` exists.

- [ ] **Step 2: Install into default profile for local verification**

Run:

```bash
PROFILE_DIR="$HOME/Library/Application Support/Zotero/Profiles/65dw3txp.default"
osascript -e 'quit app "Zotero"' >/dev/null 2>&1 || true
sleep 2
cp zotero-reading-flow.xpi "$PROFILE_DIR/extensions/readingflow@moon.com.xpi"
open -a Zotero
```

Expected: Zotero opens with the user's default profile.

- [ ] **Step 3: Verify menu behavior manually**

Manual checks:

- Right-click a tracked parent item and confirm `Reading Flow > Resume Reading` is enabled.
- Choose `Resume Reading` and confirm a PDF opens.
- Right-click a PDF attachment with tracked parent data and confirm `Resume Reading` is enabled.
- Right-click an untracked item and confirm `Resume Reading` is disabled or no-ops.
- Confirm existing status actions and `Reset Reading Progress` still work.
- Confirm Progress, Status, and Last Read columns still align visually.

- [ ] **Step 4: Commit if verification caused no source changes**

Run:

```bash
git status --short
```

Expected: no tracked source changes. Do not commit generated ignored files.

## Self-Review

Spec coverage:

- Resume Reading is covered by Task 2, Task 3, and Task 5.
- Reading Queue classification is covered by Task 1 and surfaced in Task 3.
- No new metadata fields are added.
- Error fallback behavior is covered in Task 2 tests and Task 4 docs.
- Existing columns and verification are covered in Task 4 and Task 5.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps remain.
- Queue custom dashboard is explicitly non-goal for this plan.

Type consistency:

- Queue keys are `continueReading`, `nearlyDone`, and `staleReading` in tests, implementation, and menu wiring.
- Existing `FlowData` fields match `flowData.ts`.
- `ResumeReader` depends on existing `DataStore.getData()` and does not write data.
