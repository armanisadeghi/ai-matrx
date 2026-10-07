// providers/chatMarkdownRegistration.ts
//
// The app's rich-document rendering engine, registered into `@ai-matrx/chat`
// (../aidream/apps/shared/chat/src/host/markdown-slots.tsx, chat-package-move P14). The package draws
// markdown through these slots and never imports the engine. Imported for its side effect
// by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/markdown-slots";
import MarkdownStream from "@/components/MarkdownStream";
import { BasicMarkdownContent } from "@ai-matrx/rich-content/display/chat-markdown/BasicMarkdownContent";
import AudioOutputBlockSkeleton from "@/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";
import { useOpenCitationSource } from "@/components/mardown-display/chat-markdown/citations/useOpenCitationSource";

registerChatUi({
  MarkdownStream,
  BasicMarkdownContent,
  AudioOutputBlockSkeleton,
  useOpenCitationSource,
  // The diagram engine stays a lazy chunk: loaded only when a print or capture asks for it.
  renderAllDiagrams: async (...args: Parameters<typeof import("@ai-matrx/rich-content/mermaid/lazy-draw").renderAllDiagrams>) =>
    (await import("@ai-matrx/rich-content/mermaid/lazy-draw")).renderAllDiagrams(...args),
  drawMermaidForPrint: async (...args: Parameters<typeof import("@ai-matrx/rich-content/mermaid/print-render").drawMermaidForPrint>) =>
    (await import("@ai-matrx/rich-content/mermaid/print-render")).drawMermaidForPrint(...args),
});
