// features/flashcards/components/editor/EditSetView.tsx
//
// The flashcard set AUTHORING surface (the view↔edit split, ROUTING.md §2). This
// is the real edit page, not a placeholder: rename the set + edit its details,
// set its share visibility + folders/tags, edit each card's front/back inline
// (dirty-tracked, per-card save, markdown/LaTeX preview toggle, delete,
// up/down reorder), and add a new card. Writes go through fcService
// (RLS-gated — you can only edit sets you own); the VIEW-vs-EDIT permission
// gate + duplicate-to-edit for view-only sharees is the Wave-5 sharing
// follow-up. Image/audio card attachments via the canonical fileHandler are
// NOT yet wired here — tracked as a Phase 1A fast-follow, not faked.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Save,
  Layers,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Share2,
  FolderTree,
  Scissors,
  Grid3x3,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { fcService } from "../../data/fcService";
import type { NewCardInput, SetWithCards, CardWithDetails } from "../../data/types";
import { SetVisibilityControl } from "../sharing/SetVisibilityControl";
import { FolderTagPicker } from "../organize/FolderTagPicker";
import {
  asCardKind,
  CARD_KIND,
  clozeFaces,
  matchingDynamicContent,
  matchingPairs,
  type CardKind,
  type MatchingPair,
} from "../../utils/cardVariants";

const EDU_BASE = "/education/flashcards";

interface HeaderFields {
  name: string;
  description: string;
  topic: string;
}

export function EditSetView({ setId }: { setId: string }) {
  const router = useRouter();
  const [data, setData] = useState<SetWithCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [header, setHeader] = useState<HeaderFields>({
    name: "",
    description: "",
    topic: "",
  });
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingCard, setAddingCard] = useState(false);

  // Bump to refetch (after adding a card). The fetch lives in the effect so no
  // setState fires synchronously in the effect body.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fcService.getSetWithCards(setId);
      if (cancelled) return;
      if (!res.data) {
        setError(res.error ?? "Flashcard set not found");
        setData(null);
      } else {
        setData(res.data);
        setHeader({
          name: res.data.set.name ?? "",
          description: res.data.set.description ?? "",
          topic: res.data.set.topic ?? "",
        });
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [setId, reloadKey]);

  const saveHeader = async () => {
    if (!data) return;
    setSavingHeader(true);
    const res = await fcService.updateSet(setId, {
      name: header.name.trim() || "Untitled set",
      description: header.description.trim() || null,
      topic: header.topic.trim() || null,
    });
    setSavingHeader(false);
    if (res.error) {
      toast.error("Couldn't save set details", { description: res.error });
    } else {
      toast.success("Set details saved");
      if (res.data) setData({ ...data, set: res.data });
    }
  };

  const STARTER_CARD: Record<CardKind, NewCardInput> = {
    basic: { front: "New card front", back: "New card back" },
    cloze: {
      front: "The capital of France is {{c1::Paris}}.",
      back: "",
      card_kind: CARD_KIND.cloze,
    },
    matching: {
      front: "Match each term to its definition",
      back: "",
      card_kind: CARD_KIND.matching,
      dynamic_content: matchingDynamicContent([
        { left: "Term A", right: "Definition A" },
        { left: "Term B", right: "Definition B" },
      ]),
    },
  };

  const addCard = async (kind: CardKind) => {
    setAddingCard(true);
    const res = await fcService.addCards(setId, [STARTER_CARD[kind]]);
    setAddingCard(false);
    if (res.error) {
      toast.error("Couldn't add a card", { description: res.error });
    } else {
      toast.success("Card added");
      setReloadKey((k) => k + 1);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<CardWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  const confirmDeleteCard = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fcService.deleteCard(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (res.error) {
      toast.error("Couldn't delete the card", { description: res.error });
    } else {
      toast.success("Card deleted");
      setReloadKey((k) => k + 1);
    }
  };

  const moveCard = async (index: number, direction: -1 | 1) => {
    if (!data || reordering) return;
    const target = index + direction;
    if (target < 0 || target >= data.cards.length) return;
    const ids = data.cards.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setReordering(true);
    const res = await fcService.reorderCards(setId, ids);
    setReordering(false);
    if (res.error) {
      toast.error("Couldn't reorder cards", { description: res.error });
    } else {
      setReloadKey((k) => k + 1);
    }
  };

  const goView = () => {
    if (isPending) return;
    startTransition(() => router.push(`${EDU_BASE}/${setId}`));
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {data ? (
            <Button variant="outline" size="sm" onClick={goView} disabled={isPending}>
              <Eye className="mr-1.5 h-4 w-4" />
              View set
            </Button>
          ) : null}
        </div>

        {loading ? (
          <>
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </>
        ) : error || !data ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-16 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Couldn&apos;t load this set
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {error ?? "This flashcard set could not be found."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => router.push(EDU_BASE)}
            >
              All flashcards
            </Button>
          </div>
        ) : (
          <>
            {/* Set details */}
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Layers className="h-4 w-4 text-primary" />
                Set details
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Name
                  </label>
                  <Input
                    value={header.name}
                    onChange={(e) =>
                      setHeader((h) => ({ ...h, name: e.target.value }))
                    }
                    placeholder="Set name"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Topic
                    </label>
                    <Input
                      value={header.topic}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, topic: e.target.value }))
                      }
                      placeholder="e.g. Cell Biology"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Description
                    </label>
                    <Input
                      value={header.description}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, description: e.target.value }))
                      }
                      placeholder="What this set covers"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveHeader} disabled={savingHeader}>
                    {savingHeader ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save details
                  </Button>
                </div>

                {/* Sharing */}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Share2 className="h-3.5 w-3.5" />
                    Sharing
                  </label>
                  <SetVisibilityControl
                    setId={setId}
                    visibility={data.set.visibility}
                    onChange={(v) =>
                      setData((prev) =>
                        prev ? { ...prev, set: { ...prev.set, visibility: v } } : prev,
                      )
                    }
                  />
                </div>

                {/* Folders / tags */}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderTree className="h-3.5 w-3.5" />
                    Folders / tags
                  </label>
                  <FolderTagPicker setId={setId} />
                </div>
              </div>
            </section>

            {/* Cards */}
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">
                Cards ({data.cards.length})
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={addingCard}>
                    {addingCard ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Add card
                    <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void addCard(CARD_KIND.basic)}>
                    <Plus className="mr-2 h-4 w-4 text-muted-foreground" />
                    Basic (front / back)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void addCard(CARD_KIND.cloze)}>
                    <Scissors className="mr-2 h-4 w-4 text-muted-foreground" />
                    Cloze deletion
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void addCard(CARD_KIND.matching)}
                  >
                    <Grid3x3 className="mr-2 h-4 w-4 text-muted-foreground" />
                    Matching pairs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-3 space-y-3">
              {data.cards.map((card, i) => (
                <CardEditor
                  key={card.id}
                  card={card}
                  index={i}
                  count={data.cards.length}
                  reordering={reordering}
                  onMove={(dir) => void moveCard(i, dir)}
                  onDelete={() => setDeleteTarget(card)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete this card"
        description={
          <>
            Permanently delete &ldquo;{deleteTarget?.front}&rdquo;. This cannot
            be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={confirmDeleteCard}
      />
    </div>
  );
}

/** One card's inline editor — variant-aware (basic / cloze / matching),
 * dirty-tracked with a per-card save, a live-preview toggle, delete, and
 * up/down reorder. */
function CardEditor({
  card,
  index,
  count,
  reordering,
  onMove,
  onDelete,
}: {
  card: CardWithDetails;
  index: number;
  count: number;
  reordering: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const kind = asCardKind(card.card_kind);

  // Baseline (last-saved) vs. live edits — never mutate the card prop.
  const [base, setBase] = useState({
    front: card.front,
    back: card.back,
    pairs: matchingPairs(card),
  });
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [pairs, setPairs] = useState<MatchingPair[]>(() => matchingPairs(card));
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const pairsDirty =
    JSON.stringify(pairs) !== JSON.stringify(base.pairs);
  const dirty =
    front !== base.front ||
    back !== base.back ||
    (kind === CARD_KIND.matching && pairsDirty);

  const save = async () => {
    setSaving(true);
    const patch =
      kind === CARD_KIND.matching
        ? {
            front: front.trim(),
            card_kind: CARD_KIND.matching,
            dynamic_content: matchingDynamicContent(pairs) as never,
          }
        : kind === CARD_KIND.cloze
          ? { front: front.trim(), back: back.trim(), card_kind: CARD_KIND.cloze }
          : { front: front.trim(), back: back.trim() };
    const res = await fcService.updateCard(card.id, patch);
    setSaving(false);
    if (res.error) {
      toast.error(`Couldn't save card ${index + 1}`, { description: res.error });
    } else {
      toast.success(`Card ${index + 1} saved`);
      // Re-sync the baseline so the row is no longer dirty.
      if (res.data) {
        const savedPairs = matchingPairs(res.data);
        setFront(res.data.front);
        setBack(res.data.back);
        setPairs(savedPairs);
        setBase({ front: res.data.front, back: res.data.back, pairs: savedPairs });
      }
    }
  };

  const kindLabel =
    kind === CARD_KIND.cloze
      ? "Cloze"
      : kind === CARD_KIND.matching
        ? "Matching"
        : "Basic";
  const clozePreview = kind === CARD_KIND.cloze ? clozeFaces(front) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Card {index + 1}
          {kind !== CARD_KIND.basic && (
            <span className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-0 text-primary">
              {kind === CARD_KIND.cloze ? (
                <Scissors className="h-2.5 w-2.5" />
              ) : (
                <Grid3x3 className="h-2.5 w-2.5" />
              )}
              {kindLabel}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Move up"
            aria-label={`Move card ${index + 1} up`}
            disabled={index === 0 || reordering}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="Move down"
            aria-label={`Move card ${index + 1} down`}
            disabled={index === count - 1 || reordering}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {kind !== CARD_KIND.matching && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? (
                <EyeOff className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Eye className="mr-1 h-3.5 w-3.5" />
              )}
              {preview ? "Edit" : "Preview"}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Delete card"
            aria-label={`Delete card ${index + 1}`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={dirty ? "default" : "ghost"}
            onClick={save}
            disabled={!dirty || saving}
            className="h-7 px-2 text-xs"
          >
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>

      {kind === CARD_KIND.matching ? (
        <MatchingPairsEditor pairs={pairs} onChange={setPairs} prompt={front} onPromptChange={setFront} />
      ) : kind === CARD_KIND.cloze ? (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Cloze text — wrap the hidden answer in {"{{c1::answer}}"} (add
              {" {{c1::answer::hint}}"} for a hint)
            </label>
            {preview ? (
              <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Blanked
                </div>
                <ConfigurableMarkdownContent
                  content={clozePreview?.front || "*empty*"}
                />
                <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Revealed
                </div>
                <ConfigurableMarkdownContent
                  content={clozePreview?.back || "*empty*"}
                />
              </div>
            ) : (
              <Textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                rows={3}
                className="resize-y text-sm"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Extra notes (optional — shown on the revealed side)
            </label>
            <Textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              rows={2}
              className="resize-y text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Front
            </label>
            {preview ? (
              <div className="min-h-[76px] rounded-md border border-border bg-muted/30 p-2">
                <ConfigurableMarkdownContent content={front || "*empty*"} />
              </div>
            ) : (
              <Textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                rows={3}
                className="resize-y text-sm"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Back
            </label>
            {preview ? (
              <div className="min-h-[76px] rounded-md border border-border bg-muted/30 p-2">
                <ConfigurableMarkdownContent content={back || "*empty*"} />
              </div>
            ) : (
              <Textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                rows={3}
                className="resize-y text-sm"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The pairs editor for a matching card: a prompt + a list of left/right rows. */
function MatchingPairsEditor({
  pairs,
  onChange,
  prompt,
  onPromptChange,
}: {
  pairs: MatchingPair[];
  onChange: (pairs: MatchingPair[]) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
}) {
  const setPair = (i: number, patch: Partial<MatchingPair>): void =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const removePair = (i: number): void =>
    onChange(pairs.filter((_, idx) => idx !== i));
  const addPair = (): void => onChange([...pairs, { left: "", right: "" }]);

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Prompt
        </label>
        <Input
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. Match each term to its definition"
          className="text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-[10px] uppercase tracking-wider text-muted-foreground">
          Pairs
        </label>
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={pair.left}
              onChange={(e) => setPair(i, { left: e.target.value })}
              placeholder="Term"
              className="flex-1 text-sm"
            />
            <span className="text-muted-foreground">↔</span>
            <Input
              value={pair.right}
              onChange={(e) => setPair(i, { right: e.target.value })}
              placeholder="Match"
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remove pair"
              disabled={pairs.length <= 1}
              onClick={() => removePair(i)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={addPair}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add pair
        </Button>
      </div>
    </div>
  );
}
