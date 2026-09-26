// features/rich-document/annotations/LinkRecordSheet.tsx
//
// "Link a record…" — the platform's ONE universal record picker
// (UniversalAssociationPicker, its own create affordances) pointed at this source,
// offering ONLY the kinds the relationship registry lets link here (door law:
// `linkableKinds` → public.association_link_sources; no choice is dead). The linked record stays in its
// own store; only an `anchored_to` edge is written (with the passage when one
// is selected). Detaching happens from the panel.

"use client";

import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffect, useState } from "react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { listableTokens } from "@/features/scopes/registry/entityRegistry";
import { useSidecar } from "./AnnotationSidecar";
import { linkableKinds } from "./service";
import type { TextAnchor } from "./anchor";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export function LinkRecordSheet({
  open,
  onOpenChange,
  passage,
  onLink,
  attachedKeys,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = link to the whole document. */
  passage: TextAnchor | null;
  onLink: (token: string, id: string, title: string) => Promise<boolean>;
  attachedKeys?: Set<string>;
}) {
  const userId = useAppSelector(selectUserId);
  const { source } = useSidecar();
  // null = still asking; string = the reason it could not be asked (said, never hidden).
  const [kinds, setKinds] = useState<EntityTypeToken[] | null>(null);
  const [kindsError, setKindsError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setKinds(null);
    setKindsError(null);
    linkableKinds(source.token)
      .then((tokens) => {
        // Registered pair AND a lister that exists — the SAME check the picker uses to list
        // candidates (registry.listableTokens: pickable + a title column or a host lister). A
        // kind that can link but cannot be listed is not offered (verify RC-B11 round 3: Documents,
        // Flashcards and Records were offered, listed nothing and showed a developer message).
        const listable = new Set<string>(listableTokens());
        if (live) setKinds(tokens.filter((t) => listable.has(t)) as EntityTypeToken[]);
      })
      .catch((e: unknown) => { if (live) setKindsError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [open, source.token]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{passage ? "Link to this passage" : "Link to this document"}</SheetTitle>
          <SheetDescription>
            {passage ? (
              <span className="line-clamp-3">“{passage.exact}”</span>
            ) : (
              "Pick a record to attach it here — only the kinds that can be linked to this are offered."
            )}
          </SheetDescription>
        </SheetHeader>
        {open && kindsError && (
          <ErrorNotice size="inline" className="text-sm" message={kindsError} />
        )}
        {open && !kindsError && kinds === null && (
          <p className="text-sm text-muted-foreground" aria-busy="true">Finding what can be linked here…</p>
        )}
        {open && kinds !== null && kinds.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing can be linked to this yet. An admin allows a kind of record in the relationship rules.</p>
        )}
        {open && kinds !== null && kinds.length > 0 && (
          <UniversalAssociationPicker
            tokens={kinds}
            ownerId={userId}
            attachedKeys={attachedKeys ?? new Set()}
            onAttach={async (token, id, title) => {
              const ok = await onLink(token, id, title);
              if (ok) onOpenChange(false);
              return ok ? { ok: true } : { ok: false, error: "Not linked — the panel says why." };
            }}
            onDetach={async () => ({ ok: false, error: "Detach a link from the annotations panel." })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
