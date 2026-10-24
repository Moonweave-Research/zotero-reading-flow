import { DataStore } from './dataStore';
import { FlowData, getLastActivityAt, getLocalDayKey, resolveDisplayProgress, resolveReadingAvailability, resolveReadingStatus, ReadingStatus } from './flowData';
import { ResumeReader } from './resumeReader';

export const READING_FLOW_PANE_ID = 'reading-flow-details';
const HTML = 'http://www.w3.org/1999/xhtml';
type Props = { body: HTMLElement; doc: Document; item: any; editable: boolean; setEnabled: (enabled: boolean) => void; refresh?: () => void };
type Instance = { props: Props; generation: number; observer?: any; refresh?: () => void; busy: boolean; mutation?: symbol };

/** Earliest surviving activity DATE, never the history container's creation time. */
export function firstRecordedPDFActivity(data: FlowData): string | null {
  if (data.availability) return null;
  const dates = Object.entries(data.history?.days ?? {}).filter(([, day]) => day.activity).map(([date]) => date);
  const last = getLastActivityAt(data);
  if (last !== null) dates.push(getLocalDayKey(last));
  return dates.sort()[0] ?? null;
}

export function recordProblem(item: any, data: FlowData): string {
  if (!data.availability) return '';
  const lines = String(item.getField('extra') || '').split(/\r?\n/).map(line => line.trimStart()).filter(line => /^ReadingFlow:\s*/.test(line));
  if (lines.length > 1) return 'Multiple Reading Flow records were found. They cannot be displayed or edited safely.';
  try {
    const raw = JSON.parse(lines[0].replace(/^ReadingFlow:\s*/, ''));
    if (Number.isInteger(raw.v) && raw.v > 3) return 'This Reading Flow record uses an unsupported version. Use a compatible newer Reading Flow client to edit it.';
  } catch (_) { /* The shared parser has already classified this record as unavailable. */ }
  return 'The Reading Flow record is damaged or invalid. It cannot be displayed or edited safely.';
}

export class ReadingFlowItemPaneManager {
  private paneID?: string;
  private instances = new Map<HTMLElement, Instance>();
  constructor(private store: DataStore, private reader = new ResumeReader(store)) {}

  register() {
    const api = (Zotero as any).ItemPaneManager;
    if (this.paneID || !api?.registerSection) return;
    const id = api.registerSection({
      paneID: READING_FLOW_PANE_ID, pluginID: 'readingflow@moon.com',
      header: { l10nID: 'reading-flow-pane-header', icon: 'chrome://readingflow/content/icon.png' },
      sidenav: { l10nID: 'reading-flow-pane-sidenav', icon: 'chrome://readingflow/content/icon.png' },
      onInit: (props: Props) => this.init(props),
      onDestroy: (props: Props) => this.destroy(props.body),
      onItemChange: (props: Props) => {
        const state = this.state(props); state.generation++; state.busy = false; state.mutation = undefined;
        props.setEnabled(Boolean(this.parent(props.item)));
      },
      onRender: (props: Props) => this.render(props),
      onAsyncRender: (props: Props) => this.renderTarget(props)
    });
    if (!id) throw new Error('Reading Flow could not register its item pane section.');
    this.paneID = id;
  }

  unregister() {
    for (const body of this.instances.keys()) this.destroy(body);
    if (this.paneID) (Zotero as any).ItemPaneManager?.unregisterSection(this.paneID);
    this.paneID = undefined;
  }

  canFocus(items: any[]): boolean {
    return Boolean(this.paneID && items.length === 1 && this.parent(items[0]));
  }

  async focus(win: any = Zotero.getMainWindow()): Promise<boolean> {
    const selected = win?.ZoteroPane?.getSelectedItems?.() ?? Zotero.getActiveZoteroPane?.()?.getSelectedItems?.() ?? [];
    if (!this.canFocus(selected)) return false;
    const details = win.document.querySelector('item-details');
    if (!details?.scrollToPane) return false;
    const pane = win.ZoteroPane;
    if (pane?.itemPane?.collapsed) pane.toggleItemPane();
    await details.render?.();
    return await details.scrollToPane(this.paneID) === true;
  }

  private parent(item: any): any {
    if (!item || item.deleted) return null;
    const parent = item.isPDFAttachment?.() ? Zotero.Items.get(item.parentID) : item;
    return parent?.isRegularItem?.() && !parent.parentID && !parent.deleted ? parent : null;
  }
  private state(props: Props): Instance {
    let state = this.instances.get(props.body);
    if (!state) { state = { props, generation: 0, busy: false }; this.instances.set(props.body, state); }
    state.props = props;
    return state;
  }
  private init(props: Props) {
    const state = this.state(props); state.refresh = props.refresh;
    state.observer = Zotero.Notifier?.registerObserver({ notify: (_event: string, _type: string, ids: number[]) => {
      const parent = this.parent(state.props.item);
      if (parent && (_event === 'delete' || ids.includes(parent.id) || ids.includes(state.props.item?.id)
        || ids.some(id => (Zotero.Items.get(id) as any)?.parentID === parent.id))) {
        state.generation++;
        this.store.invalidateCache(parent.id); state.refresh?.();
      }
    } }, ['item'], 'reading-flow-pane');
  }
  private destroy(body: HTMLElement) {
    const state = this.instances.get(body);
    if (!state) return;
    state.generation++;
    if (state.observer !== undefined) Zotero.Notifier?.unregisterObserver(state.observer);
    this.instances.delete(body);
  }
  private element(props: Props, tag: string, text = ''): any {
    const element = props.doc.createElementNS(HTML, tag); element.textContent = text;
    if (['select', 'input', 'button'].includes(tag)) element.style.setProperty('font', 'inherit');
    return element;
  }
  private facts(props: Props, entries: [string, string][]) {
    const list = this.element(props, 'dl');
    for (const [key, value] of Object.entries({ display: 'grid', 'grid-template-columns': 'minmax(7em, 0.85fr) minmax(0, 1.15fr)', gap: '0.4em 0.75em', margin: '0.65em 0', 'line-height': '1.4' })) list.style.setProperty(key, value);
    for (const [name, value] of entries) {
      const label = this.element(props, 'dt', name), text = this.element(props, 'dd', value);
      text.style.setProperty('margin', '0'); text.style.setProperty('font-weight', '500');
      text.style.setProperty('font-variant-numeric', 'tabular-nums');
      if (name === 'PDF') {
        for (const [key, value] of Object.entries({ overflow: 'hidden', 'white-space': 'nowrap', 'text-overflow': 'ellipsis' })) text.style.setProperty(key, value);
        text.setAttribute('title', value);
      }
      list.append(label, text);
    }
    return list;
  }
  private render(props: Props) {
    const state = this.state(props); state.generation++;
    props.body.replaceChildren(); props.body.setAttribute('lang', 'en');
    props.body.style.setProperty('overflow-wrap', 'anywhere');
    const parent = this.parent(props.item);
    if (!parent) return;
    this.store.invalidateCache(parent.id);
    const generation = state.generation;
    const data = this.store.getData(parent);
    const problem = recordProblem(parent, data);
    const writable = props.editable && parent.isEditable?.() !== false && !problem && !state.busy;
    const add = (text: string) => { const p = this.element(props, 'p', text); p.style.setProperty('margin', '0.6em 0'); props.body.append(p); return p; };
    if (problem) add(problem);
    const controls = this.element(props, 'div');
    for (const [key, value] of Object.entries({ display: 'flex', 'flex-wrap': 'wrap', gap: '0.75em', 'align-items': 'end' })) controls.style.setProperty(key, value);
    const label = this.element(props, 'label', 'Status '), select = this.element(props, 'select');
    label.style.setProperty('display', 'block');
    label.style.setProperty('flex', '1 1 12em');
    label.style.setProperty('min-width', '0');
    select.style.setProperty('display', 'block');
    select.style.setProperty('max-width', '100%');
    select.style.setProperty('width', '100%');
    const automatic = resolveReadingStatus({ ...data, s: null }).status === 'reading' ? 'Reading' : 'Unassigned';
    for (const [value, text] of [['', `${automatic} (automatic)`], ['to-read', 'To Read (manual)'], ['reading', 'Reading (manual)'], ['skimmed', 'Skimmed (manual)'], ['read', 'Read (manual)']]) {
      const option = this.element(props, 'option', text); option.value = value; select.append(option);
    }
    if (problem) { const option = this.element(props, 'option', 'Record unavailable'); option.value = 'unavailable'; select.append(option); }
    select.value = problem ? 'unavailable' : data.s ?? ''; select.disabled = !writable; label.append(select); controls.append(label);
    select.addEventListener('change', () => { if (!this.current(state, generation, props.item)) return; void this.mutate(state, parent, () => select.value ? this.store.setStatus(parent, select.value as ReadingStatus) : this.store.clearManualStatus(parent), () => this.store.getData(parent).s === (select.value || null)); });
    const importantLabel = this.element(props, 'label', ' Important'), important = this.element(props, 'input');
    importantLabel.style.setProperty('display', 'flex');
    importantLabel.style.setProperty('align-items', 'center');
    importantLabel.style.setProperty('gap', '0.4em');
    importantLabel.style.setProperty('margin', '0 0 0.3em');
    important.type = 'checkbox'; important.indeterminate = Boolean(problem); important.checked = Boolean(data.important); important.disabled = !writable;
    importantLabel.prepend(important); controls.append(importantLabel); props.body.append(controls);
    important.addEventListener('change', () => { if (!this.current(state, generation, props.item)) return; void this.mutate(state, parent, () => this.store.setImportant(parent, important.checked), () => Boolean(this.store.getData(parent).important) === important.checked); });
    if (!props.editable || parent.isEditable?.() === false) add('Read-only item.');
    const last = getLastActivityAt(data), first = firstRecordedPDFActivity(data);
    const recent = last === null ? 'Not recorded' : `${getLocalDayKey(last)} ${String(new Date(last).getHours()).padStart(2, '0')}:${String(new Date(last).getMinutes()).padStart(2, '0')}`;
    props.body.append(this.facts(props, [['Last activity', problem ? 'Unavailable' : recent], ['First recorded', problem ? 'Unavailable' : first ?? 'Not recorded']]));
    const target = this.element(props, 'div', 'Checking PDF availability…');
    target.dataset.readingFlowTarget = 'true'; props.body.append(target);
    const note = add("PDF positions, not pages read. Earlier activity may be missing.");
    note.style.setProperty('font-size', '0.9em'); note.style.setProperty('line-height', '1.4');
    const details = this.element(props, 'details');
    details.append(this.element(props, 'summary', 'About this record'));
    if (resolveReadingAvailability(data) === 'no-record') details.append(this.element(props, 'p', 'No Reading Flow record.'));
    if (data.v < 3 && data.important) details.append(this.element(props, 'p', 'Legacy Important records do not preserve the earlier manual reading status. It cannot be recovered from PDF positions.'));
    details.append(this.element(props, 'p', 'Automatic Reading is based on recorded PDF activity. Choosing a manual status overrides it; choosing the automatic option clears that override. Neither activity nor a saved position confirms that the item was read.'));
    details.append(this.element(props, 'p', 'The first recorded PDF activity is the earliest surviving record, not the actual reading start. Detailed history retains at most 366 days; earlier or legacy activity may be missing. Status changes and resets are not PDF activity.'));
    details.append(this.element(props, 'p', 'Position tracking supports PDFs only. Manual status and Important also work for books and items without a PDF; EPUB positions are not tracked.'));
    props.body.append(details);
    const error = add(''); error.setAttribute('role', 'status'); error.dataset.readingFlowError = 'true';
  }

  private current(state: Instance, generation: number, item: any): boolean {
    return this.instances.get(state.props.body) === state && state.generation === generation && state.props.item === item;
  }
  private async renderTarget(props: Props) {
    const state = this.instances.get(props.body);
    if (!state || state.props.item !== props.item) return;
    const generation = state.generation, item = props.item;
    const region = props.body.querySelector('[data-reading-flow-target]');
    if (!region || !this.parent(item)) return;
    try {
      const target = await this.reader.getResumeDisplayTarget(item);
      if (!this.current(state, generation, item)) return;
      const data = this.store.getData(this.parent(item));
      const saved = target.action === 'resume' ? `Page ${target.lastPage}${target.totalPages ? ` / ${target.totalPages}` : ''}` : (data.availability || data.lastPage !== null || Object.keys(data.p).length > 0) ? 'Unavailable' : target.action === 'none' ? 'PDF unavailable' : 'Not saved';
      const display = resolveDisplayProgress(data);
      const maximum = display.attachmentId === String(target.attachmentId) ? display.normalizedProgress : null;
      let farthest = maximum === null ? (data.availability ? 'Unavailable' : Object.keys(data.p).length ? 'Unknown' : 'Not recorded')
        : `About ${Math.floor(maximum * 100)}% of PDF`;
      if (maximum !== null && display.pageCount !== null) {
        const page = maximum * display.pageCount;
        farthest = `${Math.abs(page - Math.round(page)) < 0.000001 ? 'Page' : 'About page'} ${Math.max(1, Math.round(page))} / ${display.pageCount}`;
      }
      region.textContent = ''; region.replaceChildren();
      region.append(this.facts(props, [['Saved position', saved], ['Farthest position', farthest], ...(target.filename ? [['PDF', target.filename] as [string, string]] : [])]));
      if (target.action === 'none' || data.availability || (target.action === 'open' && data.lastPage !== null)) region.append(this.element(props, 'p', target.reason));
      if (target.action !== 'none') {
        const actionLabel = target.action === 'resume' ? `Resume at page ${target.lastPage}${target.totalPages ? ` / ${target.totalPages}` : ''}` : 'Open PDF';
        const button = this.element(props, 'button', actionLabel); button.type = 'button';
        button.setAttribute('aria-label', target.fallbackLabel); button.setAttribute('title', target.fallbackLabel);
        for (const [key, value] of Object.entries({ height: 'auto', 'min-height': '2em', 'white-space': 'normal', 'max-width': '100%', 'overflow-wrap': 'anywhere', padding: '0.4em' })) button.style.setProperty(key, value);
        region.append(button);
        button.addEventListener('click', async () => {
          if (!this.current(state, generation, item)) return;
          button.disabled = true;
          try {
            const opened = await this.reader.executeTarget(target, () => this.current(state, generation, item));
            if (!opened && this.current(state, generation, item)) this.error(state, 'The displayed PDF or position is no longer available. Select the item again to refresh.');
          } catch (_) { if (this.current(state, generation, item)) this.error(state, 'The PDF could not be opened.'); }
          finally { if (this.current(state, generation, item)) button.disabled = false; }
        });
      }
    } catch (_) { if (this.current(state, generation, item)) region.textContent = 'PDF information could not be loaded. Select the item again to retry.'; }
  }
  private error(state: Instance, text: string) {
    const region = state.props.body.querySelector('[data-reading-flow-error]'); if (region) region.textContent = text;
  }
  private async mutate(state: Instance, parent: any, operation: () => Promise<boolean>, achieved?: () => boolean) {
    if (state.busy || !state.props.editable || parent.isEditable?.() === false || parent.deleted
      || this.parent(state.props.item)?.id !== parent.id || this.store.getData(parent).availability) return;
    const item = state.props.item, mutation = Symbol('pane-mutation');
    state.mutation = mutation; state.busy = true;
    state.props.body.querySelectorAll('select,input').forEach((control: any) => { control.disabled = true; });
    let message = '';
    try { if (!await operation() && !achieved?.()) message = 'No change was saved. The record may have changed or may no longer be editable.'; }
    catch (_) { message = 'The change could not be saved. Select the item again to review its stored record.'; }
    finally {
      if (state.mutation === mutation) {
        state.busy = false; state.mutation = undefined;
        if (this.instances.get(state.props.body) === state && state.props.item === item) {
          this.render(state.props);
          const generation = state.generation;
          await this.renderTarget(state.props);
          if (message && this.current(state, generation, item)) this.error(state, message);
        }
      }
    }
  }
}
