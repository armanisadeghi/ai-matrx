/**
 * Server slots for the chat dock: each reads the dock's cookies (request-
 * cached) right where it renders, so the shell layouts need no new plumbing and
 * the first paint is the dock as the person left it.
 */

import { readComposerModeCookie } from "@/features/agents/components/inputs/smart-input/composer/composer-mode.server";
import { readChatDockInitial } from "./chat-dock.server";
import { ChatDockHeaderButton } from "./ChatDockHeaderButton";
import { ShellChatDock } from "./ShellChatDock";

/** In `.shell-root`, right after `<main>`: the dock's grid column. */
export async function ShellChatDockSlot() {
  const [initial, initialMode] = await Promise.all([readChatDockInitial(), readComposerModeCookie()]);
  return <ShellChatDock initial={initial} initialMode={initialMode} />;
}

/** In THE HEADER RIGHT SET. */
export async function ChatDockHeaderSlot({ isAuthenticated }: { isAuthenticated: boolean }) {
  const initial = await readChatDockInitial();
  return <ChatDockHeaderButton initialOpen={initial.open} isAuthenticated={isAuthenticated} />;
}
