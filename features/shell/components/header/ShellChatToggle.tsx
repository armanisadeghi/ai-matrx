"use client";

import { MessageTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { SHELL_CHAT_TOGGLE_EVENT } from "@ai-matrx/chat/canvas/workspace/shell-chat-route";

/**
 * The header's way to the chat — on the LEFT, where the chat opens (as the
 * Board's "Show chat" is). Shown only where the shell chat can open
 * (`data-shell-chat-available`, set by ShellChatDock); ⌘\ does the same.
 */
export default function ShellChatToggle() {
  return (
    <div className="shell-chat-toggle">
      <MessageTapButton
        variant="transparent"
        ariaLabel="Chat"
        tooltip="Chat (Ctrl/Cmd + \)"
        onClick={() => window.dispatchEvent(new Event(SHELL_CHAT_TOGGLE_EVENT))}
      />
    </div>
  );
}
