"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FlipHorizontal2,
  GraduationCap,
  Headphones,
  Lightbulb,
  Link2,
  Maximize2,
  Milestone,
  MessageCircleQuestion,
  Minimize2,
  PanelBottomOpen,
  RotateCcw,
  ShieldCheck,
  Volume2,
} from "lucide-react";

type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string;
  memoryAid: string;
  source: {
    title: string;
    section: string;
    confidence: "Verified";
  };
};

type FlashcardSetFixture = {
  __kind: "flashcard_set";
  id: string;
  title: string;
  subject: string;
  cards: Flashcard[];
};

type Surface = "chat" | "education" | "canvas";
type Presentation = "focus" | "guided" | "compact";
type AssistMode = "home" | "ask" | "explain" | "hint" | "memory" | "trust";

const FLASHCARD_SET: FlashcardSetFixture = {
  __kind: "flashcard_set",
  id: "demo-severe-weather",
  title: "Severe Weather Essentials",
  subject: "Meteorology",
  cards: [
    {
      id: "ingredients",
      front: "What three ingredients are required for a thunderstorm to form?",
      back: "Moisture in the lower atmosphere, instability, and a lifting mechanism such as a front, terrain, or surface heating.",
      hint: "Think fuel, buoyancy, and a trigger.",
      memoryAid: "MIL: Moisture, Instability, Lift.",
      source: {
        title: "NOAA JetStream",
        section: "Thunderstorm Ingredients",
        confidence: "Verified",
      },
    },
    {
      id: "supercell",
      front: "What separates a supercell from an ordinary thunderstorm?",
      back: "A persistent, rotating updraft called a mesocyclone, supported by strong vertical wind shear.",
      hint: "The defining feature is inside the updraft.",
      memoryAid: "Supercells spin: remember the rotating mesocyclone.",
      source: {
        title: "National Weather Service",
        section: "Supercell Structure",
        confidence: "Verified",
      },
    },
    {
      id: "hail",
      front: "Why can strong thunderstorm updrafts produce large hail?",
      back: "They repeatedly carry ice above the freezing level, allowing new layers to accumulate before gravity overcomes the updraft.",
      hint: "Picture an ice particle cycling through a freezer.",
      memoryAid: "Up, layer, fall: stronger lift means more layers.",
      source: {
        title: "UCAR Center for Science Education",
        section: "How Hail Forms",
        confidence: "Verified",
      },
    },
    {
      id: "warning",
      front:
        "What is the difference between a severe thunderstorm watch and warning?",
      back: "A watch means conditions are favorable in a broad area. A warning means severe weather is occurring or imminent in a specific area.",
      hint: "Preparation versus immediate action.",
      memoryAid: "Watch: be ready. Warning: act now.",
      source: {
        title: "National Weather Service",
        section: "Watch vs. Warning",
        confidence: "Verified",
      },
    },
  ],
};

const SURFACE_PRESENTATION: Record<Surface, Presentation> = {
  chat: "focus",
  education: "guided",
  canvas: "compact",
};

const SURFACE_LABELS: Record<Surface, string> = {
  chat: "Chat",
  education: "Education",
  canvas: "Canvas",
};

const ASSIST_ACTIONS = [
  { id: "ask", label: "Ask coach", icon: MessageCircleQuestion },
  { id: "explain", label: "Explain", icon: BrainCircuit },
  { id: "hint", label: "Get a clue", icon: Lightbulb },
  { id: "memory", label: "Memory hook", icon: Milestone },
  { id: "trust", label: "Check source", icon: ShieldCheck },
] as const;

const presentationCopy: Record<
  Presentation,
  { label: string; description: string }
> = {
  focus: {
    label: "Focus",
    description: "Immersive card with controls on demand",
  },
  guided: {
    label: "Guided",
    description: "Study tools remain one gesture away",
  },
  compact: { label: "Compact", description: "Fits a bounded Canvas workspace" },
};

function ActionButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border px-3 text-[clamp(0.75rem,0.7rem+0.2vw,0.875rem)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent"
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function CanonicalStudyCockpit({ sourceSurface }: { sourceSurface: Surface }) {
  const presentation = SURFACE_PRESENTATION[sourceSurface];
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDockOpen, setIsDockOpen] = useState(presentation !== "focus");
  const [isFilmstripOpen, setIsFilmstripOpen] = useState(false);
  const [assistMode, setAssistMode] = useState<AssistMode>("home");
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const card = FLASHCARD_SET.cards[cardIndex];
  const progress = ((cardIndex + 1) / FLASHCARD_SET.cards.length) * 100;

  function moveCard(direction: -1 | 1) {
    setCardIndex((current) => {
      const next = current + direction;
      return Math.min(Math.max(next, 0), FLASHCARD_SET.cards.length - 1);
    });
    setIsFlipped(false);
    setAssistMode("home");
    setSubmittedQuestion("");
  }

  function readCurrentSide() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      isFlipped ? card.back : card.front,
    );
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY)) {
      moveCard(deltaX < 0 ? 1 : -1);
      return;
    }
    if (deltaY < -55) {
      setIsDockOpen(true);
    }
  }

  function renderAssistContent() {
    if (assistMode === "ask") {
      return (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = question.trim();
            if (trimmed) setSubmittedQuestion(trimmed);
          }}
        >
          <label
            htmlFor="coach-question"
            className="block text-sm font-medium text-foreground"
          >
            Ask about this card
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="coach-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Why does the lifting mechanism matter?"
              className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              style={{ fontSize: "16px" }}
            />
            <button
              type="submit"
              className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Prepare question
            </button>
          </div>
          {submittedQuestion ? (
            <div className="rounded-xl border border-info/30 bg-info/10 p-3 text-sm text-foreground">
              <p className="font-medium">Agent handoff contract</p>
              <p className="mt-1 text-muted-foreground">
                This proof would send “{submittedQuestion}” as human input with
                the card, deck, side, and source as named context—not a second
                flashcard renderer.
              </p>
            </div>
          ) : null}
        </form>
      );
    }

    if (assistMode === "explain") {
      return (
        <AssistNote
          icon={<BrainCircuit className="h-5 w-5" />}
          title="Explanation contract"
          text="The canonical player sends the visible card and study position to the education explanation mandate, then displays the streamed answer in the platform’s standard live-run surface."
        />
      );
    }

    if (assistMode === "hint") {
      return (
        <AssistNote
          icon={<Lightbulb className="h-5 w-5" />}
          title="Clue"
          text={card.hint}
        />
      );
    }

    if (assistMode === "memory") {
      return (
        <AssistNote
          icon={<Milestone className="h-5 w-5" />}
          title="Memory hook"
          text={card.memoryAid}
        />
      );
    }

    if (assistMode === "trust") {
      return (
        <AssistNote
          icon={<ShieldCheck className="h-5 w-5" />}
          title={`${card.source.confidence} source`}
          text={`${card.source.title} · ${card.source.section}`}
        />
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ASSIST_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => setAssistMode(action.id)}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 text-center text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-5 w-5 text-primary" />
              {action.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className={`@container relative flex w-full flex-col overflow-hidden rounded-[1.75rem] border border-border bg-card-textured shadow-[var(--elevation-3)] ${
        presentation === "compact"
          ? "h-[min(720px,82dvh)]"
          : "h-[min(820px,86dvh)]"
      }`}
      aria-label={`${presentationCopy[presentation].label} flashcard player`}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-glass px-3 backdrop-blur-glass backdrop-saturate-glass sm:px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {FLASHCARD_SET.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {SURFACE_LABELS[sourceSurface]} selects{" "}
            {presentationCopy[presentation].label.toLowerCase()} presentation
          </p>
        </div>
        <span className="hidden rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground @sm:inline-flex">
          {FLASHCARD_SET.__kind}
        </span>
        <span className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground">
          {presentation === "focus" ? (
            <Maximize2 className="h-4 w-4" />
          ) : (
            <Minimize2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {presentation === "focus" ? "Focused" : "Bounded"}
          </span>
        </span>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-none select-none flex-col bg-textured"
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={handlePointerEnd}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-primary/40" />
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {String(cardIndex + 1).padStart(2, "0")} /{" "}
            {String(FLASHCARD_SET.cards.length).padStart(2, "0")}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsFilmstripOpen((open) => !open);
            }}
            className="flex h-10 items-center gap-2 rounded-xl px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpenCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Jump to card</span>
          </button>
        </div>

        {isFilmstripOpen ? (
          <div className="grid shrink-0 grid-cols-4 gap-2 border-y border-border bg-card/80 p-3 [@starting-style]:opacity-0 [@starting-style]:-translate-y-2 transition-all sm:px-6">
            {FLASHCARD_SET.cards.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setCardIndex(index);
                  setIsFlipped(false);
                  setIsFilmstripOpen(false);
                }}
                className={`min-h-14 rounded-xl border p-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  index === cardIndex
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                <span className="block font-semibold tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-1 hidden line-clamp-1 @md:block">
                  {item.front}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 items-stretch justify-center px-3 pb-2 sm:px-6">
          <button
            type="button"
            aria-label={isFlipped ? "Show question" : "Show answer"}
            onClick={() => setIsFlipped((flipped) => !flipped)}
            className="group relative flex w-full max-w-5xl flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-border bg-card p-[clamp(1.25rem,4vw,4rem)] text-center shadow-[var(--elevation-2)] transition-all duration-300 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="absolute left-4 top-4 rounded-full border border-border bg-muted px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:left-6 sm:top-6">
              {isFlipped ? "Answer" : "Prompt"}
            </span>
            <div className="absolute right-4 top-4 flex items-center gap-1 text-xs text-muted-foreground sm:right-6 sm:top-6">
              <FlipHorizontal2 className="h-4 w-4" />
              <span className="hidden sm:inline">Tap to flip</span>
            </div>
            <p className="max-w-4xl text-balance text-[clamp(1.35rem,2.5vw+0.7rem,3.5rem)] font-semibold leading-[1.13] tracking-[-0.025em] text-foreground">
              {isFlipped ? card.back : card.front}
            </p>
            <p className="absolute bottom-4 text-xs text-muted-foreground sm:bottom-6">
              Swipe sideways to navigate · Swipe up for learning tools
            </p>
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-6">
          <ActionButton label="Previous" onClick={() => moveCard(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </ActionButton>
          <div className="flex items-center gap-2">
            <ActionButton label="Listen" onClick={readCurrentSide}>
              <Volume2 className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label="Flip"
              onClick={() => setIsFlipped((flipped) => !flipped)}
            >
              <RotateCcw className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label="Learning tools"
              onClick={() => setIsDockOpen((open) => !open)}
              active={isDockOpen}
            >
              <PanelBottomOpen className="h-4 w-4" />
            </ActionButton>
          </div>
          <ActionButton label="Next" onClick={() => moveCard(1)}>
            <ArrowRight className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>

      <div
        className={`shrink-0 border-t border-border bg-glass backdrop-blur-glass backdrop-saturate-glass transition-[max-height] duration-300 ${
          isDockOpen ? "max-h-[42dvh]" : "max-h-12"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setIsDockOpen((open) => !open);
            if (isDockOpen) setAssistMode("home");
          }}
          className="flex h-12 w-full items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {isDockOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
          Learning dock
        </button>
        {isDockOpen ? (
          <div className="max-h-[calc(42dvh-3rem)] overflow-y-auto overscroll-contain px-3 pb-safe sm:px-6 sm:pb-4">
            {assistMode !== "home" ? (
              <button
                type="button"
                onClick={() => setAssistMode("home")}
                className="mb-2 flex h-10 items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                All learning tools
              </button>
            ) : null}
            {renderAssistContent()}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AssistNote({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-primary/25 bg-primary/10 p-4 [@starting-style]:opacity-0 [@starting-style]:translate-y-2 transition-all">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      </div>
    </div>
  );
}

export default function CanonicalFlashcardsReimaginePage() {
  const [sourceSurface, setSourceSurface] = useState<Surface>("chat");
  const presentation = SURFACE_PRESENTATION[sourceSurface];

  return (
    <main className="min-h-dvh bg-textured px-3 py-5 text-foreground sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="grid gap-4 rounded-2xl border border-border bg-glass p-4 shadow-glass backdrop-blur-glass backdrop-saturate-glass lg:grid-cols-[1fr_auto] lg:items-center lg:p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-foreground">
                Isolated contract proof
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5" />
                No production data path
              </span>
            </div>
            <h1 className="text-[clamp(1.35rem,1.05rem+1.4vw,2.5rem)] font-semibold tracking-[-0.025em]">
              One study cockpit, selected by context
            </h1>
            <p className="mt-1 max-w-3xl text-[clamp(0.875rem,0.82rem+0.2vw,1rem)] text-muted-foreground">
              Every surface sends the same{" "}
              <code className="font-mono text-foreground">flashcard_set</code>{" "}
              contract into one player. The host chooses a presentation—not a
              renderer.
            </p>
          </div>

          <div
            className="rounded-2xl border border-border bg-card p-1"
            aria-label="Demo source surface"
          >
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(SURFACE_LABELS) as Surface[]).map((surface) => (
                <button
                  key={surface}
                  type="button"
                  onClick={() => setSourceSurface(surface)}
                  className={`min-h-11 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm ${
                    surface === sourceSurface
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {SURFACE_LABELS[surface]}
                </button>
              ))}
            </div>
            <p className="px-2 py-1.5 text-center text-[0.7rem] text-muted-foreground">
              {presentationCopy[presentation].description}
            </p>
          </div>
        </header>

        <CanonicalStudyCockpit
          key={sourceSurface}
          sourceSurface={sourceSurface}
        />

        <footer className="grid gap-3 pb-safe sm:grid-cols-3">
          <ProofPoint
            icon={<CircleHelp className="h-4 w-4" />}
            title="One input contract"
          >
            The fixture retains{" "}
            <code className="font-mono">__kind: flashcard_set</code> from entry
            to render.
          </ProofPoint>
          <ProofPoint
            icon={<Headphones className="h-4 w-4" />}
            title="One capability dock"
          >
            Navigation, audio, AI handoff, hints, memory aids, and trust live
            beside every presentation.
          </ProofPoint>
          <ProofPoint
            icon={<FlipHorizontal2 className="h-4 w-4" />}
            title="One gesture model"
          >
            Tap flips, horizontal swipe moves, and upward swipe opens learning
            tools everywhere.
          </ProofPoint>
        </footer>
      </div>
    </main>
  );
}

function ProofPoint({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </p>
      <p className="mt-1.5 leading-relaxed">{children}</p>
    </div>
  );
}
