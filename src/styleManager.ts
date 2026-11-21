const STYLE_ID = 'reading-flow-styles';
const LOCALE_HREF = 'reading-flow.ftl';

export class StyleManager {
  private documents = new Set<Document>();

  public injectCSS(doc: Document) {
    this.documents.add(doc);
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      tree-row[data-flow-color] {
        background-color: var(--reading-flow-row-color) !important;
      }
    `;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  public removeCSS(doc: Document) {
    doc.getElementById(STYLE_ID)?.remove();
    this.documents.delete(doc);
  }

  public unregister() {
    for (const doc of this.documents) this.removeCSS(doc);
  }

  public injectLocale(win: Window, _rootURI: string) {
    const mozXULElement = (win as any).MozXULElement;
    const insertFTLIfNeeded = mozXULElement?.insertFTLIfNeeded;

    if (typeof insertFTLIfNeeded !== 'function') {
      return;
    }

    insertFTLIfNeeded.call(mozXULElement, LOCALE_HREF);
  }
}
