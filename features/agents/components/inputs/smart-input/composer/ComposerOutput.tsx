"use client";

/**
 * Output (brief §11). What the person wants back.
 *
 * Real today: Shapes — each one attaches its render_block skill to this chat
 * (the SAME `addedSkills` write the Quickset shape chips make, through the
 * shared `useShapeChipToggles`), and "Let the agent decide" (no shape asked
 * for). Artifacts, Files, Media and The Matrx have no request field or tool
 * behind them yet, so they are hidden, never faked (brief Q5); each appears
 * here the day a real capability backs it.
 *
 * Output is sticky for the chat (it lives in the conversation's run settings)
 * and the pill carries an × to clear it.
 */

import { useState } from "react";
import { ChevronDown, Layers, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { SHAPE_CHIP_ICONS, useShapeChipToggles } from "../ShapeChipsRow";
import { ComposerMenuDivider, ComposerMenuLabel, ComposerMenuRow, ComposerSubmenu } from "./ComposerMenu";
import { composerPillClass } from "./ComposerAgentPill";
import type { ComposerSize } from "./composer-types";

function ShapesList({ conversationId }: { conversationId: string }) {
  const { chips, added, toggle } = useShapeChipToggles(conversationId);
  return (
    <>
      <ComposerMenuLabel>Shapes</ComposerMenuLabel>
      {chips.map((chip) => (
        <ComposerMenuRow
          key={chip.key}
          icon={SHAPE_CHIP_ICONS[chip.key] ?? Layers}
          label={chip.label}
          checked={added.has(chip.registryId)}
          onClick={() => toggle(chip.registryId)}
        />
      ))}
    </>
  );
}

/** The Output menu's body — rendered in the pill (page/splash) or inside + (compact). */
export function ComposerOutputPanel({ conversationId }: { conversationId: string }) {
  const { chips, added, clear } = useShapeChipToggles(conversationId);
  const onCount = chips.filter((chip) => added.has(chip.registryId)).length;
  return (
    <>
      {chips.length > 0 ? (
        <ComposerSubmenu
          row={{ icon: Layers, label: "Shapes", badge: onCount > 0 ? `${onCount} on` : undefined }}
          panelClassName="w-64"
        >
          <ShapesList conversationId={conversationId} />
        </ComposerSubmenu>
      ) : null}
      <ComposerMenuDivider />
      <ComposerMenuRow label="Let the agent decide" checked={onCount === 0} onClick={clear} />
    </>
  );
}

export function ComposerOutputPill({
  conversationId,
  size,
  menuSide,
}: {
  conversationId: string;
  size: ComposerSize;
  menuSide: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const { chips, added, clear } = useShapeChipToggles(conversationId);
  const onChips = chips.filter((chip) => added.has(chip.registryId));
  const label = onChips.length === 0 ? "Output" : onChips.length === 1 ? onChips[0].label : `${onChips.length} shapes`;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <div className={cn(composerPillClass(size, open), "gap-0 p-0")}>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex h-full min-w-0 items-center gap-1 px-2" aria-label={`Output: ${label}`}>
            <span className={cn("truncate", onChips.length > 0 && "font-medium text-foreground")}>{label}</span>
            {onChips.length === 0 ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : null}
          </button>
        </PopoverTrigger>
        {onChips.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear output"
            title="Clear — let the agent decide"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <PopoverContent
        /* sizing: fixed — the Output menu is a fixed 260px list of families (brief §11) */
        side={menuSide}
        align="start"
        sideOffset={8}
        className="w-64 p-1"
      >
        <ComposerOutputPanel conversationId={conversationId} />
      </PopoverContent>
    </Popover>
  );
}
