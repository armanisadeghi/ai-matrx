"use client";

import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  createSurface,
  SURFACE_TIERS,
} from "@/features/surfaces/services/surfaces.service";

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
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [parentOptions, initialParent]);

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
      toast.success(`${fullName} created`);
      onCreated(fullName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
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
            <p className="text-[11px] text-muted-foreground">
              Inheritance chain for tool defaults. Defaults to{" "}
              <code className="font-mono">{DEFAULT_PARENT_SURFACE}</code>.
            </p>
            {parentInvalid && (
              <p className="text-[11px] text-destructive">
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
            <p className="text-[11px] text-muted-foreground">
              Full name:{" "}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">
                {fullName || `${client || "<client>"}/<local>`}
              </code>
            </p>
            {!localValid && local.length > 0 && (
              <p className="text-[11px] text-destructive">
                Use lowercase letters, digits, hyphens, and slashes.
              </p>
            )}
            {nameClash && (
              <p className="text-[11px] text-destructive">
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
                        <span className="text-[10px] text-muted-foreground">
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
            <Textarea
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
