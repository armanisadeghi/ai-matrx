import HamburgerButton from "./header-left-menu/HamburgerButton";
import { HeaderControlSet } from "./HeaderControlSet";
import { HeaderCrowdingGuard } from "./HeaderCrowdingGuard";
import ShellChatToggle from "./ShellChatToggle";
import { GuestPhoneBrand, GuestPhoneSignIn } from "./GuestHeader";

interface HeaderProps {
  isAuthenticated: boolean;
}

/**
 * THE HEADER — route content in the center, the route's own actions and then
 * THE HEADER CONTROL SET on the right (`HeaderControlSet`: Search,
 * Intelligence, Canvas, Messages, Notifications — owner, 2026-09-30). Nothing
 * else is built into the header: the organization lives in the sidebar's
 * account rail (`ShellOrgSwitcher`), the person bottom-left
 * (`ShellUserBlock`). Guard: `features/shell/__tests__/header-right-set.test.ts`.
 *
 * THE TOP BOUNDARY is owned here, once (owner, 2026-10-03): the band is solid
 * (`.shell-header::before`), there is no border under it, and the only
 * transition into the page is `.shell-header-fade` — a few pixels drawn over
 * the content, zero layout space. Routes inject into the slots below and can
 * never style it. Guard: `features/shell/__tests__/header-top-boundary.test.ts`.
 */
export default function Header({ isAuthenticated }: HeaderProps) {
  return (
    <header className="shell-header">
      <div className="shell-header-fade" data-shell-header-fade aria-hidden="true" />
      <HamburgerButton />
      {isAuthenticated ? <ShellChatToggle /> : <GuestPhoneBrand />}
      <HeaderCrowdingGuard />

      <div className="shell-header-center" id="shell-header-center" />

      <div className="shell-header-right" data-header-right-set>
        <div className="shell-header-right-inject" id="shell-header-right" />
        {isAuthenticated ? null : <GuestPhoneSignIn />}
        <HeaderControlSet isAuthenticated={isAuthenticated} />
      </div>
    </header>
  );
}
