"use client";

import {
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Headphones,
  Layers3,
  Lightbulb,
  Menu,
  MessageCircleQuestion,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

type Flashcard = {
  id: string;
  front: string;
  back: string;
  source: string;
  confidence: "verified" | "review";
};

type FlashcardSet = {
  __kind: "flashcard_set";
  id: string;
  title: string;
  subject: string;
  cards: Flashcard[];
};

const FIXTURE: FlashcardSet = {
  __kind: "flashcard_set",
  id: "demo-severe-weather",
  title: "Severe Weather Essentials",
  subject: "Meteorology",
  cards: [
    {
      id: "ingredients",
      front:
        "What four ingredients are required for a thunderstorm to become severe?",
      back: "Moisture in the lower atmosphere, atmospheric instability, a lifting mechanism, and strong vertical wind shear.",
      source: "NOAA JetStream · Severe Thunderstorms",
      confidence: "verified",
    },
    {
      id: "updraft",
      front: "Why does wind shear help a storm persist?",
      back: "It separates the updraft from the downdraft, keeping falling rain from cutting off the storm's warm, moist inflow.",
      source: "NOAA JetStream · Thunderstorm Life Cycle",
      confidence: "verified",
    },
    {
      id: "supercell",
      front: "What distinguishes a supercell from other thunderstorms?",
      back: "A persistent, deeply rotating updraft called a mesocyclone.",
      source: "National Weather Service · Supercells",
      confidence: "verified",
    },
    {
      id: "warning",
      front:
        "What is the practical difference between a severe thunderstorm watch and warning?",
      back: "A watch means conditions are favorable. A warning means severe weather is occurring or imminent, so take shelter now.",
      source: "National Weather Service · Weather Safety",
      confidence: "review",
    },
  ],
};

const ASSISTS = [
  {
    id: "ask",
    label: "Ask AI",
    icon: MessageCircleQuestion,
    response:
      "Ask anything about this card. The card, answer, and source would be attached as structured context.",
  },
  {
    id: "explain",
    label: "Explain",
    icon: BrainCircuit,
    response:
      "Think of a storm as an engine: moisture is fuel, instability lets air accelerate, lift starts it, and shear keeps its moving parts separated.",
  },
  {
    id: "hint",
    label: "Hint",
    icon: Lightbulb,
    response: "Use the initials M-I-L-S: moisture, instability, lift, shear.",
  },
  {
    id: "audio",
    label: "Listen",
    icon: Headphones,
    response:
      "Audio playback would use the canonical text-to-speech path for the visible side.",
  },
] as const;

function clampIndex(index: number) {
  return (index + FIXTURE.cards.length) % FIXTURE.cards.length;
}

export default function DenseCanonicalFlashcardsDemo() {
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [selectedAssist, setSelectedAssist] = useState<
    (typeof ASSISTS)[number] | null
  >(null);
  const [style, setStyle] = useState<"focus" | "embedded" | "review">("focus");
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const card = FIXTURE.cards[cardIndex];

  const move = (direction: -1 | 1) => {
    setCardIndex((current) => clampIndex(current + direction));
    setIsFlipped(false);
    setSelectedAssist(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY)) {
      move(deltaX < 0 ? 1 : -1);
      return;
    }
    if (deltaY < -48 && Math.abs(deltaY) > Math.abs(deltaX)) {
      setIsActionsOpen(true);
      return;
    }
    if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12)
      setIsFlipped((current) => !current);
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured text-foreground">
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3 pr-14">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Layers3 className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-[clamp(0.875rem,0.8rem+0.25vw,1rem)] font-semibold">
              Canonical Flashcards · Dense proof
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              One contract · context-selected presentation · fixture only
            </p>
          </div>
        </div>
        <div className="hidden items-center rounded-md border border-border bg-muted/30 p-0.5 sm:flex">
          {(["focus", "embedded", "review"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStyle(item)}
              className={`h-9 rounded px-3 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                style === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider">
              Deck queue
            </p>
            <p className="text-xs text-muted-foreground">
              {FIXTURE.cards.length} cards · {FIXTURE.subject}
            </p>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-1.5">
            {FIXTURE.cards.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCardIndex(index);
                  setIsFlipped(false);
                }}
                className={`mb-1 flex min-h-11 w-full items-start gap-2 rounded-md px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  index === cardIndex
                    ? "bg-accent ring-1 ring-primary/40"
                    : "hover:bg-accent/50"
                }`}
              >
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span className="line-clamp-2 text-xs leading-4">
                  {item.front}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="font-mono">{FIXTURE.__kind}</span>
          </div>
        </aside>

        <section className="@container flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">
                {style}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {FIXTURE.title}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <span>
                {cardIndex + 1} / {FIXTURE.cards.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {Math.round(((cardIndex + 1) / FIXTURE.cards.length) * 100)}%
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-3 @md:p-5">
            <div
              className={`flex h-full max-h-[680px] w-full flex-col ${style === "embedded" ? "max-w-2xl" : "max-w-4xl"}`}
            >
              <button
                type="button"
                aria-label={isFlipped ? "Show question" : "Show answer"}
                onPointerDown={(event) => {
                  pointerStart.current = { x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={handlePointerUp}
                className="group relative flex min-h-0 flex-1 touch-pan-y select-none flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-[var(--elevation-2)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isFlipped ? "Answer" : "Prompt"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" /> Tap to flip
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-5 @md:p-8">
                  <p className="max-w-3xl text-center text-[clamp(1.25rem,1rem+2.2cqi,2.75rem)] font-semibold leading-[1.18] tracking-tight">
                    {isFlipped ? card.back : card.front}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
                  <span className="truncate pr-2">{card.source}</span>
                  <span className="hidden shrink-0 items-center gap-1 sm:flex">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" /> Source
                    attached
                  </span>
                </div>
              </button>

              <div className="mt-2 grid shrink-0 grid-cols-[44px_1fr_44px] items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous card"
                  onClick={() => move(-1)}
                  className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md border border-border bg-card p-1 scrollbar-hide">
                  {FIXTURE.cards.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Jump to card ${index + 1}`}
                      onClick={() => {
                        setCardIndex(index);
                        setIsFlipped(false);
                      }}
                      className={`h-9 min-w-12 rounded px-2 text-xs font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        index === cardIndex
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Next card"
                  onClick={() => move(1)}
                  className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-card md:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider">
                Learning assists
              </p>
              <p className="text-xs text-muted-foreground">
                Visible card is structured context
              </p>
            </div>
            <BrainCircuit className="h-4 w-4 text-primary" />
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {ASSISTS.map((assist) => (
              <button
                key={assist.id}
                type="button"
                onClick={() => setSelectedAssist(assist)}
                className={`flex min-h-11 items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  selectedAssist?.id === assist.id
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-accent/50"
                }`}
              >
                <assist.icon className="h-4 w-4 shrink-0 text-primary" />
                {assist.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 border-t border-border p-3">
            {selectedAssist ? (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                  <selectedAssist.icon className="h-4 w-4 text-primary" />
                  {selectedAssist.label}
                </div>
                <p className="text-sm leading-5">{selectedAssist.response}</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
                Select an assist to inspect its in-context result.
              </div>
            )}
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Source</span>
              <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-success" /> Attached
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <span className="capitalize">{card.confidence}</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-2 pb-safe md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-1 rounded-t-xl border border-b-0 border-glass-edge bg-glass p-1.5 shadow-glass backdrop-blur-glass backdrop-saturate-glass">
          {ASSISTS.slice(0, 3).map((assist) => (
            <button
              key={assist.id}
              type="button"
              onClick={() => {
                setSelectedAssist(assist);
                setIsActionsOpen(true);
              }}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <assist.icon className="h-4 w-4 text-primary" />
              <span className="hidden min-[390px]:inline">{assist.label}</span>
            </button>
          ))}
          <button
            type="button"
            aria-label="Open all learning actions"
            onClick={() => setIsActionsOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-glass-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isActionsOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-background/60 md:hidden"
          onClick={() => setIsActionsOpen(false)}
        >
          <section
            aria-label="Learning actions"
            onClick={(event) => event.stopPropagation()}
            className="flex h-[58dvh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-[var(--elevation-3)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
              <div>
                <p className="text-sm font-semibold">Learning actions</p>
                <p className="text-xs text-muted-foreground">
                  Card {cardIndex + 1} · source-aware
                </p>
              </div>
              <button
                type="button"
                aria-label="Close learning actions"
                onClick={() => setIsActionsOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-safe">
              <div className="grid grid-cols-2 gap-2">
                {ASSISTS.map((assist) => (
                  <button
                    key={assist.id}
                    type="button"
                    onClick={() => setSelectedAssist(assist)}
                    className={`flex min-h-11 items-center gap-2 rounded-md border p-3 text-left text-sm font-medium ${selectedAssist?.id === assist.id ? "border-primary bg-accent" : "border-border"}`}
                  >
                    <assist.icon className="h-4 w-4 text-primary" />
                    {assist.label}
                  </button>
                ))}
              </div>
              {selectedAssist && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-sm leading-5">{selectedAssist.response}</p>
                </div>
              )}
              <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                Swipe up on the card to open this sheet. Swipe horizontally to
                move between cards.
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
