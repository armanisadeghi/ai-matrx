"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast, recordToast } from "@/lib/toast";
import {
  createSurface,
  SURFACE_TIERS,
} from "@/features/surfaces/services/surfaces.service";
import { ProTextarea } from "@/components/official/ProTextarea";
import { SURFACE_LAYER_ATTRIBUTE } from "@/features/surfaces/runtime/window-forms";
import type { NewSurfaceDraftFields } from "@/features/surfaces/lib/ui-surfaces-agent-writes";

/** The dialog's live values — the `new_surface_draft` read twin. */
export interface NewSurfaceDraftScope {
  name: string;
  client: string;
  local: string;
  parent_surface_name: string | null;
  tier: string;
  description: string;
}

export const DEFAULT_PARENT_SURFACE = "matrx-default/default";
export const PARENT_NONE = "__none__";

interface Props {
  clients: {
    name: string;
    description: string | null;
    is_active: boolean | null;
  }[];
  existingNames: Set<string>;
  parentOptions: string[];
  /** Pre-select client (e.g. when adding a child under a surface). */
  initialClient?: string;
  /** Pre-select parent (e.g. current surface when adding a child). */
  initialParent?: string;
  title?: string;
  /**
   * An agent's fill (`new_surface_draft`): applied on mount and again each
   * time `version` changes. Nothing is saved — the person presses Create.
   */
  seed?: { fields: NewSurfaceDraftFields; version: number };
  /** Marks the root as this surface's layer so the generic form net stands down. */
  agentSurfaceName?: string;
  /** Receives the live values on every render (the draft read twin). */
  onDraftChange?: (draft: NewSurfaceDraftScope) => void;
  onClose: () => void;
  onCreated: (surfaceName: string) => void;
}

export function NewSurfaceDialog({
  clients,
  existingNames,
  parentOptions,
  initialClient,
  initialParent,
  title = "New UI surface",
  seed,
  agentSurfaceName,
  onDraftChange,
  onClose,
  onCreated,
}: Props) {
  const [client, setClient] = useState(
    () => initialClient ?? clients[0]?.name ?? "",
  );
  const [parentSurface, setParentSurface] = useState(
    () => initialParent ?? DEFAULT_PARENT_SURFACE,
  );
  const [local, setLocal] = useState("");
  const [description, setDescription] = useState("");
  const [tier, setTier] = useState<string>("Pages");
  const [busy, setBusy] = useState(false);

  const parentSelectOptions = useMemo(() => {
    const names = new Set(parentOptions);
    names.add(DEFAULT_PARENT_SURFACE);
    if (initialParent) names.add(initialParent);
    // An agent's fill names a parent the parser already checked exists.
    const seededParent = seed?.fields.parent_surface_name;
    if (seededParent) names.add(seededParent);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [parentOptions, initialParent, seed]);

  // Apply an agent's fill once per version — state adjusted during render
  // (React's documented pattern for "reset when a prop changes").
  const [appliedSeed, setAppliedSeed] = useState<number | null>(null);
  if (seed && seed.version !== appliedSeed) {
    setAppliedSeed(seed.version);
    const f = seed.fields;
    if (f.client !== undefined) setClient(f.client);
    if (f.local !== undefined) setLocal(f.local);
    if (f.parent_surface_name !== undefined)
      setParentSurface(f.parent_surface_name ?? PARENT_NONE);
    if (f.tier !== undefined) setTier(f.tier);
    if (f.description !== undefined) setDescription(f.description);
  }

  useEffect(() => {
    onDraftChange?.({
      name: client && local ? `${client}/${local}` : "",
      client,
      local,
      parent_surface_name: parentSurface === PARENT_NONE ? null : parentSurface,
      tier,
      description,
    });
  });

  const tierEntry =
    SURFACE_TIERS.find((t) => t.label === tier) ?? SURFACE_TIERS[1];
  const fullName = client && local ? `${client}/${local}` : "";
  const LOCAL_RE = /^[a-z0-9-/]+$/;
  const localValid = LOCAL_RE.test(local);
  const nameClash = fullName !== "" && existingNames.has(fullName);
  const parentInvalid =
    parentSurface !== PARENT_NONE &&
    !parentSelectOptions.includes(parentSurface);

  const submit = async () => {
    if (!client || !localValid || nameClash || parentInvalid) return;
    setBusy(true);
    try {
      await createSurface({
        name: fullName,
        client_name: client,
        description: description,
        sort_order: tierEntry.min + 50,
        is_active: true,
        parent_surface_name:
          parentSurface === PARENT_NONE ? null : parentSurface,
      });
      // A surface name carries a slash, so it can never be a whole path
      // segment; its admin route ends in the LOCAL part, and that is what
      // keeps this toast alive through the caller's navigation to it.
      recordToast.success(
        { type: "ui_surface", id: fullName, title: local },
        `${fullName} created`,
      );
      onCreated(fullName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        className="sm:max-w-md matrx-touch-targets"
        {...(agentSurfaceName
          ? { [SURFACE_LAYER_ATTRIBUTE]: agentSurfaceName }
          : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={client} onValueChange={setClient} disabled={busy}>
              <SelectTrigger className="bg-background text-foreground">
                <SelectValue placeholder="Pick a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Parent surface</Label>
            <Select
              value={parentSurface}
              onValueChange={setParentSurface}
              disabled={busy}
            >
              <SelectTrigger className="font-mono text-sm bg-background text-foreground">
                <SelectValue placeholder="Pick a parent surface" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(320px,50dvh)]">
                <SelectItem value={PARENT_NONE} className="text-xs">
                  (none — root surface)
                </SelectItem>
                {parentSelectOptions.map((name) => (
                  <SelectItem
                    key={name}
                    value={name}
                    className="font-mono text-xs"
                  >
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Inheritance chain for tool defaults. Defaults to{" "}
              <code className="font-mono">{DEFAULT_PARENT_SURFACE}</code>.
            </p>
            {parentInvalid && (
              <p className="text-xs text-destructive">
                Selected parent is not a known surface.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Local part of name</Label>
            <Input
              value={local}
              onChange={(e) => setLocal(e.target.value.toLowerCase())}
              placeholder="e.g. notes or debug/state-analyzer"
              className="font-mono text-sm bg-background text-foreground"
              style={{ fontSize: "16px" }}
              disabled={busy}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Full name:{" "}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">
                {fullName || `${client || "<client>"}/<local>`}
              </code>
            </p>
            {!localValid && local.length > 0 && (
              <p className="text-xs text-destructive">
                Use lowercase letters, digits, hyphens, and slashes.
              </p>
            )}
            {nameClash && (
              <p className="text-xs text-destructive">
                <code className="font-mono">{fullName}</code> already exists.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tier (sort_order band)</Label>
            <Select value={tier} onValueChange={setTier} disabled={busy}>
              <SelectTrigger className="bg-background text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURFACE_TIERS.filter((t) => t.label !== "Reserved").map(
                  (t) => (
                    <SelectItem key={t.label} value={t.label}>
                      <div className="flex flex-col items-start">
                        <span>{t.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.description}
                        </span>
                      </div>
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <ProTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short, agent-facing description"
              className="bg-background text-foreground"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              busy ||
              !client ||
              !localValid ||
              nameClash ||
              !local ||
              parentInvalid
            }
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
