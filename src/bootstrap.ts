import { BasicTool } from 'zotero-plugin-toolkit';
import { DataStore } from './dataStore';
import { ReaderTracker } from './readerTracker';
import { ColumnManager } from './columnManager';
import { StyleManager } from './styleManager';
import { NotifierManager } from './notifierManager';
import { PopoverManager } from './popoverManager';
import { Logger } from './Logger';

class Bootstrap {
  private tool: BasicTool;
  public dataStore?: DataStore;
  private readerTracker?: ReaderTracker;
  private columnManager?: ColumnManager;
  private styleManager: StyleManager;
  private notifierManager?: NotifierManager;
  private popoverManager?: PopoverManager;

  constructor() {
    this.tool = new BasicTool();
    this.styleManager = new StyleManager();
  }

  install() {}
  
  async startup({ id, version, rootURI }: { id: string; version: string; rootURI: string }) {
    Logger.log('Reading Flow: Starting up');
    this.dataStore = new DataStore();
    
    this.styleManager.injectCSS();

    this.readerTracker = new ReaderTracker(this.dataStore);
    this.readerTracker.register();

    this.columnManager = new ColumnManager(this.dataStore);
    await this.columnManager.register();

    this.notifierManager = new NotifierManager(this.dataStore);
    this.notifierManager.register();

    this.popoverManager = new PopoverManager();
    this.popoverManager.register();
  }

  shutdown() {
    Logger.log('Reading Flow: Shutting down');
    
    if (this.readerTracker) {
      this.readerTracker.unregister();
    }

    if (this.columnManager) {
      this.columnManager.unregister();
    }

    if (this.notifierManager) {
      this.notifierManager.unregister();
    }

    if (this.popoverManager) {
      this.popoverManager.unregister();
    }

    this.styleManager.unregister();
  }
  
  uninstall() {}
}

const BOOTSTRAP = new Bootstrap();

export function install() {
  BOOTSTRAP.install();
}

export async function startup(data: any, reason: any) {
  await BOOTSTRAP.startup(data);
}

export function shutdown(data: any, reason: any) {
  BOOTSTRAP.shutdown();
}

export function uninstall() {
  BOOTSTRAP.uninstall();
}
