// features/kg-suggestions/components/KgSuggestionsNavButton.tsx
//
// A reusable "open the global suggestion inbox" button with a live count
// badge. Opens the GlobalSuggestionsDrawer via the overlay system (NOT a
// parallel render tree) — see openers/kgSuggestionsDrawer.tsx. Drop this into
// any nav / hub surface that should expose the global inbox. Self-fetches the
// global pending count so the badge stays in sync with accept/reject/defer
// from any other surface.

"use client";

import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { useOpenKgSuggestionsDrawer } from "@/features/overlays/openers/kgSuggestionsDrawer";
import type { KgGlobalFilter } from "@/features/kg-suggestions/types";

export interface KgSuggestionsNavButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Hide entirely when there are no pending suggestions. Default false. */
  hideWhenEmpty?: boolean;
  label?: string;
}

export function KgSuggestionsNavButton({
  className,
  variant = "outline",
  hideWhenEmpty = false,
  label = "Suggestions",
}: KgSuggestionsNavButtonProps) {
  const filter: KgGlobalFilter = { global: true, status: "pending" };
  const { count } = useKgSuggestions(filter);
  const openDrawer = useOpenKgSuggestionsDrawer();

  if (hideWhenEmpty && count <= 0) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={() => openDrawer()}
      className={cn("relative gap-1.5", className)}
    >
      <Lightbulb className="h-3.5 w-3.5" />
      <span>{label}</span>
      {count > 0 ? (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}

export default KgSuggestionsNavButton;
