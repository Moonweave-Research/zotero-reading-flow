# Reading Flow Attention Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single compact `Flow` column that combines reading progress, status, priority, and stale-reading signals without forcing users to keep multiple Reading Flow columns visible.

**Architecture:** Add priority as a backward-compatible field on the existing Reading Flow metadata, then isolate display derivation in a new `attention` module. `ColumnManager` renders the compact scan column, while `ReadingFlowMenuManager` adds priority controls under the existing context menu.

**Tech Stack:** TypeScript, Zotero 9 bootstrap plugin APIs, Node test runner via `scripts/run-unit-tests.js`, esbuild, existing `npm run verify` gate.

---

## Execution Preconditions

Run this plan in a clean feature branch or dedicated worktree. The current repository may already contain unrelated release work, so do not mix the attention-column implementation with the v1.1.14 release-hardening diff.

Before editing source code, run:

```bash
git status --short --branch
```

Expected before implementation:

```text
## <feature-branch>
```

If tracked or untracked files are listed, stop and isolate the implementation in a clean branch/worktree or commit the existing work first.

## File Structure

- Modify `src/flowData.ts`: add `ReadingPriority`, `priority`, priority normalization, and backward-compatible metadata merging.
- Create `src/attention.ts`: derive compact label, tooltip, sort value, and visual tone from `FlowData`.
- Modify `src/dataStore.ts`: add `setPriority(item, priority)` as the single write surface for priority menu actions.
- Modify `src/columnManager.ts`: register and render the new compact `Flow` column.
- Modify `src/menuManager.ts`: add priority menu actions using the existing multi-item update path.
- Modify `addon/locale/en-US/reading-flow.ftl`: add Fluent labels for priority menu entries.
- Modify `test/flowData.test.ts`: cover priority normalization and merge behavior.
- Create `test/attention.test.ts`: cover the pure attention derivation module.
- Modify `test/dataStore.test.ts`: cover `setPriority`.
- Modify `test/columnManager.test.ts`: cover Flow column registration and rendering.
- Modify `test/menuManager.test.ts`: cover priority menu labels and commands.
- Optionally modify `README.md` and `CHANGELOG.md` after behavior is verified.

## Task 1: Add Priority To Flow Data

**Files:**
- Modify: `src/flowData.ts`
- Modify: `test/flowData.test.ts`

- [ ] **Step 1: Write the failing priority normalization test**

Add `ReadingPriority` to the import list in `test/flowData.test.ts`, then add:

```ts
test('normalizeFlowData preserves valid priority and drops invalid priority', () => {
  assert.equal(normalizeFlowData({ priority: 'high' }).priority, 'high');
  assert.equal(normalizeFlowData({ priority: 'normal' }).priority, 'normal');
  assert.equal(normalizeFlowData({ priority: 'low' }).priority, 'low');
  assert.equal(normalizeFlowData({ priority: 'urgent' }).priority, null);
  assert.equal(normalizeFlowData({}).priority, null);

  const priority: ReadingPriority = 'high';
  assert.equal(priority, 'high');
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL with TypeScript or assertion output showing `ReadingPriority` or `priority` is not defined on `FlowData`.

- [ ] **Step 3: Implement the priority schema**

Update `src/flowData.ts` with these additions:

```ts
export type ReadingPriority = 'high' | 'normal' | 'low';

export interface FlowData {
  v: number;
  p: { [attId: string]: number };
  pageCount?: { [attId: string]: number };
  c: string | null;
  s: ReadingStatus | null;
  priority: ReadingPriority | null;
  ts: number;
  lastAttachmentId: string | null;
  lastPage: number | null;
  lastReadAt: number | null;
}

export const DEFAULT_FLOW_DATA: FlowData = {
  v: 1,
  p: {},
  c: null,
  s: null,
  priority: null,
  ts: 0,
  lastAttachmentId: null,
  lastPage: null,
  lastReadAt: null
};

const VALID_PRIORITIES = new Set<ReadingPriority>(['high', 'normal', 'low']);
```

In `normalizeFlowData`, include priority in the returned object:

```ts
priority: VALID_PRIORITIES.has(input?.priority) ? input.priority : null,
```

- [ ] **Step 4: Run the focused validation**

Run:

```bash
npm run test:unit
```

Expected: PASS, including the new priority normalization test.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/flowData.ts test/flowData.test.ts
git commit -m "feat: add reading priority metadata"
```

## Task 2: Add The Attention Derivation Module

**Files:**
- Create: `src/attention.ts`
- Create: `test/attention.test.ts`

- [ ] **Step 1: Write the failing attention tests**

Create `test/attention.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAttentionSummary,
  parseAttentionSummary,
  serializeAttentionSummary
} from '../src/attention';
import { normalizeFlowData } from '../src/flowData';

const now = Date.parse('2026-05-12T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

test('getAttentionSummary stays quiet for untouched items', () => {
  const summary = getAttentionSummary(normalizeFlowData({}), now);

  assert.equal(summary.label, '');
  assert.equal(summary.title, '');
  assert.equal(summary.tone, 'empty');
  assert.equal(summary.sortValue, '900|empty');
});

test('getAttentionSummary displays active reading progress compactly', () => {
  const summary = getAttentionSummary(normalizeFlowData({
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastPage: 9,
    pageCount: { '10': 20 },
    lastReadAt: now - day
  }), now);

  assert.equal(summary.label, '45% Reading');
  assert.equal(summary.tone, 'reading');
  assert.equal(summary.sortValue, '300|reading|045');
  assert.match(summary.title, /Status: Reading/);
  assert.match(summary.title, /Progress: 45%/);
  assert.match(summary.title, /Page: 9 \/ 20/);
  assert.match(summary.title, /Last read: 1d/);
});

test('getAttentionSummary promotes high-priority stale reading', () => {
  const summary = getAttentionSummary(normalizeFlowData({
    priority: 'high',
    p: { '10': 0.2 },
    lastAttachmentId: '10',
    lastReadAt: now - 15 * day
  }), now);

  assert.equal(summary.label, 'High Stale 15d');
  assert.equal(summary.tone, 'high');
  assert.equal(summary.sortValue, '000|high-stale|015');
  assert.match(summary.title, /Priority: High/);
  assert.match(summary.title, /Stale: 15d/);
});

test('getAttentionSummary keeps completed items out of stale state', () => {
  const summary = getAttentionSummary(normalizeFlowData({
    s: 'read',
    priority: 'high',
    lastReadAt: now - 90 * day
  }), now);

  assert.equal(summary.label, 'High Read');
  assert.equal(summary.tone, 'complete');
  assert.equal(summary.sortValue, '500|read');
  assert.doesNotMatch(summary.title, /Stale/);
});

test('getAttentionSummary keeps important status visible', () => {
  const summary = getAttentionSummary(normalizeFlowData({
    s: 'important',
    lastReadAt: now - 30 * day
  }), now);

  assert.equal(summary.label, 'Important');
  assert.equal(summary.tone, 'important');
  assert.equal(summary.sortValue, '100|important');
});

test('serializeAttentionSummary round-trips display data', () => {
  const summary = getAttentionSummary(normalizeFlowData({
    priority: 'low',
    s: 'to-read'
  }), now);

  assert.deepEqual(parseAttentionSummary(serializeAttentionSummary(summary)), summary);
  assert.equal(parseAttentionSummary(''), null);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `src/attention.ts` does not exist.

- [ ] **Step 3: Implement `src/attention.ts`**

Create `src/attention.ts`:

```ts
import {
  FlowData,
  ReadingPriority,
  ReadingStatus,
  formatRelativeDate,
  getDisplayAttachmentId,
  getDisplayProgress,
  inferStatus
} from './flowData';

export type AttentionTone = 'empty' | 'high' | 'low' | 'reading' | 'important' | 'complete' | 'neutral';

export interface AttentionSummary {
  label: string;
  title: string;
  sortValue: string;
  tone: AttentionTone;
}

const STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read',
  important: 'Important'
};

const PRIORITY_LABELS: Record<ReadingPriority, string> = {
  high: 'High',
  normal: 'Normal',
  low: 'Low'
};

export function getAttentionSummary(data: FlowData, now = Date.now()): AttentionSummary {
  const status = inferStatus(data);
  const progress = getDisplayProgress(data);
  const staleDays = getStaleDays(data, status, now);
  const priority = data.priority;
  const titleParts = getTitleParts(data, status, progress, staleDays, now);

  if (status === 'important') {
    return {
      label: withPriority(priority, 'Important'),
      title: titleParts.join('; '),
      sortValue: priority === 'high' ? '000|high-important' : '100|important',
      tone: priority === 'low' ? 'low' : 'important'
    };
  }

  if (staleDays !== null) {
    const label = `${withPriority(priority, `Stale ${staleDays}d`)}`;
    return {
      label,
      title: titleParts.join('; '),
      sortValue: priority === 'high'
        ? `000|high-stale|${pad3(staleDays)}`
        : `200|stale|${pad3(staleDays)}`,
      tone: priority === 'low' ? 'low' : priority === 'high' ? 'high' : 'reading'
    };
  }

  if (status === 'read') {
    return {
      label: withPriority(priority, 'Read'),
      title: titleParts.join('; '),
      sortValue: '500|read',
      tone: 'complete'
    };
  }

  if (status === 'skimmed') {
    return {
      label: withPriority(priority, 'Skimmed'),
      title: titleParts.join('; '),
      sortValue: priority === 'high' ? '050|high-skimmed' : '550|skimmed',
      tone: priority === 'high' ? 'high' : 'neutral'
    };
  }

  if (progress > 0) {
    const progressLabel = progress > 1 ? `p. ${Math.round(progress)}` : `${Math.round(progress * 100)}%`;
    const label = withPriority(priority, `${progressLabel} Reading`);
    return {
      label,
      title: titleParts.join('; '),
      sortValue: priority === 'high'
        ? `010|high-reading|${pad3(Math.round(progress * 100))}`
        : `300|reading|${pad3(Math.round(progress * 100))}`,
      tone: priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'reading'
    };
  }

  if (priority && priority !== 'normal') {
    return {
      label: `${PRIORITY_LABELS[priority]} To Read`,
      title: titleParts.join('; '),
      sortValue: priority === 'high' ? '020|high-to-read' : '700|low-to-read',
      tone: priority === 'high' ? 'high' : 'low'
    };
  }

  return {
    label: '',
    title: '',
    sortValue: '900|empty',
    tone: 'empty'
  };
}

export function serializeAttentionSummary(summary: AttentionSummary): string {
  if (!summary.label) return '';
  return [summary.sortValue, summary.label, summary.title, summary.tone].join('\t');
}

export function parseAttentionSummary(data: string): AttentionSummary | null {
  if (!data) return null;
  const [sortValue, label, title, tone] = data.split('\t');
  if (!sortValue || !label || !isAttentionTone(tone)) return null;
  return { sortValue, label, title: title || '', tone };
}

function getStaleDays(data: FlowData, status: ReadingStatus, now: number): number | null {
  if (status === 'read' || status === 'skimmed' || status === 'important') return null;
  if (!data.lastReadAt || data.lastReadAt <= 0) return null;
  if (getDisplayProgress(data) <= 0) return null;

  const days = Math.floor(Math.max(0, now - data.lastReadAt) / DAY_MS);
  return days >= STALE_DAYS ? days : null;
}

function getTitleParts(
  data: FlowData,
  status: ReadingStatus,
  progress: number,
  staleDays: number | null,
  now: number
): string[] {
  const parts = [`Status: ${STATUS_LABELS[status]}`];
  if (data.priority) parts.push(`Priority: ${PRIORITY_LABELS[data.priority]}`);
  if (progress > 0 && progress <= 1) parts.push(`Progress: ${Math.round(progress * 100)}%`);
  if (progress > 1) parts.push(`Progress: p. ${Math.round(progress)}`);

  const attachmentId = getDisplayAttachmentId(data);
  const total = attachmentId ? data.pageCount?.[attachmentId] : null;
  if (data.lastPage && total) parts.push(`Page: ${data.lastPage} / ${total}`);
  if (data.lastPage && !total) parts.push(`Page: ${data.lastPage}`);
  if (data.lastReadAt) parts.push(`Last read: ${formatRelativeDate(data.lastReadAt, now)}`);
  if (staleDays !== null) parts.push(`Stale: ${staleDays}d`);
  return parts;
}

function withPriority(priority: ReadingPriority | null, label: string): string {
  if (priority === 'high' || priority === 'low') return `${PRIORITY_LABELS[priority]} ${label}`;
  return label;
}

function pad3(value: number): string {
  return String(Math.max(0, Math.min(999, value))).padStart(3, '0');
}

function isAttentionTone(value: string | undefined): value is AttentionTone {
  return value === 'empty'
    || value === 'high'
    || value === 'low'
    || value === 'reading'
    || value === 'important'
    || value === 'complete'
    || value === 'neutral';
}
```

- [ ] **Step 4: Run the focused validation**

Run:

```bash
npm run test:unit
```

Expected: PASS, including all `attention.test.ts` tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/attention.ts test/attention.test.ts
git commit -m "feat: derive compact reading attention state"
```

## Task 3: Add Priority Writes To DataStore

**Files:**
- Modify: `src/dataStore.ts`
- Modify: `test/dataStore.test.ts`

- [ ] **Step 1: Write the failing DataStore priority test**

Append to `test/dataStore.test.ts`:

```ts
test('setPriority persists and clears priority through ReadingFlow metadata', async () => {
  let extra = '';
  const saves: string[] = [];
  const item = {
    id: 1,
    getField(fieldName: string) {
      assert.equal(fieldName, 'extra');
      return extra;
    },
    setField(fieldName: string, value: string) {
      assert.equal(fieldName, 'extra');
      extra = value;
    },
    async saveTx() {
      saves.push(extra);
    }
  };
  const store = new DataStore();

  await store.setPriority(item, 'high');
  assert.equal(store.getData(item).priority, 'high');
  assert.match(extra, /"priority":"high"/);

  await store.setPriority(item, null);
  assert.equal(store.getData(item).priority, null);
  assert.match(extra, /"priority":null/);
  assert.equal(saves.length, 2);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `DataStore.setPriority` is not defined.

- [ ] **Step 3: Implement `setPriority`**

Update imports in `src/dataStore.ts`:

```ts
ReadingPriority,
ReadingStatus
```

Add the public method:

```ts
public async setPriority(item: any, priority: ReadingPriority | null) {
  await this.updateData(item, { priority });
}
```

- [ ] **Step 4: Run the focused validation**

Run:

```bash
npm run test:unit
```

Expected: PASS, including the new `setPriority` test.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/dataStore.ts test/dataStore.test.ts
git commit -m "feat: persist reading priority"
```

## Task 4: Register And Render The Flow Column

**Files:**
- Modify: `src/columnManager.ts`
- Modify: `test/columnManager.test.ts`

- [ ] **Step 1: Write the failing Flow column tests**

Append to `test/columnManager.test.ts`:

```ts
test('register adds the Flow column before detailed Reading Flow columns', async () => {
  const registered: any[] = [];
  (globalThis as any).Zotero = {
    ItemTreeManager: {
      async registerColumn(config: any) {
        registered.push(config);
        return config.dataKey;
      },
      unregisterColumn() {},
      refreshColumns() {}
    },
    Prefs: {
      get() {
        return true;
      }
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: { '10': 0.45 },
        c: null,
        s: null,
        priority: 'high',
        ts: 0,
        lastAttachmentId: '10',
        lastPage: 9,
        lastReadAt: Date.parse('2026-05-01T00:00:00Z'),
        pageCount: { '10': 20 }
      };
    }
  } as any);
  (manager as any).ensureColumnsVisibleOnFirstRun = async () => {};

  await manager.register();

  assert.equal(registered[0].dataKey, 'readingFlowFlow');
  assert.equal(registered[0].label, 'Flow');
  assert.deepEqual(registered.map((column) => column.dataKey), [
    'readingFlowFlow',
    'readingFlowProgress',
    'readingFlowStatus',
    'readingFlowLastRead'
  ]);
});

test('Flow column renders compact label and tooltip', async () => {
  const registered: any[] = [];
  const now = Date.parse('2026-05-12T12:00:00Z');
  const originalDateNow = Date.now;
  Date.now = () => now;

  (globalThis as any).Zotero = {
    ItemTreeManager: {
      async registerColumn(config: any) {
        registered.push(config);
        return config.dataKey;
      },
      unregisterColumn() {}
    },
    Prefs: {
      get() {
        return true;
      }
    },
    debug() {},
    logError() {}
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: { '10': 0.45 },
        c: null,
        s: null,
        priority: 'high',
        ts: 0,
        lastAttachmentId: '10',
        lastPage: 9,
        lastReadAt: now - 15 * 24 * 60 * 60 * 1000,
        pageCount: { '10': 20 }
      };
    }
  } as any);
  (manager as any).ensureColumnsVisibleOnFirstRun = async () => {};

  try {
    await manager.register();
    const flowColumn = registered.find((column) => column.dataKey === 'readingFlowFlow');
    const item = { isRegularItem: () => true };
    const data = flowColumn.dataProvider(item, flowColumn.dataKey);
    const cell = flowColumn.renderCell(0, data, { className: 'flow' }, false, document);

    assert.equal(cell.textContent, 'High Stale 15d');
    assert.match(cell.title, /Priority: High/);
    assert.match(cell.title, /Stale: 15d/);
    assert.match(cell.getAttribute('style') ?? '', /overflow:hidden/);
  } finally {
    Date.now = originalDateNow;
  }
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because the Flow column is not registered.

- [ ] **Step 3: Implement Flow column registration**

Update `src/columnManager.ts` imports:

```ts
import { getAttentionSummary, parseAttentionSummary, serializeAttentionSummary } from './attention';
```

Add the data key:

```ts
const FLOW_KEY = 'readingFlowFlow';
```

Change the class data keys:

```ts
private readonly dataKeys = [FLOW_KEY, PROGRESS_KEY, STATUS_KEY, LAST_READ_KEY];
```

At the beginning of `register()`, before the existing Progress column, add:

```ts
const flowKey = await Zotero.ItemTreeManager.registerColumn({
  dataKey: FLOW_KEY,
  label: 'Flow',
  pluginID: PLUGIN_ID,
  enabledTreeIDs: ['main'],
  zoteroPersist: ['width', 'hidden', 'sortDirection'],
  dataProvider: (item: any): string => {
    try {
      if (!item?.isRegularItem?.()) return '';
      return serializeAttentionSummary(getAttentionSummary(this.dataStore.getData(item)));
    } catch (e) {
      Logger.error('flow dataProvider failed', e);
      return '';
    }
  },
  renderCell: (_index: number, data: string, column: any, _isFirstColumn: boolean, doc: Document): HTMLElement => {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;font-size:11px;text-overflow:ellipsis;white-space:nowrap;`;

    const summary = parseAttentionSummary(data);
    if (!summary) return cell;

    const badge = doc.createElement('span');
    badge.textContent = summary.label;
    badge.title = summary.title;
    badge.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'max-width:100%',
      'height:18px',
      'padding:0 6px',
      'border-radius:9px',
      'box-sizing:border-box',
      'font-size:10px',
      'line-height:1',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      `color:${this.getAttentionColor(summary.tone)}`,
      `background:${this.getAttentionColor(summary.tone)}1a`
    ].join(';');
    cell.title = summary.title;
    cell.appendChild(badge);
    return cell;
  }
});
```

Add helper method inside `ColumnManager`:

```ts
private getAttentionColor(tone: string): string {
  if (tone === 'high') return '#dc2626';
  if (tone === 'low') return '#6b7280';
  if (tone === 'important') return '#dc2626';
  if (tone === 'complete') return '#16a34a';
  if (tone === 'reading') return '#2563eb';
  return '#374151';
}
```

Update warnings and registered keys:

```ts
if (!flowKey) Logger.warn('registerColumn returned null for Flow — column will not appear');
this.registeredDataKeys = [flowKey, progressKey, statusKey, lastReadKey].filter(Boolean);
```

- [ ] **Step 4: Run the focused validation**

Run:

```bash
npm run test:unit
```

Expected: PASS, including the new Flow column tests.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/columnManager.ts test/columnManager.test.ts
git commit -m "feat: add compact flow column"
```

## Task 5: Add Priority Controls To The Context Menu

**Files:**
- Modify: `src/menuManager.ts`
- Modify: `addon/locale/en-US/reading-flow.ftl`
- Modify: `test/menuManager.test.ts`

- [ ] **Step 1: Write the failing menu tests**

In `test/menuManager.test.ts`, update the fake `dataStore` inside `setupMenu`:

```ts
const priorityCalls: any[] = [];
```

```ts
async setPriority(_item: any, priority: any) {
  priorityCalls.push(priority);
  mutationCalls.push('setPriority');
}
```

Return `priorityCalls` from `setupMenu`:

```ts
return {
  openCalls,
  manager,
  mutationCalls,
  priorityCalls,
  submenu,
  menuByL10nID(l10nID: string) {
    return submenu.menus.find((menu: any) => (menu.l10nID ?? menu.l10nId) === l10nID);
  }
};
```

Extend `menus include direct labels as a fallback for nested native menu rendering`:

```ts
assert.equal(menuByL10nID('reading-flow-priority-high').label, 'Set Priority High');
assert.equal(menuByL10nID('reading-flow-priority-normal').label, 'Set Priority Normal');
assert.equal(menuByL10nID('reading-flow-priority-low').label, 'Set Priority Low');
assert.equal(menuByL10nID('reading-flow-priority-clear').label, 'Clear Priority');
```

Add:

```ts
test('priority commands use command context and refresh item tree', async () => {
  const item = makeRegularItem(20);
  const { menuByL10nID, mutationCalls, priorityCalls } = setupMenu([], {
    20: flowData()
  }, [item]);
  const commandContext = { items: [item] };

  await menuByL10nID('reading-flow-priority-high').onCommand(new Event('command'), commandContext);
  await menuByL10nID('reading-flow-priority-normal').onCommand(new Event('command'), commandContext);
  await menuByL10nID('reading-flow-priority-low').onCommand(new Event('command'), commandContext);
  await menuByL10nID('reading-flow-priority-clear').onCommand(new Event('command'), commandContext);

  assert.deepEqual(priorityCalls, ['high', 'normal', 'low', null]);
  assert.deepEqual(mutationCalls, [
    'setPriority',
    'refreshColumns',
    'notifier',
    'setPriority',
    'refreshColumns',
    'notifier',
    'setPriority',
    'refreshColumns',
    'notifier',
    'setPriority',
    'refreshColumns',
    'notifier'
  ]);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:unit
```

Expected: FAIL because priority menu entries are not registered.

- [ ] **Step 3: Implement priority menu entries**

Update imports in `src/menuManager.ts`:

```ts
import { ReadingPriority, ReadingStatus } from './flowData';
```

Extend `MENU_LABELS`:

```ts
priorityHigh: 'Set Priority High',
priorityNormal: 'Set Priority Normal',
priorityLow: 'Set Priority Low',
priorityClear: 'Clear Priority',
```

In the submenu list, insert these entries after status commands and before reset:

```ts
{
  menuType: 'separator'
},
this.priorityMenu('high', 'reading-flow-priority-high', MENU_LABELS.priorityHigh),
this.priorityMenu('normal', 'reading-flow-priority-normal', MENU_LABELS.priorityNormal),
this.priorityMenu('low', 'reading-flow-priority-low', MENU_LABELS.priorityLow),
this.priorityMenu(null, 'reading-flow-priority-clear', MENU_LABELS.priorityClear),
```

Add this method:

```ts
private priorityMenu(priority: ReadingPriority | null, l10nID: string, label: string) {
  return {
    menuType: 'menuitem',
    l10nID,
    label,
    onCommand: (_event: Event, context: any) => this.updateSelectedItems(
      (item) => this.dataStore.setPriority(item, priority),
      context
    )
  };
}
```

Update `addon/locale/en-US/reading-flow.ftl`:

```ftl
reading-flow-priority-high =
    .label = Set Priority High
reading-flow-priority-normal =
    .label = Set Priority Normal
reading-flow-priority-low =
    .label = Set Priority Low
reading-flow-priority-clear =
    .label = Clear Priority
```

- [ ] **Step 4: Run the focused validation**

Run:

```bash
npm run test:unit
```

Expected: PASS, including priority menu tests.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/menuManager.ts addon/locale/en-US/reading-flow.ftl test/menuManager.test.ts
git commit -m "feat: add reading priority menu actions"
```

## Task 6: Documentation And Release Notes

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Optionally modify: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: Update README feature wording**

In `README.md`, update the feature section so the primary scan surface is `Flow`:

```md
- `Flow`: a compact scan column for priority, stale in-progress reading, reading status, and progress.
- `Progress`: optional detailed progress display for users who want a dedicated progress column.
- `Status`: optional detailed reading state (`To Read`, `Reading`, `Skimmed`, `Read`, `Important`).
- `Last Read`: optional detailed recency display (`now`, `5m`, `3h`, `2d`, or a date).
```

- [ ] **Step 2: Update the quick-start column guidance**

Replace any wording that tells users to keep all three old columns visible with:

```md
For the most compact layout, keep `Flow` visible. If you want more detail, also enable `Progress`, `Status`, or `Last Read` from Zotero's column menu.
```

- [ ] **Step 3: Update changelog**

Add a new unreleased entry in `CHANGELOG.md`:

```md
## Unreleased

- Added a compact `Flow` column that combines priority, stale-reading, status, and progress signals.
- Added Reading Flow context-menu actions for setting and clearing reading priority.
- Kept `Progress`, `Status`, and `Last Read` available as optional detailed columns.
```

- [ ] **Step 4: Run docs scan**

Run:

```bash
rg -n "Progress`, `Status`, and `Last Read`|Progress, Status, and Last Read|keep.*Progress.*Status.*Last Read" README.md docs
```

Expected: any remaining matches should describe optional detailed columns, not a required default layout.

- [ ] **Step 5: Commit Task 6**

```bash
git add README.md CHANGELOG.md docs/TROUBLESHOOTING.md
git commit -m "docs: describe compact flow column"
```

If `docs/TROUBLESHOOTING.md` was not changed, omit it from `git add`.

## Task 7: Full Verification

**Files:**
- No source files changed in this task unless verification exposes a defect.

- [ ] **Step 1: Run whitespace check**

```bash
git diff --check
```

Expected:

```text
```

Exit code must be `0`.

- [ ] **Step 2: Run full repo gate**

```bash
npm run verify
```

Expected:

```text
# fail 0
Build finished. Creating .xpi...
verify-xpi: OK (8 files)
```

Exit code must be `0`.

- [ ] **Step 3: Inspect final diff**

```bash
git status --short --branch
git diff --stat
```

Expected: only files from this plan are modified, and the branch contains the task commits listed above.

- [ ] **Step 4: Manual Zotero check**

Install the generated XPI into a disposable Zotero test profile and verify:

```text
Flow column appears in the library column menu.
Flow column can stay visible without requiring Progress, Status, and Last Read.
High priority appears after Set Priority High.
Clear Priority removes the priority part of the Flow label.
An in-progress paper last read 14+ days ago shows a stale label.
Read papers do not become stale.
Progress, Status, and Last Read still render when enabled.
Resume Reading still opens the tracked attachment at the saved page.
```

- [ ] **Step 5: Commit verification fixes if needed**

If verification required source or test changes:

```bash
git add <changed-files>
git commit -m "fix: stabilize flow column verification"
```

If no files changed after verification, do not create an empty commit.

## Self-Review Notes

- Spec coverage: priority metadata, computed stale state, single compact scan column, optional detail columns, right-click controls, local-only storage, old metadata compatibility, and testing are covered.
- Scope decision: configurable stale thresholds, due dates, dashboards, annotation analysis, and AI features remain outside this plan.
- Type consistency: `ReadingPriority`, `priority`, `AttentionSummary`, `getAttentionSummary`, `serializeAttentionSummary`, `parseAttentionSummary`, and `DataStore.setPriority` are defined before later tasks use them.
- Execution risk: this plan assumes implementation starts from a clean branch or worktree because the current repo may contain unrelated release-hardening changes.
