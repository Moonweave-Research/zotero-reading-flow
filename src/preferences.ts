export const READING_FLOW_PREFS = {
  completedColor: 'extensions.readingflow.color-completed',
  readingColor: 'extensions.readingflow.color-reading',
  debug: 'extensions.readingflow.debug',
  displayDensity: 'extensions.readingflow.displayDensity',
  newItemStatus: 'extensions.readingflow.newItemStatus',
  newItemStatusActivatedAt: 'extensions.readingflow.newItemStatusActivatedAt',
  sidebarSearchKey: 'extensions.readingflow.sidebarSearchKey'
} as const;

export function getGlobalPreference<T = unknown>(name: string): T | undefined {
  return (globalThis as any).Zotero?.Prefs?.get?.(name, true) as T | undefined;
}

export function setGlobalPreference(name: string, value: unknown): void {
  (globalThis as any).Zotero?.Prefs?.set?.(name, value, true);
}

export function clearLegacyPreferenceAlias(name: string): void {
  try {
    // Earlier Reading Flow builds accidentally passed a full key to Zotero's
    // non-global API, which created extensions.zotero.extensions.readingflow.*.
    (globalThis as any).Zotero?.Prefs?.clear?.(name);
  } catch {
    // Absence or a runtime without preference clearing is harmless.
  }
}

export function clearLegacyReadingFlowPreferenceAliases(): void {
  for (const name of Object.values(READING_FLOW_PREFS)) {
    clearLegacyPreferenceAlias(name);
  }
}

export function setNewItemStatusPreference(value: string, now = Date.now()): void {
  const valid = new Set(['to-read', 'reading', 'skimmed', 'read', 'important']);
  setGlobalPreference(READING_FLOW_PREFS.newItemStatus, valid.has(value) ? value : 'unassigned');
  setNewItemStatusActivationPreference(
    valid.has(value) ? Math.floor(now / 1000) * 1000 : 0
  );
}

export function setNewItemStatusActivationPreference(timestamp: number): void {
  const name = READING_FLOW_PREFS.newItemStatusActivatedAt;
  const existing = getGlobalPreference(name);
  if (existing !== undefined && typeof existing !== 'string') {
    try {
      (globalThis as any).Zotero?.Prefs?.clear?.(name, true);
    } catch {
      // Setting below still handles clean profiles and runtimes without clear().
    }
  }
  setGlobalPreference(name, String(timestamp));
}

export function getNewItemStatusActivationTimestamp(): number | null {
  const raw = getGlobalPreference(READING_FLOW_PREFS.newItemStatusActivatedAt);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
