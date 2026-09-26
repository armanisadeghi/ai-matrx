// features/rich-document/annotations/LinkRecordSheet.tsx
//
// "Link a flashcard, task, note…" — the platform's ONE universal record picker
// (UniversalAssociationPicker, every listable registered token, its own
// create affordances) pointed at this source. The linked record stays in its
// own store; only an `anchored_to` edge is written (with the passage when one
// is selected). Detaching happens from the panel.

"use client";

import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { TextAnchor } from "./anchor";

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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{passage ? "Link to this passage" : "Link to this document"}</SheetTitle>
          <SheetDescription>
            {passage ? (
              <span className="line-clamp-3">“{passage.exact}”</span>
            ) : (
              "Pick any record — a flashcard, task, note, deck or anything else — to attach it here."
            )}
          </SheetDescription>
        </SheetHeader>
        {open && (
          <UniversalAssociationPicker
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
