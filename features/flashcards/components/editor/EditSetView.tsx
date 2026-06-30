// features/flashcards/components/editor/EditSetView.tsx
//
// The flashcard set AUTHORING surface (the view↔edit split, ROUTING.md §2). This
// is the real edit page, not a placeholder: rename the set + edit its details,
// edit each card's front/back inline (dirty-tracked, per-card save), and add a
// new card. Writes go through fcService (RLS-gated — you can only edit sets you
// own); the VIEW-vs-EDIT permission gate + duplicate-to-edit for view-only
// sharees is the Wave-5 sharing follow-up.
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
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fcService } from "../../data/fcService";
import type { SetWithCards, CardWithDetails } from "../../data/types";

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

  const addCard = async () => {
    setAddingCard(true);
    const res = await fcService.addCards(setId, [
      { front: "New card front", back: "New card back" },
    ]);
    setAddingCard(false);
    if (res.error) {
      toast.error("Couldn't add a card", { description: res.error });
    } else {
      toast.success("Card added");
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
              </div>
            </section>

            {/* Cards */}
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">
                Cards ({data.cards.length})
              </h2>
              <Button size="sm" variant="outline" onClick={addCard} disabled={addingCard}>
                {addingCard ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Add card
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {data.cards.map((card, i) => (
                <CardEditor key={card.id} card={card} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One card's inline editor — dirty-tracked front/back with a per-card save. */
function CardEditor({ card, index }: { card: CardWithDetails; index: number }) {
  // Baseline (last-saved) vs. live edits — never mutate the card prop.
  const [base, setBase] = useState({ front: card.front, back: card.back });
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [saving, setSaving] = useState(false);

  const dirty = front !== base.front || back !== base.back;

  const save = async () => {
    setSaving(true);
    const res = await fcService.updateCard(card.id, {
      front: front.trim(),
      back: back.trim(),
    });
    setSaving(false);
    if (res.error) {
      toast.error(`Couldn't save card ${index + 1}`, { description: res.error });
    } else {
      toast.success(`Card ${index + 1} saved`);
      // Re-sync the baseline so the row is no longer dirty.
      if (res.data) {
        setFront(res.data.front);
        setBack(res.data.back);
        setBase({ front: res.data.front, back: res.data.back });
      }
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Card {index + 1}
        </span>
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Front
          </label>
          <Textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={3}
            className="resize-y text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Back
          </label>
          <Textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={3}
            className="resize-y text-sm"
          />
        </div>
      </div>
    </div>
  );
}
