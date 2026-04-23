import { DataStore } from './dataStore';

export class ColumnManager {
  private dataStore: DataStore;
  
  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public async register() {
    await Zotero.ItemTreeManager.registerColumns({
      dataKey: 'readingFlowProgress',
      label: 'Progress',
      pluginID: 'readingflow@example.com',
      zoteroPersist: true,
      renderCell: this.renderProgressCell.bind(this)
    });
  }

  public unregister() {
    Zotero.ItemTreeManager.unregisterColumns('readingflow@example.com');
  }

  private renderProgressCell(index: number, data: any, column: any, element: HTMLElement) {
    // Edge Case: Clear recycled virtualized cell content
    element.textContent = '';
    
    const item = data.getRow(index).ref;
    if (!item || !item.isRegularItem()) return element;

    const flowData = this.dataStore.getData(item);
    
    // Find most recent progress from all attachments
    let latestProgress = 0;
    if (flowData.p && Object.keys(flowData.p).length > 0) {
       latestProgress = Math.max(...Object.values(flowData.p) as number[]);
    }

    if (latestProgress === 0) return element;

    const barContainer = document.createElement('div');
    barContainer.style.width = '100%';
    barContainer.style.height = '6px';
    barContainer.style.backgroundColor = 'rgba(0,0,0,0.1)';
    barContainer.style.borderRadius = '3px';
    barContainer.style.overflow = 'hidden';
    barContainer.style.marginTop = '4px';

    const bar = document.createElement('div');
    bar.style.width = `${latestProgress * 100}%`;
    bar.style.height = '100%';
    bar.style.backgroundColor = latestProgress >= 0.99 ? '#4caf50' : '#2196f3';

    barContainer.appendChild(bar);
    element.appendChild(barContainer);

    return element;
  }
}
