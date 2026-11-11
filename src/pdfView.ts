/** Keep reader actions on the last focused split even while a toolbar has focus. */
export function activePDFView(reader: any): any {
  const internal = reader?._internalReader;
  return internal?._lastView
    ?? (internal?._lastViewPrimary === false ? internal?._secondaryView : internal?._primaryView);
}

export function activePDFApplication(reader: any): any {
  const view = activePDFView(reader);
  const win = view?._iframeWindow ?? (!view ? reader?._iframeWindow : undefined);
  return (win?.wrappedJSObject ?? win)?.PDFViewerApplication
    ?? (!view ? reader?.PDFViewerApplication : undefined);
}
