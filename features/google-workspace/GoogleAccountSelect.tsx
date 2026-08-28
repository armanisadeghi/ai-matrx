"use client";

import { UserRound } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { googleConnectionLabel } from "@/features/marketing/google/presentation";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { cn } from "@/lib/utils";

export interface GoogleAccountSelectProps {
  connections: GoogleConnectionSummary[];
  connectionId: string;
  onConnectionChange: (connectionId: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Canonical Google identity control used immediately before account-scoped
 * work. One eligible account reads as identity confirmation; multiple accounts
 * become an explicit selector rather than silently choosing the first row.
 */
export function GoogleAccountSelect({
  connections,
  connectionId,
  onConnectionChange,
  label = "Google account",
  disabled = false,
  className,
}: GoogleAccountSelectProps) {
  const selected =
    connections.find((connection) => connection.id === connectionId) ??
    connections[0] ??
    null;
  if (!selected) return null;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {connections.length === 1 ? (
        <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-sm text-foreground">
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{googleConnectionLabel(selected)}</span>
        </div>
      ) : (
        <Select
          value={selected.id}
          onValueChange={onConnectionChange}
          disabled={disabled}
        >
          <SelectTrigger
            className="h-11"
            aria-label={`Choose ${label.toLocaleLowerCase()}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {googleConnectionLabel(connection)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
