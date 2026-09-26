"use client";

// features/education/study-guides/components/StudyFlashcardLinks.tsx
//
// "Manage linked flashcards" — a thin wrapper over the canonical
// UniversalAssociationPicker, linking flashcard sets to this guide's note.
//
// Hosted in the NON-BLOCKING docked panel, never a Sheet: a focus-trapping
// Sheet blocks keystrokes into any nested interactive picker content
// (every-picker-takes-new-input.md rule 4; same fix pattern as
// features/education/classes/components/AddClassContentSheet.tsx).

import { useState } from "react";
import { UniversalAssociationPicker, useContainerLinks } from "@ai-matrx/associations/react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { Note } from "@/features/notes/types";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export function StudyFlashcardLinks({ guide, onChanged }: { guide: Note; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const userId = useAppSelector(selectUserId);
  const links = useContainerLinks({ containerType: "note", containerId: open ? guide.id : null, orgId: guide.organization_id });
  return <>
    <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>Manage linked flashcards</Button>
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={setOpen}
      title="Link flashcards"
      description="Choose decks to show their cards as key terms in this guide."
      expandButtonLabel="Manage linked flashcards"
      initialFocus
      position="right"
      defaultSize={34}
      minSize={24}
      contentClassName="flex min-h-0 flex-1 flex-col px-3 pb-3"
    >
      {links.error && <ErrorNotice size="inline" className="text-sm" message={links.error} />}
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
    </MatrxDynamicPanelHost>
  </>;
}
