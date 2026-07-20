"use client";

/**
 * KindBindPicker — "Bind to a kind": a searchable picker over the platform
 * Shape registry (Content IR kinds). Selecting a kind hands the caller that
 * kind's canonical written `output_schema` envelope (see kindBinding.ts);
 * the caller applies it through the existing save path.
 *
 * Data comes in via props (the tab owns the one catalog load, shared with the
 * matches-kind indicator) — this component is pure presentation + selection.
 */

import { useState } from "react";
import { Shapes, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { KindSchema } from "@/features/content-ir/core/kind-schema.types";
import type { KindCatalogEntry } from "@/features/content-ir/registry/kind-catalog";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import { buildKindOutputSchema, listBindableKinds } from "./kindBinding";

interface KindBindPickerProps {
  /** Full catalog snapshot; the picker filters to bindable kinds itself. */
  entries: KindCatalogEntry[] | null;
  /** Resolver over the same snapshot (catalogResolver(entries)). */
  resolve: ((kind: string) => KindSchema | undefined) | null;
  loading: boolean;
  /** Fired with the canonical envelope for the chosen kind. */
  onBind: (kind: string, outputSchema: OutputSchema) => void;
}

export function KindBindPicker({
  entries,
  resolve,
  loading,
  onBind,
}: KindBindPickerProps) {
  const [open, setOpen] = useState(false);

  const bindable = entries ? listBindableKinds(entries) : [];

  const handleSelect = (kind: string) => {
    if (!resolve) return;
    const built = buildKindOutputSchema(kind, resolve);
    if (!built) {
      // Loud recovery: a listed kind that fails to export is a registry
      // defect, never something to swallow.
      toast.error(`Kind "${kind}" could not be exported to a JSON Schema.`);
      return;
    }
    if (built.unresolved.length > 0) {
      toast.warning(
        `Kind "${kind}" references unresolved kinds: ${built.unresolved.join(", ")} — permissive stubs were written.`,
      );
    }
    setOpen(false);
    onBind(kind, built.outputSchema);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={loading || !entries || !resolve}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Shapes className="h-3.5 w-3.5 mr-1" />
          )}
          Bind to a kind
          <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search kinds…" className="h-8 text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              No matching kinds.
            </CommandEmpty>
            <CommandGroup heading={`${bindable.length} bindable kinds`}>
              {bindable.map((entry) => (
                <CommandItem
                  key={entry.kind}
                  value={`${entry.kind} ${entry.label} ${entry.family ?? ""}`}
                  onSelect={() => handleSelect(entry.kind)}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-mono truncate">{entry.kind}</span>
                  <span className="text-muted-foreground truncate">
                    {entry.label}
                  </span>
                  {entry.family && (
                    <Badge
                      variant="secondary"
                      className="ml-auto shrink-0 text-[10px] px-1 py-0"
                    >
                      {entry.family}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
