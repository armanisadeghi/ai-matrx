import HamburgerButton from "./header-left-menu/HamburgerButton";
import HeaderChooseOrgButton from "./header-right-menu/HeaderChooseOrgButton";
import { CanvasShellHeaderToggle } from "@/features/canvas/core/CanvasHeaderToggle";
import { SurfaceAgentsHeaderButton } from "@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import { InboxHeaderButton } from "@/features/notifications/components/InboxHeaderButton";

interface HeaderProps {
  isAuthenticated: boolean;
}

/**
 * THE HEADER RIGHT SET — the same three controls, in the same order, at every
 * breakpoint and in every auth state (owner, 2026-09-19: "a consistent set of
 * things for that top-right section … never hiding things and only disabling
 * when inactive"):
 *
 *   [ route-injected actions ] [ Agents ] [ Canvas ] [ Inbox ]
 *
 * Each control owns a fixed 44px slot and is ALWAYS mounted. A control with
 * nothing to do is `disabled` with a tooltip that says why (Canvas with
 * nothing in it); a control a guest cannot use opens the auth gate (Agents,
 * Inbox). Nothing here unmounts on state, so the row never shifts.
 *
 * The one conditional element is the red "Choose org" nudge: a warning, not a
 * control, that exists only while no organization is chosen.
 *
 * The profile/avatar menu is NOT here any more — it lives bottom-left
 * (`ShellUserBlock`), where the sidebar ends. Guard:
 * `features/shell/__tests__/header-right-set.test.tsx`.
 */
export default function Header({ isAuthenticated }: HeaderProps) {
  return (
    <header className="shell-header">
      <HamburgerButton />

      <div className="shell-header-center" id="shell-header-center" />

      <div className="shell-header-right" data-header-right-set>
        <div className="shell-header-right-inject" id="shell-header-right" />
        {/* Renders nothing once an org is active. In header flow on purpose —
            it replaced a fixed drop-down card that covered route chrome. */}
        {isAuthenticated && <HeaderChooseOrgButton />}
        <SurfaceAgentsHeaderButton isAuthenticated={isAuthenticated} />
        <CanvasShellHeaderToggle />
        <InboxHeaderButton isAuthenticated={isAuthenticated} />
      </div>
    </header>
  );
}
