"use client";

/**
 * ContributeResourceSheet
 * -----------------------
 * Lets a member share *their own* resources with an organization, fast.
 *
 * Pick a resource kind → search your own items → "Share with team". Every
 * shareable kind comes from the org resource catalogue, so this stays in sync
 * with the rest of the org workspace automatically. The actual grant goes
 * through the existing `shareWithOrg` → `share_resource_with_org` RPC (which
 * validates ownership + org membership server-side).
 */

import React from "react";
import { Loader2, Search, Check, ArrowLeft, Share2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { shareWithOrg } from "@/utils/permissions/service";
import type { ResourceType } from "@/utils/permissions/registry";
import { listOrgSharedIdsForTable } from "@/utils/permissions/orgModeration";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  CONTENT_ROLES,
  contributableEntries,
  getContentRole,
  type OrgResourceEntry,
} from "../resource-catalogue";

interface ContributeResourceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  /** Pre-select a resource kind by catalogue key when opening. */
  initialEntryKey?: string | null;
  /** Called after at least one successful share so callers can refresh counts. */
  onContributed?: () => void;
}

interface MyItem {
  id: string;
  title: string;
}

export function ContributeResourceSheet({
  open,
  onOpenChange,
  orgId,
  orgName,
  initialEntryKey,
  onContributed,
}: ContributeResourceSheetProps) {
  const userId = useAppSelector(selectUserId);
  const entries = React.useMemo(() => contributableEntries(), []);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MyItem[]>([]);
  const [alreadyShared, setAlreadyShared] = React.useState<Set<string>>(new Set());
  const [justShared, setJustShared] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [sharingId, setSharingId] = React.useState<string | null>(null);

  const selected = entries.find((e) => e.key === selectedKey) ?? null;

  React.useEffect(() => {
    if (open) {
      setSelectedKey(initialEntryKey ?? null);
      setQuery("");
    }
  }, [open, initialEntryKey]);

  // Load the user's own items for the selected kind.
  React.useEffect(() => {
    if (!open || !selected || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setItems([]);
      setJustShared(new Set());
      try {
        // contributableEntries() guarantees table + titleColumn + shareKey.
        const table = selected.table!;
        const titleCol = selected.titleColumn!;
        let q = supabase
          .from(table as never)
          .select(`id, ${titleCol}`)
          .eq("user_id", userId)
          .limit(200);
        if (selected.archivedColumn) {
          q = q.eq(selected.archivedColumn as never, false);
        }
        const [{ data, error }, sharedIds] = await Promise.all([
          q,
          listOrgSharedIdsForTable(orgId, selected.shareKey!),
        ]);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
        setItems(
          rows.map((r) => ({
            id: String(r.id),
            title: String(r[titleCol] ?? "").trim() || "Untitled",
          })),
        );
        setAlreadyShared(sharedIds);
      } catch (err) {
        if (!cancelled) {
          console.error("[ContributeResourceSheet] load failed:", err);
          toast.error("Couldn't load your items for this kind.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selected, userId, orgId]);

  async function handleShare(item: MyItem) {
    if (!selected) return;
    setSharingId(item.id);
    try {
      const result = await shareWithOrg({
        // shareKey is the canonical table name; the share RPC's resolver accepts
        // canonical names directly. Cast at this boundary because the catalogue
        // intentionally keys on the (broader) DB registry, not the TS mirror.
        resourceType: selected.shareKey! as ResourceType,
        resourceId: item.id,
        organizationId: orgId,
        permissionLevel: "viewer",
      });
      if (result.success) {
        setJustShared((prev) => new Set(prev).add(item.id));
        toast.success(`Shared "${item.title}" with ${orgName}`);
        onContributed?.();
      } else {
        toast.error(result.error ?? "Failed to share");
      }
    } finally {
      setSharingId(null);
    }
  }

  const filtered = items.filter((it) =>
    it.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Share with {orgName}
          </SheetTitle>
          <SheetDescription>
            {selected
              ? `Pick which of your ${selected.labelPlural.toLowerCase()} to share with the team.`
              : "Choose what kind of thing you want to share, then pick the items."}
          </SheetDescription>
        </SheetHeader>

        {!selected ? (
          // Step 1 — kind picker, grouped by content role.
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {CONTENT_ROLES.map((role) => {
              const roleEntries = entries.filter((e) => e.role === role.id);
              if (roleEntries.length === 0) return null;
              return (
                <div key={role.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`h-2 w-2 rounded-full ${role.accentBar}`} />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {role.title}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {roleEntries.map((entry) => (
                      <KindButton key={entry.key} entry={entry} onClick={() => setSelectedKey(entry.key)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Step 2 — item picker for the chosen kind.
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-3 border-b border-border space-y-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 -ml-2 text-muted-foreground"
                onClick={() => setSelectedKey(null)}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                All kinds
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search your ${selected.labelPlural.toLowerCase()}…`}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <selected.icon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {items.length === 0
                      ? `You don't own any ${selected.labelPlural.toLowerCase()} yet.`
                      : "No matches."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((item) => {
                    const shared = alreadyShared.has(item.id) || justShared.has(item.id);
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        <selected.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 min-w-0 text-sm truncate" title={item.title}>
                          {item.title}
                        </span>
                        {shared ? (
                          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                            <Check className="h-3 w-3" />
                            Shared
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0"
                            disabled={sharingId === item.id}
                            onClick={() => handleShare(item)}
                          >
                            {sharingId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Share
                              </>
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function KindButton({
  entry,
  onClick,
}: {
  entry: OrgResourceEntry;
  onClick: () => void;
}) {
  const role = getContentRole(entry.role);
  const Icon = entry.icon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all text-left"
    >
      <span className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${role.accentBg} ${role.accentText}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium truncate">{entry.labelPlural}</span>
    </button>
  );
}
