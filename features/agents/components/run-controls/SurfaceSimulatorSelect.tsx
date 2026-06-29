"use client";

/**
 * SurfaceSimulatorSelect — creator-panel control (Run tab) that overrides the
 * surface a conversation reports to the server.
 *
 * Picks ANY row from `ui.ui_surface` (every client: matrx-user,
 * matrx-admin, matrx-public, chrome-extension, …) and stores it as
 * `builderAdvancedSettings.surfaceOverride`. `buildToolInjection` then sends it
 * verbatim as `client.surface` instead of the route-detected one, so the
 * available tools for this run match the simulated surface. The server resolves
 * it through the same `public.tool_surface_defaults.always_include_tools` path
 * (post-2026 refactor — `tl_def_surface` was dropped) and cannot tell it is
 * simulated — that is the whole point.
 *
 * Caveat: simulating a surface whose tools the current client can't actually
 * execute (e.g. a chrome-extension browser tool) makes those tools *available*
 * to the model, but a real call to one can't be fulfilled here yet.
 */

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Monitor, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { detectActiveSurface } from "@/features/surfaces/utils/route-to-surface";
import {
  listSurfaceOptions,
  type SurfaceOption,
} from "@/features/surfaces/services/surfaces.service";

// Module-level cache — the surface catalog (~100 rows) changes rarely, so we
// fetch it once per session instead of on every panel open.
let surfaceCache: SurfaceOption[] | null = null;

export function SurfaceSimulatorSelect({
  conversationId,
}: {
  conversationId: string;
}) {
  const dispatch = useAppDispatch();
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const override = settings.surfaceOverride ?? null;

  const [open, setOpen] = useState(false);
  const [surfaces, setSurfaces] = useState<SurfaceOption[]>(
    surfaceCache ?? [],
  );
  const [loading, setLoading] = useState(!surfaceCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (surfaceCache) return undefined;
    // `loading` already initializes to `!surfaceCache` (true here), so no
    // synchronous setState in the effect body (react-hooks/set-state-in-effect).
    let active = true;
    listSurfaceOptions()
      .then((rows) => {
        if (!active) return;
        surfaceCache = rows;
        setSurfaces(rows);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Failed to load surfaces");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const detected =
    typeof window !== "undefined" ? detectActiveSurface() : null;

  const setOverride = (value: string | null) => {
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { surfaceOverride: value },
      }),
    );
    setOpen(false);
  };

  // No useMemo — React Compiler memoizes (CLAUDE.md core invariant).
  const byClient = new Map<string, SurfaceOption[]>();
  for (const s of surfaces) {
    const arr = byClient.get(s.client_name) ?? [];
    arr.push(s);
    byClient.set(s.client_name, arr);
  }
  const groups = [...byClient.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="py-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">
          Surface Simulator
        </Label>
        {override && (
          <button
            type="button"
            onClick={() => setOverride(null)}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" /> clear
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 w-full justify-between text-xs font-normal"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Monitor className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {override ?? `Detected: ${detected ?? "none"}`}
              </span>
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput
              placeholder="Search surfaces…"
              className="h-8 text-xs"
            />
            <CommandList>
              {loading && (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Loading surfaces…
                </div>
              )}
              {error && (
                <div className="py-4 text-center text-xs text-destructive">
                  {error}
                </div>
              )}
              {!loading && !error && (
                <>
                  <CommandEmpty>No surfaces found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__detected__ use detected route surface"
                      onSelect={() => setOverride(null)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3 w-3",
                          override === null ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="text-xs">
                        Use detected surface
                        {detected ? ` (${detected})` : ""}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                  {groups.map(([client, items]) => (
                    <CommandGroup key={client} heading={client}>
                      {items.map((s) => (
                        <CommandItem
                          key={s.name}
                          value={s.name}
                          onSelect={() => setOverride(s.name)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-3 w-3",
                              override === s.name
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <span className="truncate text-xs">{s.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {override && (
        <p className="mt-1 text-[10px] leading-tight text-amber-600 dark:text-amber-500">
          Simulating <span className="font-mono">{override}</span> — this run&apos;s
          available tools match that surface, not the real one.
        </p>
      )}
    </div>
  );
}
