import { redirect } from "next/navigation";

/**
 * `/chat` is intentionally the agent picker, NOT a "resume last conversation"
 * landing. Users reach prior conversations via the sidebar — visiting /chat
 * itself always presents a fresh choice (mirrors how Slack / iMessage open to
 * an empty "compose" surface, not your last thread).
 */
export default function ChatRoot() {
  redirect("/chat/new");
}
