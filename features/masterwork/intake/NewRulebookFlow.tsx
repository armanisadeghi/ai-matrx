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
// Draft durability (W43, 2026-09-12): the step lives in the URL, so the
// ANSWERS must last exactly as long as the step does. Every input mirrors into
// the shared `useWizardDraft` primitive (lib/wizard-draft/) — and the page
// decides what to render through `resolveWizardStep`, so it can never draw a
// complete-looking step 2 out of an unread cache or a missing draft. Cleared
// on create.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { nameFromSentence } from "@/lib/text/nameFromSentence";
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
  ChevronDown,
  FileText,
  Frown,
  Globe,
  HelpCircle,
  Loader2,
  MessagesSquare,
  Lightbulb,
  Inbox,
  Library,
  Video,
  Network,
  Puzzle,
  ThumbsDown,
  User,
  UserMinus,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { recordToast, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { cn } from "@/lib/utils";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { organizationBlockingReason } from "@/features/organizations/organizationBlockingReason";
import { useWizardDraft } from "@/lib/wizard-draft/useWizardDraft";
import { resolveWizardStep } from "@/lib/wizard-draft/resolveWizardStep";
import { WizardAnswersLost } from "@/lib/wizard-draft/WizardAnswersLost";
import { WizardDraftRestored } from "@/lib/wizard-draft/WizardDraftRestored";
import { createDraftRulebook } from "../service";
import { WorkingNotice } from "@/lib/progress/WorkingNotice";
import { NEW_RULEBOOK_OPENING_MS } from "../record/openingRates";
import {
  startableApproaches,
  type DistillationApproach,
} from "../browse/approaches";
import { useApproachRegistry } from "../browse/useApproachRegistry";
import { ApproachCard, ACCENT } from "../browse/ApproachCard";
import { relevantApproachKeys } from "./approachRelevance";

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
  /** One line under the title — used where the answer changes what comes next. */
  subtitle?: string;
  /** Knowledge lives in several places at once; its answer is a SET. */
  multi?: boolean;
}

/** Multi-select answers persist as one string so draft recovery, the wizard
 *  slice and `metadata.intake` all keep their existing shapes. */
export const MULTI_SEP = " | ";
export function splitMulti(value: string | undefined): string[] {
  return (value ?? "").split(MULTI_SEP).map((v) => v.trim()).filter(Boolean);
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
    subtitle: "Pick every place it lives — this decides what we offer you next.",
    accent: "amber",
    multi: true,
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
      { value: "In my AI chats", label: "In my AI chats", helper: "ChatGPT, Claude, coding tools", icon: MessagesSquare },
      { value: "In my meetings and calls", label: "In my meetings", helper: "Calls and recordings", icon: Video },
      { value: "In my email and messages", label: "In my messages", helper: "Email and threads", icon: Inbox },
      {
        value: "Someone else's material (a book, a course)",
        label: "Someone else's material",
        helper: "A book or a course",
        icon: BookOpen,
      },
      { value: "Nothing yet — just an idea", label: "Nothing yet", helper: "Just an idea so far", icon: Lightbulb },
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
/** Every question's default — the state a fresh form starts in. */
export function defaultIntakeAnswers(): Record<string, string> {
  return Object.fromEntries(QUESTIONS.map((q) => [q.key, q.defaultValue]));
}

export interface NewRulebookDraftValues {
  goal: string;
  name: string;
  answers: Record<string, string>;
  /**
   * 🚨 ONE INTENT, ONE RULEBOOK (cold walk 20, defect C). The id of THIS
   * decision to start a Rulebook, minted once and kept with the answers,
   * because that is the lifetime it belongs to: pressing Start twice, coming
   * back to a restored draft and pressing again, or reloading mid-flight are
   * all the SAME intent and must all land on one Rulebook. `rulebook_create`
   * enforces it with a unique index; an empty string means the draft predates
   * this and the create mints one per call, as it used to.
   */
  startToken: string;
}

/**
 * Put a saved draft back on the form.
 *
 * 🚨 THE MULTI-SELECT TRAP (W43): `knowledge` is a SET and persists as one
 * joined string ("In my head | In my AI chats"). The previous restorer checked
 * every saved answer against the single option VALUES, so a multi answer never
 * matched and was replaced by the default — silently. "Best for what you
 * described" then showed the defaults' Approaches and Start created a Rulebook
 * configured by answers the Expert never gave. Validate each PART, and report
 * anything genuinely unrecognized instead of dropping it.
 */
export function restoreNewRulebookDraft(data: Record<string, unknown>): {
  values: NewRulebookDraftValues;
  rejectedKeys: string[];
} {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const rejectedKeys: string[] = [];
  const answers = defaultIntakeAnswers();

  for (const q of QUESTIONS) {
    const saved = str(data[q.key]);
    if (!saved) continue;
    const parts = q.multi ? splitMulti(saved) : [saved];
    const known = parts.filter((part) =>
      q.options.some((o) => o.value === part),
    );
    if (known.length === 0) {
      rejectedKeys.push(q.key);
      continue;
    }
    if (known.length !== parts.length) rejectedKeys.push(q.key);
    answers[q.key] = known.join(MULTI_SEP);
  }

  return {
    values: {
      goal: str(data.goal) ?? "",
      name: str(data.name) ?? "",
      answers,
      startToken: str(data.start_token) ?? "",
    },
    rejectedKeys,
  };
}

/** The single strongest fit — the card we pre-select. Derived from the SAME
 *  relevance map that orders the top row, so the badge can never disagree
 *  with what is shown. */
function suggestedApproachKey(knowledge: string): string {
  return relevantApproachKeys(splitMulti(knowledge))[0] ?? "interview";
}

/**
 * Derive a Rulebook name from the goal.
 *
 * 🚨 This used to cut at 60 characters on a word boundary and say NOTHING
 * about it. Cold walk, 2026-09-16: a typed goal of "How I decide which
 * incoming e-waste pallets need a manual sort instead of going straight to the
 * shredder." became the header "How I decide which incoming e-waste pallets
 * need a manual" — ending on a dangling adjective, which a first-timer reads
 * as a typo rather than as a decision. Same bug the Vision Interview's own
 * titles had. The rule lives once now: `lib/text/nameFromSentence.ts`.
 */
function nameFromGoal(goal: string): string {
  return nameFromSentence(goal, { fallback: "" });
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
      <div>
        <h2 className="text-sm font-semibold text-foreground">{question.title}</h2>
        {question.subtitle ? (
          <p className="text-xs text-muted-foreground">{question.subtitle}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {question.options.map((opt) => (
          <OptionTile
            key={opt.value}
            option={opt}
            accent={question.accent}
            selected={
              question.multi
                ? splitMulti(value).includes(opt.value)
                : value === opt.value
            }
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
  // THE SHARED ORGANIZATION SEAM (D1, jobs-bar cold-walk-12, 2026-09-19):
  // Start used to read `selectOrganizationId` itself and hand-roll a bounded
  // wait in `create()` — outside any try/catch. With no organization
  // selected, that wait could throw before ever touching state, so the click
  // produced zero network requests, no console error, and no visible change
  // at all: a primary, enabled, blue button that silently did nothing.
  // `useOrganizationRequired` is the ONE shared reading of the organization
  // every org-scoped surface in this repo uses, and `organizationBlockingReason`
  // turns it into the sentence Start (and every other primary action in this
  // flow, and Library's/exports' own creation flows) shows beside itself —
  // never a per-button `if (!organizationId)`. With sole membership this
  // reads `null` and Start behaves exactly as it always has.
  const orgState = useOrganizationRequired();
  const orgReason = organizationBlockingReason(
    orgState.organizationState,
    "starting this Rulebook",
  );
  const {
    status: draftStatus,
    restored,
    applyOnce: applyDraftOnce,
    didRestore: draftRestored,
    acknowledge: acknowledgeDraft,
    discard: discardDraft,
    patch: patchDraft,
    clear: clearDraft,
  } = useWizardDraft<NewRulebookDraftValues>(WIZARD_ID, {
    restore: restoreNewRulebookDraft,
  });
  const [, startTransition] = useTransition();

  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  // Every question starts on its sensible default — the Expert can click
  // straight through without touching any of them.
  const [answers, setAnswers] = useState<Record<string, string>>(
    defaultIntakeAnswers,
  );
  // ONE loader, shared by every Approach surface (wall W2). It owns the read,
  // the Expert-readable sentence, and a retry that actually re-reads.
  const registry = useApproachRegistry();
  const approaches = registry.approaches;
  // null = follow the suggestion; a string = the Expert's explicit pick.
  const [selectedKey, setSelectedKey] = useState<string | null>(
    searchParams.get("approach"),
  );
  // 🚨 N8 — "STARTING…" IS NOT A DURATION (cold walk 13, 2026-09-20).
  // This button sat on the word "Starting…" for 45-51 seconds with nothing
  // else on the screen. `saving` is now the START of a measured wait rather
  // than a boolean, so the sticky bar can show the platform's waiting line —
  // the clock, and a promise that stops promising once it is overtaken.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const saving = startedAt !== null;
  // 🚨 ONE INTENT, ONE RULEBOOK (cold walk 20, defect C). Minted here, not in
  // the service: a token minted per CALL is a different token on the second
  // press and would dedupe nothing. It rides with the answers (see
  // `NewRulebookDraftValues.startToken`) so it survives a reload and an
  // abandoned-and-restored draft, and it is replaced the moment this intent
  // ends — a finished Start, or "Start fresh".
  const [startToken, setStartToken] = useState<string>(() =>
    crypto.randomUUID(),
  );
  /** The "On the way" cards are one collapsed line until the Expert opens it. */
  const [showComingSoon, setShowComingSoon] = useState(false);

  // The step lives in the URL; the answers live in a draft that is READ BACK
  // ASYNCHRONOUSLY. Until that read settles we know nothing, so we render the
  // form's waiting state rather than a step 2 made of defaults; once it has
  // settled and the goal is still missing, we say so and send them back to
  // step 1 instead of pretending (W43).
  const requestedStep: 1 | 2 = searchParams.get("step") === "2" ? 2 : 1;
  const resolution = resolveWizardStep<1 | 2>({
    requestedStep,
    firstStep: 1,
    draftStatus,
    prerequisitesMet: Boolean(goal.trim()),
  });
  const step: 1 | 2 = resolution.kind === "step" ? resolution.step : 1;

  // THE QUESTIONS COME FIRST (Arman, 2026-08-21) — they are not a form to
  // survive, they are the router: their answers decide which Approaches lead
  // on step 2. An `?approach=` from the standing catalog only PRE-SELECTS a
  // card there; it never skips the questions, because the questions also
  // configure the Rulebook itself (sharing, strictness, the Audition baseline).
  const preChosenKey = searchParams.get("approach");

  // THE PARAM WINS (census defect D3, fixed 2026-09-12). `selectedKey` was
  // seeded from `?approach=` at MOUNT only. This page is one route, so
  // arriving from the catalog a second time — "From examples of your best
  // work", then back, then "Everything you've published" — is a client-side
  // navigation that does NOT remount: the new param was read into nothing and
  // the PREVIOUS card stayed highlighted. An Expert who trusts the highlight
  // and presses Start begins the wrong lane, having chosen the right one.
  // So every CHANGE of the param re-selects; an in-page click still wins
  // afterwards, because the param has not changed again.
  const appliedApproachParam = useRef<string | null>(preChosenKey);
  useEffect(() => {
    if (!preChosenKey) return;
    if (appliedApproachParam.current === preChosenKey) return;
    appliedApproachParam.current = preChosenKey;
    setSelectedKey(preChosenKey);
  }, [preChosenKey]);

  // One-time draft recovery — fill only what the Expert hasn't typed here.
  // `restored` settles exactly once, when the persisted read comes back.
  //
  // AND IT IS SAID OUT LOUD (cold walk 6, 2026-09-17). This used to put the
  // old goal back with nothing on screen admitting it. The Expert read the
  // pre-filled textarea as the page she still had to fill in, clicked where
  // her eye landed and typed her sentence into the middle of the old one —
  // the Rulebook was created with `prefix + sentence + suffix` as its goal and
  // the Capture Plan faithfully showed the mess. `applyOnce` owns the
  // once-ness now and raises `didRestore`, which draws the notice below.
  useEffect(() => {
    applyDraftOnce((v) => {
      if (v.goal) setGoal((current) => current || v.goal);
      if (v.name) setName((current) => current || v.name);
      setAnswers(v.answers);
      // The restored draft is the SAME intent she abandoned, so it keeps its
      // token: coming back and pressing Start can no longer make a second
      // Rulebook of the one she already started.
      if (v.startToken) setStartToken(v.startToken);
    });
  }, [applyDraftOnce, restored]);

  /** Every draft write carries the intent's id, so the token is saved by the
   *  same keystroke that saves the answer it belongs to — never by a separate
   *  effect that could run for somebody who typed nothing. */
  const rememberDraft = useCallback(
    (patch: Record<string, unknown>) => {
      patchDraft({ ...patch, start_token: startToken });
    },
    [patchDraft, startToken],
  );

  /** "Start fresh": the saved draft goes, and so does everything it put on
   *  screen — a notice that leaves the old words in the field is no notice. */
  const startFresh = () => {
    discardDraft();
    setGoal("");
    setName("");
    setAnswers(defaultIntakeAnswers);
    // A new intent, so a new id — otherwise "Start fresh" would be deduped
    // against the Rulebook the abandoned draft had already made.
    setStartToken(crypto.randomUUID());
  };

  // A registry that read cleanly but offers nothing startable is not an error
  // the loader can name — it is this wizard's own problem, so this wizard says
  // it, in the same slot and with the same working retry.
  const approachError =
    registry.error ??
    (approaches !== null && startableApproaches(approaches).length === 0
      ? "No ways to get started are available right now — please try again shortly."
      : null);

  const suggested = suggestedApproachKey(answers.knowledge);
  // The registry read returns the WHOLE catalog now (that is the point — Arman
  // wants every named Approach on screen). Only the STARTABLE ones may begin a
  // Rulebook; the rest are shown below as cards that say what they are.
  const startable = approaches === null ? null : startableApproaches(approaches);
  const startableKeys = new Set((startable ?? []).map((a) => a.key));

  // TWO TIERS, NEVER A GATE (Arman, 2026-08-21): what they told us decides
  // what sits ON TOP; every other Approach stays on the same screen below.
  // A coming-soon Approach that fits belongs in the top row saying so — we are
  // not in production, and seeing it wanted is what gets it built.
  const relevantKeys = relevantApproachKeys(splitMulti(answers.knowledge));
  const bestForYou =
    approaches === null
      ? []
      : relevantKeys
          .map((k) => approaches.find((a) => a.key === k))
          .filter((a): a is DistillationApproach => Boolean(a))
          // An unbuilt Approach that FITS is still unbuilt, and five of them
          // led this row on 2026-09-12 — the Expert scrolled past five things
          // she could not use before reaching one she could. They move to the
          // "On the way" disclosure below, which counts them and says they
          // fit, so "seeing it wanted is what gets it built" (Arman,
          // 2026-08-21) survives without blocking the way forward.
          .filter((a) => a.availability !== "coming_soon");
  const bestKeySet = new Set(bestForYou.map((a) => a.key));
  const everythingElse =
    approaches === null
      ? []
      : approaches.filter(
          (a) => !bestKeySet.has(a.key) && a.availability !== "coming_soon",
        );
  // ON THE WAY (census defect D1, fixed 2026-09-12). The named-but-unbuilt
  // Approaches stay on this screen — Arman, 2026-08-21: "I wanna see cards for
  // them" — but they no longer sit BETWEEN the Expert and the only actionable
  // control. They were eight inert cards, roughly two screens of dead scroll,
  // above a Start button that read as "there is no way to proceed". Now they
  // are one line that opens.
  const relevantKeySet = new Set(relevantKeys);
  const comingSoon =
    approaches === null
      ? []
      : approaches
          .filter((a) => a.availability === "coming_soon")
          // The ones that fit what she said lead the list when it opens.
          .sort(
            (a, b) =>
              Number(relevantKeySet.has(b.key)) -
              Number(relevantKeySet.has(a.key)),
          );
  const comingSoonThatFit = comingSoon.filter((a) =>
    relevantKeySet.has(a.key),
  ).length;
  const effectiveKey =
    (selectedKey && startable?.some((a) => a.key === selectedKey)
      ? selectedKey
      : null) ??
    (startable?.some((a) => a.key === suggested)
      ? suggested
      : (startable?.[0]?.key ?? null));

  /** The card the sticky bar will start — named there so Start is never a
   *  guess about which lane the Expert is about to begin. */
  const selectedApproach =
    startable?.find((a) => a.key === effectiveKey) ?? null;

  const toStep = (next: 1 | 2) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 2) params.set("step", "2");
    else params.delete("step");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleContinue = () => {
    // Gated on the Continue button, which already carries this sentence as
    // its muted reason. A goal nobody has typed yet is a PROMPT, not an
    // alarm, so it never becomes a red toast (class sweep, 2026-09-16).
    if (!goal.trim()) return;
    toStep(2);
  };

  const create = async (workspaceId: string) => {
    const approach = startable?.find((a) => a.key === effectiveKey);
    // The sticky bar already says "Pick how you'd like to do this" in muted
    // words beside a dark Start; saying it again in red after the press would
    // dress a normal first paint as a failure (class sweep, 2026-09-16).
    if (!approach) return;
    // NOTHING FAILS SILENTLY: a Rulebook with no goal is not a Rulebook. The
    // step resolver should make this unreachable; if it ever is reached, the
    // Expert is told rather than handed an empty Rulebook (W43).
    if (!goal.trim()) {
      toast.error(
        "We do not have what you are trying to build any more — tell us again and we'll start it.",
      );
      toStep(1);
      return;
    }
    setStartedAt(Date.now());
    try {
      const rulebookName = name.trim() || nameFromGoal(goal) || "My expertise";
      const rulebook = await createDraftRulebook({
        name: rulebookName,
        description: goal.trim(),
        source: {},
        organizationId: workspaceId,
        intake: {
          goal: goal.trim(),
          who_runs_it: answers.who,
          knowledge_lives: answers.knowledge,
          stakes: answers.stakes,
          benchmark: answers.benchmark,
          approach: approach.key,
        },
        // ONE INTENT, ONE RULEBOOK. Pressing Start again — now, or after a
        // reload, or on the draft she came back to — answers with THIS
        // Rulebook instead of minting a second one with the same name.
        clientToken: startToken,
      });
      clearDraft();
      // The intent is spent. Anything she starts next is a different one.
      setStartToken(crypto.randomUUID());
      // Route into the chosen Approach: the registry row's own intake_query
      // is appended to the Rulebook URL (e.g. the interview Approach carries
      // {"interview":"1"} so the Scout opens on arrival).
      const params = new URLSearchParams(approach.intakeQuery);
      const href = `/masterwork/${rulebook.id}${params.size > 0 ? `?${params.toString()}` : ""}`;
      // 🚨 NOTHING FAILS SILENTLY, INCLUDING A PERMISSION (cold walk 20, C).
      // Two Rulebooks may carry one name — Notion and Linear both allow it and
      // we refuse nothing — but the walk ended with three rows reading
      // "walk20-Zone Failure Verdict" and no word anywhere about how that
      // happened. Allowing it is the ruling; saying it is the other half.
      // 🚨 AND IT MUST STILL BE THERE WHEN SHE ARRIVES (cold walk 21, defect
      // D). The sentence above shipped on 2026-09-21 and the walk still read
      // "nothing" — because it was raised on /masterwork/new with sonner's
      // four-second default and the very next statement navigates to the new
      // Rulebook, where the person is reading a page that is still painting.
      // A fact she may have MEANT something else by does not get four seconds:
      // it stays until she dismisses it (the app Toaster renders a close
      // button, and `recordToast` keeps it alive only while the URL still
      // names this Rulebook, so it cannot follow her anywhere else). An
      // ordinary start is still an ordinary four-second courtesy.
      recordToast.success(
        { type: "rulebook", id: rulebook.id, title: rulebook.name },
        `"${rulebook.name}" started`,
        rulebook.nameAlreadyInUse
          ? {
              description: `You already have a Rulebook called "${rulebook.name}". This one is separate — rename either from its own page. ${approach.costTimeShape}`,
              duration: Infinity,
            }
          : { description: approach.costTimeShape },
      );
      startTransition(() => router.push(href));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the Rulebook",
      );
      setStartedAt(null);
    }
  };

  return (
    // The Rulebook does not exist yet, so there is no id and no door — an
    // origin says as much as the surface honestly knows and no more.
    <MasterworkDictationOrigin surface="masterwork.new_rulebook">
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <StepDots step={step} />

      {resolution.kind === "loading" ? (
        // The URL asks for step 2 and we have not read the saved answers back
        // yet. Say what we are doing — never draw step 2 from defaults (W43).
        <div
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-6"
          aria-busy="true"
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Finding what you told us…
          </p>
        </div>
      ) : resolution.kind === "lost" ? (
        <WizardAnswersLost
          what="what you told us"
          onStartOver={() => toStep(1)}
          startOverLabel="Start again"
        />
      ) : step === 1 ? (
        <div className="space-y-9">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              New Masterwork
            </h1>
            {/* THE SCREEN COUNTED WRONG AND PROMISED WHAT IT DID NOT DELIVER
                (jobs-bar-2026-09-16, items 8 and 9). It said "Four quick
                answers" over FIVE questions and a name field, and it said
                "Everything is pre-filled" directly above the one field that is
                empty AND required — which is why the very first thing a
                first-timer saw was the Continue button refusing to move. Say
                the true shape: one sentence from you, the rest already
                answered. */}
            <p className="text-muted-foreground">
              Tell us in one sentence what you want to build. The rest is
              already answered the way most people answer it — change anything
              that isn&apos;t true for you, or leave it and keep going.
            </p>
          </div>

          {/* NOTHING FAILS SILENTLY — including a kindness. The fields below
              may already hold what this person started last time; if they do,
              they are told, and "Start fresh" empties them in one click. */}
          {draftRestored ? (
            <WizardDraftRestored
              onStartFresh={startFresh}
              onDismiss={acknowledgeDraft}
            />
          ) : null}

          <section className="space-y-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              What are you trying to build?
            </h2>
            <ProTextarea
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                rememberDraft({ goal: e.target.value });
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
                // A multi-select answer is a SET: tapping toggles, and the last
                // one standing cannot be turned off (an empty answer would
                // leave the next step with nothing to work from).
                //
                // The next value is computed OUTSIDE the state updater on
                // purpose. React runs an updater during render, so dispatching
                // the draft-save from inside it updates another component
                // mid-render — the "Cannot update a component while rendering a
                // different component" warning. Compute, then set, then save.
                const current = answers[q.key];
                let next = v;
                if (q.multi) {
                  const cur = splitMulti(current);
                  const has = cur.includes(v);
                  const out =
                    has && cur.length > 1
                      ? cur.filter((x) => x !== v)
                      : has
                        ? cur
                        : [...cur, v];
                  next = out.join(MULTI_SEP);
                }
                setAnswers((prev) => ({ ...prev, [q.key]: next }));
                rememberDraft({ [q.key]: next });
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
                rememberDraft({ name: e.target.value });
              }}
              placeholder="e.g. Our SEO Keyword Method"
              auxiliaryControlsLabel="Rulebook name"
              wrapperClassName="w-full"
            />
          </section>

          <div className="flex items-center justify-between border-t border-border pt-6">
            <Button asChild variant="ghost" className="min-h-[44px] gap-2">
              <Link href="/masterwork/all">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            {/* A DISABLED PRIMARY ACTION SAYS WHY (`teach-recent-practitioner` W2, 2026-09-15). */}
            <GatedActionButton
              onClick={handleContinue}
              reason={firstBlockingReason([
                {
                  when: !goal.trim(),
                  reason: "Say what you're trying to build to continue",
                },
              ])}
              className="min-h-[44px] gap-2 px-6"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </GatedActionButton>
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
                onClick={registry.reload}
              >
                Try again
              </Button>
            </div>
          ) : registry.loading || approaches === null ? (
            // Reached ONLY while a read is outstanding. A failed read sets the
            // error above, so "Try again" can never land back here (W2).
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
              {/* TOP ROW — what fits what they told us. Startable ones select;
                  a coming-soon card that fits still shows here, inert, so the
                  Expert sees we know it is the right answer. */}
              {bestForYou.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Best for what you described
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Based on where you said your knowledge lives. Anything
                      below works too — this is a shortcut, not a limit.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {bestForYou.map((approach) => (
                      <ApproachCard
                        key={approach.key}
                        approach={approach}
                        selected={approach.key === effectiveKey}
                        suggested={approach.key === suggested}
                        onSelect={
                          startableKeys.has(approach.key)
                            ? () => setSelectedKey(approach.key)
                            : undefined
                        }
                        inert={!startableKeys.has(approach.key)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* EVERYTHING ELSE — same screen, one section down. Never a gate. */}
              {everythingElse.length > 0 ? (
                <div className="space-y-3">
                  {/* The section headings were SMALLER than the card titles
                      they introduced, so the page had no hierarchy and matched
                      neither the catalog nor step 1
                      (jobs-bar-2026-09-16, item 10). */}
                  <h2 className="text-lg font-semibold text-foreground">
                    Every other way
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {everythingElse.map((approach) => (
                      <ApproachCard
                        key={approach.key}
                        approach={approach}
                        selected={approach.key === effectiveKey}
                        onSelect={
                          startableKeys.has(approach.key)
                            ? () => setSelectedKey(approach.key)
                            : undefined
                        }
                        inert={!startableKeys.has(approach.key)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ON THE WAY — named, approved, not built. Collapsed by
                  default so nothing unbuilt stands between the Expert and
                  Start (D1); one click still shows every card. */}
              {comingSoon.length > 0 ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowComingSoon((v) => !v)}
                    aria-expanded={showComingSoon}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-left transition-colors hover:border-muted-foreground/40"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        On the way — {comingSoon.length} more{" "}
                        {comingSoon.length === 1 ? "way" : "ways"} we&apos;re
                        building
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Named and approved, not built yet — nothing here can
                        start a Rulebook today.
                        {comingSoonThatFit > 0
                          ? ` ${comingSoonThatFit} of ${comingSoonThatFit === 1 ? "them fits" : "them fit"} what you described.`
                          : ""}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        showComingSoon && "rotate-180",
                      )}
                    />
                  </button>
                  {showComingSoon ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {comingSoon.map((approach) => (
                        <ApproachCard
                          key={approach.key}
                          approach={approach}
                          selected={false}
                          inert
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

            </div>
          )}

          {/* A WHOLE CHANNEL IS A WAY TO START TOO — AND IT HAS A DOOR.
              Step 2 is where the Expert says what this Rulebook will learn
              from, and for a creator that answer is often "everything on my
              channel". No Approach carries a channel, so without this the only
              honest move was to start the Rulebook, find the Sources panel and
              discover Libraries there. This is not an Approach card (the cards
              are the registry's rows, never a hardcoded one) — it is a plain
              door beside them. Nothing is created yet, so it carries no
              rulebook id; the answers typed above are kept in the saved draft
              and restored when the Expert comes back. */}
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
            <h2 className="text-sm font-semibold text-foreground">
              Already have a YouTube channel in mind?
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Catalogue the whole channel first — every video becomes a Source
              you can hand to this Rulebook once you start it. Your answers are
              saved; come straight back.
            </p>
            <Button asChild variant="outline" className="mt-3 min-h-[44px] gap-2">
              <Link href="/libraries?from=rulebook">
                <Library className="h-4 w-4" />
                Bring a whole YouTube channel
              </Link>
            </Button>
          </div>

          {/* THE ACTION IS ALWAYS ON SCREEN (census defect D1, fixed
              2026-09-12). Start used to be the LAST element on the page,
              below every card including the eight unbuilt ones — about two
              screens of dead scroll before the only control that does
              anything, which reads as "there is no way to proceed". It is now
              a sticky bar that also NAMES the card it will start, so the
              Expert can see what pressing it does without scrolling back.
              THE ORGANIZATION READING IS THE SHARED SEAM (D1, cold-walk-12):
              `orgState`/`orgReason` come from `useOrganizationRequired` +
              `organizationBlockingReason` — the one hook and one sentence
              builder every org-scoped primary action in this repo (and, per
              the census, the Library/exports creation flows) should share,
              never a hand-rolled `if (!organizationId)` per button. With
              nothing selected Start is DISABLED and the reason sits right
              beside it, exactly the pattern Continue already demonstrates two
              screens earlier — never a button that looks live and silently
              does nothing (D1's exact failure). With sole membership the
              state is already `ready`, `orgReason` is `null`, and Start
              behaves exactly as it does today. */}
          {/* 🚨 N8 — THE WAIT SAYS HOW LONG IT HAS BEEN. Walk 13 pressed Start
              and watched the word "Starting…" for at least 45 seconds with
              nothing else moving on the screen. This is the platform's one
              waiting line (`lib/progress/WorkingNotice.tsx`) — the same
              primitive the distillation and Shadow panels already use — so the
              clock moves every second and the promise corrects itself out loud
              the moment it is overtaken. Numbers and where they were measured:
              `features/masterwork/record/openingRates.ts`. */}
          {startedAt !== null ? (
            <WorkingNotice
              className="sticky bottom-[64px] z-20 mb-2"
              doing={
                selectedApproach
                  ? `Starting your Rulebook with ${selectedApproach.label}…`
                  : "Starting your Rulebook…"
              }
              startedAt={startedAt}
              usualMs={NEW_RULEBOOK_OPENING_MS}
            />
          ) : null}
          <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
            <Button
              variant="ghost"
              onClick={() => toStep(1)}
              disabled={saving}
              className="min-h-[44px] gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex min-w-0 items-center gap-3">
              <p className="min-w-0 truncate text-right text-xs text-muted-foreground sm:text-sm">
                {orgReason ? (
                  orgReason
                ) : approachError ? (
                  // NOTHING FAILS SILENTLY: with no list, "Pick how you'd like
                  // to do this" is an instruction the Expert cannot follow. Say
                  // why the button is dark instead (W2).
                  "Nothing to start until the ways to get started load"
                ) : selectedApproach ? (
                  <>
                    Starting with{" "}
                    <span className="font-medium text-foreground">
                      {selectedApproach.label}
                    </span>
                  </>
                ) : (
                  "Pick how you'd like to do this"
                )}
              </p>
              <Button
                onClick={() => {
                  if (!orgState.organizationId) return;
                  void create(orgState.organizationId);
                }}
                disabled={saving || Boolean(orgReason) || !effectiveKey}
                title={orgReason ?? undefined}
                className="min-h-[44px] shrink-0 gap-2 px-7"
              >
                {saving || orgState.organizationState === "resolving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {orgState.organizationState === "resolving"
                  ? "Getting ready…"
                  : saving
                    ? "Starting…"
                    : "Start"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </MasterworkDictationOrigin>
  );
}
