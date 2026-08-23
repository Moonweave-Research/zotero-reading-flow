# Reading Flow Next Action Column Implementation Plan

> **Status: STALE / HISTORICAL ONLY — DO NOT EXECUTE**
>
> Superseded on 2026-07-28 by the sole active authority:
> [Reading Flow Authoritative Design and Implementation Plan](../../READING_FLOW_AUTHORITY.md).
> Preserve this file only as historical context. Agents must not execute its
> tasks or use it to override the authoritative plan.

**Goal:** Build a single `Flow` column that tells researchers the next reading action, such as `Read Next`, `Resume 45%`, `Return 45%`, `Finish 88%`, `Skimmed`, or `Done`.

**Architecture:** Keep Reading Flow's existing parent-item metadata model and add only one backward-compatible field: `priority`. Put all action-label derivation in a pure `flowAction` module so the Zotero item-tree renderer stays cheap and synchronous. Register `Flow` as the primary column while keeping `Progress`, `Status`, and `Last Read` as optional detail columns.

**Tech Stack:** TypeScript, Zotero 9 ItemTreeManager/MenuManager APIs, Node test runner through `scripts/run-unit-tests.js`, esbuild, existing `npm run verify` gate.

---

## Product Decision

This plan intentionally changes the older `Attention` idea. `Flow` must not display raw diagnostic labels such as `High Stale 12d`. Those are internal reasons, not researcher-facing actions.

Visible cell text should answer one question:

```text
What should I do with this paper next?
```

The visible cell uses short action labels:

- `Read Next`
- `Resume 45%`
- `Return 45%`
- `Finish 88%`
- `Important`
- `Skimmed`
- `Done`

The tooltip explains why:

```text
High priority · in progress · untouched 12d · page 9 / 20
```

## File Structure

- Modify `src/flowData.ts`: add `ReadingPriority`, `priority`, and normalization.
- Create `src/flowAction.ts`: derive visible action label, tooltip, sort key, and visual tone from `FlowData`.
- Modify `src/dataStore.ts`: add `setPriority(item, priority)`.
- Modify `src/columnManager.ts`: register the `Flow` column first; keep detail columns available.
- Modify `src/menuManager.ts`: add priority actions under the existing Reading Flow menu.
- Modify `addon/locale/en-US/reading-flow.ftl`: add priority menu labels.
- Modify `test/flowData.test.ts`: cover priority normalization and backward compatibility.
- Create `test/flowAction.test.ts`: cover next-action derivation.
- Modify `test/dataStore.test.ts`: cover priority persistence.
- Modify `test/columnManager.test.ts`: cover Flow registration, rendering, and first-run default visibility.
- Modify `test/menuManager.test.ts`: cover priority menu commands.
- Modify `README.md`: explain `Flow` as the primary column and detail columns as optional.
- Modify `CHANGELOG.md`: add user-facing release notes after verification.

## Action Derivation Rules

The first matching rule wins:

| Condition | Visible `Flow` label | Tooltip reason |
| --- | --- | --- |
| `status = read` or progress >= 95% | `Done` | `Read` |
| `status = skimmed` | `Skimmed` | `Skimmed` |
| `status = important` with no active progress | `Important` | `Important` |
| No Reading Flow data | blank | blank |
| high priority and no progress | `Read Next` | `High priority; not started` |
| active progress >= 80% and not complete | `Finish NN%` | `In progress; near completion` |
| active progress and last read >= 14 days ago | `Return NN%` | `In progress; untouched Nd` |
| active progress | `Resume NN%` | `In progress; last read ...` |
| explicit `status = to-read` | `To Read` | `Marked To Read` |
| low priority and no progress | blank | blank |

Note-processing states are intentionally out of this plan. A later plan can add a separate marker for "read but not processed" once the primary reading-action column is stable.

## Task 1: Add Priority Metadata

**Files:**
- Modify: `src/flowData.ts`
- Modify: `test/flowData.test.ts`

- [ ] **Step 1: Write the failing priority normalization test**

Add this import in `test/flowData.test.ts`:

```ts
import { ReadingPriority } from '../src/flowData';
```

Add this test:

```ts
test('normalizeFlowData preserves valid priority and drops invalid priority', () => {
  assert.equal(normalizeFlowData({ priority: 'high' }).priority, 'high');
  assert.equal(normalizeFlowData({ priority: 'normal' }).priority, 'normal');
  assert.equal(normalizeFlowData({ priority: 'low' }).priority, 'low');
  assert.equal(normalizeFlowData({ priority: 'urgent' }).priority, null);
  assert.equal(normalizeFlowData({ priority: '' }).priority, null);
  assert.equal(normalizeFlowData({}).priority, null);

  const priority: ReadingPriority = 'high';
  assert.equal(priority, 'high');
});
```

- [ ] **Step 2: Run the unit tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `ReadingPriority` and `FlowData.priority` do not exist.

- [ ] **Step 3: Implement the priority schema**

In `src/flowData.ts`, add:

```ts
export type ReadingPriority = 'high' | 'normal' | 'low';
```

Update `FlowData`:

```ts
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
```

Update `DEFAULT_FLOW_DATA`:

```ts
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
```

Add:

```ts
const VALID_PRIORITIES = new Set<ReadingPriority>(['high', 'normal', 'low']);
```

Add `priority` to the object returned by `normalizeFlowData`:

```ts
priority: VALID_PRIORITIES.has(input?.priority) ? input.priority : null,
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/flowData.ts test/flowData.test.ts
git commit -m "feat: add reading priority metadata"
```

## Task 2: Create The Flow Action Derivation Module

**Files:**
- Create: `src/flowAction.ts`
- Create: `test/flowAction.test.ts`

- [ ] **Step 1: Write the failing action derivation tests**

Create `test/flowAction.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFlowAction,
  parseFlowAction,
  serializeFlowAction
} from '../src/flowAction';
import { normalizeFlowData } from '../src/flowData';

const now = Date.parse('2026-06-04T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

test('getFlowAction stays quiet for untouched items', () => {
  const action = getFlowAction(normalizeFlowData({}), now);

  assert.equal(action.label, '');
  assert.equal(action.detail, '');
  assert.equal(action.title, '');
  assert.equal(action.tone, 'empty');
  assert.equal(action.sortValue, '900|empty');
});

test('getFlowAction suggests Read Next for high-priority unread papers', () => {
  const action = getFlowAction(normalizeFlowData({ priority: 'high' }), now);

  assert.equal(action.label, 'Read Next');
  assert.equal(action.detail, '');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '000|read-next');
  assert.match(action.title, /High priority/);
  assert.match(action.title, /not started/);
});

test('getFlowAction suggests Resume with percent for recent active reading', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastPage: 9,
    pageCount: { '10': 20 },
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Resume');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'reading');
  assert.equal(action.sortValue, '300|resume|045');
  assert.match(action.title, /45%/);
  assert.match(action.title, /page 9 \/ 20/);
  assert.match(action.title, /last read 1d/);
});

test('getFlowAction suggests Return instead of exposing stale diagnostics', () => {
  const action = getFlowAction(normalizeFlowData({
    priority: 'high',
    p: { '10': 0.45 },
    lastAttachmentId: '10',
    lastReadAt: now - 15 * day
  }), now);

  assert.equal(action.label, 'Return');
  assert.equal(action.detail, '45%');
  assert.equal(action.tone, 'high');
  assert.equal(action.sortValue, '100|return|015|045');
  assert.match(action.title, /High priority/);
  assert.match(action.title, /untouched 15d/);
  assert.doesNotMatch(action.label, /Stale/);
});

test('getFlowAction suggests Finish for near-complete papers', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.88 },
    lastAttachmentId: '10',
    lastReadAt: now - day
  }), now);

  assert.equal(action.label, 'Finish');
  assert.equal(action.detail, '88%');
  assert.equal(action.tone, 'finish');
  assert.equal(action.sortValue, '200|finish|088');
});

test('getFlowAction marks completed and skimmed papers plainly', () => {
  assert.equal(getFlowAction(normalizeFlowData({ s: 'read' }), now).label, 'Done');
  assert.equal(getFlowAction(normalizeFlowData({ p: { '10': 0.97 } }), now).label, 'Done');
  assert.equal(getFlowAction(normalizeFlowData({ s: 'skimmed' }), now).label, 'Skimmed');
});

test('serializeFlowAction round-trips action data for column providers', () => {
  const action = getFlowAction(normalizeFlowData({
    p: { '10': 0.45 },
    lastAttachmentId: '10'
  }), now);

  assert.deepEqual(parseFlowAction(serializeFlowAction(action)), action);
  assert.equal(serializeFlowAction(action).startsWith(`${action.sortValue}\t`), true);
  assert.equal(parseFlowAction(''), null);
  assert.equal(parseFlowAction('{bad json'), null);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `src/flowAction.ts` does not exist.

- [ ] **Step 3: Implement `src/flowAction.ts`**

Create `src/flowAction.ts`:

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

export type FlowActionTone = 'empty' | 'high' | 'reading' | 'finish' | 'important' | 'complete' | 'neutral';

export interface FlowAction {
  label: string;
  detail: string;
  title: string;
  sortValue: string;
  tone: FlowActionTone;
}

const STALE_DAYS = 14;
const FINISH_THRESHOLD = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITY_LABELS: Record<ReadingPriority, string> = {
  high: 'High priority',
  normal: 'Normal priority',
  low: 'Low priority'
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read',
  important: 'Important'
};

export function getFlowAction(data: FlowData, now = Date.now()): FlowAction {
  const status = inferStatus(data);
  const progress = getDisplayProgress(data);
  const percent = toPercent(progress);
  const staleDays = getStaleDays(data, status, now);
  const title = buildTitle(data, status, percent, staleDays, now);

  if (status === 'read' || progress >= 0.95) {
    return action('Done', '', title || 'Read', '700|done', 'complete');
  }

  if (status === 'skimmed') {
    return action('Skimmed', '', title || 'Skimmed', '650|skimmed', 'neutral');
  }

  if (status === 'important' && progress <= 0) {
    return action('Important', '', title || 'Important', '050|important', 'important');
  }

  if (isUntouched(data, progress)) {
    if (data.priority === 'high') {
      return action('Read Next', '', title || 'High priority; not started', '000|read-next', 'high');
    }
    if (data.s === 'to-read') {
      return action('To Read', '', title || 'Marked To Read', '600|to-read', 'neutral');
    }
    return action('', '', '', '900|empty', 'empty');
  }

  if (progress >= FINISH_THRESHOLD) {
    return action('Finish', `${percent}%`, title, `200|finish|${pad3(percent)}`, 'finish');
  }

  if (staleDays !== null) {
    const rank = data.priority === 'high' ? '100' : '250';
    const tone: FlowActionTone = data.priority === 'high' ? 'high' : 'reading';
    return action('Return', `${percent}%`, title, `${rank}|return|${pad3(staleDays)}|${pad3(percent)}`, tone);
  }

  if (progress > 0) {
    return action('Resume', `${percent}%`, title, `300|resume|${pad3(percent)}`, 'reading');
  }

  return action('', '', '', '900|empty', 'empty');
}

export function serializeFlowAction(action: FlowAction): string {
  return `${action.sortValue}\t${JSON.stringify(action)}`;
}

export function parseFlowAction(input: string): FlowAction | null {
  if (!input) return null;
  try {
    const json = input.includes('\t') ? input.slice(input.indexOf('\t') + 1) : input;
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.label !== 'string') return null;
    if (typeof parsed.detail !== 'string') return null;
    if (typeof parsed.title !== 'string') return null;
    if (typeof parsed.sortValue !== 'string') return null;
    if (typeof parsed.tone !== 'string') return null;
    return parsed as FlowAction;
  } catch {
    return null;
  }
}

function action(label: string, detail: string, title: string, sortValue: string, tone: FlowActionTone): FlowAction {
  return { label, detail, title, sortValue, tone };
}

function isUntouched(data: FlowData, progress: number): boolean {
  return progress <= 0 && !data.lastReadAt && !data.lastPage;
}

function getStaleDays(data: FlowData, status: ReadingStatus, now: number): number | null {
  if (!data.lastReadAt || status === 'read' || status === 'skimmed') return null;
  const days = Math.floor(Math.max(0, now - data.lastReadAt) / DAY_MS);
  return days >= STALE_DAYS ? days : null;
}

function buildTitle(
  data: FlowData,
  status: ReadingStatus,
  percent: number,
  staleDays: number | null,
  now: number
): string {
  const parts: string[] = [];
  if (data.priority) parts.push(PRIORITY_LABELS[data.priority]);
  parts.push(STATUS_LABELS[status]);
  if (percent > 0) parts.push(`${percent}% read`);
  const attachmentId = getDisplayAttachmentId(data);
  const total = attachmentId ? data.pageCount?.[attachmentId] : undefined;
  if (data.lastPage && total) parts.push(`page ${data.lastPage} / ${total}`);
  if (data.lastPage && !total) parts.push(`page ${data.lastPage}`);
  if (data.lastReadAt) parts.push(`last read ${formatRelativeDate(data.lastReadAt, now)}`);
  if (staleDays !== null) parts.push(`untouched ${staleDays}d`);
  if (data.priority === 'high' && percent <= 0) parts.push('not started');
  return parts.join(' · ');
}

function toPercent(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0 || progress > 1) return 0;
  return Math.max(1, Math.min(100, Math.round(progress * 100)));
}

function pad3(value: number): string {
  return String(Math.max(0, Math.round(value))).padStart(3, '0');
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/flowAction.ts test/flowAction.test.ts
git commit -m "feat: derive next reading actions"
```

## Task 3: Persist Priority Through DataStore

**Files:**
- Modify: `src/dataStore.ts`
- Modify: `test/dataStore.test.ts`

- [ ] **Step 1: Write the failing `setPriority` test**

Add this test to `test/dataStore.test.ts`:

```ts
test('setPriority persists priority without clearing progress state', async () => {
  let extra = 'ReadingFlow: {"v":1,"p":{"10":0.45},"s":"reading","ts":1,"lastAttachmentId":"10","lastPage":9,"lastReadAt":1000}';
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
    async saveTx() {}
  };
  const store = new DataStore();

  await store.setPriority(item, 'high');

  const data = store.getData(item);
  assert.equal(data.priority, 'high');
  assert.deepEqual(data.p, { '10': 0.45 });
  assert.equal(data.s, 'reading');
  assert.equal(data.lastAttachmentId, '10');
  assert.equal(data.lastPage, 9);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `DataStore.setPriority` does not exist.

- [ ] **Step 3: Implement `setPriority`**

In `src/dataStore.ts`, update the import:

```ts
ReadingPriority,
ReadingStatus
```

Add this method below `setStatus`:

```ts
public async setPriority(item: any, priority: ReadingPriority | null) {
  await this.updateData(item, { priority });
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dataStore.ts test/dataStore.test.ts
git commit -m "feat: persist reading priority"
```

## Task 4: Register And Render The Flow Column

**Files:**
- Modify: `src/columnManager.ts`
- Modify: `test/columnManager.test.ts`

- [ ] **Step 1: Write the failing registration test**

Add this test to `test/columnManager.test.ts`:

```ts
test('register adds Flow as the primary Reading Flow column', async () => {
  const registeredColumns: any[] = [];
  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        return undefined;
      },
      set() {}
    },
    ItemTreeManager: {
      async registerColumn(config: any) {
        registeredColumns.push(config);
        return `${config.pluginID}-${config.dataKey}`;
      },
      unregisterColumn() {}
    }
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
        lastReadAt: Date.parse('2026-06-03T12:00:00Z')
      };
    }
  } as any);

  await manager.register();

  assert.equal(registeredColumns[0].dataKey, 'readingFlowFlow');
  assert.equal(registeredColumns[0].label, 'Flow');
  assert.deepEqual(registeredColumns.map((column) => column.dataKey), [
    'readingFlowFlow',
    'readingFlowProgress',
    'readingFlowStatus',
    'readingFlowLastRead'
  ]);
});
```

- [ ] **Step 2: Write the failing render test**

Add this test to `test/columnManager.test.ts`:

```ts
test('Flow column renders action label, percent detail, and tooltip', async () => {
  const registeredColumns: any[] = [];
  const fakeDoc = {
    createElement() {
      return {
        className: '',
        style: { cssText: '' },
        children: [] as any[],
        appendChild(child: any) {
          this.children.push(child);
        },
        textContent: '',
        title: ''
      };
    }
  } as any;

  (globalThis as any).Zotero = {
    Prefs: {
      get(pref: string) {
        if (pref === 'extensions.readingflow.columnsInitialized') return true;
        return undefined;
      },
      set() {}
    },
    ItemTreeManager: {
      async registerColumn(config: any) {
        registeredColumns.push(config);
        return `${config.pluginID}-${config.dataKey}`;
      },
      unregisterColumn() {}
    }
  };

  const manager = new ColumnManager({
    getData() {
      return {
        v: 1,
        p: { '10': 0.45 },
        pageCount: { '10': 20 },
        c: null,
        s: null,
        priority: null,
        ts: 0,
        lastAttachmentId: '10',
        lastPage: 9,
        lastReadAt: Date.now()
      };
    }
  } as any);

  await manager.register();
  const flowColumn = registeredColumns.find((column) => column.dataKey === 'readingFlowFlow');
  const serialized = flowColumn.dataProvider({ isRegularItem: () => true }, 'readingFlowFlow');
  const cell = flowColumn.renderCell(0, serialized, { className: 'custom-flow' }, false, fakeDoc);

  assert.equal(cell.className, 'cell custom-flow');
  assert.equal(cell.children[0].textContent, 'Resume');
  assert.equal(cell.children[1].textContent, '45%');
  assert.match(cell.title, /45% read/);
  assert.match(cell.title, /page 9 \/ 20/);
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because `readingFlowFlow` is not registered.

- [ ] **Step 4: Implement Flow column registration**

In `src/columnManager.ts`, import:

```ts
import { getFlowAction, parseFlowAction, serializeFlowAction } from './flowAction';
```

Add:

```ts
const FLOW_KEY = 'readingFlowFlow';
```

Change:

```ts
private readonly dataKeys = [PROGRESS_KEY, STATUS_KEY, LAST_READ_KEY];
```

to:

```ts
private readonly firstRunVisibleDataKeys = [FLOW_KEY];
```

At the start of `register()`, before the progress column, register:

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
      return serializeFlowAction(getFlowAction(this.dataStore.getData(item)));
    } catch (e) {
      Logger.error('flow dataProvider failed', e);
      return '';
    }
  },
  renderCell: (_index: number, data: string, column: any, _isFirstColumn: boolean, doc: Document): HTMLElement => {
    const cell = doc.createElement('span');
    cell.className = `cell ${column.className || ''}`.trim();
    cell.style.cssText = `${BASE_CELL_STYLE};justify-content:center;gap:4px;font-size:11px;`;

    const summary = parseFlowAction(data);
    if (!summary || !summary.label) return cell;

    cell.title = summary.title;

    const label = doc.createElement('span');
    label.textContent = summary.label;
    label.style.cssText = [
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'font-weight:500'
    ].join(';');
    cell.appendChild(label);

    if (summary.detail) {
      const detail = doc.createElement('span');
      detail.textContent = summary.detail;
      detail.style.cssText = [
        'flex:0 0 auto',
        'color:var(--fill-secondary, #666)',
        'font-size:10px',
        'white-space:nowrap'
      ].join(';');
      cell.appendChild(detail);
    }

    return cell;
  }
});
```

Update warnings and registered keys:

```ts
if (!flowKey) Logger.warn('registerColumn returned null for Flow — column will not appear');
this.registeredDataKeys = [flowKey, progressKey, statusKey, lastReadKey].filter(Boolean);
void this.showColumnsOnFirstRun(this.firstRunVisibleDataKeys);
```

Update `ensureColumnsVisibleOnFirstRun()` so it no longer references the removed `dataKeys` member:

```ts
public async ensureColumnsVisibleOnFirstRun() {
  await this.showColumnsOnFirstRun(this.firstRunVisibleDataKeys);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/columnManager.ts test/columnManager.test.ts
git commit -m "feat: add next action Flow column"
```

## Task 5: Add Priority Menu Actions

**Files:**
- Modify: `src/menuManager.ts`
- Modify: `addon/locale/en-US/reading-flow.ftl`
- Modify: `test/menuManager.test.ts`

- [ ] **Step 1: Write the failing menu label test**

Add assertions to the existing menu registration test in `test/menuManager.test.ts`:

```ts
assert.equal(menuByL10nID('reading-flow-priority-high').label, 'Set Priority High');
assert.equal(menuByL10nID('reading-flow-priority-normal').label, 'Set Priority Normal');
assert.equal(menuByL10nID('reading-flow-priority-low').label, 'Set Priority Low');
assert.equal(menuByL10nID('reading-flow-priority-clear').label, 'Clear Priority');
```

- [ ] **Step 2: Write the failing command test**

Add this test:

```ts
test('priority commands update selected regular items and refresh columns', async () => {
  const selected = [{ id: 20, isRegularItem: () => true }];
  const priorityCalls: any[] = [];
  const { menuByL10nID, mutationCalls } = setupMenu(selected, {}, selected, {
    async setPriority(_item: any, priority: any) {
      priorityCalls.push(priority);
    }
  });

  await menuByL10nID('reading-flow-priority-high').onCommand(new Event('command'), { items: selected });
  await menuByL10nID('reading-flow-priority-normal').onCommand(new Event('command'), { items: selected });
  await menuByL10nID('reading-flow-priority-low').onCommand(new Event('command'), { items: selected });
  await menuByL10nID('reading-flow-priority-clear').onCommand(new Event('command'), { items: selected });

  assert.deepEqual(priorityCalls, ['high', 'normal', 'low', null]);
  assert.equal(mutationCalls.filter((call) => call === 'refreshColumns').length, 4);
});
```

If `setupMenu` does not currently accept a store override, change its signature to:

```ts
function setupMenu(
  selectedItems: any[],
  dataById: Record<number, FlowData | Error>,
  availableItems = selectedItems,
  storeOverrides: Record<string, any> = {}
) {
```

and merge `storeOverrides` into the fake `dataStore`.

- [ ] **Step 3: Run tests and confirm failure**

Run:

```bash
npm run test:unit
```

Expected: FAIL because priority menu entries do not exist.

- [ ] **Step 4: Implement priority menu entries**

In `src/menuManager.ts`, import:

```ts
import { ReadingPriority, ReadingStatus } from './flowData';
```

Add labels:

```ts
priorityHigh: 'Set Priority High',
priorityNormal: 'Set Priority Normal',
priorityLow: 'Set Priority Low',
priorityClear: 'Clear Priority',
```

Add these menu items after the status actions and before reset:

```ts
{
  menuType: 'separator'
},
this.priorityMenu('high', 'reading-flow-priority-high', MENU_LABELS.priorityHigh),
this.priorityMenu('normal', 'reading-flow-priority-normal', MENU_LABELS.priorityNormal),
this.priorityMenu('low', 'reading-flow-priority-low', MENU_LABELS.priorityLow),
this.priorityMenu(null, 'reading-flow-priority-clear', MENU_LABELS.priorityClear),
{
  menuType: 'separator'
},
```

Add:

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

Add locale strings:

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

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/menuManager.ts addon/locale/en-US/reading-flow.ftl test/menuManager.test.ts
git commit -m "feat: add reading priority menu actions"
```

## Task 6: Update Docs And Release Notes

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README feature language**

In `README.md`, update the feature table so `Flow` is the primary surface:

```md
| **Flow** | One compact next-action column: `Read Next`, `Resume 45%`, `Return 45%`, `Finish 88%`, `Skimmed`, or `Done`. |
| **Progress** | Optional detail column for latest tracked position. |
| **Status** | Optional detail column for reading state (`To Read`, `Reading`, `Skimmed`, `Read`, `Important`). |
| **Last Read** | Optional detail column for the last tracked reading time. |
```

Update the usage section:

```md
- Keep `Flow` visible for the most compact reading workflow.
- Enable `Progress`, `Status`, or `Last Read` from Zotero's column menu when you want separate detail columns.
- Right-click a paper -> **Reading Flow -> Set Priority High** to make it appear as `Read Next` or `Return`.
```

- [ ] **Step 2: Update changelog**

Add a new unreleased section at the top of `CHANGELOG.md`:

```md
# Unreleased

### Added

- Added a primary `Flow` column that shows the next reading action, such as `Read Next`, `Resume 45%`, `Return 45%`, `Finish 88%`, `Skimmed`, or `Done`.
- Added Reading Flow priority actions for `High`, `Normal`, `Low`, and priority clearing.

### Changed

- Treat `Progress`, `Status`, and `Last Read` as optional detail columns behind the primary `Flow` column.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document next action Flow column"
```

## Task 7: Verify Package And Runtime Checklist

**Files:**
- No source edits expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS for typecheck, unit tests, build, and XPI validation.

- [ ] **Step 2: Inspect package contents**

Run:

```bash
node scripts/verify-xpi.js
```

Expected: PASS and no missing locale/manifest/build artifact errors.

- [ ] **Step 3: Manual Zotero smoke check**

Install the built XPI in a clean Zotero 9 test profile and verify:

```text
Flow column appears in the Zotero column chooser.
New profiles show Flow as the primary Reading Flow column.
Progress, Status, and Last Read remain available as optional columns.
High priority unread item shows Read Next.
Active recent reading shows Resume NN%.
Active stale reading shows Return NN%.
Near-complete reading shows Finish NN%.
Read paper shows Done.
Skimmed paper shows Skimmed.
Tooltip contains the reason, page context, and last-read context when known.
Priority menu actions update the Flow column without opening the PDF.
Existing Progress, Status, Last Read columns still render correctly.
```

- [ ] **Step 4: Final commit if verification required package metadata changes**

Only run this if verification changed tracked build or release files:

```bash
git status --short
git add <changed-files>
git commit -m "chore: verify next action Flow package"
```

## Self-Review

- Spec coverage: The plan implements the primary `Flow` column, action-first visible labels, percent as secondary detail, tooltip reasons, priority metadata, menu controls, optional detail columns, and backward-compatible storage.
- Scope boundary: This plan does not implement note-processing metadata, reader-toolbar controls, dashboards, AI summaries, semantic recommendations, due dates, or configurable stale thresholds.
- Type consistency: `ReadingPriority`, `priority`, `FlowAction`, `getFlowAction`, `serializeFlowAction`, `parseFlowAction`, and `DataStore.setPriority` are introduced before later tasks use them.
- Runtime risk: Item-tree rendering remains synchronous and reads only existing item metadata.
- Migration risk: Existing `ReadingFlow:` records remain valid because `priority` normalizes to `null` when missing.
