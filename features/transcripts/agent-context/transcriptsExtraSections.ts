import { toast } from "@/lib/toast";
import { Copy } from "lucide-react";
import { copyContent } from "@ai-matrx/rich-content/copy/copy-commands";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { copyNotify } from "@/lib/clipboard/copy-notify";

export interface TranscriptsExtraSectionsArgs {
  /** Full transcript text the "Copy transcript" item writes to the clipboard. */
  getTranscriptText: () => string;
}

/**
 * Transcript-specific menu items injected via `extraSections` (the core menu
 * renders them; this wrapper only describes them).
 *
 * Kept intentionally small: the viewer header already hosts the richer surface
 * actions (export / save-to-notes / promote-to-studio via the one action bar, `RichDocumentActions`).
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
            void copyContent(text, {
              onSuccess: () => copyNotify("Transcript copied", "success"),
              onError: () => toast.error("Failed to copy"),
            });
          },
        },
      ],
    },
  ];
}
