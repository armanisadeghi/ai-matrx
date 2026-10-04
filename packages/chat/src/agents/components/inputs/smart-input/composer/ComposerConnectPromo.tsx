"use client";

/**
 * With nothing connected to this chat, the chips row offers the most popular
 * connectors (Arman, 2026-10-03): one chip, their brand marks in color, then
 * "Connect". A press opens the SAME Connections menu as + › Connections
 * (per-chat switches, reconnect, choose files, browse all) — never a second door.
 */

import {
  GitHubMark,
  GmailMark,
  GoogleDocsMark,
  GoogleSheetsMark,
  MicrosoftMark,
} from "@host/features/connectors/marks";
import { useState } from "react";
import { cn, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { ComposerConnectorsPanel } from "./ComposerConnectorsPanel";
import { COMPOSER_CHIP_CLASS } from "./composer-chip";

const POPULAR = [
  { name: "Gmail", Mark: GmailMark },
  { name: "Google Docs", Mark: GoogleDocsMark },
  { name: "Google Sheets", Mark: GoogleSheetsMark },
  { name: "GitHub", Mark: GitHubMark },
  { name: "Microsoft", Mark: MicrosoftMark },
] as const;

export function ComposerConnectPromo({
  conversationId,
  menuSide,
  className,
}: {
  conversationId: string;
  menuSide: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const names = POPULAR.map((p) => p.name).join(", ");
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(COMPOSER_CHIP_CLASS, "gap-1.5", open && "bg-accent", className)}
          title={`Connect ${names} and more`}
          aria-label={`Connections: ${names} and more`}
        >
          <span className="flex items-center gap-1">
            {POPULAR.map(({ name, Mark }) => (
              <Mark key={name} colored className="h-3.5 w-3.5" />
            ))}
          </span>
          <span className="text-muted-foreground">Connect</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — the same 360px Connections panel as + › Connections */
        side={menuSide}
        align="start"
        sideOffset={6}
        className="flex h-[min(70dvh,480px)] w-[360px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
      >
        <ComposerConnectorsPanel conversationId={conversationId} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
