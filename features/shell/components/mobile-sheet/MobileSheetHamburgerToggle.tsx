"use client";

// Same hamburger control as the shell header — fixed to the identical spot so
// an accidental open can be dismissed with the same tap target.

import { MenuTapButton } from "@/components/icons/tap-buttons";

export default function MobileSheetHamburgerToggle() {
  return (
    <MenuTapButton
      as="label"
      htmlFor="shell-mobile-menu"
      ariaLabel="Close navigation menu"
      className="shell-mobile-sheet-hamburger"
    />
  );
}
