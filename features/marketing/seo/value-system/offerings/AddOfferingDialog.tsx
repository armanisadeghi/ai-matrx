"use client";

/**
 * Add offering — the ONLY place platform suggestions appear (brand-offerings D6).
 *
 * The person types what they sell. Matching suggestions are listed; choosing
 * one COPIES it into this brand (copy-on-adopt: later edits to the suggestion
 * never touch the brand's copy) and this site offers it. Anything the
 * suggestions do not cover is created as the brand's own offering from exactly
 * what was typed (every picker takes new input, P23). A suggestion the brand
 * already has says so. The reason is kept with the site's choice (P24).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { searchOfferingTemplates, type CatalogOffering, type OfferingTemplate } from "./data";
import { OFFERING_KIND_META, offeringKindLabel, type OfferingKindValue } from "./vocabulary";

export type AddOfferingChoice =
  | { mode: "template"; templateId: string; name: string; reason: string }
  | { mode: "existing"; offeringId: string; name: string; reason: string }
  | { mode: "custom"; name: string; kind: OfferingKindValue; reason: string };

export function AddOfferingDialog({
  siteId,
  catalog,
  busy,
  onCancel,
  onChoose,
}: {
  siteId: string;
  catalog: CatalogOffering[];
  busy: boolean;
  onCancel: () => void;
  onChoose: (choice: AddOfferingChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<OfferingKindValue>("service");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggestions = useQuery({
    queryKey: ["seo", "offerings", "templates", siteId, debounced],
    queryFn: ({ signal }) => searchOfferingTemplates(siteId, debounced, signal),
    enabled: debounced.length > 0,
    staleTime: 60_000,
  });

  const typed = query.trim();
  const byTemplate = new Map(
    catalog.filter((o) => o.templateId).map((o) => [o.templateId as string, o]),
  );
  const exactOwn = catalog.find(
    (offering) => offering.name.trim().toLocaleLowerCase() === typed.toLocaleLowerCase(),
  );
  const matches = (suggestions.data ?? []).slice(0, 30);

  const chooseTemplate = (template: OfferingTemplate) => {
    const owned = byTemplate.get(template.id);
    if (owned) {
      onChoose({ mode: "existing", offeringId: owned.id, name: owned.name, reason });
    } else {
      onChoose({ mode: "template", templateId: template.id, name: template.name, reason });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Add an offering to this site</DialogTitle>
          <DialogDescription>
            Type what this business sells. Pick a suggestion, or add it exactly
            as you wrote it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hard drive shredding, ITAD, e-waste pickup…"
            className="h-10 text-base sm:text-sm"
            aria-label="What does this business sell?"
          />

          {typed ? (
            <div className="rounded-md border border-border">
              {exactOwn ? (
                <OptionButton
                  onClick={() =>
                    onChoose({ mode: "existing", offeringId: exactOwn.id, name: exactOwn.name, reason })
                  }
                  disabled={busy || exactOwn.available}
                  title={exactOwn.name}
                  detail={
                    exactOwn.available
                      ? "Already one of this brand's offerings, and this site already offers it."
                      : "Already one of this brand's offerings. Offer it on this site."
                  }
                  icon={exactOwn.available ? Check : Plus}
                />
              ) : (
                <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">Add “{typed}”</p>
                    <p className="text-[11px] text-muted-foreground">
                      As this brand&apos;s own offering, offered on this site.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {OFFERING_KIND_META.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        aria-pressed={kind === entry.value}
                        onClick={() => setKind(entry.value)}
                        className={cn(
                          "min-h-9 rounded border px-2 text-xs transition-colors sm:min-h-7",
                          kind === entry.value
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/60",
                        )}
                      >
                        {entry.label}
                      </button>
                    ))}
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => onChoose({ mode: "custom", name: typed, kind, reason })}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {typed ? (
            <div className="space-y-1">
              <p className="px-1 text-[11px] font-medium text-muted-foreground">Suggestions</p>
              {suggestions.isPending && debounced ? (
                <div className="space-y-1.5" aria-label="Looking for suggestions">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : suggestions.error ? (
                <p className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  Could not look up suggestions: {extractErrorMessage(suggestions.error)}. You can still
                  add “{typed}” above.
                </p>
              ) : matches.length === 0 && debounced ? (
                <p className="px-1 text-xs text-muted-foreground">
                  No suggestion matches “{debounced}”. Add it above as your own.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {matches.map((template) => {
                    const owned = byTemplate.get(template.id);
                    const offeredHere = owned?.available === true;
                    return (
                      <OptionButton
                        key={template.id}
                        onClick={() => chooseTemplate(template)}
                        disabled={busy || offeredHere}
                        title={template.name}
                        detail={
                          offeredHere
                            ? "This site already offers it."
                            : owned
                              ? `This brand already has it as “${owned.name}”. Offer it on this site.`
                              : template.description || offeringKindLabel(template.kind)
                        }
                        icon={offeredHere ? Check : Plus}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">
              Suggestions appear as you type. Nothing is added until you choose.
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="add-offering-reason" className="text-xs">
              Why does this site offer it? (optional, and worth writing)
            </Label>
            <ProTextarea
              id="add-offering-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Our main enterprise service; most of our revenue."
              rows={2}
              className="text-base sm:text-sm"
            />
          </div>
        </div>

        <DialogFooter className="pb-safe">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionButton({
  title,
  detail,
  icon: Icon,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  icon: typeof Plus;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", disabled ? "text-success" : "text-primary")} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
