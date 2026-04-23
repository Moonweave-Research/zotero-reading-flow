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
    
    // UI Layer - Row Tinting
    const row = element.closest('tree-row');
    if (row) {
      if (flowData.c) {
        row.setAttribute('data-flow-color', 'true');
        // Apply 20% opacity (0x33) to hex colors
        const color = flowData.c.startsWith('#') ? `${flowData.c}33` : flowData.c;
        row.style.setProperty('--reading-flow-row-color', color);
      } else {
        row.removeAttribute('data-flow-color');
        row.style.removeProperty('--reading-flow-row-color');
      }
    }
    
    // Find most recent progress from all attachments
    let latestProgress = 0;
    if (flowData.p && Object.keys(flowData.p).length > 0) {
      const entries = Object.values(flowData.p);
      let newestTs = -1;
      
      for (const entry of entries) {
        if (typeof entry === 'object' && entry !== null && 'ts' in entry) {
          if (entry.ts > newestTs) {
            newestTs = entry.ts;
            latestProgress = entry.pr;
          }
        } else if (typeof entry === 'number') {
          // Fallback for legacy data: if no timestamped entry found yet, 
          // or if this number is greater than what we have (as a heuristic)
          if (newestTs === -1) {
            latestProgress = Math.max(latestProgress, entry);
          }
        }
      }
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
    
    const prefPrefix = 'extensions.readingflow.';
    const completedColor = Zotero.Prefs.get(prefPrefix + 'color-completed') || '#4caf50';
    const readingColor = Zotero.Prefs.get(prefPrefix + 'color-reading') || '#2196f3';
    
    bar.style.backgroundColor = latestProgress >= 0.99 ? completedColor : readingColor;

    barContainer.appendChild(bar);
    element.appendChild(barContainer);

    return element;
  }
}
