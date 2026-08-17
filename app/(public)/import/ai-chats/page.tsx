import type { Metadata } from "next";
import { SourceGallery } from "@/features/source-onboarding/components/SourceGallery";
import { aiChatsGallery } from "@/features/source-onboarding/galleries/ai-chats";

export const metadata: Metadata = {
  title: "Import your AI chats | AI Matrx",
  description:
    "Export your conversation history from ChatGPT, Claude, Gemini, Grok, Meta AI, Cursor, Copilot, and Claude Code — step-by-step guides — and turn your own judgment into a Rulebook on AI Matrx.",
};

export default function AiChatsGalleryPage() {
  return <SourceGallery gallery={aiChatsGallery} />;
}
