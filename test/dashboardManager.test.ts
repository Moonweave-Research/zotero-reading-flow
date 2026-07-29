import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardManager } from '../src/dashboardManager';

function setup() {
  const calls: string[] = [];
  let unload: (() => void) | undefined;
  const dashboard = {
    closed: false,
    focus() { calls.push('focus'); },
    close() { calls.push('close'); this.closed = true; unload?.(); },
    addEventListener(type: string, listener: () => void, options: any) {
      assert.equal(type, 'unload');
      assert.deepEqual(options, { once: true });
      unload = listener;
    }
  };
  const openCalls: any[][] = [];
  const mainWindow = {
    openDialog(...args: any[]) {
      openCalls.push(args);
      dashboard.closed = false;
      return dashboard;
    }
  };
  return { calls, mainWindow, openCalls };
}

test('opens one packaged modeless resizable dashboard and focuses it on repeated open', () => {
  const { calls, mainWindow, openCalls } = setup();
  const manager = new DashboardManager(
    mainWindow as any,
    'chrome://readingflow/content/'
  );

  const first = manager.open();
  const second = manager.open();

  assert.equal(first, second);
  assert.deepEqual(openCalls, [[
    'chrome://readingflow/content/dashboard.xhtml',
    'reading-flow-dashboard',
    'chrome,dialog=no,resizable,centerscreen,width=900,height=650'
  ]]);
  assert.deepEqual(calls, ['focus']);
});

test('close is idempotent and a later open creates a new lifecycle', () => {
  const { calls, mainWindow, openCalls } = setup();
  const manager = new DashboardManager(mainWindow as any, 'resource://reading-flow/');

  manager.open();
  manager.close();
  manager.close();
  manager.open();

  assert.deepEqual(calls, ['close']);
  assert.equal(openCalls.length, 2);
});

test('fails explicitly when the runtime refuses to create the window', () => {
  const manager = new DashboardManager({ openDialog: () => null } as any, 'resource://reading-flow/');
  assert.throws(() => manager.open(), /did not open/);
});

test('passes the dashboard data source to the XHTML window and forwards refresh', () => {
  const { mainWindow, openCalls } = setup();
  const provider = { async getSnapshot() { throw new Error('not called'); } };
  const manager = new DashboardManager(
    mainWindow as any,
    'chrome://readingflow/content/',
    provider
  );
  const window = manager.open() as any;
  let refreshes = 0;
  window.readingFlowDashboard = { refresh() { refreshes += 1; } };

  manager.refresh();

  assert.equal(openCalls[0][3], provider);
  assert.equal(refreshes, 1);
});
