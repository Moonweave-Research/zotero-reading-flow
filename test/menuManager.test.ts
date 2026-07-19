import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FLOW_DATA, FlowData } from '../src/flowData';
import { Logger } from '../src/Logger';
import { ReadingFlowMenuManager } from '../src/menuManager';

function flowData(updates: Partial<FlowData> = {}): FlowData {
  return { ...DEFAULT_FLOW_DATA, ...updates };
}

function makeRegularItem(id: number) {
  return {
    id,
    isRegularItem() {
      return true;
    },
    isPDFAttachment() {
      return false;
    }
  };
}

function makePdfAttachment(id: number, parentID: number) {
  return {
    id,
    parentID,
    isRegularItem() {
      return false;
    },
    isPDFAttachment() {
      return true;
    }
  };
}

function makeUnsupportedItem(id: number) {
  return {
    id,
    isRegularItem() {
      return false;
    },
    isPDFAttachment() {
      return false;
    }
  };
}

function enabledContext() {
  const menuElem: any = {
    label: undefined as string | undefined
  };
  menuElem.setAttribute = (name: string, value: string) => {
    if (name === 'label') {
      menuElem.label = value;
    }
  };

  return {
    enabled: undefined as boolean | undefined,
    l10nArgs: undefined as string | undefined,
    menuElem,
    setEnabled(value: boolean) {
      this.enabled = value;
    },
    setL10nArgs(value: string) {
      this.l10nArgs = value;
    }
  };
}

function setLabelContext() {
  return {
    enabled: undefined as boolean | undefined,
    l10nArgs: undefined as string | undefined,
    setEnabled(value: boolean) {
      this.enabled = value;
    },
    setL10nArgs(value: string) {
      this.l10nArgs = value;
    },
    setLabel(label: string) {
      this.label = label;
    }
  };
}

function setupMenu(selectedItems: any[], dataById: Record<number, FlowData | Error>, availableItems = selectedItems) {
  let registeredMenu: any;
  const openCalls: any[] = [];
  const mutationCalls: string[] = [];

  (globalThis as any).Zotero = {
    MenuManager: {
      registerMenu(menu: any) {
        registeredMenu = menu;
        return 'registered-menu-id';
      }
    },
    getActiveZoteroPane() {
      return {
        getSelectedItems() {
          return selectedItems;
        }
      };
    },
    Items: {
      get(id: number) {
        return availableItems.find((item) => item.id === id) ?? null;
      }
    },
    Reader: {
      async open(...args: any[]) {
        openCalls.push(args);
      }
    },
    ItemTreeManager: {
      refreshColumns() {
        mutationCalls.push('refreshColumns');
      }
    },
    Notifier: {
      trigger() {
        mutationCalls.push('notifier');
      }
    },
    Prefs: {
      get() {
        return true;
      }
    },
    debug() {}
  };

  const dataStore = {
    getData(item: any) {
      const data = dataById[item.id];
      if (data instanceof Error) {
        throw data;
      }
      return data ?? flowData();
    },
    async setStatus() {
      mutationCalls.push('setStatus');
    },
    async resetProgress() {
      mutationCalls.push('resetProgress');
    },
    async updateData() {
      mutationCalls.push('updateData');
    }
  };

  const manager = new ReadingFlowMenuManager(dataStore as any);
  manager.register();
  const submenu = registeredMenu.menus[0];

  return {
    openCalls,
    manager,
    mutationCalls,
    submenu,
    menuByL10nID(l10nID: string) {
      return submenu.menus.find((menu: any) => (menu.l10nID ?? menu.l10nId) === l10nID);
    }
  };
}

test('submenu is enabled for a selected regular item', async () => {
  const item = makeRegularItem(20);
  const { submenu } = setupMenu([item], {
    20: flowData()
  });

  const context = enabledContext();
  await submenu.onShowing(new Event('showing'), context);

  assert.equal(context.enabled, true);
});

test('menus keep l10n IDs for Zotero MenuManager rendering', () => {
  const item = makeRegularItem(20);
  const { submenu, menuByL10nID } = setupMenu([item], { 20: flowData() });

  assert.equal(submenu.l10nID, 'reading-flow-menu');
  assert.equal(menuByL10nID('reading-flow-resume-reading').l10nID, 'reading-flow-resume-reading');
  assert.equal(menuByL10nID('reading-flow-reset-progress').l10nID, 'reading-flow-reset-progress');
});

test('menus include direct labels as a fallback for nested native menu rendering', () => {
  const item = makeRegularItem(20);
  const { submenu, menuByL10nID } = setupMenu([item], { 20: flowData() });

  assert.equal(submenu.label, 'Reading Flow');
  assert.equal(menuByL10nID('reading-flow-resume-reading').label, 'Resume Reading');
  assert.equal(menuByL10nID('reading-flow-status-to-read').label, 'Mark as To Read');
  assert.equal(menuByL10nID('reading-flow-status-reading').label, 'Mark as Reading');
  assert.equal(menuByL10nID('reading-flow-status-skimmed').label, 'Mark as Skimmed');
  assert.equal(menuByL10nID('reading-flow-status-read').label, 'Mark as Read');
  assert.equal(menuByL10nID('reading-flow-status-important').label, 'Mark as Important');
  assert.equal(menuByL10nID('reading-flow-reset-progress').label, 'Reset Reading Progress');
});

test('resume menu is disabled for a non-resumable selected item', async () => {
  const item = makeRegularItem(20);
  const { menuByL10nID } = setupMenu([item], {
    20: flowData({ lastAttachmentId: '10', lastPage: 3 })
  });

  const context = enabledContext();
  await menuByL10nID('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, false);
});

test('resume menu updates dynamic label and l10n args for resumable page state', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 7 } })
  }, [parent, attachment]);

  const context = enabledContext();
  await menuByL10nID('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, true);
  assert.equal(context.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 7 }));
  assert.equal(context.menuElem.label, 'Resume at Page 4 / 7');
});

test('resume menu updates dynamic label through setLabel when menuElem is unavailable', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 7 } })
  }, [parent, attachment]);

  const context = setLabelContext();
  await menuByL10nID('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, true);
  assert.equal(context.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 7 }));
  assert.equal(context.label, 'Resume at Page 4 / 7');
});

test('resume menu keeps fallback label when resume is not available', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10' })
  }, [parent, attachment]);

  const context = enabledContext();
  await menuByL10nID('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, false);
  assert.equal(context.l10nArgs, '{}');
  assert.equal(context.menuElem.label, 'Resume Reading');
});

test('resume menu clears stale args when selection is not resumable', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 4, pageCount: { '10': 7 } })
  }, [parent, attachment]);

  const context = enabledContext();
  const resumeMenu = menuByL10nID('reading-flow-resume-reading');
  await resumeMenu.onShowing(new Event('showing'), context);

  assert.equal(context.l10nArgs, JSON.stringify({ mode: 'page-total', page: 4, total: 7 }));

  const { menuByL10nID: getNoPageResumeMenu } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10' })
  }, [parent, attachment]);
  await getNoPageResumeMenu('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.l10nArgs, '{}');
  assert.equal(context.menuElem.label, 'Resume Reading');
  assert.equal(context.enabled, false);
});

test('submenu is enabled for exactly one resumable PDF attachment', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { submenu } = setupMenu([attachment], {
    20: flowData({ lastAttachmentId: '10', lastPage: 5 })
  }, [parent, attachment]);

  const context = enabledContext();
  await submenu.onShowing(new Event('showing'), context);

  assert.equal(context.enabled, true);
});

test('submenu is disabled for a single non-regular non-resumable item', async () => {
  const item = makeUnsupportedItem(99);
  const { submenu } = setupMenu([item], {});

  const context = enabledContext();
  await submenu.onShowing(new Event('showing'), context);

  assert.equal(context.enabled, false);
});

test('resume menu is registered and disabled for multi-select', async () => {
  const first = makeRegularItem(20);
  const second = makeRegularItem(21);
  const { menuByL10nID } = setupMenu([first, second], {
    20: flowData({ lastAttachmentId: '10', lastPage: 3 }),
    21: flowData({ lastAttachmentId: '11', lastPage: 4 })
  });

  const resumeMenu = menuByL10nID('reading-flow-resume-reading');
  const context = enabledContext();
  await resumeMenu.onShowing(new Event('showing'), context);

  assert.equal(resumeMenu.menuType, 'menuitem');
  assert.equal(context.enabled, false);
});

test('resume menu is disabled when the single selected item has no resumable PDF', async () => {
  const item = makeRegularItem(20);
  const { menuByL10nID } = setupMenu([item], {
    20: flowData()
  });

  const context = enabledContext();
  await menuByL10nID('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, false);
});

test('resume menu command opens the selected resumable item', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID, openCalls } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 5 })
  }, [parent, attachment]);

  await menuByL10nID('reading-flow-resume-reading').onCommand();

  assert.deepEqual(openCalls, [[10, { pageIndex: 4 }]]);
});

test('resume menu command uses command context when current selection is unavailable', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID, openCalls } = setupMenu([], {
    20: flowData({ lastAttachmentId: '10', lastPage: 5 })
  }, [parent, attachment]);

  await menuByL10nID('reading-flow-resume-reading').onCommand(new Event('command'), { items: [parent] });

  assert.deepEqual(openCalls, [[10, { pageIndex: 4 }]]);
});

test('status and reset commands use command context when current selection is unavailable', async () => {
  const item = makeRegularItem(20);
  const { menuByL10nID, mutationCalls } = setupMenu([], {
    20: flowData()
  }, [item]);
  const commandContext = { items: [item] };

  await menuByL10nID('reading-flow-status-reading').onCommand(new Event('command'), commandContext);
  await menuByL10nID('reading-flow-reset-progress').onCommand(new Event('command'), commandContext);

  assert.deepEqual(mutationCalls, [
    'setStatus',
    'refreshColumns',
    'notifier',
    'resetProgress',
    'refreshColumns',
    'notifier'
  ]);
});

test('resume menu command logs outer resumeSelectedItem errors without rejecting', async () => {
  const originalError = Logger.error;
  const errors: any[][] = [];
  const item = makeRegularItem(20);
  const { manager, menuByL10nID } = setupMenu([item], {});

  Logger.error = (...args: any[]) => {
    errors.push(args);
  };
  (manager as any).resumeReader.resume = async () => {
    throw new Error('outer resume failed');
  };

  try {
    await assert.doesNotReject(menuByL10nID('reading-flow-resume-reading').onCommand());

    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], 'resume reading failed for item 20');
    assert.match(errors[0][1].message, /outer resume failed/);
  } finally {
    Logger.error = originalError;
  }
});

test('resume menu command catches reader failures through ResumeReader warnings', async () => {
  const originalWarn = Logger.warn;
  const originalError = Logger.error;
  const warnings: string[] = [];
  const errors: string[] = [];
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByL10nID } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 5 })
  }, [parent, attachment]);

  Logger.warn = (message: string) => {
    warnings.push(message);
  };
  Logger.error = (message: string) => {
    errors.push(message);
  };
  (globalThis as any).Zotero.Reader.open = async () => {
    throw new Error('reader failed');
  };

  try {
    await assert.doesNotReject(menuByL10nID('reading-flow-resume-reading').onCommand());

    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /opening 10 at saved page failed; retrying without location/);
    assert.match(warnings[1], /failed to open attachment 10/);
    assert.match(warnings[1], /reader failed/);
  } finally {
    Logger.warn = originalWarn;
    Logger.error = originalError;
  }
});
