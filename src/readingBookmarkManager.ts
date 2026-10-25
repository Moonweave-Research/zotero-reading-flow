import { Logger } from './Logger';
import { DataStore } from './dataStore';
import { ReadingBookmark } from './flowData';

const PLUGIN_ID = 'readingflow@moon.com';
const HTML = 'http://www.w3.org/1999/xhtml';

/** Capture the visible reader page; never substitute an old saved/opening location. */
export function visiblePDFPosition(reader: any): { page: number; pageCount: number | null } | null {
  if (reader?._type !== 'pdf') return null;
  const view = reader?._internalReader?._primaryView;
  const win = view?._iframeWindow ?? reader?._iframeWindow;
  const app = (win?.wrappedJSObject ?? win)?.PDFViewerApplication ?? reader?.PDFViewerApplication;
  const number = app?.pdfViewer?.currentPageNumber ?? app?.page;
  const index = view?._state?.pageIndex;
  const page = number ?? (Number.isInteger(index) && index >= 0 ? index + 1 : null);
  const count = app?.pdfDocument?.numPages ?? app?.pdfViewer?.pagesCount;
  const pageCount = Number.isInteger(count) && count > 0 && count <= 100000 ? count : null;
  return Number.isInteger(page) && page > 0 && page <= 100000 && (!pageCount || page <= pageCount) ? { page, pageCount } : null;
}

export class ReadingBookmarkManager {
  private observer?: string;
  private controlsToRefresh = new Map<HTMLElement, () => void>();
  private changing = new Set<number>();
  private listener?: (event: any) => void;
  private undo = new Map<number, { before: ReadingBookmark | null; after: ReadingBookmark | null }>();
  constructor(private store: DataStore) {}

  register() {
    const api = (Zotero as any).Reader;
    if (this.listener || !api?.registerEventListener) return;
    this.listener = ({ reader, doc, append }: any) => {
      const pdf = Zotero.Items.get(reader.itemID) as any;
      const parent = pdf?.parentID ? Zotero.Items.get(pdf.parentID) : null;
      if (parent && reader._type === 'pdf') append(this.controls(doc, parent, reader));
    };
    api.registerEventListener('renderToolbar', this.listener, PLUGIN_ID);
    this.observer = (Zotero as any).Notifier?.registerObserver({ notify: (event: string, type: string, ids: number[]) => {
      if (type === 'item') for (const id of ids) this.store.invalidateCache(id);
      if (type === 'item' || (type === 'file' && event === 'pageChange')) this.refreshControls();
    } }, ['file', 'item'], 'reading-flow-bookmarks');
  }
  unregister() {
    if (this.listener) (Zotero as any).Reader?.unregisterEventListener?.('renderToolbar', this.listener);
    this.listener = undefined;
    if (this.observer !== undefined) (Zotero as any).Notifier?.unregisterObserver(this.observer);
    this.observer = undefined; this.undo.clear(); this.controlsToRefresh.clear();
  }

  controls(doc: Document, parent: any, reader?: any, isCurrent: () => boolean = () => true): HTMLElement {
    const box = doc.createElementNS(HTML, 'span') as HTMLElement;
    box.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:0.4em;max-width:100%;font:inherit;';
    const message = doc.createElementNS(HTML, 'span'); message.setAttribute('role', 'status');
    const make = (label: string, action: () => Promise<boolean>) => {
      const button = doc.createElementNS(HTML, 'button') as HTMLButtonElement;
      button.type = 'button'; button.textContent = label; button.title = label;
      button.style.cssText = 'font:inherit;white-space:normal;max-width:100%;min-height:2em;border:1px solid color-mix(in srgb, currentColor 25%, transparent);border-radius:4px;padding:0.3em 0.6em;background:ButtonFace;color:ButtonText;';
      button.disabled = this.changing.has(parent.id) || parent.isEditable?.() === false || Boolean(this.store.getData(parent).availability);
      button.addEventListener('click', async () => {
        if (button.disabled || !isCurrent()) return;
        const buttons = Array.from(box.querySelectorAll('button')); buttons.forEach(b => { b.disabled = true; });
        try {
          const changed = await action();
          message.textContent = changed ? 'Saved.' : 'Not changed. Open this PDF at the page you want, or refresh the record.';
        } catch (_) { message.textContent = 'Could not save the reading bookmark.'; }
        finally { paint(); }
      });
      box.append(button); return button;
    };
    const paint = () => {
      const focused = Array.from(box.querySelectorAll('button')).find(button => button === doc.activeElement)?.textContent;
      box.replaceChildren();
      const current = this.current(parent, reader);
      const save = make(reader ? 'Bookmark here' : 'Set reading bookmark here', () => this.saveCurrent(parent, reader));
      save.setAttribute('aria-label', 'Set reading bookmark here');
      save.title = 'Set reading bookmark at the current PDF page';
      if (!current && !reader) { save.disabled = true; save.title = 'Open this PDF to set a reading bookmark at its current page.'; }
      if (!reader && this.store.getData(parent).bookmark) make('Remove bookmark', () => this.change(parent, null));
      if (this.undo.has(parent.id)) make(reader ? 'Undo' : 'Undo bookmark change', () => this.undoChange(parent));
      box.append(message);
      if (focused) Array.from(box.querySelectorAll('button')).find(button => button.textContent === focused)?.focus();
    };
    this.controlsToRefresh.set(box, () => { if (isCurrent()) paint(); });
    paint(); return box;
  }

  private async refreshItem(parent: any) {
    this.store.invalidateCache(parent.id);
    try {
      await (Zotero as any).ItemTreeManager?.refreshColumns?.();
      await (Zotero as any).Notifier?.trigger?.('refresh', 'item', [parent.id]);
    } catch (error) { Logger.warn(`Reading bookmark saved; refresh the item to see its current position: ${String(error)}`); }
  }

  private refreshControls() {
    for (const [box, paint] of this.controlsToRefresh) {
      if (box.isConnected === false) this.controlsToRefresh.delete(box);
      else paint();
    }
  }

  private current(parent: any, reader?: any): { pdf: any; position: { page: number; pageCount: number | null } } | null {
    const candidates = reader ? [reader] : (Zotero as any).Reader?._readers ?? [];
    const matching = candidates.filter((r: any) => (Zotero.Items.get(r.itemID) as any)?.parentID === parent.id);
    // The library pane must not guess between several open PDFs for one item.
    if (matching.length !== 1) return null;
    const candidate = matching[0], pdf = Zotero.Items.get(candidate.itemID) as any;
    const position = visiblePDFPosition(candidate);
    return !pdf?.deleted && pdf?.isPDFAttachment?.() && pdf.key && position ? { pdf, position } : null;
  }
  async saveCurrent(parent: any, reader?: any): Promise<boolean> {
    const current = this.current(parent, reader);
    if (!current) return false;
    return this.change(parent, { attachmentKey: current.pdf.key, ...current.position, at: Date.now() });
  }
  private async change(parent: any, next: ReadingBookmark | null): Promise<boolean> {
    if (this.changing.has(parent.id)) return false;
    this.changing.add(parent.id);
    const before = this.store.getData(parent).bookmark ?? null;
    const previousUndo = this.undo.get(parent.id);
    this.undo.set(parent.id, { before, after: next });
    try {
      const changed = await this.store.setReadingBookmark(parent, next, before);
      if (!changed) {
        if (previousUndo) this.undo.set(parent.id, previousUndo); else this.undo.delete(parent.id);
      }
      return changed;
    } catch (error) {
      if (previousUndo) this.undo.set(parent.id, previousUndo); else this.undo.delete(parent.id);
      throw error;
    } finally { this.changing.delete(parent.id); await this.refreshItem(parent); this.refreshControls(); }
  }
  async undoChange(parent: any): Promise<boolean> {
    if (this.changing.has(parent.id)) return false;
    const entry = this.undo.get(parent.id);
    if (!entry) return false;
    this.changing.add(parent.id); this.undo.delete(parent.id);
    try { return await this.store.setReadingBookmark(parent, entry.before, entry.after); }
    catch (error) { this.undo.set(parent.id, entry); throw error; }
    finally { this.changing.delete(parent.id); await this.refreshItem(parent); this.refreshControls(); }
  }
}
