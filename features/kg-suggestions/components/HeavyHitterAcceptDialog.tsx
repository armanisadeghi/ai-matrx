// features/kg-suggestions/components/HeavyHitterAcceptDialog.tsx
//
// The lightweight "create a scope from this recurring entity" step. Opened
// from the heavy-hitter row's "Create scope" button. The user confirms/edits
// the suggested scope name and picks a scope_type from their org's existing
// types; on confirm it runs the accept → create-scope → tag-sources flow via
// useHeavyHitterAccept and reports the outcome with a toast.
//
// Responsive: a Dialog on desktop, a Drawer on mobile (per the mobile-first
// rule — Drawer, not Dialog, on small screens). No browser dialogs.
//
// Scope-type selection UX: we list the org's existing scope types (the
// canonical `list_scope_types` RPC via the agent-context scopeTypes slice) and
// pre-select a sensible default by matching the KG entity_kind to a type label
// (organization/company → Client/Company-ish; person/contact → Contact/Person-
// ish). The user is always free to override. If the org has no scope types we
// can't create a scope (create_scope needs a type_id), so we explain that and
// link the user to /scopes to define one first.

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import type { ScopeType } from "@/features/agent-context/redux/scope/types";
import { useHeavyHitterAccept } from "@/features/kg-suggestions/hooks/useHeavyHitterAccept";
import type { KgSuggestionRow } from "@/features/kg-suggestions/types";

export interface HeavyHitterAcceptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: KgSuggestionRow;
  /** Active org id — the new scope belongs to it. */
  organizationId: string | null;
}

/**
 * Heuristic default scope-type selection: match the KG entity kind against
 * scope-type labels so the common cases (an organization → a "Client"/"Company"
 * scope; a person → a "Contact"/"Person" scope) pre-select without forcing a
 * choice. Falls back to the first type. Returns the type id, or "" if none.
 */
function defaultScopeTypeId(entityKind: string, types: ScopeType[]): string {
  if (types.length === 0) return "";
  const kind = entityKind.toLowerCase();
  const hints: Record<string, string[]> = {
    organization: ["client", "company", "organization", "org", "account"],
    org: ["client", "company", "organization", "org", "account"],
    company: ["client", "company", "organization", "org", "account"],
    person: ["contact", "person", "people", "individual"],
    people: ["contact", "person", "people", "individual"],
    contact: ["contact", "person", "people", "individual"],
    location: ["location", "place", "site"],
    product: ["product", "item"],
  };
  const wanted = hints[kind] ?? [kind];
  const match = types.find((t) => {
    const label = `${t.label_singular} ${t.label_plural}`.toLowerCase();
    return wanted.some((w) => label.includes(w));
  });
  return (match ?? types[0]).id;
}

export function HeavyHitterAcceptDialog({
  open,
  onOpenChange,
  row,
  organizationId,
}: HeavyHitterAcceptDialogProps) {
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const { promote } = useHeavyHitterAccept();

  const types = useAppSelector((s) =>
    organizationId
      ? selectScopeTypesByOrg(s, organizationId)
      : ([] as ScopeType[]),
  );
  const typesLoading = useAppSelector(selectScopeTypesLoading);

  const suggestedName = row.suggested_value ?? row.entity.name ?? "";
  const [name, setName] = useState(suggestedName);
  const [typeId, setTypeId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Load the org's scope types once when the dialog opens.
  useEffect(() => {
    if (open && organizationId) {
      void dispatch(fetchScopeTypes(organizationId));
    }
  }, [open, organizationId, dispatch]);

  // Reset name + default type each time the dialog opens for a row.
  useEffect(() => {
    if (open) setName(suggestedName);
  }, [open, suggestedName]);

  // Pick a default scope type once types are available (only if unset).
  useEffect(() => {
    if (open && !typeId && types.length > 0) {
      setTypeId(defaultScopeTypeId(row.entity.kind ?? "", types));
    }
  }, [open, typeId, types, row.entity.kind]);

  const hasTypes = types.length > 0;
  const canSubmit = !!organizationId && hasTypes && !!typeId && !!name.trim();

  const handleConfirm = async () => {
    if (!organizationId || !typeId || !name.trim()) return;
    setBusy(true);
    try {
      const result = await promote({
        row,
        organizationId,
        scopeTypeId: typeId,
        scopeName: name.trim(),
      });

      if (result.ok) {
        const parts = [`Created scope “${result.scopeName ?? name.trim()}”`];
        if (result.taggedCount > 0) parts.push("tagged its source");
        let msg = parts.join(" and ");
        if (result.tagFailedCount > 0) {
          msg += " (source tag failed — tag it from the scope page)";
        }
        toast.success(msg);
        onOpenChange(false);
      } else {
        toast.error(
          result.error
            ? `Could not create scope: ${result.error}`
            : "Could not create scope from suggestion",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const entityLabel = row.entity.name ?? suggestedName ?? "this entity";

  const body = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="hh-scope-name" className="text-xs">
          Scope name
        </Label>
        <Input
          id="hh-scope-name"
          autoFocus={!isMobile}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scope name"
          disabled={busy}
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Scope type</Label>
        {typesLoading && !hasTypes ? (
          <Skeleton className="h-9 w-full rounded-md" />
        ) : hasTypes ? (
          <Select value={typeId} onValueChange={setTypeId} disabled={busy}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a scope type" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label_singular}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-xs text-muted-foreground">
            No scope types yet. Create one in{" "}
            <span className="font-medium text-foreground">Scopes</span> first,
            then come back to promote this entity.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Its source mentions will be tagged to the new scope automatically.
      </p>
    </div>
  );

  const footer = (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button size="sm" onClick={handleConfirm} disabled={!canSubmit || busy}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Network className="h-3.5 w-3.5 mr-1.5" />
        )}
        Create scope
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Create scope</DrawerTitle>
            <DrawerDescription>
              Promote “{entityLabel}” to a scope.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create scope</DialogTitle>
          <DialogDescription>
            Promote “{entityLabel}” to a scope.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HeavyHitterAcceptDialog;
