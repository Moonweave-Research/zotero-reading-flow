import { Logger } from './Logger';

export class PopoverManager {
  private timeoutId: any = null;
  private popover: HTMLElement | null = null;
  private currentItemId: number | null = null;
  private contentElement: HTMLElement | null = null;
  private readonly boundHandleMouseOver = this.handleMouseOver.bind(this);
  private readonly boundHandleMouseOut = this.handleMouseOut.bind(this);
  private readonly boundRemovePopover = this.removePopover.bind(this);

  public register() {
    const pane = Zotero.getActiveZoteroPane();
    if (pane?.itemsView?.contentElement && !this.contentElement) {
      const content = pane.itemsView.contentElement;
      content.addEventListener('mouseover', this.boundHandleMouseOver);
      content.addEventListener('mouseout', this.boundHandleMouseOut);
      content.addEventListener('scroll', this.boundRemovePopover);
      this.contentElement = content;
    }
  }

  public unregister() {
    if (this.contentElement) {
      this.contentElement.removeEventListener('mouseover', this.boundHandleMouseOver);
      this.contentElement.removeEventListener('mouseout', this.boundHandleMouseOut);
      this.contentElement.removeEventListener('scroll', this.boundRemovePopover);
      this.contentElement = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.removePopover();
  }

  private handleMouseOver(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const cell = target.closest('.cell');
    if (!cell) return;

    // Check if it's the title column (Zotero 9 primary cell)
    const isTitleCell = cell.classList.contains('primary') || cell.getAttribute('data-column-id') === 'title';
    if (!isTitleCell) return;

    const row = cell.closest('tree-row');
    if (!row) return;

    const pane = Zotero.getActiveZoteroPane();
    const index = parseInt(row.getAttribute('data-index') || '-1');
    if (index === -1) return;

    const item = pane.itemsView.getRow(index).ref;
    if (!item || !item.isRegularItem()) return;

    if (this.currentItemId === item.id) return;
    this.currentItemId = item.id;

    if (this.timeoutId) clearTimeout(this.timeoutId);
    
    const prefDelay = Zotero.Prefs.get('extensions.readingflow.hover-debounce');
    const delay = typeof prefDelay === 'number' ? prefDelay : 400;
    this.timeoutId = setTimeout(() => this.showPopover(item, event), delay);
  }

  private handleMouseOut(event: MouseEvent) {
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (this.popover && this.popover.contains(relatedTarget)) return;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentItemId = null;
    this.removePopover();
  }

  private async showPopover(item: any, event: MouseEvent) {
    try {
      const abstract = item.getField('abstractNote');
      // Fetch top 3 highlights/annotations
      const annotations = await Zotero.Annotations.getForItems([item.id]);
      
      if (!abstract && (!annotations || annotations.length === 0)) return;

      this.removePopover();

      const doc = Zotero.getMainWindow().document;
      const popover = doc.createElement('div');
      popover.id = 'reading-flow-popover';
      Object.assign(popover.style, {
        position: 'fixed',
        zIndex: '10000',
        backgroundColor: 'white',
        color: '#333',
        border: '1px solid #ccc',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxWidth: '350px',
        fontSize: '12px',
        lineHeight: '1.4',
        pointerEvents: 'none'
      });

      let html = '';
      if (abstract) {
        const sanitizedAbstract = this.sanitizeHTML(abstract);
        html += `<div style="margin-bottom: 8px;"><strong>Abstract:</strong><br/>${sanitizedAbstract.substring(0, 300)}${sanitizedAbstract.length > 300 ? '...' : ''}</div>`;
      }

      if (annotations && annotations.length > 0) {
        html += `<div><strong>Top Highlights:</strong><ul style="margin: 4px 0; padding-left: 16px;">`;
        const topAnnotations = annotations.slice(0, 3);
        for (const ann of topAnnotations) {
          const text = ann.annotationText || '';
          if (text) {
            html += `<li>${this.sanitizeHTML(text).substring(0, 100)}${text.length > 100 ? '...' : ''}</li>`;
          }
        }
        html += `</ul></div>`;
      }

      popover.innerHTML = html;
      doc.body.appendChild(popover);
      this.popover = popover;

      this.positionPopover(event.clientX, event.clientY);
    } catch (e) {
      Logger.error('Popover error', e);
    }
  }

  private sanitizeHTML(str: string): string {
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m] as string);
  }

  private positionPopover(x: number, y: number) {
    if (!this.popover) return;
    
    const padding = 15;
    let left = x + padding;
    let top = y + padding;

    const width = this.popover.offsetWidth;
    const height = this.popover.offsetHeight;
    const win = Zotero.getMainWindow();
    const viewportWidth = win.innerWidth;
    const viewportHeight = win.innerHeight;

    if (left + width > viewportWidth) {
      left = x - width - padding;
    }
    if (top + height > viewportHeight) {
      top = y - height - padding;
    }

    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
  }

  private removePopover() {
    if (this.popover) {
      this.popover.remove();
      this.popover = null;
    }
  }
}
