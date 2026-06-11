import ChatLanding from "@/features/auth/components/module-landing/landings/ChatLanding";

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
  return <ChatLanding />;
}
