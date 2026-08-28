export interface LibrarySelectionPane {
  getSelectedLibraryIDs?: () => unknown;
  getSelectedLibraryID?: () => unknown;
}

export function getSelectedLibraryID(pane: LibrarySelectionPane | null | undefined): number | null {
  if (typeof pane?.getSelectedLibraryIDs === 'function') {
    try {
      const values = pane.getSelectedLibraryIDs();
      if (!Array.isArray(values) || values.length !== 1) return null;
      return asLibraryID(values[0]);
    } catch {
      return null;
    }
  }

  try {
    return asLibraryID(pane?.getSelectedLibraryID?.());
  } catch {
    return null;
  }
}

function asLibraryID(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
