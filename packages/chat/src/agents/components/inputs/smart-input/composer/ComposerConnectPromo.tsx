"use client";

/**
 * With nothing connected to this chat, the chips row offers the most popular
 * connectors (Arman, 2026-10-03): one chip, their brand marks in color, then
 * "Connect". A press opens the live connector directory — the same door as
 * + › Connections › Browse all connectors.
 */

import {
  GitHubMark,
  GmailMark,
  GoogleDocsMark,
  GoogleSheetsMark,
  MicrosoftMark,
} from "@host/features/connectors/marks";
import { cn } from "@ai-matrx/design-system";
import { useOpenLiveIntegrationsWindow } from "../../../../../host/window-openers";
import { COMPOSER_CHIP_CLASS } from "./composer-chip";

const POPULAR = [
  { name: "Gmail", Mark: GmailMark },
  { name: "Google Docs", Mark: GoogleDocsMark },
  { name: "Google Sheets", Mark: GoogleSheetsMark },
  { name: "GitHub", Mark: GitHubMark },
  { name: "Microsoft", Mark: MicrosoftMark },
] as const;

export function ComposerConnectPromo({ className }: { className?: string }) {
  const openDirectory = useOpenLiveIntegrationsWindow();
  const names = POPULAR.map((p) => p.name).join(", ");
  return (
    <button
      type="button"
      onClick={() => openDirectory()}
      className={cn(COMPOSER_CHIP_CLASS, "gap-1.5", className)}
      title={`Connect ${names} and more`}
      aria-label={`Connect apps: ${names} and more`}
    >
      <span className="flex items-center gap-1">
        {POPULAR.map(({ name, Mark }) => (
          <Mark key={name} colored className="h-3.5 w-3.5" />
        ))}
      </span>
      <span className="text-muted-foreground">Connect</span>
    </button>
  );
}
