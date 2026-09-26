// features/education/notes/EduNoteNew.tsx
//
// /education/notes/new — create a fresh platform note and open it. A thin client
// redirect over NotesAPI.create (the single canonical note-create path).

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { EDUCATION_NOTE_CREATE_FIELDS } from "@/features/education/notes/education-notes";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { ensureOrganizationContext, isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

export function EduNoteNew() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // 🚨 FOUR STATES, NOT TWO. This page's only content is a spinner that says
  // "Creating your note…", so every state the boolean pair could not name was
  // spelled as work in progress: under a FAILED organization read (R37)
  // `organizationRequired` is false and `canLoad` is false, so nothing was ever
  // created and nothing ever said so — the spinner ran for as long as the tab
  // stayed open. `organizationState` names all four and the ONE notice renders
  // each of them, "we could not check" and its Try again included.
  const { organizationId, canLoad, organizationState } = useOrganizationRequired();

  useEffect(() => {
    if (started.current || !canLoad || !organizationId) return;
    void (async () => {
      try {
        const capturedOrganizationId = await ensureOrganizationContext({ organizationId });
        if (started.current) return;
        started.current = true;
        const note = await NotesAPI.create({ label: "Untitled note", content: "", ...EDUCATION_NOTE_CREATE_FIELDS, organization_id: capturedOrganizationId });
        router.replace(`/education/notes/${note.id}`);
      } catch (e) {
        if (isOrganizationSelectionCancelled(e)) return;
        setError(e instanceof Error ? e.message : "Could not create the note");
      }
    })();
  }, [router, organizationId, canLoad]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-textured">
      {organizationState !== "ready" ? (
        <OrganizationContextNotice
          state={organizationState}
          what="a new education note"
        />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-8 py-10 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Couldn&apos;t create the note</p>
          <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
          <Button onClick={() => router.push("/education/notes")}>Back to notes</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm">Creating your note…</p>
        </div>
      )}
    </div>
  );
}
