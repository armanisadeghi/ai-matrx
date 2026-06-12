"use client";

import { GhostTapButton } from "@/components/icons/tap-buttons";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { useChatIncognito } from "./ChatIncognitoProvider";

export function ChatIncognitoHeaderButton() {
  const { isIncognito, toggleIncognito, canUseIncognito } = useChatIncognito();

  if (!canUseIncognito) return null;

  return (
    <PageHeaderRightPortal>
      <GhostTapButton
        ariaLabel={isIncognito ? "Exit incognito chat" : "Incognito chat"}
        tooltip={isIncognito ? "Exit incognito chat" : "Incognito chat"}
        variant={isIncognito ? "solid" : "glass"}
        bgColor={isIncognito ? "bg-foreground" : undefined}
        iconColor={isIncognito ? "text-background" : undefined}
        hoverBgColor={isIncognito ? "hover:bg-foreground/90" : undefined}
        onClick={toggleIncognito}
      />
    </PageHeaderRightPortal>
  );
}
