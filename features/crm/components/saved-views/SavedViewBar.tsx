"use client";

// features/crm/components/saved-views/SavedViewBar.tsx
//
// The smart-view bar on /crm — the thing that turns the list into a work
// queue. Each chip IS a saved query: click it and the list becomes that queue;
// change anything and the bar says so and offers to update the view.
//
// It writes through the SAME setters the human controls call (`setQuery` for
// scope/search/kind/filters, `setPrefs` for sort), so applying a view and
// clicking the filters by hand are indistinguishable downstream — no parallel
// query path, exactly as the agent write handlers do.

import { useEffect, useState } from "react";
import { Bookmark, Check, Loader2, MoreVertical, Plus, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { cn } from "@/lib/utils";
import type { CrmQueryContext } from "../../types";
import type { SavedView } from "../../saved-views/types";
import type { SavedViewCodec } from "../../saved-views/service";
import {
  createSavedView,
  deleteSavedView,
  fetchSavedViews,
  touchSavedView,
  updateSavedView,
} from "../../saved-views/service";

/**
 * Generic over the definition shape: each CRM list (parties, deals) supplies
 * its codec (list key + parser), the CURRENT list state as a definition, and
 * the compare/describe functions. The bar itself never knows what a definition
 * means — that stays in each list's `saved-views`/`views` module.
 */
export interface SavedViewBarProps<TDef> {
  ctx: CrmQueryContext | null;
  codec: SavedViewCodec<TDef>;
  /**
   * What the list shows RIGHT NOW as a definition — or null when the surface
   * cannot be described by a view (e.g. the trash). Null disables save/update.
   */
  current: TDef | null;
  /** Tooltip for the disabled Save button when `current` is null. */
  currentUnavailableReason?: string;
  matches: (a: TDef, b: TDef) => boolean;
  describe: (definition: TDef) => string;
  /** Org a NEW view is stamped into (the scope's org, else the active org). */
  orgId: string | null;
  activeViewId: string | null;
  onActiveViewIdChange: (id: string | null) => void;
  /** Applies a view: the caller lands it through setQuery + setPrefs. */
  onApply: (definition: TDef) => void;
  /**
   * A view id from the URL (`?view=…`) — opened once, as soon as the views
   * load. This is what makes a view a real destination: an outreach list can
   * link back to the query that filled it.
   */
  autoOpenViewId?: string | null;
  className?: string;
}

export function SavedViewBar<TDef>({
  ctx,
  codec,
  current,
  currentUnavailableReason,
  matches,
  describe,
  orgId,
  activeViewId,
  onActiveViewIdChange,
  onApply,
  autoOpenViewId,
  className,
}: SavedViewBarProps<TDef>) {
  const [views, setViews] = useState<SavedView<TDef>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [renaming, setRenaming] = useState<SavedView<TDef> | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchSavedViews(ctx, codec);
        if (!cancelled) setViews(rows);
      } catch (e) {
        if (!cancelled) {
          console.error("[crm] saved views load failed:", e);
          toast.error(
            e instanceof Error ? e.message : "Could not load smart views",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  // Open the URL's view once, when it first becomes available. `openedFromUrl`
  // guards it so a user who then clicks a different chip is not yanked back.
  const [openedFromUrl, setOpenedFromUrl] = useState(false);
  useEffect(() => {
    if (openedFromUrl || !autoOpenViewId || views.length === 0) return;
    const target = views.find((v) => v.id === autoOpenViewId);
    setOpenedFromUrl(true);
    if (!target) {
      toast.error("That smart view no longer exists");
      return;
    }
    onActiveViewIdChange(target.id);
    onApply(target.definition);
    void touchSavedView(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per URL
  }, [autoOpenViewId, views, openedFromUrl]);

  const active = views.find((v) => v.id === activeViewId) ?? null;
  // `current === null` means the surface cannot be described by a view right
  // now (the party list's trash, for instance) — nothing to save or compare.
  const dirty =
    !!active && current !== null && !matches(active.definition, current);

  const apply = (view: SavedView<TDef>) => {
    onActiveViewIdChange(view.id);
    onApply(view.definition);
    void touchSavedView(view.id);
    setViews((prev) =>
      prev.map((v) =>
        v.id === view.id ? { ...v, last_used_at: new Date().toISOString() } : v,
      ),
    );
  };

  const saveNew = async (name: string, shared: boolean) => {
    if (!orgId) throw new Error("No organization to save this view into");
    if (current === null) throw new Error("This surface cannot be saved as a view");
    const created = await createSavedView({
      name,
      definition: current,
      orgId,
      visibility: shared ? "internal" : "personal",
      codec,
    });
    setViews((prev) => [created, ...prev]);
    onActiveViewIdChange(created.id);
    toast.success(`"${created.name}" saved`);
  };

  const updateDefinition = async (view: SavedView<TDef>) => {
    if (current === null) return;
    try {
      await updateSavedView(view.id, { definition: current });
      const next = current;
      setViews((prev) =>
        prev.map((v) => (v.id === view.id ? { ...v, definition: next } : v)),
      );
      toast.success(`"${view.name}" now matches what you are looking at`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const rename = async (view: SavedView<TDef>, name: string) => {
    await updateSavedView(view.id, { name });
    setViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, name: name.trim() } : v)),
    );
    toast.success(`Renamed to "${name.trim()}"`);
  };

  const menuFor = (view: SavedView<TDef>): (() => ItemMenuConfig) => () => ({
    sections: [
      {
        id: "use",
        items: [
          {
            id: "apply",
            label: "Open this view",
            onSelect: () => apply(view),
          },
          {
            id: "update",
            label: "Save current filters into this view",
            disabled: !dirty || activeViewId !== view.id,
            disabledReason:
              activeViewId === view.id
                ? "The list already matches this view"
                : "Open the view first, then adjust the filters",
            onSelect: () => updateDefinition(view),
          },
          {
            id: "rename",
            label: "Rename…",
            onSelect: () => setRenaming(view),
          },
        ],
      },
      {
        id: "share",
        items: [
          {
            id: "visibility",
            label:
              view.visibility === "internal"
                ? "Make it mine only"
                : "Share with my organization",
            onSelect: async () => {
              const nextVisibility =
                view.visibility === "internal" ? "personal" : "internal";
              try {
                await updateSavedView(view.id, { visibility: nextVisibility });
                setViews((prev) =>
                  prev.map((v) =>
                    v.id === view.id ? { ...v, visibility: nextVisibility } : v,
                  ),
                );
                toast.success(
                  nextVisibility === "internal"
                    ? `"${view.name}" is now shared with your organization`
                    : `"${view.name}" is now yours alone`,
                );
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Sharing failed");
              }
            },
          },
        ],
      },
      {
        id: "danger",
        items: [
          {
            id: "delete",
            label: "Delete view",
            tone: "destructive",
            onSelect: async () => {
              const ok = await confirm({
                title: `Delete "${view.name}"?`,
                description:
                  "The saved query is removed. The records it lists are untouched.",
                confirmLabel: "Delete view",
                variant: "destructive",
              });
              if (!ok) return;
              try {
                await deleteSavedView(view.id);
                setViews((prev) => prev.filter((v) => v.id !== view.id));
                if (activeViewId === view.id) onActiveViewIdChange(null);
                toast.success(`"${view.name}" deleted`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
              }
            },
          },
        ],
      },
    ],
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" />
        Views
      </span>

      {loading && views.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading views…
        </span>
      ) : views.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          None yet — filter the list, then save it as a view your team can work.
        </span>
      ) : (
        views.map((view) => {
          const isActive = view.id === activeViewId;
          return (
            <span
              key={view.id}
              className={cn(
                "inline-flex items-center rounded-md border text-xs transition-colors",
                isActive
                  ? "border-primary/40 bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                onClick={() => apply(view)}
                title={describe(view.definition)}
                className="inline-flex h-11 items-center gap-1 px-2 font-medium lg:h-7"
              >
                {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                {view.visibility === "internal" && (
                  <Users className="h-3 w-3 shrink-0 opacity-70" />
                )}
                <span className="max-w-[12rem] truncate">{view.name}</span>
              </button>
              <ItemMenu config={menuFor(view)} align="end">
                <button
                  type="button"
                  aria-label={`Actions for view ${view.name}`}
                  className="inline-flex h-11 w-6 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground lg:h-7"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </ItemMenu>
            </span>
          );
        })
      )}

      {dirty && active && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          Modified
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => void updateDefinition(active)}
          >
            Update view
          </button>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => apply(active)}
          >
            Reset
          </button>
        </span>
      )}

      <Button
        size="sm"
        variant="ghost"
        className="h-11 gap-1 px-2 text-xs lg:h-7"
        disabled={!orgId || current === null}
        title={
          current === null
            ? (currentUnavailableReason ??
              "This surface cannot be saved as a view")
            : orgId
              ? "Save what you are looking at as a reusable view"
              : "No organization to save into"
        }
        onClick={() => setSaveOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Save view
      </Button>

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        summary={current === null ? "" : describe(current)}
        onSave={saveNew}
      />

      <TextInputDialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open && !renameBusy) setRenaming(null);
        }}
        title="Rename view"
        placeholder="View name"
        defaultValue={renaming?.name ?? ""}
        confirmLabel="Rename"
        busy={renameBusy}
        onConfirm={async (name) => {
          if (!renaming) return;
          setRenameBusy(true);
          try {
            await rename(renaming, name);
            setRenaming(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Rename failed");
          } finally {
            setRenameBusy(false);
          }
        }}
      />
    </div>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  summary,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  onSave: (name: string, shared: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setShared(true);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(name, shared);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the view");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save this view</DialogTitle>
          <DialogDescription className="text-xs">{summary}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="saved-view-name" className="text-xs">
              Name
            </Label>
            <Input
              id="saved-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="e.g. Untouched leads — Acme"
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={shared}
              onCheckedChange={(v) => setShared(v === true)}
            />
            <span className="text-xs text-foreground">
              Share with my organization
              <span className="ml-1 text-muted-foreground">
                (everyone in it can open and edit this view)
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Save view"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
