import type { Metadata } from "next";
import ChatLanding from "@/features/auth/components/module-landing/landings/ChatLanding";

export const metadata: Metadata = {
  title: "Chat — AI Matrx",
  description:
    "Chat with real agents — not just a chat box. Drop in files, run agentic workflows, branch and fork, replay every step. Free to start.",
  openGraph: {
    title: "Chat with real agents — AI Matrx",
    description:
      "Drop in files, run agentic workflows, branch and fork, replay every step.",
    type: "website",
  },
};

/**
 * `/chat` is the public-facing marketing surface for the Chat module. The
 * sidebar nav routes authenticated users straight to `/chat/new` (the
 * workspace), so authed visitors hit this page only via external links;
 * when they do, `AuthedWorkspaceCTA` (mounted by `ModuleLanding`) gives
 * them a one-tap route to the workspace.
 *
 * Guests get the full marketing experience: hero, capabilities, how it
 * works, sub-area cards, polite conversion nudges that fire after
 * meaningful interaction.
 */
export default function ChatPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto bg-textured">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <ChatLanding />
    </div>
  );
}
