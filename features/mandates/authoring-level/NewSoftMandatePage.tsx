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
import { ArrowRight, ExternalLink, Loader2 } from "lucide-react";
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
import { memberMandateRecordHref } from "@/features/mandates/member-list/routes";
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
  const [mandateKey, setMandateKey] = useState("");
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
    mandateKey,
    goal,
    outputKind,
    outputConstraints,
    draftInputs,
  };
  const dirty = draftIsDirty(draft);
  const missing = missingCreationPieces({ label, mandateKey, goal });

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
    setMandateKey(saved.mandateKey);
    setGoal(saved.goal);
    setOutputKind(saved.outputKind);
    setOutputConstraints(saved.outputConstraints);
    setDraftInputs(saved.draftInputs);
    setRestoredAt(saved.savedAt);
    /* eslint-enable react-hooks/set-state-in-effect */
    // `restored` makes this run once even though the key is a dependency.
  }, [draftKey]);

  // Every change is written down. `dirty` gates it so an empty form does not
  // resurrect itself, and the refusal to store is shown rather than swallowed.
  useEffect(() => {
    if (!restored.current || !dirty) return;
    const result = writeLevelDraft(draftKey, {
      label,
      mandateKey,
      goal,
      outputKind,
      outputConstraints,
      draftInputs,
    });
    setUnstorable(result.ok ? null : result.reason);
  }, [label, mandateKey, goal, outputKind, outputConstraints, draftInputs, dirty, draftKey]);

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
      const created = await createSoftMandate(dispatch, {
        level,
        organizationId: orgId,
        mandateKey,
        label,
        goal,
        outputKind,
        outputConstraints,
        draftInputs,
      });
      recordToast.success(
        { type: "mandate", id: created.mandateId, title: created.mandateKey },
        level === "organization"
          ? `${created.mandateKey} created for ${orgName ?? "your organization"} — now choose who fulfils it.`
          : `${created.mandateKey} created — only you can see it until you share it. Now choose who fulfils it.`,
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

  return (
    <div className="h-full overflow-y-auto">
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
                setServerError(null);
              }}
              placeholder="What this job is called — e.g. Goal writer"
              className="h-10 text-lg font-semibold tracking-tight"
              autoFocus
              aria-label="Mandate name"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Input
              value={mandateKey}
              onChange={(e) => {
                setMandateKey(e.target.value);
                // The server's refusal is about the key it was GIVEN. Once the
                // key changes the sentence describes a value that is no longer
                // on screen — it goes with it.
                setServerError(null);
              }}
              placeholder="feature.specific_job"
              className="h-8 w-72 font-mono text-[12.5px]"
              aria-label="Mandate key"
            />
            <span className="text-[11px] text-muted-foreground/70">
              lowercase, dot-separated — code calls this key forever
            </span>
          </div>
          {/* 🚨 THE KEY IS TAKEN — REFUSED ON THE FIELD, WITH A DOOR THE PERSON
              MAY CHOOSE. The link opens in a NEW TAB on purpose: following it
              must not cost them this form, and this page must never decide to
              follow it for them. */}
          {keyState.status === "taken" ? (
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
            <p className="px-1 text-[12.5px] text-destructive">{serverError}</p>
          ) : null}
        </header>

        {/* THE TRIAD */}
        <Section title="Input" hint="describe them — formalize later">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <DraftInputsEditor items={draftInputs} onChange={setDraftInputs} />
          </div>
        </Section>

        <TriadFlowMark />

        <Section title="Goal" hint="lives only here — give it your best words">
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
                ? "Not yet — that key belongs to a live job; change it and this works."
                : "No agent needed yet — bind one whenever it exists."}
          </span>
        </div>
      </div>
    </div>
  );
}
