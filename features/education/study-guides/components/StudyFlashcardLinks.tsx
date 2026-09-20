"use client";

import { useState } from "react";
import { UniversalAssociationPicker, useContainerLinks } from "@ai-matrx/associations/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { Note } from "@/features/notes/types";

export function StudyFlashcardLinks({ guide, onChanged }: { guide: Note; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const userId = useAppSelector(selectUserId);
  const links = useContainerLinks({ containerType: "note", containerId: open ? guide.id : null, orgId: guide.organization_id });
  return <>
    <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>Manage linked flashcards</Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader><SheetTitle>Link flashcards</SheetTitle><SheetDescription>Choose decks to show their cards as key terms in this guide.</SheetDescription></SheetHeader>
        {links.error && <p role="alert" className="text-sm text-destructive">{links.error}</p>}
        <UniversalAssociationPicker tokens={["fc_set"]} ownerId={userId} orgId={guide.organization_id}
          attachedKeys={new Set([...links.attachedIdsFor("fc_set")].map((id) => `fc_set:${id}`))}
          onAttach={async (token, id, title) => {
            const result = await links.attach(token, id, title);
            if (result.ok) onChanged();
            return result;
          }}
          onDetach={async (token, id) => {
            const result = await links.detach(token, id);
            if (result.ok) onChanged();
            return result;
          }} />
      </SheetContent>
    </Sheet>
  </>;
}
