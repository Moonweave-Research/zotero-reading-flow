import { ReadingFlowItemPaneManager } from '../../src/itemPaneManager';
import { DEFAULT_FLOW_DATA } from '../../src/flowData';

// Real panel rendering with synthetic records and a stubbed Zotero host API.
(globalThis as any).renderReadingFlow = async (filename = 'Sample paper.pdf') => {
  let hooks: any;
  const paper: any = { id: 1, isRegularItem: () => true, isEditable: () => true };
  const data = {
    ...DEFAULT_FLOW_DATA, s: 'reading', readingStartedAt: Date.UTC(2026, 9, 25, 12),
    bookmark: { attachmentKey: 'ABCDEFGH', page: 4, pageCount: 10, at: Date.UTC(2026, 9, 25, 12) },
    lastAttachmentId: '2', lastPage: 8, pageCount: { '2': 10 }
  };
  (globalThis as any).Zotero = {
    ItemPaneManager: { registerSection: (options: any) => { hooks = options; return 'reading-flow-details'; } },
    Items: { get: () => paper }, Reader: {}, Notifier: { registerObserver: () => 1 }
  };
  const store: any = { getData: () => data, invalidateCache: () => {} };
  const reader: any = {
    getResumeDisplayTarget: async (_item: any, kind: string) => ({
      action: 'resume', attachmentId: 2, positionKind: kind === 'last-viewed' ? 'last-viewed' : 'bookmark',
      lastPage: kind === 'last-viewed' ? 8 : 4, filename, fallbackLabel: 'Open sample paper'
    })
  };
  const manager = new ReadingFlowItemPaneManager(store, reader);
  manager.register();
  const props = { body: document.querySelector('[data-type="body"]'), doc: document, item: paper, editable: true, setEnabled: () => {} };
  hooks.onInit(props);
  await hooks.onRender(props);
};
