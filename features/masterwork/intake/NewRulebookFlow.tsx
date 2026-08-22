"use client";

// features/masterwork/intake/NewRulebookFlow.tsx
//
// The guided start of Masterwork Distillation — a full page, in the house
// guided-intake pattern (exemplars: /research/topics/new, the podcast
// GeneratorForm, the app builder): big default-filled option buttons the
// Expert can click straight through, never small chip bubbles.
//
// Two steps, URL-driven like the research wizard (?step=2):
//
// 1. What are you building — one free-text goal plus four questions rendered
//    as large color-coded option tiles. EVERY question has a sensible default
//    pre-selected, so the only thing the Expert must do is say the goal.
//    Answers land on metadata.intake, where the Scout reads them so it never
//    re-asks.
// 2. "How do you want to do this?" — the Approach picker. The cards are the
//    ENABLED rows of the platform.approach registry (never a hardcoded list —
//    "intake is a registry of Approaches, never a hardcoded flow"). The
//    knowledge answer marks one card Suggested and pre-selects it; the row's
//    own intake_query routes the Expert into that Approach's surface.
//
// Draft durability: every input mirrors into the persisted generic
// wizard-draft slice (the same primitive the research wizard uses), so a
// refresh or a wander-off recovers the Expert's words. Cleared on create.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpen,
  Brain,
  Building2,
  Check,
  FileText,
  Frown,
  Globe,
  HelpCircle,
  Loader2,
  MessagesSquare,
  Network,
  Puzzle,
  ThumbsDown,
  User,
  UserMinus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  patchWizardDraft,
  clearWizardDraft,
  selectWizardDraft,
} from "@/lib/redux/slices/wizardDraftSlice";
import { createDraftRulebook } from "../service";
import {
  fetchDistillationApproaches,
  startableApproaches,
  type DistillationApproach,
} from "../browse/approaches";
import { ApproachCard, ACCENT } from "../browse/ApproachCard";

const WIZARD_ID = "masterwork-new";

// ── The four questions, as big guided option tiles ───────────────────────────
//
// The stored VALUES are the exact strings the Scout already reads from
// metadata.intake — presentation changed, the contract did not.

interface IntakeOption {
  value: string;
  label: string;
  helper: string;
  icon: LucideIcon;
}

interface IntakeQuestion {
  key: "who" | "knowledge" | "stakes" | "benchmark";
  title: string;
  /** Tailwind color family for this question's tiles. */
  accent: "blue" | "amber" | "rose" | "violet";
  options: IntakeOption[];
  /** Pre-selected so the Expert can click straight through. */
  defaultValue: string;
}

const QUESTIONS: IntakeQuestion[] = [
  {
    key: "who",
    title: "Who will actually run this?",
    accent: "blue",
    defaultValue: "Just me",
    options: [
      { value: "Just me", label: "Just me", helper: "My own assistant", icon: User },
      { value: "My team", label: "My team", helper: "The people I work with", icon: Users },
      { value: "A department", label: "A department", helper: "One part of the company", icon: Network },
      { value: "The whole company", label: "The whole company", helper: "Everyone here", icon: Building2 },
      { value: "Customers", label: "Customers", helper: "People outside", icon: Globe },
    ],
  },
  {
    key: "knowledge",
    title: "Where does the knowledge live today?",
    accent: "amber",
    defaultValue: "In my head",
    options: [
      { value: "In my head", label: "In my head", helper: "I just know it", icon: Brain },
      { value: "Split across people", label: "Split across people", helper: "A few of us hold it", icon: Users },
      {
        value: "Written down (docs, SOPs, past work)",
        label: "Written down",
        helper: "Docs, SOPs, past work",
        icon: FileText,
      },
      {
        value: "Someone else's material (a book, a course)",
        label: "Someone else's material",
        helper: "A book or a course",
        icon: BookOpen,
      },
      { value: "Not sure", label: "Not sure", helper: "Help me figure it out", icon: HelpCircle },
    ],
  },
  {
    key: "stakes",
    title: "If it gets something wrong, that's…",
    accent: "rose",
    defaultValue: "Costs money",
    options: [
      { value: "Embarrassing", label: "Embarrassing", helper: "Awkward, fixable", icon: Frown },
      { value: "Costs money", label: "Costs money", helper: "Real dollars lost", icon: Banknote },
      { value: "Costs a client", label: "Costs a client", helper: "A relationship at risk", icon: UserMinus },
      { value: "Serious harm", label: "Serious harm", helper: "People could get hurt", icon: AlertTriangle },
    ],
  },
  {
    key: "benchmark",
    title: "If you handed this to ChatGPT today, how would it do?",
    accent: "violet",
    defaultValue: "Haven't tried",
    options: [
      { value: "It can't do it", label: "It can't do it", helper: "Not even close", icon: XCircle },
      { value: "It does it badly", label: "It does it badly", helper: "Wrong in ways I can see", icon: ThumbsDown },
      {
        value: "It takes several chats",
        label: "It takes several chats",
        helper: "I have to keep steering",
        icon: MessagesSquare,
      },
      {
        value: "It doesn't have my context",
        label: "It doesn't have my context",
        helper: "It can't know what I know",
        icon: Puzzle,
      },
      { value: "Haven't tried", label: "Haven't tried", helper: "This is my first go", icon: HelpCircle },
    ],
  },
];

// The accent map now lives beside the shared ApproachCard (browse/ApproachCard.tsx)
// — the question tiles below and the Approach cards have always used one
// palette, and it may only be declared once.

/**
 * Which Approach the knowledge answer suggests — a soft hint (badge +
 * preselect), never a route. The Expert always sees every enabled card.
 */
function suggestedApproachKey(knowledge: string): string {
  if (
    knowledge === "Written down (docs, SOPs, past work)" ||
    knowledge === "Someone else's material (a book, a course)"
  ) {
    return "source";
  }
  return "interview";
}

/**
 * Derive a Rulebook name from the goal: at most `max` characters, truncated on
 * a word boundary so the name never ends mid-word.
 */
function nameFromGoal(goal: string, max = 60): string {
  const clean = goal.trim().replace(/[.!?]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.!?,;:]+$/, "");
}

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-full", "bg-primary")} />
        <div className={cn("h-px w-10", step >= 2 ? "bg-primary/50" : "bg-border")} />
        <div className={cn("h-2 w-2 rounded-full", step >= 2 ? "bg-primary" : "bg-border")} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{step} / 2</span>
    </div>
  );
}

function OptionTile({
  option,
  accent,
  selected,
  onSelect,
}: {
  option: IntakeOption;
  accent: keyof typeof ACCENT;
  selected: boolean;
  onSelect: () => void;
}) {
  const look = ACCENT[accent];
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex min-h-[44px] w-full flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all",
        selected ? cn(look.selected, "shadow-sm") : cn("border-border bg-card", look.hover),
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          selected ? look.iconSelected : look.icon,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium leading-tight text-foreground">
        {option.label}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">
        {option.helper}
      </span>
      {selected && (
        <Check className={cn("absolute right-2.5 top-2.5 h-4 w-4", look.check)} />
      )}
    </button>
  );
}

function QuestionSection({
  question,
  value,
  onChange,
}: {
  question: IntakeQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">{question.title}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {question.options.map((opt) => (
          <OptionTile
            key={opt.value}
            option={opt}
            accent={question.accent}
            selected={value === opt.value}
            onSelect={() => onChange(opt.value)}
          />
        ))}
      </div>
    </section>
  );
}

// ── Main flow ────────────────────────────────────────────────────────────────

export function NewRulebookFlow() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const draft = useAppSelector(selectWizardDraft(WIZARD_ID));
  const [, startTransition] = useTransition();

  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  // Every question starts on its sensible default — the Expert can click
  // straight through without touching any of them.
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(QUESTIONS.map((q) => [q.key, q.defaultValue])),
  );
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(null);
  const [approachError, setApproachError] = useState<string | null>(null);
  // null = follow the suggestion; a string = the Expert's explicit pick.
  const [selectedKey, setSelectedKey] = useState<string | null>(
    searchParams.get("approach"),
  );
  const [saving, setSaving] = useState(false);

  // A deep link straight to ?step=2 with no goal yet falls back to step 1 —
  // the goal is the one thing the Expert must actually say.
  const step: 1 | 2 =
    searchParams.get("step") === "2" && goal.trim() ? 2 : 1;

  // THE WAY COMES FIRST (Arman, 2026-08-21). Arriving here with an Approach
  // already chosen — from the module home or the catalog — means this page is
  // the SECOND step, not the first: ask the little it needs, then start.
  // Arriving bare, it has no business asking questions before the Expert has
  // chosen how they want to work, so it hands them the catalog.
  const preChosenKey = searchParams.get("approach");
  const chosen = preChosenKey
    ? (approaches ?? []).find((a) => a.key === preChosenKey) ?? null
    : null;
  useEffect(() => {
    if (!preChosenKey) router.replace("/masterwork/approaches");
  }, [preChosenKey, router]);

  const patchDraft = (patch: Record<string, unknown>) =>
    dispatch(patchWizardDraft({ wizardId: WIZARD_ID, patch }));

  // One-time draft recovery — fill only what the Expert hasn't typed here.
  const draftHydrated = useRef(false);
  useEffect(() => {
    if (draftHydrated.current || !draft) return;
    draftHydrated.current = true;
    const d = draft.data;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.length > 0 ? v : null;
    if (!goal && str(d.goal)) setGoal(str(d.goal) as string);
    if (!name && str(d.name)) setName(str(d.name) as string);
    setAnswers((prev) => {
      const next = { ...prev };
      for (const q of QUESTIONS) {
        const v = str(d[q.key]);
        if (v && q.options.some((o) => o.value === v)) next[q.key] = v;
      }
      return next;
    });
  }, [draft, goal, name]);

  // Load the registry on mount so the cards are there the moment the Expert
  // reaches step 2.
  useEffect(() => {
    if (approaches !== null) return;
    let cancelled = false;
    setApproachError(null);
    fetchDistillationApproaches()
      .then((rows) => {
        if (cancelled) return;
        if (startableApproaches(rows).length === 0) {
          setApproachError(
            "No ways to get started are available right now — please try again shortly.",
          );
          return;
        }
        setApproaches(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setApproachError(
          err instanceof Error
            ? err.message
            : "Could not load the ways to get started.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [approaches]);

  const suggested = suggestedApproachKey(answers.knowledge);
  // The registry read returns the WHOLE catalog now (that is the point — Arman
  // wants every named Approach on screen). Only the STARTABLE ones may begin a
  // Rulebook; the rest are shown below as cards that say what they are.
  const startable = approaches === null ? null : startableApproaches(approaches);
  const notStartable =
    approaches === null ? [] : approaches.filter((a) => !a.enabled);
  const effectiveKey =
    (selectedKey && startable?.some((a) => a.key === selectedKey)
      ? selectedKey
      : null) ??
    (startable?.some((a) => a.key === suggested)
      ? suggested
      : (startable?.[0]?.key ?? null));

  const toStep = (next: 1 | 2) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 2) params.set("step", "2");
    else params.delete("step");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleContinue = () => {
    if (!goal.trim()) {
      toast.error("Tell us what you're trying to build first.");
      return;
    }
    toStep(2);
  };

  const create = async () => {
    const approach = startable?.find((a) => a.key === effectiveKey);
    if (!approach) {
      toast.error("Pick how you'd like to do this first.");
      return;
    }
    if (!organizationId) {
      toast.error("Your workspace is still loading — try again in a moment.");
      return;
    }
    setSaving(true);
    try {
      const rulebookName = name.trim() || nameFromGoal(goal) || "My expertise";
      const rulebook = await createDraftRulebook({
        name: rulebookName,
        description: goal.trim(),
        source: {},
        organizationId,
        intake: {
          goal: goal.trim(),
          who_runs_it: answers.who,
          knowledge_lives: answers.knowledge,
          stakes: answers.stakes,
          benchmark: answers.benchmark,
          approach: approach.key,
        },
      });
      dispatch(clearWizardDraft(WIZARD_ID));
      // Route into the chosen Approach: the registry row's own intake_query
      // is appended to the Rulebook URL (e.g. the interview Approach carries
      // {"interview":"1"} so the Scout opens on arrival).
      const params = new URLSearchParams(approach.intakeQuery);
      const href = `/masterwork/${rulebook.id}${params.size > 0 ? `?${params.toString()}` : ""}`;
      toast.success(`"${rulebook.name}" started`, {
        description: approach.costTimeShape,
      });
      startTransition(() => router.push(href));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the Rulebook",
      );
      setSaving(false);
    }
  };

  return (
    // The Rulebook does not exist yet, so there is no id and no door — an
    // origin says as much as the surface honestly knows and no more.
    <MasterworkDictationOrigin surface="masterwork.new_rulebook">
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      {preChosenKey ? null : <StepDots step={step} />}

      {step === 1 ? (
        <div className="space-y-9">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {chosen ? chosen.label : "Start a Rulebook"}
            </h1>
            <p className="text-muted-foreground">
              Answers are pre-filled — change what&apos;s wrong and start.
            </p>
          </div>

          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              What are you trying to build?
            </h2>
            <ProTextarea
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                patchDraft({ goal: e.target.value });
              }}
              placeholder="e.g. An assistant that does keyword research exactly the way I do it"
              autoGrow
              minHeight={96}
              maxHeight={220}
              enableTextStats={false}
              auxiliaryControlsLabel="what you are trying to build"
              autoFocus
              className="text-base text-foreground"
              wrapperClassName="w-full"
            />
          </section>

          {QUESTIONS.map((q) => (
            <QuestionSection
              key={q.key}
              question={q}
              value={answers[q.key]}
              onChange={(v) => {
                setAnswers((prev) => ({ ...prev, [q.key]: v }));
                patchDraft({ [q.key]: v });
              }}
            />
          ))}

          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              Name it{" "}
              <span className="font-normal text-muted-foreground">
                (optional — we&apos;ll name it from your goal)
              </span>
            </h2>
            <ProInput
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                patchDraft({ name: e.target.value });
              }}
              placeholder="e.g. Our SEO Keyword Method"
              auxiliaryControlsLabel="Rulebook name"
              wrapperClassName="w-full"
            />
          </section>

          <div className="flex items-center justify-between border-t border-border pt-6">
            <Button asChild variant="ghost" className="min-h-[44px] gap-2">
              <Link href="/masterwork/approaches">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button
              onClick={() => (preChosenKey ? void create() : handleContinue())}
              disabled={!goal.trim() || saving}
              className="min-h-[44px] gap-2 px-6"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Starting…" : preChosenKey ? "Start" : "Continue"}
              {!saving && !preChosenKey ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              How do you want to do this?
            </h1>
            <p className="text-muted-foreground">
              Every path ends the same way — rules you approve, in your own
              words.
            </p>
          </div>

          {approachError ? (
            <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <p>{approachError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApproaches(null);
                  setApproachError(null);
                }}
              >
                Try again
              </Button>
            </div>
          ) : approaches === null ? (
            <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-2xl border-2 border-border bg-muted/40"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2">
                {(startable ?? []).map((approach) => (
                  <ApproachCard
                    key={approach.key}
                    approach={approach}
                    selected={approach.key === effectiveKey}
                    suggested={approach.key === suggested}
                    onSelect={() => setSelectedKey(approach.key)}
                  />
                ))}
              </div>

              {/* Every other named Approach, so nothing we approved is
                  invisible. Inert here on purpose: clicking away from this
                  step would throw the Expert's unsaved answers on the floor. */}
              {notStartable.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Other ways we&apos;re building
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      These aren&apos;t ways to <em>start</em> a Rulebook — some
                      are already available from elsewhere, some are on the way.
                      Once your Rulebook exists you&apos;ll find them all under
                      &ldquo;Add&rdquo;.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {notStartable.map((approach) => (
                      <ApproachCard key={approach.key} approach={approach} inert />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-6">
            <Button
              variant="ghost"
              onClick={() => toStep(1)}
              disabled={saving}
              className="min-h-[44px] gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => void create()}
              disabled={saving || !effectiveKey}
              className="min-h-[44px] gap-2 px-7"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {saving ? "Starting…" : "Start"}
            </Button>
          </div>
        </div>
      )}
    </div>
    </MasterworkDictationOrigin>
  );
}
