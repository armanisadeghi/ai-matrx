"use client";

import { useState } from "react";
import { Loader2, Sparkles, CheckSquare, Square, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { bulkCreateSurfaces } from "@/features/surfaces/services/surfaces.service";
import {
  SURFACE_CANDIDATES,
  type SurfaceCandidate,
} from "@/features/surfaces/data/surface-candidates";

interface Props {
  /** Names already in the live ui_surface table — these are filtered out. */
  existingNames: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}

const ALL = "__all__";

export function SurfaceCandidatesDialog({ existingNames, onClose, onAdded }: Props) {
  const available = SURFACE_CANDIDATES.filter((c) => !existingNames.has(c.name));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activateAll, setActivateAll] = useState(false);
  const [client, setClient] = useState<string>(ALL);
  const [group, setGroup] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = available.filter((c) => {
    if (client !== ALL && c.client_name !== client) return false;
    if (group !== ALL && c.group !== group) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const allVisibleSelected =
    visible.length > 0 && visible.every((c) => selected.has(c.name));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) {
      visible.forEach((c) => next.delete(c.name));
    } else {
      visible.forEach((c) => next.add(c.name));
    }
    setSelected(next);
  };

  const onAdd = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const rows = available
        .filter((c) => selected.has(c.name))
        .map((c) => ({
          name: c.name,
          client_name: c.client_name,
          description: c.description,
          sort_order: c.sort_order,
          is_active: activateAll ? true : c.is_active,
        }));
      await bulkCreateSurfaces(rows);
      toast.success(`Added ${rows.length} surface${rows.length === 1 ? "" : "s"}`);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk add failed");
    } finally {
      setBusy(false);
    }
  };

  const clientOptions = Array.from(new Set(SURFACE_CANDIDATES.map((c) => c.client_name))).sort();
  const groupOptions: SurfaceCandidate["group"][] = [
    "page",
    "overlay",
    "editor",
    "widget",
    "debug",
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Add surfaces from candidate inventory
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            {available.length} candidate{available.length === 1 ? "" : "s"} available out of{" "}
            {SURFACE_CANDIDATES.length} known. Already-seeded names are hidden. Sort_order and
            description come from the catalog; the active state defaults to the catalog's
            recommendation unless overridden below.
          </p>
        </DialogHeader>

        {/* Filter bar */}
        <div className="flex-shrink-0 px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 max-w-xs text-xs"
            style={{ fontSize: "16px" }}
          />
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clients</SelectItem>
              {clientOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All kinds</SelectItem>
              {groupOptions.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleAll}
            disabled={visible.length === 0 || busy}
            className="h-7 text-xs gap-1.5 ml-auto"
          >
            {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {allVisibleSelected ? "Deselect visible" : "Select visible"}
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {visible.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
              {available.length === 0
                ? "All known candidates are already seeded. Add new candidates by editing surface-candidates.ts."
                : "No candidates match these filters."}
            </div>
          ) : (
            <ul className="rounded-md border border-border bg-card divide-y divide-border">
              {visible.map((c) => {
                const isSelected = selected.has(c.name);
                return (
                  <li
                    key={c.name}
                    className={`px-3 py-2 grid grid-cols-[24px_1fr_100px_80px] items-start gap-3 cursor-pointer hover:bg-muted/30 ${isSelected ? "bg-muted/40" : ""}`}
                    onClick={() => toggle(c.name)}
                  >
                    <div className="mt-0.5 text-muted-foreground">
                      {isSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <code className="font-mono text-xs">{c.name}</code>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {c.description}
                      </p>
                    </div>
                    <div>
                      <Badge variant="outline" className="text-[10px]">
                        {c.group}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={c.is_active ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {c.is_active ? "active" : "inactive"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-border flex-shrink-0 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={activateAll}
              onChange={(e) => setActivateAll(e.target.checked)}
              className="accent-primary"
              disabled={busy}
            />
            Force-activate all selected (override catalog default)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {selected.size} selected
            </span>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void onAdd()} disabled={busy || selected.size === 0}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>Add {selected.size}</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
