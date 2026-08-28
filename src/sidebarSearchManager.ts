import { FLOW_PREFIX } from './flowData';
import {
  getGlobalPreference,
  READING_FLOW_PREFS,
  setGlobalPreference
} from './preferences';
import { getSelectedLibraryID } from './selectedLibrary';

type SavedSearchReferences = Record<string, string>;
const SIDEBAR_SEARCH_NAME = 'Reading Flow — Tracked Papers';
const LEGACY_SIDEBAR_SEARCH_NAMES = new Set(['Reading Flow Metadata', 'Reading Flow metadata']);

export class SidebarSearchManager {
  public async migrateTrackedSearches(): Promise<void> {
    for (const libraryID of Object.keys(this.getReferences()).map(Number)) {
      await this.getTrackedSearch(libraryID);
    }
  }

  public async create(): Promise<string> {
    try {
      return await this.createSearch();
    } catch (error) {
      return this.report(`Could not create the sidebar shortcut: ${this.errorMessage(error)}`);
    }
  }

  private async createSearch(): Promise<string> {
    const libraryID = getSelectedLibraryID(Zotero.getActiveZoteroPane?.());
    if (!libraryID) return this.report('Select an editable Zotero library first.');
    const library = (Zotero as any).Libraries?.get?.(libraryID);
    if (library?.editable === false) {
      return this.report(`“${this.libraryName(libraryID)}” is read-only. Select an editable library.`);
    }

    const existing = await this.getTrackedSearch(libraryID);
    if (existing) {
      return this.report(
        `“${SIDEBAR_SEARCH_NAME}” is already added to “${this.libraryName(libraryID)}”. `
        + 'Look under Saved Searches in the left sidebar.'
      );
    }

    const search = new (Zotero as any).Search();
    search.libraryID = libraryID;
    search.name = SIDEBAR_SEARCH_NAME;
    search.addCondition('extra', 'contains', FLOW_PREFIX.trim());
    search.addCondition('noChildren', 'true', '');
    search.addCondition('itemType', 'isNot', 'attachment');
    search.addCondition('itemType', 'isNot', 'note');
    await search.saveTx();
    if (typeof search.key !== 'string' || !search.key) {
      throw new Error('Zotero did not return a key for the saved search');
    }
    this.setReference(libraryID, search.key);
    return this.report(
      `Created “${SIDEBAR_SEARCH_NAME}” in “${this.libraryName(libraryID)}”. `
      + 'Look under Saved Searches in the left sidebar.'
    );
  }

  public async status(): Promise<string> {
    try {
      const libraryID = getSelectedLibraryID(Zotero.getActiveZoteroPane?.());
      if (!libraryID) return this.report('Select a Zotero library to check its sidebar list.');
      const libraryName = this.libraryName(libraryID);
      const search = await this.getTrackedSearch(libraryID);
      return this.report(search
        ? `Added to “${libraryName}”. Look under Saved Searches in the left sidebar.`
        : `Not added to “${libraryName}”.`);
    } catch (error) {
      return this.report(`Could not check the sidebar list: ${this.errorMessage(error)}`);
    }
  }

  public async remove(): Promise<string> {
    try {
      const libraryID = getSelectedLibraryID(Zotero.getActiveZoteroPane?.());
      if (!libraryID) return this.report('Select the Zotero library whose shortcut you want to remove.');
      const search = await this.getTrackedSearch(libraryID);
      if (search) await search.eraseTx();
      this.setReference(libraryID, null);
      return this.report(search
        ? `Removed “${SIDEBAR_SEARCH_NAME}” from “${this.libraryName(libraryID)}”.`
        : `“${SIDEBAR_SEARCH_NAME}” is not added to “${this.libraryName(libraryID)}”.`);
    } catch (error) {
      return this.report(`Could not remove the sidebar shortcut: ${this.errorMessage(error)}`);
    }
  }

  private async getTrackedSearch(libraryID: number): Promise<any | null> {
    const key = this.getReferences()[String(libraryID)];
    if (!key) return null;
    const searches = (Zotero as any).Searches;
    const lookup = searches?.getByLibraryAndKeyAsync?.(libraryID, key)
      ?? searches?.getByLibraryAndKey?.(libraryID, key);
    const search = await Promise.resolve(lookup ?? null);
    if (!search) {
      this.setReference(libraryID, null);
    } else if (LEGACY_SIDEBAR_SEARCH_NAMES.has(search.name) && typeof search.saveTx === 'function') {
      search.name = SIDEBAR_SEARCH_NAME;
      await search.saveTx();
    }
    return search;
  }

  private getReferences(): SavedSearchReferences {
    const raw = getGlobalPreference<string>(READING_FLOW_PREFS.sidebarSearchKey);
    if (typeof raw !== 'string' || !raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.libraryID === 'number' && typeof parsed?.key === 'string' && parsed.key) {
        return { [String(parsed.libraryID)]: parsed.key };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter(([libraryID, key]) => (
        /^\d+$/.test(libraryID) && Number(libraryID) > 0 && typeof key === 'string' && key.length > 0
      ))) as SavedSearchReferences;
    } catch {
      return {};
    }
  }

  private setReference(libraryID: number, key: string | null): void {
    const references = this.getReferences();
    if (key) references[String(libraryID)] = key;
    else delete references[String(libraryID)];
    setGlobalPreference(
      READING_FLOW_PREFS.sidebarSearchKey,
      Object.keys(references).length ? JSON.stringify(references) : ''
    );
  }

  private libraryName(libraryID: number): string {
    const library = (Zotero as any).Libraries?.get?.(libraryID);
    return typeof library?.name === 'string' && library.name.trim()
      ? library.name.trim()
      : `Library ${libraryID}`;
  }

  private report(message: string): string {
    const mainDocument = Zotero.getMainWindow?.()?.document;
    const element = (globalThis as any).document?.getElementById?.('readingflow-pref-sidebar-message')
      ?? mainDocument?.getElementById?.('readingflow-pref-sidebar-message');
    if (element) element.textContent = message;
    return message;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error);
  }
}
