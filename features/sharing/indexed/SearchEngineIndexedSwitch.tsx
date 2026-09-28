"use client";

// "Indexed by search engines" — the per-item half of the indexed switch (access ladder T-12).
// Law: common-docs/policies/access-ladder.md ("Public items: indexed or not").
//
// An INLINE control: it sits on the existing "Published to the web" line of whatever surface
// hosts it and never adds a row. It renders nothing until the record is published to the web
// (search engines can only index a published record) and nothing for a type that has no
// switch. Security is identical either way, so the words say only what search engines do.

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getSearchEngineIndexedState, setSearchEngineIndexed } from "./actions";
import type { SearchEngineIndexedState } from "./types";

interface Props {
  resourceType: string;
  resourceId: string;
  /**
   * Re-read whenever this changes — pass the host's own published state so the control
   * appears the moment the record is published (and leaves when it is unpublished).
   */
  publishedHint?: boolean;
  className?: string;
}

export function SearchEngineIndexedSwitch({
  resourceType,
  resourceId,
  publishedHint,
  className,
}: Props) {
  const [state, setState] = useState<SearchEngineIndexedState | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const res = await getSearchEngineIndexedState(resourceType, resourceId);
    if (res.error) {
      // Loud, but not in the way: the host's own publish control still works.
      console.warn(`[search-engine-indexed] state for ${resourceType}/${resourceId}: ${res.error}`);
      setState(null);
      return;
    }
    setState(res.state);
  }, [resourceType, resourceId]);

  useEffect(() => {
    void load();
  }, [load, publishedHint]);

  if (!state || !state.enrolled || !state.published_to_web) return null;

  const onChange = async (next: boolean) => {
    setBusy(true);
    // A flip is a deliberate choice and is stored as one: a later change to the type's
    // default (organization or person) never overrides what the creator set by hand.
    const res = await setSearchEngineIndexed(resourceType, resourceId, next);
    setBusy(false);
    if (res.error || !res.state) {
      toast({
        title: "Couldn't change search engine indexing",
        description: res.error ?? "Please try again",
        variant: "destructive",
      });
      return;
    }
    setState(res.state);
    toast({
      title: next ? "Search engines may list this page" : "Search engines are told not to list this page",
      description: "Anyone with the address can still open it.",
    });
  };

  const followsDefault = state.value === null;
  const id = `indexed-${resourceType}-${resourceId}`;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={
        followsDefault
          ? `Following the default for this type (${state.type_default ? "indexed" : "not indexed"}).`
          : "Set for this item."
      }
    >
      <label htmlFor={id} className="cursor-pointer text-xs text-muted-foreground">
        Indexed by search engines
      </label>
      <Switch
        id={id}
        checked={state.effective}
        onCheckedChange={onChange}
        disabled={busy || !state.can_change}
        aria-label="Indexed by search engines"
      />
    </span>
  );
}
