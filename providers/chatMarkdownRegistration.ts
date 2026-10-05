// providers/chatMarkdownRegistration.ts
//
// The app's rich-document rendering engine, registered into `@ai-matrx/chat`
// (packages/chat/src/host/markdown-slots.tsx, chat-package-move P14). The package draws
// markdown through these slots and never imports the engine. Imported for its side effect
// by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import "@ai-matrx/chat/host/markdown-slots";
import MarkdownStream from "@/components/MarkdownStream";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import AudioOutputBlockSkeleton from "@/components/mardown-display/blocks/audio/AudioOutputBlockSkeleton";

registerChatUi({ MarkdownStream, BasicMarkdownContent, AudioOutputBlockSkeleton });
