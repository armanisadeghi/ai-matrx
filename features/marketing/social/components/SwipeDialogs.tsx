"use client";

/**
 * The swipe file's three small dialogs: name a collection (create / rename),
 * pick the collection to save things into (new or existing), and save a pasted
 * link (ingest -> add). Money-bearing work states its cost before it runs.
 */

import { useEffect, useState } from "react";

import { Button, Field, Select, type SelectOption } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";

import { useAllSwipeCollections, useInvalidateSocial } from "../hooks";
import { looksLikePostUrl } from "../link";
import { useSocialSpend } from "../cost";
import { addToCollection, createCollection, ingestPost, socialErrorMessage } from "../server";
import { parseTagInput, visibleCollections } from "../swipe";
import { NoteTagsFields } from "./NoteTagsFields";

// ---------------------------------------------------------------------------
// Name a collection
// ---------------------------------------------------------------------------

export function CollectionNameDialog({
  open,
  onOpenChange,
  title,
  initial,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setName(initial);
      setError("");
    }
  }, [open, initial]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Field
          aria-label="Collection name"
          placeholder="Collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !busy) void submit();
          }}
          autoFocus
        />
        <p className="h-4 text-xs text-destructive" aria-live="polite">
          {error}
        </p>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pick the collection to save into
// ---------------------------------------------------------------------------

const NEW_COLLECTION = "__new__";

export interface SaveTarget {
  itemType: "social_post" | "social_ad";
  itemId: string;
}

/** Collection options + the "New collection" choice; `defaultId` preselects. */
function useCollectionChoice(open: boolean, defaultId: string | null) {
  const collections = useAllSwipeCollections();
  const live = visibleCollections(collections.data ?? [], false);
  const options: SelectOption[] = [
    ...live.map((c) => ({ value: c.id, label: c.name })),
    { value: NEW_COLLECTION, label: "New collection…" },
  ];
  const [choice, setChoice] = useState<string>(NEW_COLLECTION);
  useEffect(() => {
    if (!open || collections.isPending) return;
    setChoice(defaultId && live.some((c) => c.id === defaultId) ? defaultId : (live[0]?.id ?? NEW_COLLECTION));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collections.isPending]);
  return { options, choice, setChoice, loading: collections.isPending };
}

export function SaveToCollectionDialog({
  open,
  onOpenChange,
  organizationId,
  brandId,
  targets,
  defaultCollectionId,
  title = "Save to swipe file",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brandId: string;
  targets: readonly SaveTarget[];
  defaultCollectionId: string | null;
  title?: string;
  onSaved?: () => void;
}) {
  const invalidate = useInvalidateSocial();
  const { options, choice, setChoice, loading } = useCollectionChoice(open, defaultCollectionId);
  const [newName, setNewName] = useState("");
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const creating = choice === NEW_COLLECTION;
  useEffect(() => {
    if (open) {
      setNewName("");
      setNote("");
      setTagText("");
      setError("");
      setFailure(null);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      let collectionId = choice;
      if (creating) {
        const made = await createCollection({ name: newName.trim(), brandId }, { organizationId });
        collectionId = made.collection_id;
      }
      const tags = parseTagInput(tagText);
      for (const t of targets) {
        await addToCollection(
          collectionId,
          { ...t, ...(note.trim() ? { note: note.trim() } : {}), ...(tags.length ? { tags } : {}) },
          { organizationId },
        );
      }
      await invalidate();
      toast.success(targets.length === 1 ? "Saved" : `Saved ${targets.length} items`);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setFailure(err);
      setError(socialErrorMessage(err, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Select aria-label="Collection" value={choice} options={options} onValueChange={setChoice} disabled={loading} />
          {creating ? (
            <Field aria-label="New collection name" placeholder="Collection name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          ) : null}
          <NoteTagsFields note={note} tagText={tagText} onNoteChange={setNote} onTagTextChange={setTagText} />
          <p className="min-h-4 text-xs text-destructive" aria-live="polite">
            {error}
            {error ? <ErrorAlchemyMenu error={failure} operation="save to swipe file" /> : null}
          </p>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || loading || targets.length === 0 || (creating && !newName.trim())}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Save by link
// ---------------------------------------------------------------------------

export function SaveLinkDialog({
  open,
  onOpenChange,
  organizationId,
  brandId,
  defaultCollectionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  brandId: string;
  defaultCollectionId: string | null;
}) {
  const invalidate = useInvalidateSocial();
  const { costText } = useSocialSpend(organizationId);
  const { options, choice, setChoice, loading } = useCollectionChoice(open, defaultCollectionId);
  const [url, setUrl] = useState("");
  const [newName, setNewName] = useState("Saved");
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const creating = choice === NEW_COLLECTION;
  const valid = looksLikePostUrl(url);
  useEffect(() => {
    if (open) {
      setUrl("");
      setNote("");
      setTagText("");
      setError("");
      setFailure(null);
      setStatus("");
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    setError("");
    setFailure(null);
    setStatus("Fetching…");
    try {
      const result = await ingestPost(
        { url: url.trim() },
        {
          organizationId,
          onProgress: (p) => setStatus(p.step && p.total ? `${p.message} · ${p.step} of ${p.total}` : p.message),
        },
      );
      setStatus("Adding to the collection…");
      let collectionId = choice;
      if (creating) {
        const made = await createCollection({ name: newName.trim() || "Saved", brandId }, { organizationId });
        collectionId = made.collection_id;
      }
      const tags = parseTagInput(tagText);
      await addToCollection(
        collectionId,
        { itemType: "social_post", itemId: result.post_id, ...(note.trim() ? { note: note.trim() } : {}), ...(tags.length ? { tags } : {}) },
        { organizationId },
      );
      await invalidate();
      toast.success("Saved");
      onOpenChange(false);
    } catch (err) {
      setFailure(err);
      setError(socialErrorMessage(err, "Couldn't save that link"));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save link</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Field aria-label="Post link" placeholder="Paste a post or video link" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          <Select aria-label="Collection" value={choice} options={options} onValueChange={setChoice} disabled={loading} />
          {creating ? (
            <Field aria-label="New collection name" placeholder="Collection name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          ) : null}
          <NoteTagsFields note={note} tagText={tagText} onNoteChange={setNote} onTagTextChange={setTagText} disabled={busy} />
          <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
            {error ? (
              <span className="text-destructive">
                {error}
                <ErrorAlchemyMenu error={failure} operation="save social link" />
              </span>
            ) : (
              status || (url.trim() && !valid ? "Not a post link" : costText("save_link"))
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || loading || !valid || (creating && !newName.trim())}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
