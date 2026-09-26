"use client";

// features/mandates/authoring-level/NewSoftMandatePage.tsx
//
// CREATE A SOFT MANDATE AT THE USER OR ORGANIZATION LEVEL — a copy of the admin
// creation page (../authoring/NewMandatePage.tsx, untouched) made level-aware.
// Same triad spine (INPUT → GOAL → OUTPUT), same key probe, same keystroke
// draft rule, same "refused on the control, reason beside it" button. What
// differs, and only this:
//   · the door is `POST /mandates/soft` (./service.ts) — soft only, never
//     code-backed; the server homes it (my personal org / this organization)
//     and sets who can see it (only me / every member);
//   · the draft is kept per seat (./level-draft.ts);
//   · the handoff goes to the new mandate's page on THIS seat.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { toast, recordToast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Section } from "../workspace/Section";
import { TriadFlowMark } from "../workspace/TriadSections";
import { DraftInputsEditor } from "../authoring/DraftInputsEditor";
import { OutputKindPicker } from "../authoring/OutputKindPicker";
import { type DraftInput } from "../authoring/service";
import { createSoftMandate } from "./service";
import {
  memberMandateListHref,
  memberMandateRecordHref,
} from "@/features/mandates/member-list/routes";
import type { MandateListLevel } from "@/features/mandates/member-list/types";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  keyTakenSentence,
  keyUnknownSentence,
  probeMandateKey,
  type KeyAvailability,
} from "../authoring/key-availability";
import {
  draftIsDirty,
  draftUnstorableSentence,
  EMPTY_DRAFT,
  restoredDraftSentence,
} from "../authoring/draft";
import { missingCreationPieces } from "../authoring/NewMandatePage";
import {
  clearLevelDraft,
  levelDraftKey,
  readLevelDraft,
  writeLevelDraft,
} from "./level-draft";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { BackendApiError } from "@/lib/api/errors";
import { keyFromName, softMandateNamespace } from "./soft-key";

export interface NewSoftMandatePageProps {
  level: MandateListLevel;
  /** Organization level: the organization the mandate belongs to. */
  orgId?: string | null;
  orgName?: string | null;
}

export function NewSoftMandatePage({ level, orgId = null, orgName = null }: NewSoftMandatePageProps) {
  const draftKey = levelDraftKey(level, orgId);
  const clearDraft = () => clearLevelDraft(draftKey);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  /** Only what the person typed under Advanced; empty = the key follows the name. */
  const [typedMandateKey, setMandateKey] = useState("");
  /** Bumped when the key made from the name is already taken. */
  const [autoAttempt, setAutoAttempt] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const keyIsAuto = typedMandateKey.trim() === "";
  const keyNamespace = softMandateNamespace(level === "organization" ? "organization" : "user");
  const mandateKey = keyIsAuto ? keyFromName(label, autoAttempt, keyNamespace) : typedMandateKey;
  const [goal, setGoal] = useState("");
  const [draftInputs, setDraftInputs] = useState<DraftInput[]>([
    { description: "" },
  ]);
  const [outputKind, setOutputKind] = useState<string | null>(null);
  const [outputConstraints, setOutputConstraints] = useState("");
  const [creating, setCreating] = useState(false);
  /** The server's refusal, verbatim — the key validator's words are the copy. */
  const [serverError, setServerError] = useState<string | null>(null);
  /**
   * The last answer the probe gave, WITH the key it was about. Keeping the key
   * beside the answer is what makes a stale answer impossible: the render below
   * only shows it when it still describes what is on screen.
   */
  const [probed, setProbed] = useState<{
    key: string;
    answer: KeyAvailability;
  } | null>(null);
  /** Set when a draft was put back, and cleared when the person discards it. */
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  /** Set when the browser refuses to keep the copy — the person is told. */
  const [unstorable, setUnstorable] = useState<string | null>(null);

  const draft = {
    label,
    mandateKey: typedMandateKey,
    goal,
    outputKind,
    outputConstraints,
    draftInputs,
  };
  const dirty = draftIsDirty(draft);
  // A key made from the name is never a missing piece of its own: with no
  // name there is nothing to make it from, and the name is already asked for.
  const missing = missingCreationPieces({
    label,
    mandateKey: keyIsAuto && !label.trim() ? "pending" : mandateKey,
    goal,
  }).map((piece) => (piece === "the key" ? "a key (under Advanced)" : piece));

  // ── NOTHING TYPED IS LOST ──────────────────────────────────────────────────
  // Put back whatever was in the form last time this page was open. It runs
  // once, before anything is typed, so it can never overwrite live input.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readLevelDraft(draftKey);
    if (!saved) return;
    // Restoring IS a synchronisation from an external system (this browser's
    // stored draft) into React, on mount, exactly once — the case the rule's
    // own documentation carves out. It cannot cascade: `restored` closes the
    // door behind it before a single setter runs.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLabel(saved.label);
    // A key that is just the one the name makes is not a choice the person
    // made — restore it as "follow the name", so renaming still moves it.
    setMandateKey(
      saved.mandateKey === keyFromName(saved.label, 1, keyNamespace) ? "" : saved.mandateKey,
    );
    setGoal(saved.goal);
    setOutputKind(saved.outputKind);
    setOutputConstraints(saved.outputConstraints);
    setDraftInputs(saved.draftInputs);
    setRestoredAt(saved.savedAt);
    /* eslint-enable react-hooks/set-state-in-effect */
    // `restored` makes this run once even though the keys are dependencies.
  }, [draftKey, keyNamespace]);

  // Every change is written down. `dirty` gates it so an empty form does not
  // resurrect itself, and the refusal to store is shown rather than swallowed.
  useEffect(() => {
    if (!restored.current || !dirty) return;
    const result = writeLevelDraft(draftKey, {
      label,
      mandateKey: typedMandateKey,
      goal,
      outputKind,
      outputConstraints,
      draftInputs,
    });
    setUnstorable(result.ok ? null : result.reason);
  }, [label, typedMandateKey, goal, outputKind, outputConstraints, draftInputs, dirty, draftKey]);

  // A hard navigation (reload, closing the tab, a link out of the app) is the
  // one kind the draft alone cannot make invisible — so it is announced.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── IS THE KEY FREE? ──────────────────────────────────────────────────────
  // Asked as the person types, answered beside the field. The answer is only
  // ever rendered: this effect holds no router and calls nothing that could
  // move the route. A stale answer is dropped rather than shown against a key
  // that is no longer on screen.
  useEffect(() => {
    const typed = mandateKey.trim();
    if (!typed) return;
    let live = true;
    const timer = setTimeout(() => {
      void probeMandateKey(typed).then((answer) => {
        if (live) setProbed({ key: typed, answer });
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [mandateKey]);

  // DERIVED, never remembered (the V2-4 lesson this page already learned about
  // its other refusal): an answer only counts while it is about the key the
  // person can actually see.
  const typedKey = mandateKey.trim();
  const keyState: KeyAvailability =
    typedKey === ""
      ? { status: "idle" }
      : probed?.key === typedKey
        ? probed.answer
        : { status: "checking" };
  const keyIsTaken = keyState.status === "taken";
  // A key made from the name that is already taken is not the person's
  // problem: the next number is tried, silently and only for the made key.
  useEffect(() => {
    if (keyIsAuto && keyIsTaken && autoAttempt < 50) setAutoAttempt((n) => n + 1);
  }, [keyIsAuto, keyIsTaken, autoAttempt]);
  // A taken key's door opens the mandate on THIS seat, not the admin route.
  const takenHref =
    keyState.status === "taken"
      ? memberMandateRecordHref(level, keyState.mandateKey, orgId)
      : null;

  /**
   * 🚨 THE REFUSAL IS DERIVED, NEVER STORED (V2-4, production walk
   * 2026-08-31). Pressing Create on the empty form used to WRITE the
   * missing-pieces sentence into `serverError` — the same state that holds the
   * server's verbatim key refusal. Nothing cleared it, so filling in the name,
   * the key and the goal left a red "still needs a name (the top field), the
   * key, the goal" standing under a form that had all three, three inches from
   * a grey line that had updated correctly. Two sentences about one form, one
   * of them false.
   *
   * The missing-pieces refusal is a pure function of the fields, so it is now
   * computed on every render and cannot go stale. The button carries it the
   * way `Apply` and `Set your own answer` already do on the binding screens
   * (UI-STANDARD 14): refused ON the control, with the reason beside it. The
   * `serverError` state holds ONLY what the server actually said, and it is
   * cleared the moment any field it could be about changes.
   */
  const create = async () => {
    if (missing.length > 0 || keyIsTaken) return;
    setCreating(true);
    setServerError(null);
    try {
      // A made key can be taken by a mandate this person cannot see (someone
      // else's private one) — the probe reads through RLS and says "free", the
      // server says 409. That is still not the person's problem: the next
      // number is tried. A key typed under Advanced is theirs, and is refused.
      let attempt = autoAttempt;
      let made: Awaited<ReturnType<typeof createSoftMandate>> | null = null;
      while (!made) {
        const key = keyIsAuto ? keyFromName(label, attempt, keyNamespace) : mandateKey;
        try {
          made = await createSoftMandate(dispatch, {
            level,
            organizationId: orgId,
            mandateKey: key,
            label,
            goal,
            outputKind,
            outputConstraints,
            draftInputs,
          });
        } catch (error: unknown) {
          const taken = error instanceof BackendApiError && error.status === 409;
          if (!keyIsAuto || !taken || attempt >= 50) throw error;
          attempt += 1;
        }
      }
      const created = made;
      if (attempt !== autoAttempt) setAutoAttempt(attempt);
      recordToast.success(
        { type: "mandate", id: created.mandateId, title: label.trim() },
        level === "organization"
          ? `${label.trim()} created for ${orgName ?? "your organization"} — now choose who fulfils it.`
          : `${label.trim()} created — only you can see it until you share it. Now choose who fulfils it.`,
      );
      // The draft has served its purpose: the words are in the database now,
      // and a draft left behind would be put back on the next visit.
      clearDraft();
      // THE CREATION HANDOFF (PLAN-ONE-BINDING-UI §3). This page keeps its one
      // job — name, described inputs, goal, output kind — and hands straight
      // into the one binding UI with the rung and holder cells empty. The
      // workspace's own honest line takes it from here ("No holder yet — pick
      // one to start mapping, or come back when the intelligence exists"); the
      // `#bind` fragment is what scrolls it into view on arrival.
      startTransition(() => {
        router.push(
          `${memberMandateRecordHref(level, created.mandateKey, orgId, "holder")}#bind`,
        );
      });
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const listHref = memberMandateListHref(level, orgId);
  return (
    <div className="h-full overflow-y-auto">
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center gap-1">
            <ChevronLeftTapButton href={listHref} ariaLabel="All mandates" />
            <span className="truncate text-sm font-medium">
              {level === "organization" && orgName ? `New mandate for ${orgName}` : "New mandate"}
            </span>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-6">
        <p className="rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px] leading-snug text-muted-foreground">
          {level === "organization" ? (
            <>
              A custom mandate for{" "}
              <span className="font-medium text-foreground">{orgName ?? "this organization"}</span>
              . Every member can see it and use it; its owners and admins choose what runs it.
            </>
          ) : (
            <>
              A custom mandate of your own. Only you can see it until you share it with an
              organization or everyone.
            </>
          )}
        </p>
        {/* A restore is never silent: the person is told their words were put
            back, and given the one control that throws them away. */}
        {restoredAt !== null ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
            <span className="text-[12px] leading-snug text-muted-foreground">
              {restoredDraftSentence(restoredAt)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11.5px]"
              onClick={() => {
                setLabel(EMPTY_DRAFT.label);
                setMandateKey(EMPTY_DRAFT.mandateKey);
                setAutoAttempt(1);
                setGoal(EMPTY_DRAFT.goal);
                setOutputKind(EMPTY_DRAFT.outputKind);
                setOutputConstraints(EMPTY_DRAFT.outputConstraints);
                setDraftInputs([{ description: "" }]);
                setRestoredAt(null);
                clearDraft();
              }}
            >
              Start fresh
            </Button>
          </div>
        ) : null}
        {unstorable !== null ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px] leading-snug text-amber-700 dark:text-amber-400">
            {draftUnstorableSentence(unstorable)}
          </p>
        ) : null}

        {/* Identity — a name people read, a key code calls. */}
        <header className="space-y-2">
          <div className="space-y-1 px-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Name
            </span>
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setAutoAttempt(1);
                setServerError(null);
              }}
              placeholder="What this job is called — e.g. Goal writer"
              className="h-10 text-lg font-semibold tracking-tight"
              autoFocus
              aria-label="Mandate name"
            />
          </div>
          {/* The key follows the name; only someone who wants a particular one
              opens Advanced. A key the person must fix (taken, or a name with no
              letters to make one from) opens it for them. */}
          {showAdvanced || (!keyIsAuto && keyIsTaken) || (label.trim() && !mandateKey) ? (
            <div className="space-y-1 px-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                Key
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={typedMandateKey}
                  onChange={(e) => {
                    setMandateKey(e.target.value);
                    // The server's refusal is about the key it was GIVEN. Once the
                    // key changes the sentence describes a value that is no longer
                    // on screen — it goes with it.
                    setServerError(null);
                  }}
                  placeholder={keyFromName(label, autoAttempt, keyNamespace) || `${keyNamespace}.weekly_recap`}
                  className="h-8 w-72 font-mono text-[12.5px]"
                  aria-label="Mandate key"
                />
                <span className="text-[11px] text-muted-foreground/70">
                  {keyIsAuto
                    ? "Made from the name. Type here only if you want a different one."
                    : "Your own key. Clear it to go back to the one made from the name."}
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="inline-flex items-center gap-1 px-1 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="h-3 w-3" />
              Advanced
            </button>
          )}
          {/* 🚨 THE KEY IS TAKEN — REFUSED ON THE FIELD, WITH A DOOR THE PERSON
              MAY CHOOSE. The link opens in a NEW TAB on purpose: following it
              must not cost them this form, and this page must never decide to
              follow it for them. */}
          {keyState.status === "taken" && !keyIsAuto ? (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <p className="text-[12.5px] leading-snug text-destructive">
                {keyTakenSentence(keyState.mandateKey, keyState.label)}
              </p>
              <a
                href={takenHref ?? keyState.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium underline underline-offset-2"
              >
                <ExternalLink className="h-3 w-3" />
                Open {keyState.label} in a new tab
              </a>
            </div>
          ) : null}
          {keyState.status === "unknown" ? (
            <p className="px-1 text-[12px] leading-snug text-amber-700 dark:text-amber-400">
              {keyUnknownSentence(mandateKey.trim(), keyState.reason)}
            </p>
          ) : null}
          {serverError ? (
            <p className="px-1 text-[12.5px] text-destructive">{serverError} <ErrorAlchemyMenu error={serverError} /></p>
          ) : null}
        </header>

        {/* THE TRIAD */}
        <Section title="Input" hint="what the job is given">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <DraftInputsEditor items={draftInputs} onChange={setDraftInputs} />
          </div>
        </Section>

        <TriadFlowMark />

        <Section title="Goal" hint="what it must achieve">
          <div className="rounded-xl border border-primary/25 bg-card p-4">
            <ProTextarea
              value={goal}
              onChange={(e) => {
                setGoal(e.target.value);
                setServerError(null);
              }}
              placeholder="Exactly what done-well means. Tight, opinionated, no fluff — intelligent agents will turn this into a system prompt and a grading rubric."
              rows={8}
              className="min-h-40 border-none bg-transparent p-0 text-[14.5px] leading-relaxed shadow-none focus-visible:ring-0"
              aria-label="Goal"
            />
          </div>
        </Section>

        <TriadFlowMark />

        <Section title="Output">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-4">
            <OutputKindPicker value={outputKind} onSelect={setOutputKind} />
            <Input
              value={outputConstraints}
              onChange={(e) => setOutputConstraints(e.target.value)}
              placeholder="Constraints — e.g. markdown text, max 200 words"
              className="h-8 min-w-56 flex-1 text-[13px]"
              aria-label="Output constraints"
            />
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <Button
            disabled={creating || pending || missing.length > 0 || keyIsTaken}
            onClick={() => void create()}
            className="gap-1.5"
          >
            {creating || pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {creating ? "Creating…" : "Create mandate"}
          </Button>
          {/* The refused control's reason, ADJACENT — never a red sentence
              somewhere else on the page that outlives the condition. */}
          <span
            className={
              missing.length > 0 || keyIsTaken
                ? "text-[11.5px] text-muted-foreground"
                : "text-[11.5px] text-muted-foreground/70"
            }
          >
            {missing.length > 0
              ? `Not yet — this mandate still needs ${missing.join(", ")}.`
              : keyIsTaken
                ? keyIsAuto
                  ? "Finding a free key for this name…"
                  : "Not yet — that key belongs to a live job; change it and this works."
                : "No agent or workflow needed yet — bind one whenever it exists."}
          </span>
        </div>
      </div>
    </div>
  );
}
