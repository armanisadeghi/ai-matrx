"use client";

/**
 * Education on a board: a Flashcard deck and a Study kit (the "study set" — one piece of material
 * and everything made from it). Each Body is the feature's own page component, never a copy:
 *
 * - **Flashcard deck** — `SetDetailView`, the component `/education/flashcards/[setId]` renders:
 *   the card grid, Study / Fast Fire / Edit / Add more cards, Deck tools, audio, export, card
 *   views and progress. `embedded` only drops the shell header and the shell-header offset and
 *   keeps the card view in the tile instead of the address bar. Its agent surface
 *   `matrx-user/education-flashcard-set` is registered by `SetDetailView` itself. Start new is
 *   `CreateDeckPage` (`/education/flashcards/new`: Sources, Style and details, Make the deck), the
 *   deck is made when the person presses Make; the tile then becomes that deck (`onMade`).
 * - **Study kit** — `KitHub` (`/education/kits/[sourceId]`), its `matrx-user/education-kits`
 *   surface mounted inside it. The kit's id IS its source material's id; a source that is not a
 *   file rides in `source.meta.from`. Start new is `ManualKitCreator` (`/education/kits/new`).
 *
 * Study modes and Edit navigate to their own pages (the same router pushes as on the page).
 * Pure helpers: ./education-items.logic.ts.
 */

import { useEffect, useState } from "react";
import { Layers, NotebookTabs } from "lucide-react";
import { readOf } from "@/components/read-state/ReadGate";
import { SetDetailView } from "@/features/flashcards/components/set-detail/SetDetailView";
import { CreateDeckPage } from "@/features/flashcards/components/create/CreateDeckPage";
import { fetchDeckPage, type DeckListRow } from "@/features/flashcards/data/deckListService";
import { KitHub } from "@/features/education/kits/components/KitHub";
import { ManualKitCreator } from "@/features/education/kits/components/ManualKitCreator";
import { kitHref, listKits, type StudyKit } from "@/features/education/kits/kitService";
import { EDUCATION_KITS_SURFACE_NAME } from "@/features/surfaces/manifests/education-kits.manifest";
import { entityComments, type BoardItemType, type ItemBodyProps, type PickerProps } from "./types";
import { RecordList } from "./feature-items";
import {
  FLASHCARD_ITEM_KEY,
  KIT_ITEM_KEY,
  deckSource,
  deckIdOf,
  kitFromSource,
  kitSource,
} from "./education-items.logic";

// ─── Flashcard deck ──────────────────────────────────────────────────────────

type DeckRead =
  | { phase: "reading" }
  | { phase: "read"; decks: DeckListRow[] }
  | { phase: "failed"; why: string };

function DeckPicker({ onPick, onCancel }: PickerProps) {
  const [read, setRead] = useState<DeckRead>({ phase: "reading" });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setRead({ phase: "reading" });
    fetchDeckPage(
      { lane: "all", search: "", filters: {}, archived: "active" },
      { sort: "updated", ascending: false, limit: 100, offset: 0 },
    )
      .then(({ rows }) => alive && setRead({ phase: "read", decks: rows }))
      .catch((e: unknown) => alive && setRead({ phase: "failed", why: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [again]);
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={read.phase === "read" ? read.decks : []}
        read={readOf(
          { loading: read.phase === "reading", error: read.phase === "failed" ? new Error(read.why) : null },
          { what: "your flashcard decks", onRetry: () => setAgain((n) => n + 1) },
        )}
        rowKey={(d) => d.id}
        rowText={(d) => `${d.name} ${d.topic ?? ""}`}
        onChoose={(d) => onPick([{ title: d.name, source: deckSource(d.id) }])}
        onCancel={onCancel}
        emptyState={<>No flashcard decks yet. Make one with New flashcard deck.</>}
        renderRow={(d) => (
          <>
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            {d.topic ? <span className="shrink-0 truncate text-xs text-muted-foreground">{d.topic}</span> : null}
          </>
        )}
      />
    </div>
  );
}

/** A new deck tile before its deck exists: the page's own Create deck flow; nothing is made until Make the deck. */
function DeckDraftBody({ title, onSource }: Pick<ItemBodyProps, "title" | "onSource">) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-textured">
      <CreateDeckPage embedded onMade={(id, name) => onSource(deckSource(id), name || title)} />
    </div>
  );
}

function DeckBody(props: ItemBodyProps) {
  const id = deckIdOf(props.source);
  return id ? <SetDetailView key={id} setId={id} initialName={props.title} embedded /> : <DeckDraftBody title={props.title} onSource={props.onSource} />;
}

// ─── Study kit ───────────────────────────────────────────────────────────────

type KitRead =
  | { phase: "reading" }
  | { phase: "read"; kits: StudyKit[] }
  | { phase: "failed"; why: string };

function KitPicker({ onPick, onCancel }: PickerProps) {
  const [read, setRead] = useState<KitRead>({ phase: "reading" });
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setRead({ phase: "reading" });
    listKits()
      .then((kits) => alive && setRead({ phase: "read", kits }))
      .catch((e: unknown) => alive && setRead({ phase: "failed", why: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [again]);
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={read.phase === "read" ? read.kits : []}
        read={readOf(
          { loading: read.phase === "reading", error: read.phase === "failed" ? new Error(read.why) : null },
          { what: "your study kits", onRetry: () => setAgain((n) => n + 1) },
        )}
        rowKey={(k) => `${k.sourceType}:${k.sourceId}`}
        rowText={(k) => k.title}
        onChoose={(k) => onPick([{ title: k.title, source: kitSource(k.sourceType, k.sourceId) }])}
        onCancel={onCancel}
        emptyState={<>No study kits yet. Make one with New study kit.</>}
        renderRow={(k) => (
          <>
            <span className="min-w-0 flex-1 truncate">{k.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {k.artifacts.length} {k.artifacts.length === 1 ? "study aid" : "study aids"}
            </span>
          </>
        )}
      />
    </div>
  );
}

/** A new kit tile before its kit exists: the page's own manual kit creator; nothing is made until Create kit. */
function KitDraftBody({ onSource }: Pick<ItemBodyProps, "onSource">) {
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-textured">
      <ManualKitCreator onMade={(kit) => onSource(kitSource(kit.sourceType, kit.sourceId), kit.title)} />
    </div>
  );
}

function KitBody(props: ItemBodyProps) {
  const kit = kitFromSource(props.source);
  if (!kit) return <KitDraftBody onSource={props.onSource} />;
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-textured">
      <KitHub key={kit.sourceId} sourceId={kit.sourceId} sourceType={kit.sourceType} renderHeader={() => null} />
    </div>
  );
}

export const EDUCATION_ITEMS: readonly BoardItemType[] = [
  {
    key: FLASHCARD_ITEM_KEY,
    surface: { name: "matrx-user/education-flashcard-set" },
    comments: entityComments("fc_set"),
    label: "Flashcard deck",
    kindLabel: "flashcard deck",
    icon: Layers,
    group: "features",
    defaultSize: { w: 960, h: 720 },
    matches: (s) => s.kind === "entity" && s.entity === FLASHCARD_ITEM_KEY,
    Body: DeckBody,
    startNew: { label: "New flashcard deck", create: () => ({ title: "New flashcard deck", source: deckSource(null) }) },
    bringIn: { label: "Flashcard deck", Picker: DeckPicker },
    href: (s) => {
      const id = deckIdOf(s);
      return id ? `/education/flashcards/${id}` : null;
    },
  },
  {
    key: KIT_ITEM_KEY,
    surface: { name: EDUCATION_KITS_SURFACE_NAME },
    // A kit is a source anchor plus association edges, not a registered record: no thread of its own.
    comments: null,
    label: "Study kit",
    kindLabel: "study kit",
    icon: NotebookTabs,
    group: "features",
    defaultSize: { w: 880, h: 720 },
    matches: (s) => s.kind === "entity" && s.entity === KIT_ITEM_KEY,
    Body: KitBody,
    startNew: { label: "New study kit", create: () => ({ title: "New study kit", source: kitSource(null, null) }) },
    bringIn: { label: "Study kit", Picker: KitPicker },
    href: (s) => {
      const kit = kitFromSource(s);
      return kit ? kitHref(kit.sourceType, kit.sourceId) : null;
    },
  },
];
