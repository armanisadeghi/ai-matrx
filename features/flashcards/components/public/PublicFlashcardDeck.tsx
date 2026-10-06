// features/flashcards/components/public/PublicFlashcardDeck.tsx
//
// THE public flashcard deck page — one component for both public lanes: the
// indexable `/p/e/fc_set/<id>` viewer and the `/s/<token>` share-link lens.
//
//   hero    — title, card count, description, Study / Learn, the
//             visitor's saved progress on this device, and a flippable preview
//   session — the REAL <StudyDeck/> as a full-screen layer over the page (no
//             navigation, no sign-in), driven by the on-device study driver;
//             its chunk loads only when a sitting opens (PublicStudySessionImpl)
//   list    — every card's text, server-rendered for search engines
//
// Studying is never gated — product rule: every feature is free for guests,
// only AI actions are counted (by the server). "Save a copy" is the host's
// secondary action and is about SAVING, never the way to study.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Layers,
  RotateCcw,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  pushAddressWithoutNavigating,
  replaceAddressWithoutNavigating,
} from "@/lib/url-state/addressWithoutNavigating";
import {
  RichContentStaticInline,
  RichContentStaticStandard,
} from "@/components/rich-content/RichContentStaticProse";
import FlashcardItem from "@/components/mardown-display/blocks/flashcards/FlashcardItem";
import { getCardImages } from "../study/cardImages";
import { studyFaces } from "../../utils/cardVariants";
import {
  publicCardsToStudyCards,
  type PublicFlashcard,
} from "../../data/publicDeck";
import {
  clearDeviceProgress,
  readDeviceProgress,
  type DeviceProgressSummary,
  type LocalStudyMode,
} from "../../data/useLocalFlashcardStudy";

// ONE edge: StudyDeck and its whole toolbox load only when a sitting opens.
const PublicStudySessionImpl = dynamic(() => import("./PublicStudySessionImpl"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <MatrxMiniLoader />
    </div>
  ),
});

const MODE_HASH: Record<LocalStudyMode, string> = {
  study: "#study",
  learn: "#learn",
};

function modeFromHash(hash: string): LocalStudyMode | null {
  if (hash === MODE_HASH.study) return "study";
  if (hash === MODE_HASH.learn) return "learn";
  return null;
}

export interface PublicFlashcardDeckProps {
  setId: string;
  title: string;
  description?: string | null;
  /** Small chip above the title ("Flashcard set"). */
  label?: string;
  cards: readonly PublicFlashcard[];
  /** The host's secondary action — "Save a copy" (DuplicateToEditButton). */
  saveAction?: ReactNode;
  /** h1 on the indexable page; the share lens sits under its own page title. */
  headingLevel?: "h1" | "h2";
}

export function PublicFlashcardDeck({
  setId,
  title,
  description,
  label = "Flashcard set",
  cards: publicCards,
  saveAction,
  headingLevel = "h1",
}: PublicFlashcardDeckProps) {
  const cards = publicCardsToStudyCards(publicCards);
  const cardIds = cards.map((c) => c.id);
  const count = cards.length;

  const [session, setSession] = useState<LocalStudyMode | null>(null);
  // Whether WE pushed the #study entry (so closing pops it instead of leaving).
  const pushedRef = useRef(false);
  const [saved, setSaved] = useState<DeviceProgressSummary[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewFlipped, setPreviewFlipped] = useState(false);

  const idsKey = cardIds.join(",");
  // Saved progress is browser-only state: read after mount (SSR shows none),
  // and re-read when a sitting closes.
  useEffect(() => {
    if (session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs from localStorage, an external store
    setSaved(readDeviceProgress(setId, idsKey ? idsKey.split(",") : []));
  }, [setId, idsKey, session]);

  // `#study` / `#learn` open the sitting (a shareable deep link), and the
  // browser's Back closes it instead of leaving the page.
  useEffect(() => {
    const sync = () => {
      const mode = modeFromHash(window.location.hash);
      if (!mode) pushedRef.current = false;
      setSession(mode);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // One scroll area: the page behind the layer does not scroll.
  useEffect(() => {
    if (!session) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [session]);

  const open = (mode: LocalStudyMode) => {
    if (count === 0) return;
    pushAddressWithoutNavigating(MODE_HASH[mode]);
    pushedRef.current = true;
    setSession(mode);
  };

  const close = () => {
    if (pushedRef.current) {
      window.history.back();
      return;
    }
    replaceAddressWithoutNavigating(`${window.location.pathname}${window.location.search}`);
    setSession(null);
  };

  const resetProgress = () => {
    clearDeviceProgress(setId);
    setSaved([]);
  };

  const latest = saved[0] ?? null;
  const finished = latest !== null && latest.done >= latest.total;
  // Continue a saved pass; a finished pass starts over.
  const openMode = (mode: LocalStudyMode) => {
    const pass = saved.find((p) => p.mode === mode);
    if (pass && pass.done >= pass.total) clearDeviceProgress(setId, mode);
    open(mode);
  };
  const preview = cards[Math.min(previewIndex, Math.max(0, count - 1))];
  const previewFaces = preview ? studyFaces(preview) : null;
  const previewImages = preview ? getCardImages(preview) : null;
  const movePreview = (delta: number) => {
    setPreviewFlipped(false);
    setPreviewIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, count - 1)));
  };

  const Heading = headingLevel;

  return (
    <div className="matrx-touch-targets mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:px-6 sm:pt-10">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
              <Layers className="h-3.5 w-3.5" />
              {label}
            </span>
            <span className="tabular-nums">
              {count} {count === 1 ? "card" : "cards"}
            </span>
          </div>
          <Heading className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </Heading>
          {description && (
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              <RichContentStaticInline source={description} />
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button hero
              icon={<GraduationCap />}
              variant="primary"
              onClick={() => openMode(latest?.mode ?? "study")}
              disabled={count === 0}
            >
              {!latest ? "Study" : finished ? "Study again" : "Resume"}
            </Button>
            <Button hero
              icon={<Target />}
              variant="outline"
              onClick={() => openMode("learn")}
              disabled={count === 0}
              title="Missed cards come back until you know them all"
            >
              Learn
            </Button>
          </div>

          <div className="mt-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {latest ? (
              <>
                <span className="tabular-nums">
                  {latest.mode === "learn" ? "Learned" : "Studied"} {latest.done} of{" "}
                  {latest.total} on this device
                </span>
                <button
                  type="button"
                  onClick={resetProgress}
                  className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Start over
                </button>
              </>
            ) : (
              <span>Free to study. No account needed.</span>
            )}
          </div>

          {saveAction && <div className="mt-4">{saveAction}</div>}
        </div>

        {/* A flippable taste of the deck — the real card component. */}
        {preview && previewFaces && (
          <div className="min-w-0">
            <FlashcardItem
              key={`preview-${preview.id}`}
              front={previewFaces.front}
              back={previewFaces.back}
              index={previewIndex}
              layoutMode="list"
              flipped={previewFlipped}
              onFlipToggle={() => setPreviewFlipped((f) => !f)}
              frontImage={previewImages?.front}
              backImage={previewImages?.back}
              showDevWindowTrigger={false}
              heightClassName="h-[clamp(14rem,36dvh,22rem)]"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                icon={<ChevronLeft />}
                type="button"
                variant="quiet"
                onClick={() => movePreview(-1)}
                disabled={previewIndex === 0}
                aria-label="Previous card"
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {previewIndex + 1} / {count}
              </span>
              <Button
                icon={<ChevronRight />}
                type="button"
                variant="quiet"
                onClick={() => movePreview(1)}
                disabled={previewIndex >= count - 1}
                aria-label="Next card"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Every card, server-rendered (the indexable body) ─────────── */}
      <section className="mt-12" aria-labelledby={`cards-${setId}`}>
        <h2
          id={`cards-${setId}`}
          className="mb-4 text-lg font-semibold text-foreground"
        >
          {count === 0 ? "No cards yet" : `All ${count} ${count === 1 ? "card" : "cards"}`}
        </h2>
        <ol className="space-y-3">
          {publicCards.map((card, i) => (
            <li
              key={card.id}
              className="rounded-xl border border-border bg-card p-4 sm:flex sm:items-start sm:gap-5 sm:p-5"
            >
              <span className="mb-2 block text-xs font-semibold tabular-nums text-muted-foreground sm:mb-0 sm:w-6 sm:shrink-0 sm:pt-0.5">
                {i + 1}
              </span>
              <div className="grid gap-3 sm:flex-1 sm:grid-cols-2">
                <div className="min-w-0">
                  {card.front_image_url && (
                    // Durable public URL, server-rendered (SEO + anon); the alt
                    // is real alt text.
                    <img
                      src={card.front_image_url}
                      alt={card.front_image_alt ?? ""}
                      loading="lazy"
                      className="mb-2 max-h-40 w-auto rounded-md"
                    />
                  )}
                  <div className="font-medium text-foreground">
                    {card.front ? <RichContentStaticStandard source={card.front} /> : "—"}
                  </div>
                </div>
                <div className="min-w-0 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                  {card.back_image_url && (
                    <img
                      src={card.back_image_url}
                      alt={card.back_image_alt ?? ""}
                      loading="lazy"
                      className="mb-2 max-h-40 w-auto rounded-md"
                    />
                  )}
                  <div className="text-muted-foreground">
                    {card.back ? <RichContentStaticStandard source={card.back} /> : "—"}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {session && count > 0 && (
        <PublicStudySessionImpl
          key={session}
          setId={setId}
          title={title}
          cards={cards}
          mode={session}
          onClose={close}
        />
      )}
    </div>
  );
}
