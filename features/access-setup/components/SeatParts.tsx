"use client";

// Shared pieces of the People involved panels: a person row and the parts a seat sees.

import Link from "next/link";
import { Pencil, Undo2, UserMinus } from "lucide-react";
import { Badge, Button } from "@ai-matrx/design-system/controls";
import { getInitials } from "@ai-matrx/kit/format";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { partLabel, stageLabel, type AccessSetupTypeConfig } from "../registry";
import type { SeatCell, SeatHolder, SeatPerson } from "../types";

export function PersonRow({
  person,
  note,
  tone = "neutral",
  muted = false,
  action,
}: {
  person: SeatPerson;
  note?: string;
  tone?: "neutral" | "info" | "warning" | "success";
  muted?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-0.5">
      <Avatar className={`h-5 w-5 shrink-0 ${muted ? "opacity-60" : ""}`}>
        {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-xs">{getInitials(person.name)}</AvatarFallback>
      </Avatar>
      <span className={`min-w-0 truncate text-sm ${muted ? "text-muted-foreground line-through" : ""}`} title={person.email ?? undefined}>
        {person.name}
      </span>
      {note ? <Badge tone={tone} className="shrink-0">{note}</Badge> : null}
      {action ? <span className="ml-auto shrink-0">{action}</span> : null}
    </div>
  );
}

export function HolderAction({
  holder,
  disabled,
  onExclude,
  onUndo,
}: {
  holder: SeatHolder;
  disabled: boolean;
  onExclude: () => void;
  onUndo: () => void;
}) {
  if (holder.source === "added") {
    return (
      <Button variant="quiet" icon={<Undo2 className="h-4 w-4" />} disabled={disabled} onClick={onUndo}>
        Undo
      </Button>
    );
  }
  if (!holder.removable || holder.source === "fallback" || holder.source === "grant") return null;
  return (
    <Button variant="quiet" icon={<UserMinus className="h-4 w-4" />} disabled={disabled} onClick={onExclude}>
      Exclude
    </Button>
  );
}

/** "Self-evaluation · after they submit" — one chip per part; not yet open reads muted. */
export function SeatPartsLine({ cells, config }: { cells: SeatCell[]; config: AccessSetupTypeConfig }) {
  if (cells.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {cells.map((c) => {
        const when = c.fromStage && c.fromStage.length > 0 ? stageLabel(config, c.fromStage[0]) : null;
        const edits = c.level === "editor" || c.level === "admin";
        return (
          <span
            key={c.part}
            className={`inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs ${
              c.reached ? "text-foreground" : "text-muted-foreground"
            }`}
            title={edits ? "Can edit" : "Can view"}
          >
            {edits ? <Pencil className="h-3 w-3" aria-label="Can edit" /> : null}
            {partLabel(config, c.part)}
            {when ? <span className="text-muted-foreground">· {when}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export function SetAtLink({ setAt }: { setAt: { label: string; href: string } | null }) {
  if (!setAt) return null;
  return (
    <Link href={setAt.href} className="text-xs text-primary hover:underline">
      {setAt.label}
    </Link>
  );
}
