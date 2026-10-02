"use client";

// ChatPanelBackButton — mobile-only back button pinned in the chat panel header.
//
// Tapping it does two things atomically:
//   1. Closes the chat sidebar (unchecks #shell-panel-mobile)
//   2. Opens the main app nav sheet (checks #shell-mobile-menu)
//
// This gives users a seamless "go back to main navigation" gesture.
// Both operations are pure DOM checkbox manipulation — zero React re-renders.

import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

export default function ChatPanelBackButton() {
  function handleBack() {
    const panelCheckbox = document.getElementById(
      "shell-panel-mobile",
    ) as HTMLInputElement | null;
    const menuCheckbox = document.getElementById(
      "shell-mobile-menu",
    ) as HTMLInputElement | null;

    if (panelCheckbox) panelCheckbox.checked = false;
    if (menuCheckbox) menuCheckbox.checked = true;
  }

  return (
    <ChevronLeftTapButton
      variant="transparent"
      onClick={handleBack}
      ariaLabel="Back to main navigation"
    />
  );
}
