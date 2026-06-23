import { toast } from "sonner";
import { Copy } from "lucide-react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";

export interface TranscriptsExtraSectionsArgs {
  /** Full transcript text the "Copy transcript" item writes to the clipboard. */
  getTranscriptText: () => string;
}

/**
 * Transcript-specific menu items injected via `extraSections` (the core menu
 * renders them; this wrapper only describes them).
 *
 * Kept intentionally small: the viewer header already hosts the richer surface
 * actions (export / save-to-notes / promote-to-studio via `ContentActionBar`).
 * The right-click menu just adds the one action a reader expects there — copy
 * the whole transcript — wired to real behavior, not a placeholder.
 */
export function createTranscriptsExtraSections(
  args: TranscriptsExtraSectionsArgs,
): ContextMenuExtraSection[] {
  const { getTranscriptText } = args;
  return [
    {
      id: "transcript-ops",
      label: "Transcript",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "copy-transcript",
          label: "Copy transcript",
          icon: Copy,
          onSelect: () => {
            const text = getTranscriptText().trim();
            if (!text) {
              toast.error("Transcript is empty");
              return;
            }
            void copyToClipboard(text, {
              onSuccess: () => toast.success("Transcript copied"),
              onError: () => toast.error("Failed to copy"),
            });
          },
        },
      ],
    },
  ];
}
