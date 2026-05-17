"use client";

import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveSurfaces,
  selectSurfacesStatus,
} from "@/features/surfaces/redux/selectors";
import { loadSurfaces } from "@/features/surfaces/redux/thunks";

const DEFAULT_CLIENT = "matrx-default";
const DEFAULT_SURFACE = "matrx-default/default";

function splitSurfaceName(fullName: string): { client: string; local: string } {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

function prettifyLocal(local: string): string {
  return local
    .split(/[-_]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function prettifyClient(client: string): string {
  return client
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Two-dropdown surface picker: Client → Surface.
 * Defaults to `matrx-default/default` when nothing is selected — the
 * canonical starting point for every new shortcut.
 */
export function SurfacePicker({
  surfaceName,
  onChange,
  disabled,
}: {
  surfaceName: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const surfaces = useAppSelector(selectActiveSurfaces);
  const status = useAppSelector(selectSurfacesStatus);

  useEffect(() => {
    void dispatch(loadSurfaces());
  }, [dispatch]);

  // Seed to matrx-default/default on first render if the parent hasn't
  // picked anything yet.
  useEffect(() => {
    if (!surfaceName && surfaces.some((s) => s.name === DEFAULT_SURFACE)) {
      onChange(DEFAULT_SURFACE);
    }
  }, [surfaceName, surfaces, onChange]);

  const { client, local } = splitSurfaceName(surfaceName ?? "");

  const clients = useMemo(() => {
    const set = new Set<string>();
    for (const s of surfaces) set.add(s.client_name);
    const arr = Array.from(set);
    return arr.sort((a, b) => {
      if (a === DEFAULT_CLIENT) return -1;
      if (b === DEFAULT_CLIENT) return 1;
      return a.localeCompare(b);
    });
  }, [surfaces]);

  const surfacesForClient = useMemo(() => {
    if (!client) return [];
    return surfaces
      .filter((s) => s.client_name === client)
      .sort((a, b) => {
        if (client === DEFAULT_CLIENT) {
          if (a.name === DEFAULT_SURFACE) return -1;
          if (b.name === DEFAULT_SURFACE) return 1;
        }
        return splitSurfaceName(a.name).local.localeCompare(
          splitSurfaceName(b.name).local,
        );
      });
  }, [surfaces, client]);

  const onClientChange = (nextClient: string) => {
    // Auto-pick the first surface in the new client so the picker is
    // never in a "client picked but surface empty" state.
    const first = surfaces.find((s) => s.client_name === nextClient);
    if (first) onChange(first.name);
  };

  const loading = status === "loading" && surfaces.length === 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Client
        </Label>
        <Select
          value={client || ""}
          onValueChange={onClientChange}
          disabled={disabled || loading}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={loading ? "Loading…" : "Pick a client"} />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>
                {prettifyClient(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Surface
        </Label>
        <Select
          value={surfaceName || ""}
          onValueChange={onChange}
          disabled={disabled || loading || !client}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Pick a surface">
              {local ? prettifyLocal(local) : ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {surfacesForClient.map((s) => {
              const { local: localName } = splitSurfaceName(s.name);
              return (
                <SelectItem key={s.name} value={s.name}>
                  {prettifyLocal(localName)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
