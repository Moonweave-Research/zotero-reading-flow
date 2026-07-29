import type { ReadingStatus } from './flowData';
import {
  HISTORY_RANGES,
  STATISTICS_DATASETS,
  type HistoryRange,
  type ProgressBucket,
  type StatisticsDataset,
  type StatisticsSnapshot
} from './statistics';
import type { StatisticsScope } from './statisticsScope';

export type DashboardStatusFilter = 'all' | ReadingStatus;

export interface DashboardBridge {
  getSnapshot(
    scope: StatisticsScope,
    historyRange?: HistoryRange,
    statusFilter?: DashboardStatusFilter,
    dataset?: StatisticsDataset
  ): Promise<StatisticsSnapshot>;
  focusItem?(id: number | string): Promise<boolean>;
  resumeItem?(id: number | string): Promise<boolean>;
}

const STATUS_LABELS: Record<ReadingStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  skimmed: 'Skimmed',
  read: 'Read',
  important: 'Important'
};

const DATASET_LABELS: Record<StatisticsDataset, string> = {
  tracked: 'Reading set (tracked)',
  all: 'All papers (inventory)'
};

const PROGRESS_LABELS: Record<ProgressBucket, string> = {
  'not-started': 'Not started',
  '1-24': '1–24%',
  '25-49': '25–49%',
  '50-74': '50–74%',
  '75-94': '75–94%',
  complete: 'Complete',
  unknown: 'Unknown page count'
};

const HISTORY_RANGE_LABELS: Record<HistoryRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
  'all-time': 'All time'
};

const STATUSES: ReadingStatus[] = ['to-read', 'reading', 'skimmed', 'read', 'important'];
const PROGRESS_BUCKETS: ProgressBucket[] = [
  'not-started',
  '1-24',
  '25-49',
  '50-74',
  '75-94',
  'complete',
  'unknown'
];

const RECENT_PROGRESS_INITIAL_LIMIT = 8;

interface DashboardRenderOptions {
  recentProgressExpanded?: boolean;
  onToggleRecentProgress?: () => void;
  onFocusItem?: (id: number | string, title: string) => void;
  onResumeItem?: (id: number | string, title: string) => void;
}

interface DashboardQuery {
  scope: StatisticsScope;
  historyRange: HistoryRange;
  statusFilter: DashboardStatusFilter;
  dataset: StatisticsDataset;
}

export function renderDashboard(
  doc: Document,
  snapshot: StatisticsSnapshot,
  statusFilter: DashboardStatusFilter = 'all',
  updatedAt = Date.now(),
  dataset: StatisticsDataset = 'tracked',
  options: DashboardRenderOptions = {}
) {
  const filter = isStatusFilter(statusFilter) ? statusFilter : 'all';
  const selectedDataset = isStatisticsDataset(dataset) ? dataset : 'tracked';
  setText(doc, 'dashboard-papers', String(snapshot.totalPapers));
  setText(doc, 'dashboard-in-progress', String(snapshot.inProgress));
  setText(doc, 'dashboard-read', String(snapshot.read));
  setText(doc, 'dashboard-remaining-pages', formatRemainingPages(snapshot));
  setText(doc, 'dashboard-remaining-coverage', formatRemainingCoverage(snapshot));
  setText(doc, 'dashboard-updated', `Snapshot updated: ${formatUpdatedAt(updatedAt)}`);
  doc.getElementById('dashboard-updated')?.removeAttribute('data-stale');
  setText(
    doc,
    'dashboard-state',
    formatDashboardState(snapshot, filter, selectedDataset)
  );

  renderStatusComposition(doc, snapshot, filter);
  renderProgressDistribution(doc, snapshot);
  renderHistory(doc, snapshot, options);
  const statusLabel = filter === 'all' ? 'all statuses' : STATUS_LABELS[filter];
  setText(
    doc,
    'dashboard-filter-note',
    formatFilterNote(selectedDataset, statusLabel)
  );
}

export class DashboardApp {
  private started = false;
  private refreshSequence = 0;
  private statusFilter: DashboardStatusFilter = 'all';
  private historyRange: HistoryRange = '7d';
  private dataset: StatisticsDataset = 'tracked';
  private latestSnapshot: StatisticsSnapshot | null = null;
  private latestQuery: DashboardQuery | null = null;
  private lastUpdatedAt: number | null = null;
  private recentProgressExpanded = false;

  constructor(
    private readonly doc: Document,
    private readonly bridge: DashboardBridge | null,
    private readonly now: () => number = Date.now
  ) {}

  public start() {
    if (this.started) return;
    this.started = true;

    const scope = this.doc.getElementById('dashboard-scope') as HTMLSelectElement | null;
    const dataset = this.doc.getElementById('dashboard-dataset') as HTMLSelectElement | null;
    const status = this.doc.getElementById('dashboard-status-filter') as HTMLSelectElement | null;
    const historyRange = this.doc.getElementById('dashboard-history-range') as HTMLSelectElement | null;
    const refresh = this.doc.getElementById('dashboard-refresh') as HTMLButtonElement | null;

    if (dataset && isStatisticsDataset(dataset.value)) this.dataset = dataset.value;
    if (historyRange && isHistoryRange(historyRange.value)) this.historyRange = historyRange.value;

    scope?.addEventListener('change', () => { void this.refresh(); });
    dataset?.addEventListener('change', () => {
      this.dataset = isStatisticsDataset(dataset.value) ? dataset.value : 'tracked';
      void this.refresh();
    });
    status?.addEventListener('change', () => {
      this.statusFilter = isStatusFilter(status.value) ? status.value : 'all';
      void this.refresh();
    });
    historyRange?.addEventListener('change', () => {
      if (isHistoryRange(historyRange.value)) this.historyRange = historyRange.value;
      void this.refresh();
    });
    refresh?.addEventListener('click', () => { void this.refresh(); });

    void this.refresh();
  }

  public async refresh(): Promise<void> {
    const scopeElement = this.doc.getElementById('dashboard-scope') as HTMLSelectElement | null;
    const scope = scopeElement?.value === 'entire-library' ? 'entire-library' : 'current-view';
    const datasetElement = this.doc.getElementById('dashboard-dataset') as HTMLSelectElement | null;
    if (datasetElement && isStatisticsDataset(datasetElement.value)) this.dataset = datasetElement.value;
    const statusElement = this.doc.getElementById('dashboard-status-filter') as HTMLSelectElement | null;
    if (statusElement && isStatusFilter(statusElement.value)) this.statusFilter = statusElement.value;
    const historyRangeElement = this.doc.getElementById('dashboard-history-range') as HTMLSelectElement | null;
    if (historyRangeElement && isHistoryRange(historyRangeElement.value)) {
      this.historyRange = historyRangeElement.value;
    }
    const query: DashboardQuery = {
      scope,
      historyRange: this.historyRange,
      statusFilter: this.statusFilter,
      dataset: this.dataset
    };
    const sequence = ++this.refreshSequence;
    this.setBusy(true);

    if (!this.bridge) {
      this.renderError('Dashboard data is unavailable in this runtime.');
      this.setBusy(false);
      return;
    }

    try {
      const snapshot = await this.bridge.getSnapshot(
        query.scope,
        query.historyRange,
        query.statusFilter === 'all' ? undefined : query.statusFilter,
        query.dataset
      );
      if (sequence !== this.refreshSequence) return;
      this.latestSnapshot = snapshot;
      this.latestQuery = query;
      this.lastUpdatedAt = this.now();
      this.renderLatestSnapshot();
      this.setError(null);
    } catch (error) {
      if (sequence !== this.refreshSequence) return;
      const message = error instanceof Error ? error.message : 'Unknown dashboard error';
      this.renderError(`Unable to load current statistics: ${message}`);
    } finally {
      if (sequence === this.refreshSequence) this.setBusy(false);
    }
  }

  private setBusy(busy: boolean) {
    (this.doc.documentElement ?? this.doc.getElementById('reading-flow-dashboard'))
      ?.setAttribute('aria-busy', String(busy));
    const refresh = this.doc.getElementById('dashboard-refresh') as HTMLButtonElement | null;
    if (refresh) refresh.disabled = busy;
  }

  private renderError(message: string) {
    if (this.latestSnapshot && this.lastUpdatedAt !== null) {
      const queryLabel = this.latestQuery ? formatQueryLabel(this.latestQuery) : 'the previous filters';
      setText(
        this.doc,
        'dashboard-state',
        `Could not refresh current statistics. The figures below are from the last successful snapshot (${queryLabel}).`
      );
      setText(
        this.doc,
        'dashboard-updated',
        `Stale snapshot — ${queryLabel} — last updated: ${formatUpdatedAt(this.lastUpdatedAt)}`
      );
      this.doc.getElementById('dashboard-updated')?.setAttribute('data-stale', 'true');
      setText(this.doc, 'dashboard-filter-note', `Last successful snapshot: ${queryLabel}.`);
    } else {
      setText(this.doc, 'dashboard-state', message);
    }
    this.setError(message);
  }

  private renderLatestSnapshot() {
    if (!this.latestSnapshot || this.lastUpdatedAt === null) return;
    renderDashboard(
      this.doc,
      this.latestSnapshot,
      this.statusFilter,
      this.lastUpdatedAt,
      this.dataset,
      {
        recentProgressExpanded: this.recentProgressExpanded,
        onToggleRecentProgress: () => {
          this.recentProgressExpanded = !this.recentProgressExpanded;
          this.renderLatestSnapshot();
        },
        onFocusItem: (id, title) => { void this.focusItem(id, title); },
        onResumeItem: (id, title) => { void this.resumeItem(id, title); }
      }
    );
  }

  private async resumeItem(id: number | string, title: string) {
    if (!this.bridge?.resumeItem) {
      setText(this.doc, 'dashboard-recent-progress-action-status', `Resume is unavailable for ${title} in this runtime.`);
      return;
    }

    setText(this.doc, 'dashboard-recent-progress-action-status', `Resuming ${title}…`);
    try {
      const resumed = await this.bridge.resumeItem(id);
      setText(
        this.doc,
        'dashboard-recent-progress-action-status',
        resumed
          ? `Opened ${title} in the Zotero Reader.`
          : `Resume is unavailable for ${title}. Check that the paper still has a PDF attachment.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown resume error';
      setText(this.doc, 'dashboard-recent-progress-action-status', `Could not resume ${title}: ${message}`);
    }
  }

  private async focusItem(id: number | string, title: string) {
    if (!this.bridge?.focusItem) {
      setText(this.doc, 'dashboard-recent-progress-action-status', 'Selecting papers is unavailable in this runtime.');
      return;
    }

    setText(this.doc, 'dashboard-recent-progress-action-status', `Selecting ${title} in Zotero…`);
    try {
      const selected = await this.bridge.focusItem(id);
      setText(
        this.doc,
        'dashboard-recent-progress-action-status',
        selected ? `Selected ${title} in Zotero.` : `Could not select ${title} in the current Zotero view.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown selection error';
      setText(this.doc, 'dashboard-recent-progress-action-status', `Could not select ${title}: ${message}`);
    }
  }

  private setError(message: string | null) {
    const error = this.doc.getElementById('dashboard-error');
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  }
}

export function startDashboard(
  win: Window = globalThis.window,
  doc: Document = globalThis.document
): DashboardApp {
  const args = (win as any).arguments;
  const bridge = args?.[0] && typeof args[0].getSnapshot === 'function'
    ? args[0] as DashboardBridge
    : null;
  const app = new DashboardApp(doc, bridge);
  (win as any).readingFlowDashboard = {
    refresh: () => app.refresh()
  };
  app.start();
  return app;
}

function renderStatusComposition(
  doc: Document,
  snapshot: StatisticsSnapshot,
  filter: DashboardStatusFilter
) {
  const entries = STATUSES
    .filter((status) => filter === 'all' || filter === status)
    .map((status) => ({
      className: `status-${status}`,
      label: STATUS_LABELS[status],
      value: snapshot.statusCounts[status]
    }));
  renderBars(doc, 'dashboard-status-composition', entries, snapshot.totalPapers, 'No papers match this status filter.');
}

function renderProgressDistribution(doc: Document, snapshot: StatisticsSnapshot) {
  const entries = PROGRESS_BUCKETS.map((bucket) => ({
    className: bucket === 'complete' ? 'status-read' : 'progress-neutral',
    label: PROGRESS_LABELS[bucket],
    value: snapshot.progressDistribution[bucket]
  }));
  renderBars(doc, 'dashboard-progress-distribution', entries, snapshot.totalPapers, 'No papers in this scope.');
}

function renderHistory(doc: Document, snapshot: StatisticsSnapshot, options: DashboardRenderOptions) {
  const history = snapshot.history;
  const hasHistory = history.coverage.papersWithHistory > 0;
  setHidden(doc, 'dashboard-history-onboarding', hasHistory);
  for (const id of [
    'dashboard-reading-pulse',
    'dashboard-recent-progress-panel',
    'dashboard-completion-trend-panel',
    'dashboard-history-footnote'
  ]) setHidden(doc, id, !hasHistory);

  if (!hasHistory) {
    clearChildren(doc, 'dashboard-history-calendar');
    clearChildren(doc, 'dashboard-recent-progress-body');
    clearChildren(doc, 'dashboard-completion-trend');
    setHidden(doc, 'dashboard-history-range-empty', true);
    return;
  }

  setText(doc, 'dashboard-range-active-days', String(history.rangeSummary.activeDays));
  setText(doc, 'dashboard-range-progress-activity', String(history.rangeSummary.papersWithProgressActivity));
  setText(doc, 'dashboard-range-completions', String(history.rangeSummary.firstCompletions));
  setText(doc, 'dashboard-history-range-note', formatHistoryRangeNote(history));
  setHidden(doc, 'dashboard-history-range-empty', history.recentProgress.length > 0);
  setText(
    doc,
    'dashboard-history-footnote',
    history.range === 'all-time'
      ? 'All time uses lifetime first-completion totals. Activity and progress detail are limited to retained daily history.'
      : 'Activity uses retained local-day history. Status-only and reset-only days do not count as reading activity.'
  );

  renderActivityCalendar(doc, history);
  renderRecentProgress(doc, history, options);
  renderCompletionTrend(doc, history);
}

function renderRecentProgress(
  doc: Document,
  history: StatisticsSnapshot['history'],
  options: DashboardRenderOptions
) {
  const table = doc.getElementById('dashboard-recent-progress');
  const body = doc.getElementById('dashboard-recent-progress-body');
  const empty = doc.getElementById('dashboard-recent-progress-empty');
  const summary = doc.getElementById('dashboard-recent-progress-summary');
  const toggle = doc.getElementById('dashboard-recent-progress-toggle') as HTMLButtonElement | null;
  if (!table || !body || !empty || !summary || !toggle) return;
  body.replaceChildren();

  const hasRows = history.recentProgress.length > 0;
  table.hidden = !hasRows;
  empty.hidden = hasRows;
  summary.textContent = '';
  toggle.hidden = true;
  if (!hasRows) return;

  const total = history.recentProgress.length;
  const expanded = options.recentProgressExpanded === true;
  const displayed = expanded
    ? history.recentProgress
    : history.recentProgress.slice(0, RECENT_PROGRESS_INITIAL_LIMIT);
  summary.textContent = `Showing ${displayed.length} of ${total} papers with a progress update in this range.`;
  if (total > RECENT_PROGRESS_INITIAL_LIMIT) {
    toggle.hidden = false;
    toggle.textContent = expanded ? 'Show fewer' : `Show all ${total}`;
    toggle.addEventListener('click', () => options.onToggleRecentProgress?.());
  }

  for (const entry of displayed) {
    const row = doc.createElement('tr');
    const paperCell = doc.createElement('td');
    paperCell.setAttribute('data-label', 'Paper');
    paperCell.setAttribute('title', entry.title);
    const title = doc.createElement('span');
    title.textContent = entry.title;
    const focus = doc.createElement('button');
    focus.type = 'button';
    focus.className = 'recent-progress-focus';
    focus.textContent = 'Show in Zotero';
    focus.addEventListener('click', () => options.onFocusItem?.(entry.id, entry.title));
    const resume = doc.createElement('button');
    resume.type = 'button';
    resume.className = 'recent-progress-resume';
    resume.textContent = 'Resume';
    resume.addEventListener('click', () => options.onResumeItem?.(entry.id, entry.title));
    const actions = doc.createElement('span');
    actions.className = 'recent-progress-actions';
    actions.append(focus, resume);
    paperCell.append(title, actions);
    row.append(paperCell);

    const values = [
      formatProgress(entry.currentProgress),
      formatDelta(entry.delta),
      entry.lastProgressDay,
      STATUS_LABELS[entry.status],
      entry.resetCount > 0 ? `${entry.resetCount} reset${entry.resetCount === 1 ? '' : 's'}` : '—'
    ];
    const labels = ['Current progress', 'Change in range', 'Last update', 'Status', 'Reset'];
    values.forEach((value, index) => {
      const cell = doc.createElement('td');
      cell.textContent = value;
      cell.setAttribute('data-label', labels[index]);
      if (index === 3) cell.className = `recent-progress-status status-${entry.status}`;
      row.append(cell);
    });
    body.append(row);
  }
}

function formatProgress(progress: number | null): string {
  return progress === null ? '—' : formatPercent(progress);
}

function formatDelta(delta: number | null): string {
  if (delta === null) return 'New';
  if (delta > 0 && delta * 100 < 1) return '+<1%';
  if (delta < 0 && Math.abs(delta) * 100 < 1) return '−<1%';
  const percent = Math.round(delta * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

function renderActivityCalendar(doc: Document, history: StatisticsSnapshot['history']) {
  const container = doc.getElementById('dashboard-history-calendar');
  if (!container) return;
  container.replaceChildren();

  const grid = doc.createElement('div');
  grid.className = 'history-calendar-grid';
  for (const day of history.days) {
    const cell = doc.createElement('span');
    cell.className = `history-calendar-cell history-activity-${Math.min(day.activePapers, 4)}`;
    cell.setAttribute(
      'aria-label',
      `${day.day}: ${day.activePapers} papers with a progress update, ${day.completedPapers} first completions, ${day.resetPapers} resets`
    );
    cell.textContent = `${day.day.slice(5)} ${day.activePapers > 0 ? day.activePapers : '·'}`;
    grid.append(cell);
  }
  container.append(grid);
}

function renderCompletionTrend(doc: Document, history: StatisticsSnapshot['history']) {
  const container = doc.getElementById('dashboard-completion-trend');
  if (!container) return;
  container.replaceChildren();

  if (history.completionTrend.length === 0) {
    appendEmpty(doc, container, 'No first completions in this range.');
    return;
  }

  for (const point of history.completionTrend) {
    appendHistoryRow(doc, container, [
      point.day,
      `${point.papers} paper${point.papers === 1 ? '' : 's'}`,
      `${point.cumulativePapers} cumulative`
    ]);
  }
}

function appendHistoryRow(doc: Document, container: HTMLElement, values: string[]) {
  const row = doc.createElement('div');
  row.className = 'history-table-row';
  for (const value of values) {
    const cell = doc.createElement('span');
    cell.textContent = value;
    row.append(cell);
  }
  container.append(row);
}

function appendEmpty(doc: Document, container: HTMLElement, message: string) {
  const empty = doc.createElement('p');
  empty.className = 'dashboard-empty';
  empty.textContent = message;
  container.append(empty);
}

function formatHistoryRangeNote(history: StatisticsSnapshot['history']): string {
  const label = HISTORY_RANGE_LABELS[history.range];
  if (!history.startDay || !history.endDay) return `${label}: retained detail only.`;
  return `${label}: ${history.startDay} through ${history.endDay}.`;
}

function renderBars(
  doc: Document,
  containerId: string,
  entries: Array<{ className: string; label: string; value: number }>,
  total: number,
  emptyMessage: string
) {
  const container = doc.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();

  if (total === 0) {
    appendEmpty(doc, container, emptyMessage);
    return;
  }

  for (const entry of entries) {
    const row = doc.createElement('div');
    row.className = `dashboard-bar-row ${entry.className}`;

    const label = doc.createElement('span');
    label.className = 'dashboard-bar-label';
    label.textContent = entry.label;

    const meter = doc.createElement('span');
    meter.className = 'dashboard-bar-meter';
    meter.setAttribute('aria-hidden', 'true');

    const fill = doc.createElement('span');
    fill.className = `dashboard-bar-fill${entry.value > 0 ? ' has-value' : ''}`;
    fill.style.width = `${Math.max(0, Math.min(100, (entry.value / total) * 100))}%`;
    meter.append(fill);

    const value = doc.createElement('span');
    value.className = 'dashboard-bar-value';
    value.textContent = `${entry.value} (${formatPercent(entry.value / total)})`;

    row.append(label, meter, value);
    container.append(row);
  }
}

function formatPercent(value: number): string {
  if (value > 0 && value * 100 < 1) return '<1%';
  return `${Math.round(value * 100)}%`;
}

function formatRemainingPages(snapshot: StatisticsSnapshot): string {
  if (snapshot.totalPapers === 0) return '—';
  if (snapshot.remainingPagesCoverage.knownPapers === 0) return 'Unknown';
  return String(snapshot.knownRemainingPages);
}

function formatRemainingCoverage(snapshot: StatisticsSnapshot): string {
  const { knownPapers, totalPapers } = snapshot.remainingPagesCoverage;
  if (totalPapers === 0) return 'No papers in this scope.';
  if (knownPapers === 0) return `Unknown for all ${totalPapers} papers.`;
  const unknownPapers = totalPapers - knownPapers;
  return `Known for ${knownPapers} of ${totalPapers} papers; ${unknownPapers} unknown.`;
}

function formatDashboardState(
  snapshot: StatisticsSnapshot,
  filter: DashboardStatusFilter,
  dataset: StatisticsDataset
): string {
  if (snapshot.totalPapers > 0) return `${snapshot.totalPapers} papers in scope.`;
  if (dataset === 'tracked' && filter === 'all') {
    return 'No papers in this reading set yet. Record progress or set a Reading Flow status from a paper context menu to add one.';
  }
  if (dataset === 'tracked') return 'No papers in this reading set match this status.';
  return filter === 'all' ? 'No papers in this scope.' : 'No papers in this scope match this status.';
}

function formatFilterNote(dataset: StatisticsDataset, statusLabel: string): string {
  if (dataset === 'tracked') {
    return `Reading set: papers with Reading Flow data · ${statusLabel} · selected Zotero scope.`;
  }
  return `All papers (inventory): includes untracked papers · ${statusLabel} · selected Zotero scope.`;
}

function formatQueryLabel(query: DashboardQuery): string {
  const scope = query.scope === 'entire-library' ? 'Entire Library' : 'Current View';
  const dataset = DATASET_LABELS[query.dataset];
  const status = query.statusFilter === 'all' ? 'all statuses' : STATUS_LABELS[query.statusFilter];
  return `${scope} · ${dataset} · ${status} · ${HISTORY_RANGE_LABELS[query.historyRange]}`;
}

function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function setText(doc: Document, id: string, value: string) {
  const element = doc.getElementById(id);
  if (element) element.textContent = value;
}

function setHidden(doc: Document, id: string, hidden: boolean) {
  const element = doc.getElementById(id);
  if (element) element.hidden = hidden;
}

function clearChildren(doc: Document, id: string) {
  doc.getElementById(id)?.replaceChildren();
}

function isStatusFilter(value: string): value is DashboardStatusFilter {
  return value === 'all' || STATUSES.includes(value as ReadingStatus);
}

function isHistoryRange(value: string): value is HistoryRange {
  return (HISTORY_RANGES as readonly string[]).includes(value);
}

function isStatisticsDataset(value: string): value is StatisticsDataset {
  return (STATISTICS_DATASETS as readonly string[]).includes(value);
}

if (typeof globalThis.document !== 'undefined' && typeof globalThis.window !== 'undefined') {
  startDashboard(globalThis.window, globalThis.document);
}
