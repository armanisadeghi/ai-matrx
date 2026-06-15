"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  X,
  Edit2,
  Check,
  ExternalLink,
  Cpu,
  Compass,
  Code,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import {
  getSurfaceUsage,
  updateSurface,
  renameSurface,
  deleteSurface,
  type SurfaceWithStats,
  type SurfaceUsage,
} from "@/features/surfaces/services/surfaces.service";

interface Props {
  surface: SurfaceWithStats;
  onClose: () => void;
  onChanged: () => void;
}

export function SurfaceDetailDrawer({ surface, onClose, onChanged }: Props) {
  const [usage, setUsage] = useState<SurfaceUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Identity edit state
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(surface.description ?? "");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSurfaceUsage(surface.name)
      .then((u) => {
        if (!cancelled) setUsage(u);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load usage");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surface.name]);

  // Reset local form state when navigating between surfaces
  useEffect(() => {
    setEditingDesc(false);
    setDesc(surface.description ?? "");
    setRenaming(false);
    setNewName("");
  }, [surface.name, surface.description]);

  const onToggleActive = async (next: boolean) => {
    setBusy(true);
    try {
      await updateSurface(surface.name, { is_active: next });
      onChanged();
      toast.success(`${surface.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const onSaveDesc = async () => {
    setBusy(true);
    try {
      await updateSurface(surface.name, { description: desc || null });
      setEditingDesc(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onRename = async () => {
    const target = newName.trim();
    if (!target || target === surface.name) {
      setRenaming(false);
      setNewName("");
      return;
    }
    if (!/^[a-z0-9-]+\/[a-z0-9-/]+$/.test(target)) {
      toast.error("Invalid format. Use <client>/<local> with lowercase letters / digits / hyphens / slashes.");
      return;
    }
    if (!target.startsWith(`${surface.client_name}/`)) {
      toast.error(`New name must keep the client prefix "${surface.client_name}/".`);
      return;
    }
    const refsTotal =
      (usage?.tools.length ?? 0) + (usage?.agents.length ?? 0) + (usage?.uiComponents.length ?? 0);
    const ok = await confirm({
      title: `Rename to "${target}"?`,
      description:
        refsTotal > 0
          ? `${refsTotal} dependent row${refsTotal === 1 ? "" : "s"} will follow via ON UPDATE CASCADE (tools / agents / UI components). The change is atomic — a single UPDATE statement.`
          : "No dependent rows exist; this is a straight rename.",
      confirmLabel: "Rename",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await renameSurface(surface.name, target);
      toast.success(`Renamed to ${target}`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const refsTotal =
      (usage?.tools.length ?? 0) + (usage?.agents.length ?? 0) + (usage?.uiComponents.length ?? 0);
    const ok = await confirm({
      title: `Delete ${surface.name}?`,
      description:
        refsTotal > 0
          ? `This surface has ${usage?.tools.length ?? 0} tool ref${usage?.tools.length === 1 ? "" : "s"}, ${usage?.agents.length ?? 0} agent ref${usage?.agents.length === 1 ? "" : "s"}, and ${usage?.uiComponents.length ?? 0} tool_ui row${usage?.uiComponents.length === 1 ? "" : "s"}. Delete will fail unless those are removed first (FKs do not cascade on delete). Deactivate instead?`
          : "No dependents — safe to delete.",
      confirmLabel: refsTotal > 0 ? "Try delete" : "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSurface(surface.name);
      toast.success(`${surface.name} deleted`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-3 border-b border-border flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono text-sm font-semibold">{surface.name}</code>
              <Badge variant="outline" className="text-[10px]">
                {surface.client_name}
              </Badge>
              <Badge
                variant={surface.is_active ? "default" : "secondary"}
                className="text-[10px]"
              >
                {surface.is_active ? "active" : "inactive"}
              </Badge>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                sort {surface.sort_order}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {surface.executor_name && (
                <Badge variant="outline" className="text-[10px]">
                  executor: <code className="ml-1 font-mono">{surface.executor_name}</code>
                </Badge>
              )}
              {surface.parent_surface_name && (
                <Badge variant="outline" className="text-[10px]">
                  parent: <code className="ml-1 font-mono">{surface.parent_surface_name}</code>
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Created {new Date(surface.created_at ?? "").toLocaleDateString()} ·
              Updated {new Date(surface.updated_at ?? "").toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            className="h-7 w-7 p-0 flex-shrink-0"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          {/* Identity / actions */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Identity
            </h3>
            <div className="flex items-center gap-3">
              <Switch
                checked={surface.is_active ?? true}
                onCheckedChange={(v) => void onToggleActive(v)}
                disabled={busy}
              />
              <Label className="text-xs">
                {surface.is_active ? "Active — visible to tools and agents" : "Inactive — hidden from agents"}
              </Label>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Description</Label>
                {!editingDesc && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDesc(surface.description ?? "");
                      setEditingDesc(true);
                    }}
                    className="h-6 text-xs px-2 gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </Button>
                )}
              </div>
              {!editingDesc ? (
                <p className="text-sm text-foreground/80">
                  {surface.description ?? <em className="text-muted-foreground">no description</em>}
                </p>
              ) : (
                <div className="flex items-start gap-2">
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={3}
                    autoFocus
                    style={{ fontSize: "16px" }}
                    disabled={busy}
                  />
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      onClick={() => void onSaveDesc()}
                      disabled={busy}
                      className="h-7 w-7 p-0"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDesc(false)}
                      disabled={busy}
                      className="h-7 w-7 p-0"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Name (rename)</Label>
                {!renaming && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewName(surface.name);
                      setRenaming(true);
                    }}
                    className="h-6 text-xs px-2 gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Rename
                  </Button>
                )}
              </div>
              {renaming ? (
                <div className="flex items-start gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value.toLowerCase())}
                    placeholder={surface.name}
                    className="font-mono text-sm h-9"
                    style={{ fontSize: "16px" }}
                    autoFocus
                    disabled={busy}
                  />
                  <Button
                    size="sm"
                    onClick={() => void onRename()}
                    disabled={busy || !newName || newName === surface.name}
                    className="h-9"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Rename"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRenaming(false);
                      setNewName("");
                    }}
                    disabled={busy}
                    className="h-9"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Renaming cascades to {surface.toolCount + surface.agentCount} dependent row
                  {surface.toolCount + surface.agentCount === 1 ? "" : "s"} via{" "}
                  <code className="bg-muted px-1 py-0.5 rounded">ON UPDATE CASCADE</code>.
                </p>
              )}
            </div>
          </section>

          {/* Usage: tools */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5" />
              Tools on this surface
              <Badge variant="outline" className="text-[10px]">
                {usage?.tools.length ?? "—"}
              </Badge>
            </h3>
            {loading && <InlineLoading />}
            {error && <ErrorBox msg={error} />}
            {!loading && usage && usage.tools.length === 0 && (
              <EmptyHint>No tools currently expose this surface.</EmptyHint>
            )}
            {usage && usage.tools.length > 0 && (
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.tools.map((t) => (
                  <li
                    key={t.id}
                    className={`px-3 py-2 ${t.is_active === false ? "opacity-60" : ""}`}
                  >
                    <a
                      href={`/administration/mcp-tools/${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 hover:text-primary group"
                    >
                      <code className="font-mono text-xs flex-1 min-w-0 truncate">{t.name}</code>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 mt-0.5 flex-shrink-0" />
                    </a>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Usage: agents */}
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Compass className="h-3.5 w-3.5" />
              Agents visible here
              <Badge variant="outline" className="text-[10px]">
                {usage?.agents.length ?? "—"}
              </Badge>
            </h3>
            {!loading && usage && usage.agents.length === 0 && (
              <EmptyHint>
                No agents are scoped to this surface. (Agents with no surface scope are visible everywhere.)
              </EmptyHint>
            )}
            {usage && usage.agents.length > 0 && (
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.agents.map((a) => (
                  <li key={a.id} className="px-3 py-2">
                    <code className="font-mono text-xs">{a.name}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Usage: tool_ui (per-tool UI components scoped to this surface) */}
          {usage && usage.uiComponents.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Code className="h-3.5 w-3.5" />
                Custom tool UI components
                <Badge variant="outline" className="text-[10px]">
                  {usage.uiComponents.length}
                </Badge>
              </h3>
              <ul className="rounded-md border border-border bg-card divide-y divide-border">
                {usage.uiComponents.map((u) => (
                  <li key={u.id} className={`px-3 py-2 ${u.is_active ? "" : "opacity-60"}`}>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs flex-1 truncate">{u.tool_name}</code>
                      <Badge variant="secondary" className="text-[10px]">
                        {u.display_name}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            <AlertCircle className="h-3 w-3 inline mr-1" />
            FKs use ON UPDATE CASCADE; deletes do not cascade.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onDelete()}
            disabled={busy}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Delete surface
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InlineLoading() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
      <AlertCircle className="h-3.5 w-3.5" />
      {msg}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}
