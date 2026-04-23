import { BasicTool } from 'zotero-plugin-toolkit';
import { DataStore } from './dataStore';
import { ReaderTracker } from './readerTracker';
import { ColumnManager } from './columnManager';
import { Logger } from './Logger';

class Bootstrap {
  private tool: BasicTool;
  public dataStore?: DataStore;
  private readerTracker?: ReaderTracker;
  private columnManager?: ColumnManager;

  constructor() {
    this.tool = new BasicTool();
  }

  install() {}
  
  async startup({ id, version, rootURI }: { id: string; version: string; rootURI: string }) {
    Logger.log('Reading Flow: Starting up');
    this.dataStore = new DataStore();
    
    this.readerTracker = new ReaderTracker(this.dataStore);
    this.readerTracker.register();

    this.columnManager = new ColumnManager(this.dataStore);
    await this.columnManager.register();
  }

  shutdown() {
    Logger.log('Reading Flow: Shutting down');
    
    if (this.readerTracker) {
      this.readerTracker.unregister();
    }

    if (this.columnManager) {
      this.columnManager.unregister();
    }
  }
  
  uninstall() {}
}

const BOOTSTRAP = new Bootstrap();
export { BOOTSTRAP as default };
