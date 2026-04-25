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

function enabledContext() {
  return {
    enabled: undefined as boolean | undefined,
    setEnabled(value: boolean) {
      this.enabled = value;
    }
  };
}

function checkedContext() {
  return {
    checked: undefined as boolean | undefined,
    setChecked(value: boolean) {
      this.checked = value;
    }
  };
}

function setupMenu(selectedItems: any[], dataById: Record<number, FlowData>, availableItems = selectedItems) {
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
      return dataById[item.id] ?? flowData();
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
    mutationCalls,
    submenu,
    menuByLabel(label: string) {
      return submenu.menus.find((menu: any) => menu.l10nID === label);
    }
  };
}

test('resume menu is registered and disabled for multi-select', async () => {
  const first = makeRegularItem(20);
  const second = makeRegularItem(21);
  const { menuByLabel } = setupMenu([first, second], {
    20: flowData({ lastAttachmentId: '10', lastPage: 3 }),
    21: flowData({ lastAttachmentId: '11', lastPage: 4 })
  });

  const resumeMenu = menuByLabel('reading-flow-resume-reading');
  const context = enabledContext();
  await resumeMenu.onShowing(new Event('showing'), context);

  assert.equal(resumeMenu.menuType, 'menuitem');
  assert.equal(context.enabled, false);
});

test('resume menu is disabled when the single selected item has no resumable PDF', async () => {
  const item = makeRegularItem(20);
  const { menuByLabel } = setupMenu([item], {
    20: flowData()
  });

  const context = enabledContext();
  await menuByLabel('reading-flow-resume-reading').onShowing(new Event('showing'), context);

  assert.equal(context.enabled, false);
});

test('resume menu command opens the selected resumable item', async () => {
  const parent = makeRegularItem(20);
  const attachment = makePdfAttachment(10, 20);
  const { menuByLabel, openCalls } = setupMenu([parent], {
    20: flowData({ lastAttachmentId: '10', lastPage: 5 })
  }, [parent, attachment]);

  await menuByLabel('reading-flow-resume-reading').onCommand();

  assert.deepEqual(openCalls, [[10, { pageIndex: 4 }]]);
});

test('queue menus reflect checked state and do not mutate item data on command', async () => {
  const originalLog = Logger.log;
  const logMessages: string[] = [];
  Logger.log = (message: string) => {
    logMessages.push(message);
  };

  try {
    const continueItem = makeRegularItem(20);
    const doneItem = makeRegularItem(21);
    const { menuByLabel, mutationCalls } = setupMenu([continueItem, doneItem], {
      20: flowData({ p: { '10': 0.85 }, lastAttachmentId: '10' }),
      21: flowData({ p: { '11': 1 }, lastAttachmentId: '11' })
    });

    const continueContext = checkedContext();
    const staleContext = checkedContext();
    menuByLabel('reading-flow-queue-continue').onShowing(new Event('showing'), continueContext);
    menuByLabel('reading-flow-queue-stale').onShowing(new Event('showing'), staleContext);
    menuByLabel('reading-flow-queue-continue').onCommand();

    assert.equal(continueContext.checked, true);
    assert.equal(staleContext.checked, false);
    assert.deepEqual(mutationCalls, []);
    assert.equal(logMessages.length, 1);
    assert.match(logMessages[0], /continueReading: 20/);
  } finally {
    Logger.log = originalLog;
  }
});
