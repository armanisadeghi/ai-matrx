"use client";

// features/admin/relationships/components/EntityExplorerEntry.tsx
//
// Shared entry point for the entity relationship explorer: pick any entity
// type token, then either navigate to its full page
// (/administration/relationships/explorer/[token]) or peek at it in a non-blocking
// WindowPanel without leaving the current view. Used on the Relationship
// Manager list page and (pre-filled) as the header of the [token] page
// itself, so switching entities never requires going back to the list.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowRight, AppWindow, Loader2 } from "lucide-react";

import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tokensInRules } from "../utils";
import type { RelationshipRule } from "../types";

const EntityRelationshipOrbitWindow = dynamic(
  () => import("./EntityRelationshipOrbitWindow"),
  { ssr: false },
);

interface Props {
  rules: RelationshipRule[];
  /** Pre-selected token — the [token] page passes its own route param. */
  value?: string;
}

export function EntityExplorerEntry({ rules, value }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(value ?? "");
  const [windowOpen, setWindowOpen] = useState(false);

  // Sync the picker when the route token changes — React's sanctioned
  // adjust-state-during-render pattern (no effect, no cascading render).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) setSelected(value);
  }

  const involvedCount = tokensInRules(rules).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <EntityTypeCombobox
        value={selected || null}
        onChange={setSelected}
        placeholder="Explore an entity type…"
        className="w-64"
      />
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        {involvedCount} in rules
      </Badge>
      <Button
        size="sm"
        variant="outline"
        disabled={!selected || isPending}
        onClick={() =>
          startTransition(() =>
            router.push(`/administration/relationships/explorer/${selected}`),
          )
        }
      >
        {isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
        )}
        Open page
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!selected}
        onClick={() => setWindowOpen(true)}
      >
        <AppWindow className="mr-1.5 h-3.5 w-3.5" />
        Open in window
      </Button>
      {windowOpen && selected ? (
        <EntityRelationshipOrbitWindow
          token={selected}
          rules={rules}
          onClose={() => setWindowOpen(false)}
        />
      ) : null}
    </div>
  );
}
