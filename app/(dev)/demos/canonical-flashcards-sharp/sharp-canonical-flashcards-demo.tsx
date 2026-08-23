"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  ExternalLink,
  GripHorizontal,
  Headphones,
  Lightbulb,
  List,
  MessageCircleQuestion,
  RotateCcw,
  ShieldCheck,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LearningAction = "ask" | "explain" | "hint" | "memory";

interface DemoTrustEnvelope {
  __kind: "trust_envelope";
  confidence: number;
  groundedIn: string;
  sourceUrl: string;
}

interface DemoFlashcard {
  __kind: "enhanced_flashcard";
  id: string;
  front: string;
  back: string;
  topic: string;
  difficulty: "Intro" | "Core" | "Challenge";
  trust: DemoTrustEnvelope;
}

interface DemoFlashcardSet {
  __kind: "flashcard_set";
  title: string;
  cards: DemoFlashcard[];
}

const DEMO_SET: DemoFlashcardSet = {
  __kind: "flashcard_set",
  title: "Severe Weather Essentials",
  cards: [
    {
      __kind: "enhanced_flashcard",
      id: "weather-01",
      front: "What three ingredients are needed for a thunderstorm to form?",
      back: "Moisture, atmospheric instability, and a lifting mechanism.",
      topic: "Thunderstorm formation",
      difficulty: "Intro",
      trust: {
        __kind: "trust_envelope",
        confidence: 0.98,
        groundedIn: "NOAA National Severe Storms Laboratory",
        sourceUrl:
          "https://www.nssl.noaa.gov/education/svrwx101/thunderstorms/",
      },
    },
    {
      __kind: "enhanced_flashcard",
      id: "weather-02",
      front: "Why does wind shear help a thunderstorm become organized?",
      back: "It separates the storm's updraft from its downdraft, allowing the updraft to keep feeding warm, moist air into the storm for longer.",
      topic: "Storm organization",
      difficulty: "Core",
      trust: {
        __kind: "trust_envelope",
        confidence: 0.96,
        groundedIn: "NOAA JetStream",
        sourceUrl: "https://www.noaa.gov/jetstream/thunderstorms",
      },
    },
    {
      __kind: "enhanced_flashcard",
      id: "weather-03",
      front: "What distinguishes a supercell from an ordinary thunderstorm?",
      back: "A supercell contains a persistent, rotating updraft called a mesocyclone. That rotation makes the storm long-lived and capable of producing especially severe weather.",
      topic: "Supercells",
      difficulty: "Challenge",
      trust: {
        __kind: "trust_envelope",
        confidence: 0.97,
        groundedIn: "NOAA National Severe Storms Laboratory",
        sourceUrl:
          "https://www.nssl.noaa.gov/education/svrwx101/thunderstorms/types/",
      },
    },
    {
      __kind: "enhanced_flashcard",
      id: "weather-04",
      front: "What is the safest response when thunder is audible?",
      back: "Move inside a substantial building or a hard-topped vehicle and remain there for at least 30 minutes after the last thunder.",
      topic: "Lightning safety",
      difficulty: "Core",
      trust: {
        __kind: "trust_envelope",
        confidence: 0.99,
        groundedIn: "National Weather Service",
        sourceUrl: "https://www.weather.gov/safety/lightning",
      },
    },
  ],
};

const ACTIONS: Array<{
  id: LearningAction;
  label: string;
  detail: string;
  icon: typeof BrainCircuit;
}> = [
  {
    id: "ask",
    label: "Ask AI",
    detail: "Ask a follow-up about this card",
    icon: MessageCircleQuestion,
  },
  {
    id: "explain",
    label: "Explain",
    detail: "Teach it another way",
    icon: BrainCircuit,
  },
  {
    id: "hint",
    label: "Hint",
    detail: "Get a nudge without the answer",
    icon: Lightbulb,
  },
  {
    id: "memory",
    label: "Memory aid",
    detail: "Build a mnemonic",
    icon: CircleHelp,
  },
];

function cardTextSize(content: string) {
  if (content.length > 170) {
    return "text-[clamp(1.05rem,3.2cqw,2.1rem)] leading-snug";
  }
  if (content.length > 90) {
    return "text-[clamp(1.2rem,4.2cqw,2.8rem)] leading-snug";
  }
  return "text-[clamp(1.5rem,5.5cqw,3.8rem)] leading-tight";
}

function ActionContract({
  action,
  card,
  onClose,
}: {
  action: LearningAction;
  card: DemoFlashcard;
  onClose: () => void;
}) {
  const selected = ACTIONS.find((item) => item.id === action);
  const Icon = selected?.icon ?? BrainCircuit;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 [@starting-style]:translate-y-2 [@starting-style]:opacity-0 transition-all duration-200">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">{selected?.label}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              contract preview
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A canonical player can launch the same education mandate from chat,
            Education, or Canvas with these named variables.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-background/70 p-2 font-mono text-[11px]">
            <dt className="text-muted-foreground">action</dt>
            <dd className="truncate text-foreground">flashcards.{action}</dd>
            <dt className="text-muted-foreground">card_id</dt>
            <dd className="truncate text-foreground">{card.id}</dd>
            <dt className="text-muted-foreground">source</dt>
            <dd className="truncate text-foreground">flashcard_set</dd>
          </dl>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label="Close action contract"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function SharpCanonicalFlashcardsDemo() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<LearningAction | null>(
    null,
  );
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const card = DEMO_SET.cards[index];
  const progress = ((index + 1) / DEMO_SET.cards.length) * 100;

  const goTo = (nextIndex: number) => {
    const bounded = Math.max(0, Math.min(DEMO_SET.cards.length - 1, nextIndex));
    setIndex(bounded);
    setFlipped(false);
    setSelectedAction(null);
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(
      new SpeechSynthesisUtterance(flipped ? card.back : card.front),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
      goTo(index + (dx < 0 ? 1 : -1));
      return;
    }
    if (Math.abs(dy) > 56 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) setToolsOpen(true);
      else setFilmstripOpen(true);
      return;
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) setFlipped((value) => !value);
  };

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-textured text-foreground">
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-glass px-3 backdrop-blur-glass backdrop-saturate-glass sm:px-5">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          asChild
        >
          <Link
            href="/demos/canonical-flashcards"
            aria-label="Back to canonical flashcard demos"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[clamp(0.95rem,0.9rem+0.25vw,1.1rem)] font-semibold">
              {DEMO_SET.title}
            </h1>
            <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary sm:inline">
              sharp proof
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            One canonical player · focused style · fixture contract
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10 px-3"
          onClick={() => setToolsOpen(true)}
        >
          <BrainCircuit className="h-4 w-4" />
          <span className="hidden sm:inline">Learning tools</span>
        </Button>
      </header>

      <section className="relative flex min-h-0 flex-1 items-stretch justify-center overflow-hidden p-2 sm:p-4 lg:p-6">
        <div className="relative flex w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elevation-2)] @container">
          <div className="flex shrink-0 items-center gap-3 px-4 py-3">
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {card.topic}
            </span>
            <span className="text-xs text-muted-foreground">
              {card.difficulty}
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {index + 1} of {DEMO_SET.cards.length}
            </span>
          </div>
          <div className="h-1 shrink-0 bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div
            className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden px-7 py-8 sm:px-14"
            role="button"
            tabIndex={0}
            aria-label={
              flipped
                ? "Showing answer. Tap to show question."
                : "Showing question. Tap to reveal answer."
            }
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                setFlipped((value) => !value);
              }
              if (event.key === "ArrowLeft") goTo(index - 1);
              if (event.key === "ArrowRight") goTo(index + 1);
              if (event.key === "ArrowUp") setToolsOpen(true);
              if (event.key === "ArrowDown") setFilmstripOpen(true);
            }}
            onPointerDown={(event) => {
              pointerStart.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerStart.current = null;
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 z-10 hidden h-11 w-11 rounded-full bg-background/70 sm:inline-flex"
              disabled={index === 0}
              aria-label="Previous card"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                goTo(index - 1);
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex h-full w-full max-w-3xl flex-col items-center justify-center text-center">
              <span className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                {flipped ? "Answer" : "Question"}
              </span>
              <p
                key={`${card.id}-${flipped ? "back" : "front"}`}
                className={cn(
                  "max-h-full overflow-hidden font-semibold text-balance text-foreground transition-all duration-200 [@starting-style]:translate-y-2 [@starting-style]:opacity-0",
                  cardTextSize(flipped ? card.back : card.front),
                )}
              >
                {flipped ? card.back : card.front}
              </p>
              <div className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                Tap to {flipped ? "see question" : "reveal answer"}
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 z-10 hidden h-11 w-11 rounded-full bg-background/70 sm:inline-flex"
              disabled={index === DEMO_SET.cards.length - 1}
              aria-label="Next card"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                goTo(index + 1);
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="shrink-0 border-t border-border bg-muted/30 px-3 py-2">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="h-11 min-w-11 px-3"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <Button
                variant="ghost"
                className="h-11 px-3 text-muted-foreground"
                onClick={() => setToolsOpen(true)}
              >
                <ChevronUp className="h-4 w-4" />
                <span>Swipe up for learning tools</span>
              </Button>
              <Button
                variant="ghost"
                className="h-11 min-w-11 px-3"
                onClick={() => goTo(index + 1)}
                disabled={index === DEMO_SET.cards.length - 1}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <footer className="flex shrink-0 items-center justify-center px-3 pb-safe">
        <Button
          variant="ghost"
          className="h-11 text-muted-foreground"
          onClick={() => setFilmstripOpen((value) => !value)}
        >
          {filmstripOpen ? <ChevronDown /> : <ChevronUp />}
          <List className="h-4 w-4" />
          Jump to card
        </Button>
      </footer>

      {filmstripOpen && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-glass-edge bg-glass pb-safe shadow-glass-lg backdrop-blur-glass backdrop-saturate-glass [@starting-style]:translate-y-full transition-transform duration-200">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <List className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Jump to card</p>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-10 w-10"
              onClick={() => setFilmstripOpen(false)}
              aria-label="Close card filmstrip"
            >
              <X />
            </Button>
          </div>
          <div className="flex snap-x gap-2 overflow-x-auto p-3 scrollbar-thin">
            {DEMO_SET.cards.map((item, itemIndex) => (
              <Button
                key={item.id}
                variant="outline"
                className={cn(
                  "h-24 w-32 shrink-0 snap-center flex-col items-start justify-between whitespace-normal p-3 text-left",
                  itemIndex === index && "border-primary bg-primary/10",
                )}
                onClick={() => {
                  goTo(itemIndex);
                  setFilmstripOpen(false);
                }}
              >
                <span className="line-clamp-3 text-xs leading-snug">
                  {item.front}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Card {itemIndex + 1}
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {toolsOpen && (
        <div
          className="absolute inset-0 z-40 flex items-end bg-background/45"
          onClick={() => setToolsOpen(false)}
        >
          <section
            className="flex max-h-[82dvh] w-full flex-col rounded-t-2xl border border-glass-edge bg-glass pb-safe shadow-glass-lg backdrop-blur-glass backdrop-saturate-glass [@starting-style]:translate-y-full transition-transform duration-200"
            aria-label="Learning tools"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 flex-col items-center border-b border-border px-4 pb-3 pt-2">
              <GripHorizontal className="h-5 w-8 text-muted-foreground" />
              <div className="mt-1 flex w-full max-w-3xl items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BrainCircuit className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">Learn this card</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {card.topic}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setToolsOpen(false)}
                  aria-label="Close learning tools"
                >
                  <X />
                </Button>
              </div>
            </div>

            <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain p-4 scrollbar-thin">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.id}
                      variant="outline"
                      className={cn(
                        "h-auto min-h-24 flex-col items-start whitespace-normal p-3 text-left",
                        selectedAction === action.id &&
                          "border-primary bg-primary/10",
                      )}
                      onClick={() => setSelectedAction(action.id)}
                    >
                      <Icon className="mb-2 h-5 w-5 text-primary" />
                      <span className="w-full font-semibold">
                        {action.label}
                      </span>
                      <span className="w-full text-[11px] font-normal leading-snug text-muted-foreground">
                        {action.detail}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {selectedAction && (
                <div className="mt-3">
                  <ActionContract
                    action={selectedAction}
                    card={card}
                    onClose={() => setSelectedAction(null)}
                  />
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-12 justify-start"
                  onClick={speak}
                >
                  <Volume2 className="h-4 w-4 text-primary" />
                  Read {flipped ? "answer" : "question"} aloud
                  <Headphones className="ml-auto h-4 w-4 text-muted-foreground" />
                </Button>
                <a
                  href={card.trust.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-background px-4 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Source verified</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {card.trust.groundedIn} ·{" "}
                      {Math.round(card.trust.confidence * 100)}%
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p>
                  Isolated contract proof: interactions are local, audio uses
                  the browser, and AI actions show the intended mandate handoff.
                  No production route, persistence, or agent execution is
                  connected here.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
