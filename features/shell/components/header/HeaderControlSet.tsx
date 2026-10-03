import { CanvasToggle } from "@ai-matrx/canvas/react";
import { SurfaceAgentsHeaderButton } from "@ai-matrx/chat/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import { InboxHeaderButton } from "@/features/notifications/components/InboxHeaderButton";
import { MessagesHeaderButton } from "@/features/messaging/components/shell/MessagesHeaderButton";
import { CommandBarHeaderButton } from "@/features/knowledge/command-bar/OpenCommandBarButtons";
import { HeaderPhoneOverflow } from "./HeaderPhoneOverflow";

/**
 * THE HEADER CONTROL SET — the shell's permanent header icons, ONE copy for
 * every header that draws them (the shell `Header`, the canvas workspace's
 * header on /board). Owner, 2026-09-30, left to right:
 *
 *   [ Search ] [ Intelligence ] [ Canvas ] [ Messages ] [ Notifications ]
 *
 * Each is a 44px tap target that carries its own invisible spacing: NO gap,
 * NO padding, NO margin between them or around them — they render touching.
 * Nothing else belongs here; a route adds its own controls through
 * `#shell-header-right`, to the left of this set.
 *
 * Below 768px the five fold into `HeaderPhoneOverflow` (one ⋮ → a bottom sheet
 * holding the same five), a CSS swap so the server-rendered row never shifts.
 */
export function HeaderControlSet({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <>
      <div className="shell-header-secondary" data-header-control-set>
        <CommandBarHeaderButton isAuthenticated={isAuthenticated} />
        <SurfaceAgentsHeaderButton isAuthenticated={isAuthenticated} />
        <CanvasToggle variant="transparent" />
        <MessagesHeaderButton isAuthenticated={isAuthenticated} />
        <InboxHeaderButton isAuthenticated={isAuthenticated} />
      </div>
      <HeaderPhoneOverflow isAuthenticated={isAuthenticated} />
    </>
  );
}
