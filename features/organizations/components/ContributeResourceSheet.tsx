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
import {
  CONTENT_ROLES,
  contributableEntries,
  getContentRole,
  type OrgResourceEntry,
} from "../resource-catalogue";
import { useOrgContributableItems } from "../hooks/useOrgContributableItems";

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

export function ContributeResourceSheet({
  open,
  onOpenChange,
  orgId,
  orgName,
  initialEntryKey,
  onContributed,
}: ContributeResourceSheetProps) {
  const entries = React.useMemo(() => contributableEntries(), []);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const selected = entries.find((e) => e.key === selectedKey) ?? null;

  // Shared engine — only active once a kind is picked while the sheet is open.
  const mine = useOrgContributableItems(
    open ? orgId : null,
    orgName,
    selected,
    onContributed,
  );

  React.useEffect(() => {
    if (open) {
      setSelectedKey(initialEntryKey ?? null);
      setQuery("");
    }
  }, [open, initialEntryKey]);

  const filtered = mine.items.filter((it) =>
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
              {mine.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <selected.icon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {mine.items.length === 0
                      ? `You don't own any ${selected.labelPlural.toLowerCase()} yet.`
                      : "No matches."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((item) => {
                    const shared =
                      mine.alreadyShared.has(item.id) || mine.justShared.has(item.id);
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        {!selected.hideRowIcon && (
                          <selected.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
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
                            disabled={mine.sharingId === item.id}
                            onClick={() => mine.share(item)}
                          >
                            {mine.sharingId === item.id ? (
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
