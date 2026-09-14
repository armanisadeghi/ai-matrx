"use client";

/**
 * Create one of the brand's own offerings, or change an offering's name, kind,
 * description or place in the brand's catalog.
 *
 * The parent is catalog hierarchy only (brand-offerings D3): "On-site
 * Shredding is part of Hard Drive Shredding". It never says which site sells
 * it — that is each site's own choice, made in the Offered here column.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/styles/themes/utils";
import type { CatalogOffering } from "./data";
import { OFFERING_KIND_META, type OfferingKindValue } from "./vocabulary";

export interface OfferingEditDraft {
  offeringId: string | null;
  name: string;
  kind: OfferingKindValue;
  description: string;
  parentId: string | null;
}

export function OfferingEditDialog({
  draft,
  catalog,
  forbiddenParentIds,
  busy,
  onCancel,
  onSave,
}: {
  draft: OfferingEditDraft;
  catalog: CatalogOffering[];
  /** The offering itself and everything beneath it. */
  forbiddenParentIds: ReadonlySet<string>;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: OfferingEditDraft) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [kind, setKind] = useState<OfferingKindValue>(draft.kind);
  const [description, setDescription] = useState(draft.description);
  const [parentId, setParentId] = useState<string | null>(draft.parentId);
  const [parentSearch, setParentSearch] = useState("");
  const creating = draft.offeringId === null;

  const needle = parentSearch.trim().toLocaleLowerCase();
  const parents = catalog
    .filter((offering) => !forbiddenParentIds.has(offering.id))
    .filter((offering) => !needle || offering.name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parentName = parentId ? catalog.find((offering) => offering.id === parentId)?.name : null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-base">
            {creating ? "New offering" : `Edit “${draft.name}”`}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "It joins this brand's offerings and this site offers it straight away."
              : "Changes apply to this brand's offering on every site that offers it. Worth stays each site's own."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="offering-name" className="text-xs">
              Name
            </Label>
            <Input
              id="offering-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hard Drive Shredding"
              className="h-9 text-base sm:text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">What is it?</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {OFFERING_KIND_META.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={kind === entry.value}
                  onClick={() => setKind(entry.value)}
                  className={cn(
                    "rounded border px-2 py-1.5 text-left text-sm transition-colors",
                    kind === entry.value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="block">{entry.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {entry.meaning}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="offering-parent-search" className="text-xs">
              Part of
            </Label>
            <p className="text-[11px] text-muted-foreground">
              {parentName
                ? `Sits under “${parentName}” in this brand's catalog.`
                : "The top of its own branch."}{" "}
              This only organizes the catalog; each site still chooses what it offers.
            </p>
            <Input
              id="offering-parent-search"
              value={parentSearch}
              onChange={(event) => setParentSearch(event.target.value)}
              placeholder="Search this brand's offerings…"
              className="h-9 text-base sm:text-sm"
            />
            <div className="max-h-40 overflow-y-auto overscroll-contain rounded border border-border">
              <ParentOption
                selected={parentId === null}
                label="Nothing — make it the top of its own branch"
                onSelect={() => setParentId(null)}
              />
              {parents.map((offering) => (
                <ParentOption
                  key={offering.id}
                  selected={parentId === offering.id}
                  label={offering.name}
                  onSelect={() => setParentId(offering.id)}
                />
              ))}
              {parents.length === 0 && needle ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No offering in this brand matches “{parentSearch.trim()}”.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="offering-description" className="text-xs">
              What belongs under it (optional)
            </Label>
            <ProTextarea
              id="offering-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Destroying hard drives at the customer's location, with a certificate."
              rows={2}
              className="text-base sm:text-sm"
            />
          </div>
        </div>

        <DialogFooter className="pb-safe">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave({
                offeringId: draft.offeringId,
                name: name.trim(),
                kind,
                description,
                parentId,
              })
            }
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {creating ? "Create and offer it here" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ParentOption({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "block min-h-9 w-full truncate px-2 py-1.5 text-left text-sm transition-colors sm:min-h-0",
        selected ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-muted/60",
      )}
    >
      {label}
    </button>
  );
}
