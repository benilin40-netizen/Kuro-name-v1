/**
 * Safe LocalStorage Utility
 * 
 * Protects against DOMException / SecurityError when running in sandboxed iframes,
 * privacy mode, or environments where third-party storage access is denied.
 */

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (_e) {
      // Storage access blocked or restricted
    }
    return null;
  },

  setItem(key: string, value: string): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return true;
      }
    } catch (_e) {
      // Storage access blocked or quota exceeded
    }
    return false;
  },

  removeItem(key: string): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return true;
      }
    } catch (_e) {
      // Storage access blocked
    }
    return false;
  },
};

export default safeStorage;
