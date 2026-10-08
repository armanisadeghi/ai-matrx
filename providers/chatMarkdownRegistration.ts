// providers/chatMarkdownRegistration.ts
//
// The app's rich-document rendering engine, registered into `@ai-matrx/chat`
// (../aidream/apps/shared/chat/src/host/markdown-slots.tsx, chat-package-move P14). The package draws
// markdown through this slot and never imports the engine (the plain markdown leaf and the diagram
// engine are @ai-matrx/rich-content, which chat imports directly). Imported for its side effect
// by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/markdown-slots";
import MarkdownStream from "@/components/MarkdownStream";
import AudioOutputBlockSkeleton from "@/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";
import { useOpenCitationSource } from "@/components/mardown-display/chat-markdown/citations/useOpenCitationSource";

registerChatUi({
  MarkdownStream,
  AudioOutputBlockSkeleton,
  useOpenCitationSource,
});
