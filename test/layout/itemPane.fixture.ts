import { ReadingFlowItemPaneManager } from '../../src/itemPaneManager';
import { ReadingBookmarkManager } from '../../src/readingBookmarkManager';
import { DEFAULT_FLOW_DATA, FlowData } from '../../src/flowData';

// Real panel rendering with synthetic records and a stubbed Zotero host API.
(globalThis as any).renderReadingFlow = async (filename = 'Sample paper.pdf', scenario = 'bookmark') => {
  let hooks: any;
  const paper: any = { id: 1, isRegularItem: () => true, isEditable: () => scenario !== 'readonly', getField: () => scenario === 'unavailable' ? 'ReadingFlow: {bad' : '' };
  const data: FlowData = {
    ...DEFAULT_FLOW_DATA, s: 'reading', readingStartedAt: Date.UTC(2026, 9, 25, 12),
    bookmark: { attachmentKey: 'ABCDEFGH', page: 4, pageCount: 10, at: Date.UTC(2026, 9, 25, 12) },
    lastAttachmentId: '2', lastPage: 8, pageCount: { '2': 10 }
  };
  if (scenario === 'empty') { delete data.bookmark; data.lastAttachmentId = null; data.lastPage = null; data.readingStartedAt = undefined; data.s = null; }
  if (scenario === 'unavailable') data.availability = 'unavailable';
  (globalThis as any).Zotero = {
    ItemPaneManager: { registerSection: (options: any) => { hooks = options; return 'reading-flow-details'; } },
    Items: { get: () => paper }, Reader: {}, Notifier: { registerObserver: () => 1 }
  };
  const store: any = { getData: () => data, invalidateCache: () => {} };
  const reader: any = {
    getResumeDisplayTarget: async (_item: any, kind: string) => ({
      action: scenario === 'empty' || scenario === 'unavailable' ? 'none' : 'resume', reason: 'No accessible PDF attachment is available.', attachmentId: 2, positionKind: kind === 'last-viewed' ? 'last-viewed' : 'bookmark',
      lastPage: kind === 'last-viewed' ? 8 : 4, filename: scenario === 'empty' ? undefined : filename, fallbackLabel: 'Open sample paper'
    })
  };
  const manager = new ReadingFlowItemPaneManager(store, reader);
  manager.register();
  const props = { body: document.querySelector('[data-type="body"]'), doc: document, item: paper, editable: scenario !== 'readonly', setEnabled: () => {} };
  hooks.onInit(props);
  await hooks.onRender(props);
};

(globalThis as any).renderReaderToolbar = () => {
  const parent = { id: 1, isEditable: () => true };
  const pdf = { id: 2, parentID: 1, key: 'ABCDEFGH', isPDFAttachment: () => true };
  const reader = { itemID: 2, _type: 'pdf', PDFViewerApplication: { pdfViewer: { currentPageNumber: 6 }, pdfDocument: { numPages: 10 } } };
  let data: any = { ...DEFAULT_FLOW_DATA, bookmark: { attachmentKey: 'ABCDEFGH', page: 4, pageCount: 10, at: 100 } };
  (globalThis as any).Zotero = { Items: { get: () => pdf } };
  const store: any = {
    getData: () => data, invalidateCache: () => {},
    setReadingBookmark: async (_item: any, bookmark: any) => { data = { ...data, bookmark }; return true; }
  };
  const manager = new ReadingBookmarkManager(store);
  document.querySelector('#toolbar')!.append(manager.controls(document, parent, reader));
  (globalThis as any).toolbarBookmarkPage = () => data.bookmark.page;
};
