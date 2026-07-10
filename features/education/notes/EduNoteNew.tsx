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

export function EduNoteNew() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const note = await NotesAPI.create({ label: "Untitled note", content: "" });
        router.replace(`/education/notes/${note.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create the note");
      }
    })();
  }, [router]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-textured">
      {error ? (
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
