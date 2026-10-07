import { copyContent } from "@/components/agent-copy/copy-commands";

/**
 * The single clipboard path for Matrx reference fences.
 *
 * `copyContent` opens the global manual-copy dialog when browser clipboard
 * access is unavailable. A false result therefore means the user still has a
 * selected, copyable fence in front of them; callers must not show a dead-end
 * error toast or claim the copy succeeded.
 */
export async function copyReferenceFence(fence: string): Promise<boolean> {
  return copyContent(fence, {
    formatJson: false,
    onError: () => undefined,
  });
}
