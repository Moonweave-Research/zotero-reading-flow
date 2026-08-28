import { getGlobalPreference, READING_FLOW_PREFS } from './preferences';

export class Logger {
  private static prefix = "[Reading Flow] ";

  static log(message: string, level: number = 3) {
    if (!this.isDebugEnabled()) return;
    if (typeof Zotero !== "undefined" && Zotero.debug) {
      Zotero.debug(this.prefix + message, level);
    } else {
      console.log(this.prefix + message);
    }
  }

  static error(message: string, error?: any) {
    const errorMessage = error ? `${message}: ${error.message || error}` : message;
    if (typeof Zotero !== "undefined" && Zotero.debug) {
      Zotero.debug(this.prefix + "ERROR: " + errorMessage, 1);
      if (error && Zotero.logError) {
        Zotero.logError(error);
      }
    } else {
      console.error(this.prefix + "ERROR: " + errorMessage);
    }
    if (error && error.stack) {
      this.log("Stack trace: " + error.stack, 1);
    }
  }

  static warn(message: string) {
    if (typeof Zotero !== "undefined" && Zotero.debug) {
      Zotero.debug(this.prefix + "WARN: " + message, 2);
    } else {
      console.warn(this.prefix + "WARN: " + message);
    }
  }

  private static isDebugEnabled(): boolean {
    try {
      return Boolean(typeof Zotero !== "undefined" && getGlobalPreference(READING_FLOW_PREFS.debug));
    } catch {
      return false;
    }
  }
}
