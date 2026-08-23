"use client";

import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import {
  BadgeCheck,
  BookmarkCheck,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Info,
  Layers3,
  Lightbulb,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Volume2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/styles/themes/utils";

type DemoSource = "chat" | "education" | "canvas";
type DisplayStyle = "focused" | "embedded" | "review";
type AssistKind = "ask" | "explain" | "hint" | "memory";

interface CanonicalCard {
  id: string;
  front: string;
  back: string;
  sourceTitle: string;
  assist: Record<AssistKind, string>;
}

interface CanonicalFlashcardSet {
  __kind: "flashcard_set";
  id: string;
  title: string;
  description: string;
  source: {
    surface: DemoSource;
    label: string;
    trusted: boolean;
  };
  cards: CanonicalCard[];
}

const CANONICAL_FIXTURE: CanonicalFlashcardSet = {
  __kind: "flashcard_set",
  id: "weather-foundations",
  title: "Weather Foundations",
  description: "The same learning object, adapted from three entry surfaces.",
  source: {
    surface: "chat",
    label: "Weather Foundations · generated in Chat",
    trusted: true,
  },
  cards: [
    {
      id: "thunderstorm-ingredients",
      front: "What three ingredients are required for a thunderstorm?",
      back: "Moisture in the lower atmosphere\n\n• Instability — warm air below, cold air above\n• A lifting mechanism — a front, terrain, or heating",
      sourceTitle: "Severe Weather Study Guide · Section 2",
      assist: {
        ask: "Try asking: Which of the three ingredients is usually supplied by a cold front?",
        explain:
          "Moisture supplies water vapor, instability lets warm air rise rapidly, and lift gives that air its initial upward push.",
        hint: "Think fuel, a reason to rise, and the first push upward.",
        memory: "MIL: Moisture · Instability · Lift.",
      },
    },
    {
      id: "wind-shear",
      front: "Why does wind shear matter in severe thunderstorms?",
      back: "Wind shear changes wind speed or direction with height. It can separate the storm's updraft from its downdraft, helping the storm persist and rotate.",
      sourceTitle: "Severe Weather Study Guide · Section 3",
      assist: {
        ask: "Try asking: How does wind shear help create a supercell?",
        explain:
          "When the updraft and downdraft stay separated, falling rain does not immediately choke off the rising warm air.",
        hint: "Picture the rising and falling air taking different lanes.",
        memory: "Shear separates, separation sustains.",
      },
    },
    {
      id: "fronts",
      front: "How can a cold front trigger thunderstorms?",
      back: "Dense cold air wedges beneath warm, moist air and forces it upward. If the atmosphere is unstable, that lift can initiate deep convection.",
      sourceTitle: "Severe Weather Study Guide · Section 4",
      assist: {
        ask: "Try asking: Why are storms along a cold front often arranged in a line?",
        explain:
          "A front creates an extended lifting boundary, so many updrafts can initiate along the same advancing edge.",
        hint: "Focus on what dense cold air does to the warmer air ahead of it.",
        memory: "Cold wedges; warm rises.",
      },
    },
    {
      id: "updraft",
      front: "What is an updraft?",
      back: "A current of rising air inside a cloud or storm. Strong updrafts carry moisture upward, build tall clouds, and can suspend hailstones while they grow.",
      sourceTitle: "Severe Weather Study Guide · Section 5",
      assist: {
        ask: "Try asking: What controls the strength of an updraft?",
        explain:
          "The greater the buoyancy of a rising air parcel, the more strongly it accelerates upward.",
        hint: "It is the storm's upward-moving air current.",
        memory: "Updraft = upward transport.",
      },
    },
  ],
};

const SOURCE_LABELS: Record<DemoSource, string> = {
  chat: "Chat response",
  education: "Education deck",
  canvas: "Canvas block",
};

function adaptFixtureToCanonical(source: DemoSource): CanonicalFlashcardSet {
  return {
    ...CANONICAL_FIXTURE,
    source: {
      surface: source,
      label: `${CANONICAL_FIXTURE.title} · ${SOURCE_LABELS[source]}`,
      trusted: true,
    },
  };
}

function focusTextSize(text: string): string {
  if (text.length > 220) return "text-[clamp(1rem,3.7vw,1.45rem)]";
  if (text.length > 110) return "text-[clamp(1.25rem,4.8vw,2rem)]";
  return "text-[clamp(1.65rem,6.4vw,3rem)]";
}

function DemoNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
      <p>
        Isolated contract proof. The cards and assist responses are fixtures; no
        production data, persistence, or AI agent is invoked on this route.
      </p>
    </div>
  );
}

function ContractRail({ deck }: { deck: CanonicalFlashcardSet }) {
  return (
    <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-[var(--elevation-1)] lg:flex">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <BadgeCheck className="h-4 w-4 text-success" />
          One input contract
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Chat, Education, and Canvas reshape before render. The player only
          receives the canonical object below.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground">
        <div>
          <span className="text-primary">__kind</span>: &quot;{deck.__kind}
          &quot;
        </div>
        <div>
          <span className="text-primary">id</span>: &quot;{deck.id}&quot;
        </div>
        <div>
          <span className="text-primary">cards</span>: {deck.cards.length}
        </div>
        <div>
          <span className="text-primary">source.surface</span>: &quot;
          {deck.source.surface}&quot;
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          The same renderer owns
        </h2>
        {[
          "Card state and navigation",
          "Tap, swipe, and keyboard behavior",
          "Focused, embedded, and review styles",
          "AI action slots and trust context",
          "Responsive layout and safe-area controls",
        ].map((item) => (
          <div
            key={item}
            className="flex items-start gap-2 text-xs text-muted-foreground"
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            {item}
          </div>
        ))}
      </div>

      <DemoNotice />
    </aside>
  );
}

interface CanonicalPlayerProps {
  deck: CanonicalFlashcardSet;
  style: DisplayStyle;
}

function CanonicalFlashcardPlayer({ deck, style }: CanonicalPlayerProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [assistKind, setAssistKind] = useState<AssistKind | null>(null);
  const [shuffled, setShuffled] = useState(false);
  const [reviewed, setReviewed] = useState<
    Record<string, "again" | "good" | "easy">
  >({});

  const cards = shuffled ? [...deck.cards].reverse() : deck.cards;
  const card = cards[index] ?? cards[0];
  const progress = ((index + 1) / cards.length) * 100;
  const faceText = flipped ? card.back : card.front;

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(cards.length - 1, next)));
    setFlipped(false);
    setAssistKind(null);
    setJumpOpen(false);
  };

  const announceCard = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(faceText));
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => goTo(index + 1),
    onSwipedRight: () => goTo(index - 1),
    onSwipedUp: () => {
      setJumpOpen(false);
      setActionsOpen(true);
    },
    onSwipedDown: () => {
      if (actionsOpen) setActionsOpen(false);
      else setJumpOpen(true);
    },
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  const assistActions: Array<{
    kind: AssistKind;
    label: string;
    icon: typeof BrainCircuit;
  }> = [
    { kind: "ask", label: "Ask AI", icon: MessageCircleQuestion },
    { kind: "explain", label: "Explain", icon: BrainCircuit },
    { kind: "hint", label: "Hint", icon: Lightbulb },
    { kind: "memory", label: "Memory aid", icon: BookmarkCheck },
  ];

  return (
    <section
      {...swipeHandlers}
      aria-label="Canonical flashcard player"
      className={cn(
        "relative isolate flex min-h-0 w-full flex-1 touch-pan-y flex-col overflow-hidden bg-card transition-all duration-300",
        style === "focused" && "h-full",
        style !== "focused" &&
          "my-auto max-h-[820px] rounded-2xl border border-border shadow-[var(--elevation-2)]",
      )}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") goTo(index - 1);
        if (event.key === "ArrowRight") goTo(index + 1);
        if (event.key === " ") {
          event.preventDefault();
          setFlipped((value) => !value);
        }
      }}
      tabIndex={0}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 rounded-full border border-glass-edge bg-glass px-3 py-1.5 text-xs text-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass">
          <span className="font-medium">{deck.title}</span>
          <span className="ml-2 text-muted-foreground">
            {index + 1}/{cards.length}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-11 shrink-0 rounded-full p-0"
          aria-label="Close demo player"
          onClick={() => setActionsOpen(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <button
        type="button"
        className="group relative flex min-h-0 flex-1 cursor-pointer items-center justify-center overflow-hidden bg-primary px-7 pb-24 pt-24 text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? "Show question" : "Show answer"}
      >
        <div className="absolute inset-0 bg-[image:var(--gradient-1)] opacity-20" />
        <div className="relative z-10 max-h-full w-full max-w-3xl overflow-y-auto overscroll-contain scrollbar-hide">
          <div
            className={cn(
              "whitespace-pre-line text-center font-semibold leading-snug text-balance",
              focusTextSize(faceText),
            )}
          >
            {faceText}
          </div>
          <div className="mt-5 text-center text-xs font-medium text-primary-foreground/70">
            {flipped
              ? "Answer · tap to see question"
              : "Question · tap to reveal"}
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-4 z-10 flex items-end justify-between text-primary-foreground/70">
          <span className="flex items-center gap-1 text-[11px]">
            <ChevronLeft className="h-4 w-4" /> swipe
          </span>
          <span className="text-center text-[11px]">
            swipe up for learning tools
          </span>
          <span className="flex items-center gap-1 text-[11px]">
            swipe <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </button>

      {style === "review" && (
        <div className="grid grid-cols-3 gap-2 border-t border-border bg-card p-3">
          {(["again", "good", "easy"] as const).map((grade) => (
            <Button
              key={grade}
              type="button"
              variant={reviewed[card.id] === grade ? "default" : "outline"}
              className="h-11 capitalize"
              onClick={() =>
                setReviewed((value) => ({ ...value, [card.id]: grade }))
              }
            >
              {grade}
            </Button>
          ))}
        </div>
      )}

      <div className="relative z-20 border-t border-border bg-card pb-safe">
        <div className="px-4 pt-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Card {index + 1}</span>
            <span>{Math.round(progress)}% through</span>
            <span>{cards.length} total</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            className="h-14 rounded-none"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-14 rounded-none"
            onClick={() => setFlipped((value) => !value)}
            aria-label="Flip card"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-14 rounded-none"
            onClick={() => setShuffled((value) => !value)}
            aria-label="Reverse card order"
          >
            <Shuffle className={cn("h-5 w-5", shuffled && "text-primary")} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-14 rounded-none"
            onClick={() => goTo(index + 1)}
            disabled={index === cards.length - 1}
            aria-label="Next card"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 border-t border-border text-sm font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => {
            setJumpOpen(false);
            setActionsOpen(true);
          }}
        >
          <BrainCircuit className="h-4 w-4" />
          Learning tools
          <ChevronDown className="h-4 w-4 rotate-180" />
        </button>
      </div>

      {actionsOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[72dvh] flex-col rounded-t-2xl border border-border bg-card shadow-[var(--elevation-3)] pb-safe transition-all [@starting-style]:translate-y-full">
          <button
            type="button"
            className="flex h-11 shrink-0 items-center justify-center"
            onClick={() => setActionsOpen(false)}
            aria-label="Close learning tools"
          >
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
          </button>
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Learn this card
                </h2>
                <p className="text-xs text-muted-foreground">
                  Help stays attached to the current card.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={announceCard}
              >
                <Volume2 className="h-4 w-4" />
                Listen
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {assistActions.map(({ kind, label, icon: Icon }) => (
                <Button
                  key={kind}
                  type="button"
                  variant={assistKind === kind ? "default" : "outline"}
                  className="h-12 justify-start gap-2"
                  onClick={() => setAssistKind(kind)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>

            {assistKind && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm leading-relaxed text-foreground [@starting-style]:translate-y-2 [@starting-style]:opacity-0 transition-all">
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Demo action result
                </div>
                {card.assist[assistKind]}
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                Source and trust
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {card.sourceTitle}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Entered through {SOURCE_LABELS[deck.source.surface]}; rendered
                from the same canonical set.
              </p>
            </div>

            <DemoNotice />
          </div>
        </div>
      )}

      {jumpOpen && (
        <div className="absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border border-border bg-card p-4 pb-safe shadow-[var(--elevation-3)] [@starting-style]:translate-y-full transition-transform">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Jump to card
              </h2>
              <p className="text-xs text-muted-foreground">
                Swipe down on the card to open this filmstrip.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 p-0"
              onClick={() => setJumpOpen(false)}
              aria-label="Close card filmstrip"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto overscroll-contain pb-2 scrollbar-thin">
            {cards.map((item, cardIndex) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex h-28 w-24 shrink-0 flex-col justify-between rounded-xl border bg-muted p-2 text-left text-xs text-foreground transition-colors",
                  cardIndex === index
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:bg-accent",
                )}
                onClick={() => goTo(cardIndex)}
              >
                <span className="line-clamp-4">{item.front}</span>
                <span className="text-[10px] text-muted-foreground">
                  Card {cardIndex + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function CanonicalFlashcardsRefineDemoPage() {
  const [source, setSource] = useState<DemoSource>("chat");
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>("focused");
  const deck = adaptFixtureToCanonical(source);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured text-foreground">
      <header className="shrink-0 border-b border-border bg-card px-3 py-2 sm:px-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-primary" />
              <h1 className="truncate text-[clamp(1rem,0.9rem+0.35vw,1.25rem)] font-semibold">
                Canonical flashcards · Refine
              </h1>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Quizlet-inspired clarity, preserving the current focused gestures
              and hierarchy.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-lg border border-border bg-muted p-0.5"
              aria-label="Fixture entry surface"
            >
              {(["chat", "education", "canvas"] as const).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={source === item ? "default" : "ghost"}
                  className="h-9 px-2.5 text-xs capitalize"
                  onClick={() => setSource(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
            <div
              className="flex rounded-lg border border-border bg-muted p-0.5"
              aria-label="Display style"
            >
              {(["focused", "embedded", "review"] as const).map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={displayStyle === item ? "default" : "ghost"}
                  className="h-9 gap-1.5 px-2.5 text-xs capitalize"
                  onClick={() => setDisplayStyle(item)}
                >
                  {item === "focused" ? (
                    <Maximize2 className="h-3.5 w-3.5" />
                  ) : item === "embedded" ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <CircleHelp className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{item}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 gap-4 p-0 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-4">
        <div
          className={cn(
            "flex min-h-0",
            displayStyle === "focused" ? "h-full" : "p-3 lg:p-0",
          )}
        >
          <CanonicalFlashcardPlayer
            key={`${source}-${displayStyle}`}
            deck={deck}
            style={displayStyle}
          />
        </div>
        <ContractRail deck={deck} />
      </div>
    </main>
  );
}
