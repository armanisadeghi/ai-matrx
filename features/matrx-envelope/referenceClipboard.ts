import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";

/**
 * The single clipboard path for Matrx reference fences.
 *
 * `copyToClipboard` opens the global manual-copy dialog when browser clipboard
 * access is unavailable. A false result therefore means the user still has a
 * selected, copyable fence in front of them; callers must not show a dead-end
 * error toast or claim the copy succeeded.
 */
export async function copyReferenceFence(fence: string): Promise<boolean> {
  return copyToClipboard(fence, {
    formatJson: false,
    onError: () => undefined,
  });
}
