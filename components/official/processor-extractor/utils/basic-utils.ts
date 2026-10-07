import { copyToClipboard as copyWithToast } from "@/lib/clipboard/copy";

/**
 * Copies text to the clipboard; a refused copy announces itself. Resolves to whether it landed.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;
  return copyWithToast(text);
};
