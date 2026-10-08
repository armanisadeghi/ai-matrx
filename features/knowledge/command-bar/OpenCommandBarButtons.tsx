"use client";

/**
 * The visible doors to ⌘K "Search your knowledge" — the same bar the hotkey
 * opens, reachable on a phone (no keyboard) from the shell header and the
 * mobile dock. Linear and Raycast both pair the shortcut with a visible
 * search affordance; a shortcut alone is invisible on touch.
 *
 * A guest gets the same button, which opens the auth gate naming the feature
 * (the header right-set law: gated, never hidden).
 */

import { Search } from "lucide-react";
import { SearchTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useOpenKnowledgeCommandBar } from "@/features/overlays/openers/knowledgeCommandBar";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";

const GATE = {
  featureName: "Search",
  featureDescription:
    "One search over your sources, chats, notes, projects, files and agents — and every command in the app.",
};

/** The ⌘K bar, or the auth gate for a guest — shared by every Search door. */
export function useOpenBarOrGate(isAuthenticated: boolean) {
  const openBar = useOpenKnowledgeCommandBar();
  const openAuthGate = useOpenAuthGateDialog();
  return () => (isAuthenticated ? openBar() : openAuthGate(GATE));
}

export function CommandBarHeaderButton({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const open = useOpenBarOrGate(isAuthenticated);
  return (
    <SearchTapButton
      variant="transparent"
      ariaLabel={isAuthenticated ? "Search your knowledge (⌘K)" : "Search — sign in to search"}
      tooltip={isAuthenticated ? "Search  ⌘K" : "Search (sign in)"}
      onClick={open}
    />
  );
}

export function CommandBarDockButton({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const open = useOpenBarOrGate(isAuthenticated);
  return (
    <button
      type="button"
      onClick={open}
      className="shell-dock-item"
      aria-label="Search your knowledge"
      data-testid="dock-knowledge-search"
    >
      <Search size={22} strokeWidth={1.75} />
    </button>
  );
}
