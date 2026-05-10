"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useImpairmentDefinition } from "./ImpairmentSearch";
import { WarningsCallout } from "./WarningsCallout";
import type { InjuryDraft } from "../../state/types";

interface InjuryCardProps {
  index: number;
  injury: InjuryDraft;
  onEdit: () => void;
  onDelete: () => void;
  warnings?: string[];
  className?: string;
}

const SIDE_LABELS: Record<string, string> = {
  left: "Left",
  right: "Right",
  default: "Bilateral",
};

export function InjuryCard({
  index,
  injury,
  onEdit,
  onDelete,
  warnings = [],
  className,
}: InjuryCardProps) {
  const definition = useImpairmentDefinition(injury.impairment_definition_id);
  const incomplete = !injury.impairment_definition_id;

  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-4",
        "transition-colors hover:border-primary/30",
        incomplete && "border-dashed",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-mono font-semibold text-primary">
          {index + 1}
        </span>

        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-0 text-left"
        >
          {definition ? (
            <>
              <p className="text-sm font-medium text-foreground truncate">
                {definition.name}
              </p>
              <p className="mt-0.5 text-xs font-mono text-muted-foreground">
                {definition.impairment_number}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Click to choose an impairment
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {/* Show the side chip only when the impairment actually accepts a
                side (e.g. shoulder, knee). Lumbar/Cervical DRE-style
                impairments have no laterality; the auto-defaulted "default"
                value would otherwise render as a misleading "Bilateral"
                badge. While no impairment is selected yet, fall back to the
                old behavior so the editor preview stays useful. */}
            {(definition?.attributes?.side ?? true) && (
              <Chip>{SIDE_LABELS[injury.side] ?? injury.side}</Chip>
            )}
            {injury.wpi != null && injury.wpi > 0 && (
              <Chip>{injury.wpi}% WPI</Chip>
            )}
            {injury.ue != null && injury.ue > 0 && <Chip>{injury.ue}% UE</Chip>}
            {injury.le != null && injury.le > 0 && <Chip>{injury.le}% LE</Chip>}
            {injury.digit != null && injury.digit > 0 && (
              <Chip>{injury.digit}% digit</Chip>
            )}
            {injury.pain > 0 && <Chip>+{injury.pain} pain</Chip>}
            {injury.industrial !== 100 && (
              <Chip>{injury.industrial}% industrial</Chip>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onEdit}
            aria-label="Edit injury"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Delete injury"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <WarningsCallout warnings={warnings} className="mt-3 ml-9" />
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono">
      {children}
    </span>
  );
}
