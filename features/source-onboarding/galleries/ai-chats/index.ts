import type { SourceGalleryConfig } from "../../types";
import { chatgpt } from "./providers/chatgpt";
import { claude } from "./providers/claude";
import { gemini } from "./providers/gemini";
import { grok } from "./providers/grok";
import { metaAi } from "./providers/meta-ai";
import { cursor } from "./providers/cursor";
import { vscodeCopilot } from "./providers/vscode-copilot";
import { claudeCode } from "./providers/claude-code";
import { aiMatrx } from "./providers/ai-matrx";
import { matrxLocal } from "./providers/matrx-local";
import { other } from "./providers/other";

export const aiChatsGallery: SourceGalleryConfig = {
    key: "ai-chats",
    title: "Import your AI chats",
    intro: "Your years of conversations with AI assistants are full of your own judgment — every time you corrected an answer, insisted on doing it your way, or rejected a suggestion, you left a trace of how you actually think. That judgment is what we mine, never the AI's opinions. Bring the chats in, and we do the digging.",
    providers: [chatgpt, claude, gemini, grok, metaAi, cursor, vscodeCopilot, claudeCode, aiMatrx, matrxLocal, other],
    ctaHref: "/masterwork",
    ctaLabel: "Turn them into a Rulebook",
};
