/**
 * Safely copies text to clipboard
 * @param {string} text - Text to copy
 * @returns {boolean} Success status
 */
export const copyToClipboard = (text: string) => {
    if (!text) return false;
    try {
      navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.error("Copy to clipboard failed:", e);
      return false;
    }
  };