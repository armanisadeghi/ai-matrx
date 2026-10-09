"use client";

/**
 * One saved item's sheet (UI-SPEC §5 details): why it was saved (note), tags,
 * which collections hold it (copy / remove), and move to another collection.
 * A post adds `Open post details` (the shared PostDrawer); an ad shows its
 * creative facts inline. Note and tags belong to the item IN a collection (the
 * membership edge), so a many-collection item has one pair per collection.
 */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button, Chip, ChipSet, Field, Select, Textarea, type SelectOption } from "@ai-matrx/design-system/controls";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { runLabel } from "../ads";
import { useInvalidateSocial } from "../hooks";
import { addToCollection, removeFromCollection, setItemNotes, socialErrorMessage } from "../server";
import { parseTagInput } from "../swipe";
import type { SwipeCollectionRow, SwipeItem } from "../types";
import { libraryLabel } from "./AdCard";
import { PlatformMark, platformLabel } from "./PlatformMark";

export function SwipeItemSheet({
  item,
  collections,
  initialCollectionId,
  organizationId,
  onClose,
  onOpenPost,
}: {
  item: SwipeItem | null;
  /** Live collections (for membership + move). */
  collections: readonly SwipeCollectionRow[];
  /** The collection the grid is scoped to; "all" picks the item's first. */
  initialCollectionId: string;
  organizationId: string;
  onClose: () => void;
  onOpenPost: (item: SwipeItem) => void;
}) {
  const invalidate = useInvalidateSocial();
  const heldIds = useMemo(() => item?.edges.map((e) => e.collectionId) ?? [], [item]);
  const [editId, setEditId] = useState<string>("");
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<unknown>(null);

  const edge = item?.edges.find((e) => e.collectionId === editId) ?? null;
  useEffect(() => {
    if (!item) return;
    const start = item.edges.some((e) => e.collectionId === initialCollectionId)
      ? initialCollectionId
      : (item.edges[0]?.collectionId ?? "");
    setEditId(start);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key]);
  useEffect(() => {
    setNote(edge?.note ?? "");
    setTagText((edge?.tags ?? []).join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge?.edgeId, edge?.note, edge?.tags.join("|")]);

  if (!item) {
    return (
      <Drawer open={false} onOpenChange={() => undefined} direction="right">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-sm">Saved item</DrawerTitle>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>
    );
  }

  const nameOf = (id: string) => collections.find((c) => c.id === id)?.name ?? "Archived collection";
  const holdOptions: SelectOption[] = item.edges.map((e) => ({ value: e.collectionId, label: nameOf(e.collectionId) }));
  const moveOptions: SelectOption[] = collections
    .filter((c) => !heldIds.includes(c.id))
    .map((c) => ({ value: c.id, label: c.name }));
  const tags = parseTagInput(tagText);
  const dirty = edge ? note.trim() !== edge.note.trim() || tags.join("|") !== edge.tags.join("|") : false;
  const opts = { organizationId };
  const ref = { itemType: item.itemType, itemId: item.itemId };

  async function run(label: string, work: () => Promise<void>, done: string) {
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      await work();
      await invalidate();
      toast.success(done);
    } catch (err) {
      setFailure(err);
      setError(socialErrorMessage(err, `${label} failed`));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMembership(collectionId: string, held: boolean) {
    if (held) {
      const ok = await confirm({
        title: `Remove from ${nameOf(collectionId)}?`,
        description: "The note and tags kept in this collection go with it. The post or ad itself stays in the shared cache.",
        confirmLabel: "Remove",
        variant: "destructive",
      });
      if (!ok) return;
      await run("Remove", () => removeFromCollection(collectionId, ref, opts), "Removed");
    } else {
      await run("Copy", () => addToCollection(collectionId, { ...ref, note: note.trim(), tags }, opts), "Copied");
    }
  }

  async function moveTo(targetId: string) {
    if (!edge) return;
    await run(
      "Move",
      async () => {
        await addToCollection(targetId, { ...ref, note: edge.note, tags: edge.tags }, opts);
        await removeFromCollection(edge.collectionId, ref, opts);
      },
      `Moved to ${nameOf(targetId)}`,
    );
  }

  const { post, ad } = item;
  const title = item.title || (ad?.advertiser ?? post?.handle ?? "Saved item");

  return (
    <Drawer open onOpenChange={(open) => (open ? undefined : onClose())} direction="right">
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-2">
            {post ? <PlatformMark platform={post.platform} size={18} /> : null}
            <DrawerTitle className="truncate text-sm">{title}</DrawerTitle>
          </div>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4 px-3 pb-4">
          <section className="flex flex-col gap-2" aria-label="Why saved">
            {holdOptions.length > 1 ? (
              <Select aria-label="Collection to edit" value={editId} options={holdOptions} onValueChange={setEditId} />
            ) : null}
            <Textarea
              aria-label="Why saved"
              placeholder="Why saved"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!edge}
            />
            <Field
              aria-label="Tags"
              placeholder="Tags, separated by commas"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              disabled={!edge}
            />
            {tags.length ? (
              <ChipSet>
                {tags.map((t) => (
                  <Chip key={t} label={t} />
                ))}
              </ChipSet>
            ) : null}
            <div>
              <Button
                variant="primary"
                disabled={busy || !edge || !dirty}
                onClick={() => edge && void run("Save", () => setItemNotes(edge.collectionId, { ...ref, note: note.trim(), tags }, opts), "Saved")}
              >
                Save note and tags
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-1" aria-label="Collections">
            <p className="text-xs font-medium text-foreground">Collections</p>
            {collections.map((c) => {
              const held = heldIds.includes(c.id);
              return (
                <label key={c.id} className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={held}
                    disabled={busy || (held && heldIds.length === 1)}
                    onChange={() => void toggleMembership(c.id, held)}
                    title={held && heldIds.length === 1 ? "Move it to another collection instead" : undefined}
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              );
            })}
            {moveOptions.length ? (
              <div className="pt-1">
                <Select
                  aria-label="Move to"
                  value=""
                  options={moveOptions}
                  onValueChange={(v) => void moveTo(v)}
                  disabled={busy || !edge}
                />
              </div>
            ) : null}
          </section>

          <p className="min-h-4 text-xs text-destructive" aria-live="polite">
            {error}
            {error ? <ErrorAlchemyMenu error={failure} operation="edit swipe item" /> : null}
          </p>

          {post ? (
            <section className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => onOpenPost(item)}>
                Open post details
              </Button>
              <Button variant="outline" icon={<ExternalLink />} asChild>
                <a href={post.url} target="_blank" rel="noreferrer noopener">
                  Open original
                </a>
              </Button>
            </section>
          ) : null}

          {ad ? (
            <section className="flex flex-col gap-1 text-xs" aria-label="Ad">
              <p className="font-medium text-foreground">{ad.advertiser}</p>
              <p className="text-muted-foreground">
                {libraryLabel(ad.library)} · {ad.format} · {ad.status}
                {runLabel(ad) ? ` · ${runLabel(ad)}` : ""}
              </p>
              {ad.headline ? <p className="text-foreground">{ad.headline}</p> : null}
              {ad.body ? <p className="whitespace-pre-wrap text-muted-foreground">{ad.body}</p> : null}
              {ad.cta ? <p className="text-muted-foreground">CTA: {ad.cta}</p> : null}
              {ad.placements.length || ad.countries.length ? (
                <p className="text-muted-foreground">{[...ad.placements, ...ad.countries].join(" · ")}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {ad.libraryUrl ? (
                  <Button variant="outline" icon={<ExternalLink />} asChild>
                    <a href={ad.libraryUrl} target="_blank" rel="noreferrer noopener">
                      Open in library
                    </a>
                  </Button>
                ) : null}
                {ad.landingUrl ? (
                  <Button variant="outline" icon={<ExternalLink />} asChild>
                    <a href={ad.landingUrl} target="_blank" rel="noreferrer noopener">
                      Landing page
                    </a>
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
          {post ? <p className="text-[11px] text-muted-foreground">{platformLabel(post.platform)}</p> : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
