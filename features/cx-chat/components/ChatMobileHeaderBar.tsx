// ChatMobileHeaderBar — Pure server component. No 'use client'. Renders on first paint.
//
// Layout: [Hamburger] [New Chat] [Agent Name (flex-1)] [44px gap for shell avatar]
//
// The shell header already renders the user avatar (UserMenuTrigger, w-11) on the far
// right. Our fixed bar covers the full width at the same z-index, so it MUST leave
// the right 44px (pr-11) clear — otherwise we'd overlap the avatar.
//
// New Chat is placed LEFT (next to the hamburger), not right, for the same reason.
//
// The tiny ChatMobileAgentName client island hydrates the agent-name button in-place
// with the same size/shape as the static text, so there is zero layout shift.

import Link from "next/link";
import {
  MenuTapButton,
  SquarePenTapButton,
} from "@/components/icons/tap-buttons";
import ChatMobileAgentName from "./ChatMobileAgentName";
import ChatMobileAdminToggles from "./ChatMobileAdminToggles";

export default function ChatMobileHeaderBar() {
  return (
    <div
      className="lg:hidden fixed top-0 left-0 right-0 z-[41] flex items-center pr-11 pointer-events-none"
      style={{ height: "var(--shell-header-h)" }}
    >
      <span className="pointer-events-auto flex-shrink-0">
        <MenuTapButton
          as="label"
          htmlFor="shell-panel-mobile"
          ariaLabel="Open chat menu"
        />
      </span>

      <Link
        href="/demos/chat"
        aria-label="New chat"
        className="flex-shrink-0 pointer-events-auto"
      >
        <SquarePenTapButton ariaLabel="New chat" />
      </Link>

      <div className="flex-1 flex items-center justify-center min-w-0 pointer-events-auto">
        <ChatMobileAgentName />
      </div>

      <span className="pointer-events-auto flex-shrink-0">
        <ChatMobileAdminToggles />
      </span>
    </div>
  );
}
