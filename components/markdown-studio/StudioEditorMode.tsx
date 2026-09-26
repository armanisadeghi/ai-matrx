"use client";

// components/markdown-studio/StudioEditorMode.tsx
//
// The proving route's EDITOR mode (rich-content RC-B4): the one editor over
// whatever the studio has loaded. It never writes the loaded record. Saving
// goes to a DISPOSABLE copy owned by the person — a new note created with the
// loaded text byte-for-byte — and every save is read back and compared, so the
// stored row can be diffed against the original: only the edited words differ.
// "Archive copy" soft-deletes it when the check is done.

import { useState } from "react";
import Link from "next/link";
import { Archive, CopyPlus, ExternalLink, Loader2 } from "lucide-react";
import RichEditor from "@/components/rich-editor/RichEditor";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { toast } from "@/lib/toast";
import type { ContentSource } from "@/features/rich-document/types";
import { presentOrganizationRefusal } from "@/lib/organizations/organizationRefusalToast";

const COPY_FOLDER = "Rich editor proving copies";

export interface ProvingCopy {
  id: string;
  label: string;
  version: number | null;
  content: string;
}

async function readBack(id: string): Promise<{ content: string; version: number | null }> {
  const note = await NotesAPI.getById(id, { failureMode: "throw" });
  if (!note) throw new Error("the proving copy is no longer visible to you");
  return { content: note.content ?? "", version: typeof note.version === "number" ? note.version : null };
}

/**
 * One save to the proving copy. The FIRST save makes the copy from the original
 * bytes, then writes the edit — two writes. If the edit's write fails (a slow or
 * restarting server), the copy just made would hold only the original: it is
 * archived, so no copy without the typed text is ever left behind, and the
 * person is told nothing was saved (verify-RC-B4 R6-4).
 */
export async function saveToProvingCopy(
  text: string,
  existing: ProvingCopy | null,
  io: {
    createCopy: () => Promise<ProvingCopy>;
    update: (id: string, content: string, expectedVersion: number | null) => Promise<unknown>;
    readBack: (id: string) => Promise<{ content: string; version: number | null }>;
    archive: (id: string) => Promise<unknown>;
  },
): Promise<{ copy: ProvingCopy | null; stored: string }> {
  const target = existing ?? (await io.createCopy());
  try {
    await io.update(target.id, text, target.version);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (existing) throw error;
    try {
      await io.archive(target.id);
    } catch {
      throw new Error(`${reason}. The copy made for this save holds only the original text and could not be archived — archive “${target.label}” from Notes`);
    }
    throw new Error(`${reason}. The copy made for this save was archived, so no copy without your edit is left behind`);
  }
  const stored = await io.readBack(target.id);
  return { copy: { ...target, version: stored.version, content: stored.content }, stored: stored.content };
}

export function StudioEditorMode({
  content,
  title,
  contentSource,
  onContentChange,
}: {
  content: string;
  title: string;
  contentSource: ContentSource;
  onContentChange: (text: string) => void;
}) {
  // The text the editor opened with — a snapshot, so the studio buffer this
  // mode writes back into never re-opens the editor underneath the person.
  const [opened] = useState(content);
  const [copy, setCopy] = useState<ProvingCopy | null>(null);
  const [busy, setBusy] = useState<null | "copy" | "archive">(null);

  const createCopy = async (text: string): Promise<ProvingCopy> => {
    const label = `Proving copy — ${title}`.slice(0, 200);
    const created = await NotesAPI.create({
      label,
      content: text,
      folder_name: COPY_FOLDER,
      organization_id: await ensureOrgId(undefined),
    });
    const stored = await readBack(created.id);
    if (stored.content !== text) {
      toast.error("The copy was created, but its stored text differs from what was loaded. Open it to see what was stored.");
    }
    const next = { id: created.id, label, version: stored.version, content: stored.content };
    setCopy(next);
    return next;
  };

  const makeCopy = async () => {
    setBusy("copy");
    try {
      const next = await createCopy(opened);
      toast.success(`Created “${next.label}” — saves now go to this copy only.`);
    } catch (error) {
      if (presentOrganizationRefusal(error, { act: "created", subject: "The proving copy" })) return;
      toast.error(`The copy was not created: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const archiveCopy = async () => {
    if (!copy) return;
    setBusy("archive");
    try {
      await NotesAPI.remove(copy.id);
      toast.success(`Archived “${copy.label}”. It stays recoverable from the notes trash.`);
      setCopy(null);
    } catch (error) {
      toast.error(`The copy was not archived: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const save = async (text: string): Promise<string> => {
    // The first save makes the copy from the ORIGINAL bytes, then applies the edit —
    // so the copy's history holds exactly the original and the edited text.
    try {
      const result = await saveToProvingCopy(text, copy, {
        createCopy: () => createCopy(opened),
        update: (id, content, expectedVersion) =>
          NotesAPI.update(id, { content }, expectedVersion !== null ? { expectedVersion } : undefined),
        readBack,
        archive: (id) => NotesAPI.remove(id),
      });
      setCopy(result.copy);
      return result.stored;
    } catch (error) {
      if (!copy) setCopy(null);
      throw error;
    }
  };

  const extras = copy ? (
    <div className="flex items-center gap-1 text-xs">
      <Link
        href={`/notes/${copy.id}`}
        target="_blank"
        className="flex h-8 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Open the proving copy in Notes"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Proving copy</span>
      </Link>
      <button
        type="button"
        onClick={() => void archiveCopy()}
        disabled={busy !== null}
        className="flex h-8 min-w-11 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Archive the proving copy (soft delete — recoverable from the notes trash)"
      >
        {busy === "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Archive copy</span>
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => void makeCopy()}
      disabled={busy !== null || !opened}
      className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      title="Create a disposable note with this exact text; saves go there, never to the loaded record"
    >
      {busy === "copy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">Make an editable copy</span>
    </button>
  );

  return (
    <RichEditor imagePolicy="self"
      value={copy ? copy.content : opened}
      onSave={save}
      onChange={onContentChange}
      contentSource={contentSource}
      surfaceName="matrx-user/markdown-studio"
      saveLabel={copy ? "Save" : "Save to a copy"}
      toolbarExtras={extras}
      placeholder="Write, or press / to insert anything…"
    />
  );
}
