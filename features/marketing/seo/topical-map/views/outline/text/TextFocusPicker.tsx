"use client";

/**
 * views/outline/text/TextFocusPicker.tsx — the Text view's focus picker:
 * which topic `seo.map_outline` builds its neighbourhood around.
 *
 * Searches through `seo.search_map_topics` (the same function every other
 * picker in the map uses) rather than the loaded tree, because the Text view
 * may be the first screen opened and the tree not loaded at all.
 */

import { useState } from "react";
import { Check, ChevronRight, Crosshair, X } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";

import { TopicalMapFailed } from "../../../components/TopicalMapStates";
import { useMapTopicSearch } from "../../../hooks";
import type { MapTopicSearchHit } from "../../../types";

export interface TextFocusPickerProps {
  mapId: string;
  /** The current focus, or null for the whole map. */
  focus: MapTopicSearchHit | null;
  onChange: (focus: MapTopicSearchHit | null) => void;
}

export function TextFocusPicker({ mapId, focus, onChange }: TextFocusPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useMapTopicSearch(mapId, query, 25, open);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-8 max-w-[16rem] text-xs">
            <Crosshair className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{focus ? `Focus: ${focus.name}` : "Focus: whole map"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent sizing="content" align="start" className="p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Focus on a topic…" />
            <CommandList className="max-h-64">
              {search.isError ? (
                <div className="p-2">
                  <TopicalMapFailed what="the topic search" error={search.error} />
                </div>
              ) : null}
              <CommandEmpty>{search.isPending ? "Searching…" : "No topic matches."}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__whole_map"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={focus === null ? "mr-2 h-3.5 w-3.5" : "mr-2 h-3.5 w-3.5 opacity-0"}
                    aria-hidden
                  />
                  Whole map
                </CommandItem>
                {(search.data ?? []).map((hit) => (
                  <CommandItem
                    key={hit.slug}
                    value={hit.slug}
                    onSelect={() => {
                      onChange(hit);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start gap-0"
                  >
                    <span className="flex items-center text-sm">
                      <Check
                        className={
                          focus?.slug === hit.slug ? "mr-2 h-3.5 w-3.5" : "mr-2 h-3.5 w-3.5 opacity-0"
                        }
                        aria-hidden
                      />
                      {hit.name}
                    </span>
                    {hit.path.length > 1 ? (
                      <span className="ml-5 flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        {hit.path.slice(0, -1).map((crumb, index) => (
                          <span key={crumb} className="flex items-center gap-0.5">
                            {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
                            {crumb}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {focus ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Clear focus"
          title="Back to the whole map"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
