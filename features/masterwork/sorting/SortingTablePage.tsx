"use client";

// features/masterwork/sorting/SortingTablePage.tsx
//
// THE SORTING TABLE — the play surface of the `sorting_table` Approach.
//
// A pile of real cases, two to four piles the Expert names, one tap per case on
// a phone, no words at all. Then the boundary: the pairs that sat CLOSEST
// across a pile edge, and the pile nothing landed in. Those are the questions
// she answers out loud, and those answers are the rules.
//
// It is built phone-first because that is where a pile gets sorted: standing
// up, one thumb, a second a case.
//
// ## WHAT THIS SCREEN REFUSES TO DO
//
// * **It never claims a pair it did not compute.** "These two sat closest" is a
//   sentence the server's own arithmetic produced, and the score is on screen
//   beside it. The screen has no opinion about which pair is close.
// * **It never turns an absence into a rule.** A pile nobody used produces a
//   QUESTION, marked as such, and a rule only if the Expert answers it.
// * **It never pretends a save happened.** Each answered question carries its
//   OWN status — saving, what it added, or the failure with a Try again that
//   re-submits that exact answer.
// * **It never traps.** Skip is on every case and every question, because a
//   case she cannot place is a case she must be able to leave without inventing
//   a pile for it, and an invented placement is a bad rule with her name on it.
// * **It never eats a mis-tap.** Undo is on the sorting screen, always, because
//   a thumb on a phone is not a precision instrument.
//
// Server half: `aidream/aidream/services/distillation/sort_ingest.py`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileUp,
  Layers,
  ListPlus,
  Loader2,
  RefreshCw,
  BrainCircuit,
  SkipForward,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { knobBool, knobInt } from "@/lib/knobs/featureKnobs";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/redux/hooks";
import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { AgentCredit } from "@/features/masterwork/components/AgentCredit";
import { DUMP_SOURCE_TOKENS } from "../sourceLinks";
import {
  countInFlight,
  createSittingStore,
  describeResumedSitting,
  settleInFlightSaves,
  type SittingBase,
} from "../sitting/sitting";
import {
  DECLARED_KNOB_DEFAULTS,
  SORT_CASE_WRITER_MANDATE,
  SORT_KNOB_FEATURE,
  findBoundary,
  ingestSortAnswer,
  writeSortCases,
} from "./service";
import {
  MAX_CASES,
  SHEET_ACCEPT,
  casesFromRecords,
  casesFromSheet,
  looksLikeHeader,
  parsePastedCases,
  readSheet,
  suggestColumn,
  type SheetData,
} from "./cases";
import {
  defaultPiles,
  type BoundaryQuestion,
  type SortCase,
  type SortPile,
} from "./types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Phase = "setup" | "sorting" | "boundary" | "done";
type CaseDoor = "paste" | "sheet" | "records" | "write";

/** Per-question save state. `idle` is a question not answered yet. */
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; added: number; unverified: number; alreadyAnswered: boolean }
  | { kind: "failed"; message: string };

// ── THE SITTING, WRITTEN DOWN ───────────────────────────────────────────────
//
// 🚨 IT NEVER ERASES A SITTING (cold walk 5, finding 2, 2026-09-16). Every
// piece of this lane used to live in React state and nowhere else: the cases
// dealt, the piles she named, which case she was on, where each one landed, the
// boundary questions and what each answer came back with. A first-time Expert
// dealt twenty real cases, sorted five of them on the keyboard, reloaded — and
// landed back on "Sort the pile, then we'll find the line" with ZERO trace: no
// resume banner, no partial-progress notice, no rules. The only honest reading
// of that screen is that the whole session vanished, so the natural next move
// is to sort the same pile again.
//
// The Triad game — this lane's own named sibling — had the identical defect
// fixed a day earlier, and the fix was written by hand inside that one
// component, so there was nothing here to inherit. The mechanism now lives in
// `../sitting/sitting.ts` and BOTH lanes call it.
interface StoredSortSitting extends SittingBase {
  phase: Phase;
  piles: SortPile[];
  cases: SortCase[];
  index: number;
  assignments: Record<string, string>;
  history: string[];
  questions: BoundaryQuestion[];
  questionIndex: number;
  saveStates: Record<string, SaveState>;
  rulesThisSitting: number;
  seenCases: string[];
  voiceOn: boolean;
}

const sortSitting = createSittingStore<StoredSortSitting>({
  keyPrefix: "matrx.masterwork.sort.sitting.v1:",
  // A stored setup screen is not a sitting — there is nothing to pick up.
  isUsable: (sitting) =>
    sitting.phase !== "setup" && Boolean(sitting.cases?.length),
});

/** What a picked-up Sorting Table sitting says for itself. Two phases, two
 *  honest sentences — the pile she was sorting, or the questions she was
 *  answering — built from the shared one so every lane sounds the same. */
export function describeResumedSort(saved: {
  phase: Phase;
  cases: unknown[];
  index: number;
  assignments: Record<string, string>;
  questions: unknown[];
  questionIndex: number;
  saveStates: Record<string, { kind: string }>;
}): string {
  const inFlight = countInFlight(saved.saveStates);
  if (saved.phase === "sorting") {
    return describeResumedSitting({
      index: saved.index,
      total: saved.cases.length,
      answered: Object.keys(saved.assignments).length,
      inFlight,
      itemNoun: "case",
      endedPhrase: "the pile you were sorting",
      redoPhrase: "sorting those cases again",
      answeredVerb: "sorting",
    });
  }
  return describeResumedSitting({
    index: saved.questionIndex,
    total: saved.questions.length,
    answered: Object.keys(saved.saveStates).length,
    inFlight,
    itemNoun: "question",
    endedPhrase: "the questions we asked",
    redoPhrase: "answering those questions again",
  });
}

interface KnobState {
  casesPerRound: number;
  piles: number;
  questions: number;
  voiceDefaultOn: boolean;
  /** The sentence shown in place when a knob row could not be read. */
  problem: string | null;
}

const PENDING_KNOBS: KnobState = {
  casesPerRound: DECLARED_KNOB_DEFAULTS.cases_per_round,
  piles: DECLARED_KNOB_DEFAULTS.piles,
  questions: DECLARED_KNOB_DEFAULTS.boundary_questions_per_round,
  voiceDefaultOn: DECLARED_KNOB_DEFAULTS.voice_default_on,
  problem: null,
};

const DOORS: { key: CaseDoor; label: string; hint: string; icon: typeof ListPlus }[] = [
  { key: "paste", label: "Paste a list", hint: "One case per line", icon: ListPlus },
  { key: "sheet", label: "A spreadsheet", hint: "CSV or Excel", icon: FileUp },
  { key: "records", label: "Records you keep", hint: "Files, rows, past work", icon: Layers },
  { key: "write", label: "Write them for me", hint: "From your own craft", icon: BrainCircuit },
];

export function SortingTablePage({
  rulebookId,
  rulebookName,
  /** Called after an answer lands rules, so the Rulebook behind this refreshes. */
  onRulesLanded,
}: {
  rulebookId: string;
  rulebookName: string;
  onRulesLanded?: () => void;
}) {
  const store = useAppStore();

  // THE SITTING IS READ BACK BEFORE THE FIRST PAINT, so a reload never shows
  // the "deal me a pile" setup screen over a round that is still on the board.
  // Lazy initialisers, so storage is touched once and never during SSR.
  const restored = useRef<StoredSortSitting | null>(null);
  if (restored.current === null && typeof window !== "undefined") {
    restored.current = sortSitting.read(rulebookId);
  }
  const saved = restored.current;

  const [knobs, setKnobs] = useState<KnobState>(PENDING_KNOBS);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [door, setDoor] = useState<CaseDoor>("write");
  const [piles, setPiles] = useState<SortPile[]>(() =>
    saved?.piles?.length ? saved.piles : defaultPiles(DECLARED_KNOB_DEFAULTS.piles),
  );
  const [pastedText, setPastedText] = useState("");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [sheetColumn, setSheetColumn] = useState(0);
  const [sheetSkipHeader, setSheetSkipHeader] = useState(true);
  const [picked, setPicked] = useState<
    { token: string; id: string; title: string }[]
  >([]);
  const [cases, setCases] = useState<SortCase[]>(saved?.cases ?? []);
  const [index, setIndex] = useState(saved?.index ?? 0);
  const [assignments, setAssignments] = useState<Record<string, string>>(
    saved?.assignments ?? {},
  );
  const [history, setHistory] = useState<string[]>(saved?.history ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [roundNote, setRoundNote] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BoundaryQuestion[]>(
    saved?.questions ?? [],
  );
  const [questionIndex, setQuestionIndex] = useState(saved?.questionIndex ?? 0);
  const [answer, setAnswer] = useState("");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>(() =>
    // An answer that was mid-save when the page went away cannot be reported as
    // "saved" with a count — this browser never heard it — and it is not lost
    // either: the server finishes a detached submit. It is reported as landed
    // with nothing this browser can count, and the resume note carries the
    // remedy: look at the Rulebook rather than answering it again.
    settleInFlightSaves<SaveState>(saved?.saveStates ?? {}, () => ({
      kind: "saved",
      added: 0,
      unverified: 0,
      alreadyAnswered: false,
    })),
  );
  const [rulesThisSitting, setRulesThisSitting] = useState(
    saved?.rulesThisSitting ?? 0,
  );
  const [voiceOn, setVoiceOn] = useState(
    saved?.voiceOn ?? DECLARED_KNOB_DEFAULTS.voice_default_on,
  );
  /** The sentence a picked-up sitting says for itself. Null on a fresh one. */
  const [resumedNote, setResumedNote] = useState<string | null>(() =>
    saved ? describeResumedSort(saved) : null,
  );
  /** Every case text sorted this sitting — what stops a round repeating itself. */
  const seenCases = useRef<string[]>(saved?.seenCases ?? []);

  // ── the knobs this screen lays out before the first call ─────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [casesPerRound, pileCount, questionCount, voice] = await Promise.all([
          knobInt(SORT_KNOB_FEATURE, "cases_per_round"),
          knobInt(SORT_KNOB_FEATURE, "piles"),
          knobInt(SORT_KNOB_FEATURE, "boundary_questions_per_round"),
          knobBool(SORT_KNOB_FEATURE, "voice_default_on"),
        ]);
        if (cancelled) return;
        setKnobs({
          casesPerRound,
          piles: pileCount,
          questions: questionCount,
          voiceDefaultOn: voice,
          problem: null,
        });
        // A RESTORED SITTING OUTRANKS THE DEFAULTS. The knob read lands after
        // the first paint; without this it would overwrite the piles she named
        // and the board she is standing in front of with starting values.
        if (!restored.current) {
          setPiles(defaultPiles(pileCount));
          setVoiceOn(voice);
        }
      } catch (err) {
        if (cancelled) return;
        // NOTHING FAILS SILENTLY. The settings this screen obeys could not be
        // read, so the screen names them and what it is running on instead.
        setKnobs({
          ...PENDING_KNOBS,
          problem:
            `The settings for this feature could not be read (${
              err instanceof Error ? err.message : String(err)
            }). It is running on the starting values — ` +
            `${DECLARED_KNOB_DEFAULTS.piles} piles, ` +
            `${DECLARED_KNOB_DEFAULTS.cases_per_round} cases, ` +
            `${DECLARED_KNOB_DEFAULTS.boundary_questions_per_round} questions, ` +
            `voice on. An administrator can fix this by seeding the ` +
            `"${SORT_KNOB_FEATURE}" knobs.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Written on every change that matters — never on keystrokes in the answer
  // box, because a draft answer is not evidence; the placed case and the
  // submitted answer are. A setup screen is cleared rather than stored, so a
  // finished-and-restarted round never offers a stale board back.
  useEffect(() => {
    if (phase === "setup") {
      sortSitting.clear(rulebookId);
      return;
    }
    sortSitting.write(rulebookId, {
      phase,
      piles,
      cases,
      index,
      assignments,
      history,
      questions,
      questionIndex,
      saveStates,
      rulesThisSitting,
      seenCases: seenCases.current,
      voiceOn,
    });
  }, [
    rulebookId,
    phase,
    piles,
    cases,
    index,
    assignments,
    history,
    questions,
    questionIndex,
    saveStates,
    rulesThisSitting,
    voiceOn,
  ]);

  const pileName = useCallback(
    (key: string) => piles.find((pile) => pile.key === key)?.name ?? key,
    [piles],
  );

  const renamePile = (key: string, name: string) =>
    setPiles((prev) =>
      prev.map((pile) => (pile.key === key ? { ...pile, name } : pile)),
    );

  const setPileCount = (count: number) =>
    setPiles((prev) => {
      const next = defaultPiles(count);
      // Keep the names she already typed; only add or drop from the end.
      return next.map((pile, i) => prev[i] ?? pile);
    });

  // ── the cases she brought, whichever door they came through ──────────────
  const broughtCases = useMemo<SortCase[]>(() => {
    // NO NOTE ON A PASTED CASE (jobs-bar-2026-09-16, item 30). The note exists
    // so the Expert can find a case again in her own material — "row 12", "case
    // file" — and a spreadsheet or a record gets a useful one. A list she pasted
    // thirty seconds ago got the word "pasted" printed under every single card:
    // a label with no information in it, on the one screen built to hold exactly
    // one thing and nothing else.
    if (door === "paste") return parsePastedCases(pastedText, "");
    if (door === "sheet" && sheet)
      return casesFromSheet(sheet, sheetColumn, { skipFirstRow: sheetSkipHeader });
    if (door === "records") return casesFromRecords(picked);
    return [];
  }, [door, pastedText, sheet, sheetColumn, sheetSkipHeader, picked]);

  const namedPiles = piles.filter((pile) => pile.name.trim());
  const pilesReady = namedPiles.length === piles.length && piles.length >= 2;

  const start = useCallback(async () => {
    setProblem(null);
    setRoundNote(null);
    if (!pilesReady) {
      setProblem("Give every pile a name first — they are the words your rules will use.");
      return;
    }
    let round: SortCase[] = broughtCases;
    if (door === "write") {
      setBusy(true);
      try {
        const written = await writeSortCases(store, {
          rulebookId,
          count: knobs.casesPerRound,
          pileNames: piles.map((pile) => pile.name.trim()),
          seenCases: seenCases.current,
        });
        round = written.cases;
        setVoiceOn(written.voiceDefaultOn);
        if (written.cases.length < written.requested) {
          setRoundNote(
            `We asked for ${written.requested} cases and got ${written.cases.length}` +
              (written.repeatsDropped
                ? ` — ${written.repeatsDropped} were repeats of ones you've already sorted.`
                : "."),
          );
        }
      } catch (err) {
        setProblem(
          err instanceof Error
            ? err.message
            : "We couldn't write the cases. Nothing was lost — try again.",
        );
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (round.length === 0) {
      setProblem(
        door === "records"
          ? "Pick at least a couple of records — a pile of one has no edge in it."
          : "There are no cases here yet. Add a few, or let us write them for you.",
      );
      return;
    }
    if (round.length > MAX_CASES) round = round.slice(0, MAX_CASES);
    seenCases.current = [...seenCases.current, ...round.map((entry) => entry.text)];
    setCases(round);
    setIndex(0);
    setAssignments({});
    setHistory([]);
    setResumedNote(null);
    setPhase("sorting");
  }, [broughtCases, door, knobs.casesPerRound, piles, pilesReady, rulebookId, store]);

  const place = (pileKey: string) => {
    const current = cases[index];
    if (!current) return;
    setAssignments((prev) => ({ ...prev, [current.id]: pileKey }));
    setHistory((prev) => [...prev, current.id]);
    setIndex((n) => n + 1);
  };

  const skipCase = () => {
    const current = cases[index];
    if (!current) return;
    setHistory((prev) => [...prev, current.id]);
    setIndex((n) => n + 1);
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[last];
      return next;
    });
    setIndex((n) => Math.max(0, n - 1));
  };

  /**
   * 🚨 A SORT IS A KEYBOARD JOB TOO (jobs-bar-2026-09-16, item 17).
   *
   * The lane is built phone-first and that was read as phone-only: twenty cases
   * at a desk meant twenty round trips from the keyboard to the mouse and back,
   * with the pile buttons at the bottom of a tall screen. Every sorting tool
   * worth copying — Gmail, Linear, Superhuman, Anki — puts the piles on the
   * number keys. `1`…`4` place, `s` skips, `u` undoes; the hint is printed
   * beside the piles so nobody has to discover it. Typing in a field is
   * excluded, because a pile name with an "s" in it is not a skip.
   */
  useEffect(() => {
    if (phase !== "sorting") return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= piles.length) {
        event.preventDefault();
        place(piles[digit - 1].key);
        return;
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        skipCase();
        return;
      }
      if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const findTheBoundary = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const found = await findBoundary(store, {
        rulebookId,
        cases,
        piles,
        assignments,
      });
      setQuestions(found);
      setQuestionIndex(0);
      setAnswer("");
      setPhase(found.length === 0 ? "done" : "boundary");
    } catch (err) {
      setProblem(
        err instanceof Error
          ? err.message
          : "We couldn't work out the boundary. Your sort is still here — try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [assignments, cases, piles, rulebookId, store]);

  const submitAnswer = useCallback(
    async (question: BoundaryQuestion, words: string) => {
      setSaveStates((prev) => ({ ...prev, [question.id]: { kind: "saving" } }));
      try {
        const summary = await ingestSortAnswer(store, {
          rulebookId,
          question,
          reason: words,
        });
        setSaveStates((prev) => ({
          ...prev,
          [question.id]: {
            kind: "saved",
            added: summary.added,
            unverified: summary.quotesUnverified,
            alreadyAnswered: summary.alreadyAnswered,
          },
        }));
        if (summary.added > 0) {
          setRulesThisSitting((n) => n + summary.added);
          onRulesLanded?.();
        }
      } catch (err) {
        setSaveStates((prev) => ({
          ...prev,
          [question.id]: {
            kind: "failed",
            message:
              err instanceof Error
                ? err.message
                : "That one didn't save. Answer it again.",
          },
        }));
      }
    },
    [onRulesLanded, rulebookId, store],
  );

  const answerAndAdvance = () => {
    const question = questions[questionIndex];
    if (!question || !answer.trim()) return;
    // Fire, then move on: she should be reading the next question while the
    // last one distils. The question's own status row is what reports it.
    void submitAnswer(question, answer.trim());
    setAnswer("");
    setQuestionIndex((n) => n + 1);
  };

  const sortedCount = Object.keys(assignments).length;

  // ── setup ────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Layers className="h-7 w-7" />
          </span>
          <h2 className="text-2xl font-semibold text-foreground">
            Sort the pile, then we'll find the line
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Drop a pile of real cases into piles you name — one tap each, no
            words. Then we pick the two that sit closest on opposite sides and
            ask you what separates them. That answer is the rule.
          </p>
        </div>

        {knobs.problem ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {knobs.problem}
            <ErrorAlchemyMenu error={knobs.problem} />
          </p>
        ) : null}

        {/* ── the piles ─────────────────────────────────────────────────── */}
        <section className="space-y-2">
          {/* 🚨 IT WRAPS ON A PHONE (jobs-bar-2026-09-16, item 15). At 390px the
              label and the 2/3/4 control sat on one row, the label took the
              space it wanted, and the "4" was pushed clean off the right edge of
              a screen that does not scroll sideways — so on the phone this lane
              was designed for, a four-pile sort was unreachable and nothing said
              so. `flex-wrap` plus a non-shrinking control is the whole fix. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm font-medium text-foreground">
              Your piles — call them whatever you call them
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPileCount(count)}
                  aria-pressed={piles.length === count}
                  className={cn(
                    "min-h-9 min-w-9 rounded-lg border text-sm font-medium transition-colors",
                    piles.length === count
                      ? "border-sky-500/60 bg-sky-500/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-sky-500/40",
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {piles.map((pile, i) => (
              <Input
                key={pile.key}
                value={pile.name}
                onChange={(event) => renamePile(pile.key, event.target.value)}
                placeholder={`Pile ${i + 1}`}
                className="min-h-11 text-base"
                aria-label={`Name for pile ${i + 1}`}
              />
            ))}
          </div>
        </section>

        {/* ── where the cases come from ─────────────────────────────────── */}
        <section className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Where are the cases coming from?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DOORS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setDoor(entry.key)}
                  aria-pressed={door === entry.key}
                  className={cn(
                    "min-h-16 rounded-xl border-2 p-3 text-left transition-colors",
                    door === entry.key
                      ? "border-sky-500/60 bg-sky-500/5"
                      : "border-border bg-card hover:border-sky-500/40",
                  )}
                >
                  <Icon className="mb-1 h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <span className="block text-sm font-medium text-foreground">
                    {entry.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {door === "paste" ? (
            <div className="space-y-1.5">
              <Label htmlFor="sort-paste" className="text-sm">
                One case per line
              </Label>
              <ProTextarea
                id="sort-paste"
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                onTranscriptionComplete={(text) =>
                  setPastedText((prev) => (prev ? `${prev}\n${text}` : text))
                }
                enableVoice={voiceOn}
                placeholder={"Rush order, 4 seals, regular distributor\nNew buyer, no credit history, 200 units\n…"}
                className="text-base"
                minHeight={140}
                surfaceName="matrx-user/masterwork-rulebook"
              />
              <p className="text-xs text-muted-foreground">
                {broughtCases.length} case{broughtCases.length === 1 ? "" : "s"} so
                far. Up to {MAX_CASES}.
              </p>
            </div>
          ) : null}

          {door === "sheet" ? (
            <div className="space-y-2">
              <input
                type="file"
                accept={SHEET_ACCEPT}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:text-sm file:text-foreground"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setProblem(null);
                  try {
                    const data = await readSheet(file);
                    setSheet(data);
                    setSheetColumn(suggestColumn(data));
                    setSheetSkipHeader(looksLikeHeader(data));
                  } catch (err) {
                    setSheet(null);
                    setProblem(
                      err instanceof Error ? err.message : String(err),
                    );
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                CSV, TSV, plain text, Excel or OpenDocument — exactly what we can
                read.
              </p>
              {sheet ? (
                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <p className="text-sm text-foreground">
                    {sheet.totalRows} row{sheet.totalRows === 1 ? "" : "s"}. Which
                    column is the case?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sheet.headers.map((header, column) => (
                      <button
                        key={column}
                        type="button"
                        onClick={() => setSheetColumn(column)}
                        aria-pressed={sheetColumn === column}
                        className={cn(
                          "min-h-9 max-w-[14rem] truncate rounded-lg border px-2.5 text-sm transition-colors",
                          sheetColumn === column
                            ? "border-sky-500/60 bg-sky-500/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-sky-500/40",
                        )}
                      >
                        {header || `Column ${column + 1}`}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={sheetSkipHeader}
                      onChange={(event) => setSheetSkipHeader(event.target.checked)}
                      className="h-4 w-4"
                    />
                    The first row is column names, not a case
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {broughtCases.length} case
                    {broughtCases.length === 1 ? "" : "s"} ready. First one:{" "}
                    {broughtCases[0]?.text?.slice(0, 80) || "—"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {door === "records" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Pick records you already keep — files, documents, past outputs.
                Each one becomes a card with its own name on it. Nothing is
                attached to the Rulebook by picking it here.
              </p>
              <div className="rounded-lg border border-border bg-card p-2">
                <UniversalAssociationPicker
                  tokens={DUMP_SOURCE_TOKENS}
                  orgId={null}
                  attachedKeys={
                    new Set(picked.map((record) => `${record.token}:${record.id}`))
                  }
                  // Picking here attaches NOTHING to the Rulebook — the record
                  // becomes a card on this table and that is all. The picker's
                  // contract is an async attach that reports its own outcome,
                  // so these say `ok` immediately: adding a row to a local list
                  // cannot fail, and claiming it might would be a screen
                  // inventing a failure mode it does not have.
                  onAttach={async (token: EntityTypeToken, id: string, title: string) => {
                    setPicked((prev) =>
                      prev.some((r) => r.token === token && r.id === id)
                        ? prev
                        : [
                            ...prev,
                            { token: String(token), id, title: title || id },
                          ],
                    );
                    return { ok: true };
                  }}
                  onDetach={async (token: EntityTypeToken, id: string) => {
                    setPicked((prev) =>
                      prev.filter((r) => !(r.token === token && r.id === id)),
                    );
                    return { ok: true };
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {picked.length} picked.
              </p>
            </div>
          ) : null}

          {door === "write" ? (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <p className="text-sm text-foreground">
                We'll write {knobs.casesPerRound} realistic cases from this
                Rulebook's own craft, spread across your piles, with deliberate
                near-misses so there is an edge worth arguing about.
              </p>
              <AgentCredit mandate={SORT_CASE_WRITER_MANDATE} />
            </div>
          ) : null}
        </section>

        {problem ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {problem}
            <ErrorAlchemyMenu error={problem} />
          </p>
        ) : null}

        <Button
          size="lg"
          className="min-h-12 w-full text-base"
          disabled={busy}
          onClick={() => void start()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Writing your cases…
            </>
          ) : (
            <>
              Start sorting
              <ArrowRight className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    );
  }

  // ── sorting ──────────────────────────────────────────────────────────────
  if (phase === "sorting") {
    const current = cases[index];
    if (!current) {
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Check className="h-7 w-7" />
            </span>
            <h2 className="text-2xl font-semibold text-foreground">
              {sortedCount} sorted
            </h2>
            <p className="text-base text-muted-foreground">
              {piles
                .map(
                  (pile) =>
                    `${
                      Object.values(assignments).filter((k) => k === pile.key).length
                    } ${pile.name}`,
                )
                .join(" · ")}
              {cases.length - sortedCount
                ? ` · ${cases.length - sortedCount} skipped`
                : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Now the part that matters: we'll pick the cases that sat closest on
              opposite sides of a line and ask you what separates them.
            </p>
          </div>
          {problem ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {problem}
              <ErrorAlchemyMenu error={problem} />
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              size="lg"
              className="min-h-12 flex-1 text-base"
              disabled={busy}
              onClick={() => void findTheBoundary()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Finding the line…
                </>
              ) : (
                <>
                  Find the line
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="min-h-12 text-base text-muted-foreground"
              onClick={() => {
                setIndex(0);
                setHistory([]);
              }}
            >
              <Undo2 className="mr-2 h-5 w-5" />
              Sort them again
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-4 sm:px-6">
        {resumedNote ? (
          <p className="mb-3 shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-sm text-sky-700 dark:text-sky-300">
            {resumedNote}
          </p>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Case {index + 1} of {cases.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Undo
          </Button>
        </div>
        {/* 🚨 THE PROGRESS BAR IS A PROGRESS BAR (jobs-bar-2026-09-16, item 16).
            `role="presentation"` hid it from every assistive technology, and on
            the first case it renders zero width — so what a sighted person saw
            was a flat grey rule they read as a divider, and what a screen-reader
            user got was nothing at all. */}
        <div
          className="mt-2 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={cases.length}
          aria-valuenow={index}
          aria-valuetext={`${index} of ${cases.length} cases sorted`}
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-300"
            style={{ width: `${Math.max(index === 0 ? 0 : 2, (index / cases.length) * 100)}%` }}
          />
        </div>

        {/* THE CARD scrolls; the piles do not. A pile button below the fold is
            a sort you cannot finish on a phone.

            🚨 AND IT IS A CARD (jobs-bar-2026-09-16, item 16). The case used to
            be a bare paragraph floating in the middle of an otherwise empty
            screen — on a desktop, one sentence adrift in roughly six hundred
            pixels of nothing, with no edge anywhere to say "this is the thing
            you are deciding about". Every other surface in this product puts the
            subject of a decision on a card; this one is the surface where the
            decision IS the product. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain py-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <p className="text-lg font-medium leading-relaxed text-foreground">
              {current.text}
            </p>
            {current.note ? (
              <p className="mt-2 text-xs text-muted-foreground">{current.note}</p>
            ) : null}
          </div>
          {roundNote ? (
            <p className="mt-4 text-xs text-muted-foreground">{roundNote}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 pb-safe pt-3 backdrop-blur">
          <div className="flex flex-wrap gap-2">
            {piles.map((pile, i) => (
              <button
                key={pile.key}
                type="button"
                data-sort-pile={pile.key}
                onClick={() => place(pile.key)}
                className="min-h-14 flex-1 basis-[8rem] rounded-xl border-2 border-border bg-card px-3 text-base font-medium text-foreground transition-colors hover:border-sky-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 active:bg-sky-500/10"
              >
                {pile.name}
                <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
          <p className="hidden text-center text-xs text-muted-foreground sm:block">
            Or use your keyboard: {piles.map((_, i) => i + 1).join(", ")} for the
            piles, S to skip, U to undo.
          </p>
          <Button
            size="lg"
            variant="ghost"
            className="min-h-11 text-sm text-muted-foreground"
            onClick={skipCase}
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Can't place this one
          </Button>
        </div>
      </div>
    );
  }

  // ── the boundary questions ───────────────────────────────────────────────
  if (phase === "boundary") {
    const question = questions[questionIndex];
    if (!question) {
      const failures = Object.values(saveStates).filter((s) => s.kind === "failed");
      // 🚨 "NOTHING DRAFTED" IS A CLAIM, AND IT MUST NOT BE MADE WHILE ANSWERS
      // ARE STILL IN THE AIR. Found on the real pipe, 2026-09-15: five answers
      // distilled into five rules server-side while this screen said "Nothing
      // drafted this round" — the submits were still running when the round
      // ended (each one is fired and the round moves on, deliberately), and the
      // summary read a receipt count as a result count. The server finishes a
      // detached submit whether or not the tab is still listening, so a screen
      // that reports zero here is not just early, it can be permanently wrong.
      const inFlight = Object.values(saveStates).filter(
        (s) => s.kind === "saving",
      ).length;
      /** Questions she actually answered — a skipped one is not a silence. */
      const answeredCount = Object.keys(saveStates).length;
      return (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Check className="h-7 w-7" />
            </span>
            <h2 className="text-2xl font-semibold text-foreground">
              That's the round
            </h2>
            <p className="text-base text-muted-foreground">
              {rulesThisSitting
                ? `${rulesThisSitting} rule${rulesThisSitting === 1 ? "" : "s"} drafted from ${sortedCount} sorted cases.`
                : inFlight
                  ? `${sortedCount} cases sorted. Still saving your answers…`
                  : answeredCount
                    ? `${sortedCount} cases sorted. Nothing new came out of what you said this time.`
                    : "Nothing answered this round."}
            </p>
          </div>
          {inFlight > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              {inFlight} answer{inFlight === 1 ? " is" : "s are"} still being
              turned into rules. They finish on our side even if you close this —
              open the Rulebook in a moment to see them.
            </p>
          ) : null}
          {failures.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {failures.length} answer{failures.length === 1 ? "" : "s"} didn't
              save. Nothing of yours was written for{" "}
              {failures.length === 1 ? "it" : "them"} — sort another round and
              say it again.
              <ErrorAlchemyMenu />
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="min-h-12 flex-1 text-base"
              onClick={() => {
                setPhase("setup");
                setCases([]);
                setQuestions([]);
                setPastedText("");
                setSheet(null);
                setPicked([]);
              }}
            >
              <RefreshCw className="mr-2 h-5 w-5" />
              Sort another pile
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="min-h-12 flex-1 text-base"
            >
              <Link href={`/masterwork/${rulebookId}`}>
                See what landed{rulesThisSitting ? ` (${rulesThisSitting})` : ""}
              </Link>
            </Button>
          </div>
        </div>
      );
    }

    const lastState = saveStates[questions[questionIndex - 1]?.id ?? ""];

    return (
      <MasterworkDictationOrigin
        surface="masterwork.sorting_table"
        rulebookId={rulebookId}
        rulebookName={rulebookName}
      >
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-4 sm:px-6">
          {resumedNote ? (
            <p className="mb-3 shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-sm text-sky-700 dark:text-sky-300">
              {resumedNote}
            </p>
          ) : null}
          <div className="flex shrink-0 items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Question {questionIndex + 1} of {questions.length}
            </span>
            <LastAnswerStatus state={lastState} />
          </div>
          <div
            className="mt-2 h-1 w-full shrink-0 overflow-hidden rounded-full bg-muted"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-300"
              style={{ width: `${(questionIndex / questions.length) * 100}%` }}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain py-4">
            {question.kind === "pair" ? (
              <>
                <p className="text-sm font-medium text-sky-600 dark:text-sky-400">
                  These two came out almost identical — and you split them.
                </p>
                <div className="flex flex-col gap-2">
                  <QuoteCard pile={question.leftPile} text={question.leftCase} />
                  <QuoteCard pile={question.rightPile} text={question.rightCase} />
                </div>
                <p className="text-lg font-medium leading-relaxed text-foreground">
                  What makes one of them {question.leftPile} and the other{" "}
                  {question.rightPile}?
                </p>
                {/* The arithmetic, on screen. "These sat closest" is a claim
                    this screen makes to her face; the number behind it is hers
                    to see. */}
                <p className="text-xs text-muted-foreground">
                  Closest pair across that line in this round ({Math.round(
                    question.closeness * 100,
                  )}
                  % word overlap).
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-sky-600 dark:text-sky-400">
                  You named a pile and never used it.
                </p>
                <p className="text-lg font-medium leading-relaxed text-foreground">
                  {question.prompt}
                </p>
                <p className="text-xs text-muted-foreground">
                  There are no cases behind this one — that is the point of it.
                </p>
              </>
            )}

            <div className="space-y-2">
              <label
                htmlFor="sort-answer"
                className="block text-base font-medium text-foreground"
              >
                In your own words
              </label>
              <p className="text-sm text-muted-foreground">
                One or two lines is plenty. What you say here is the rule — the
                cases are just what made you say it.
              </p>
              <ProTextarea
                id="sort-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onTranscriptionComplete={(text) =>
                  setAnswer((prev) => (prev ? `${prev} ${text}` : text))
                }
                enableVoice={voiceOn}
                placeholder="Because…"
                className="text-base"
                minHeight={96}
                surfaceName="matrx-user/masterwork-rulebook"
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 pb-safe pt-3 backdrop-blur sm:flex-row-reverse">
            <Button
              size="lg"
              className="min-h-12 flex-1 text-base"
              disabled={!answer.trim()}
              onClick={answerAndAdvance}
            >
              {questionIndex + 1 < questions.length
                ? "Save and next"
                : "Save and finish"}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="min-h-12 text-base text-muted-foreground sm:flex-none"
              onClick={() => {
                setAnswer("");
                setQuestionIndex((n) => n + 1);
              }}
            >
              <SkipForward className="mr-2 h-5 w-5" />
              Skip this one
            </Button>
          </div>
        </div>
      </MasterworkDictationOrigin>
    );
  }

  // ── a round with no edge at all ──────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 overflow-y-auto px-4 pb-safe pt-6 sm:px-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold text-foreground">
          No line to find in that one
        </h2>
        {/* HONEST, never padded. A round where everything went in one pile, or
            where no two cases resemble each other, genuinely has no boundary —
            and inventing a question about it would waste the one thing this
            lane spends. */}
        <p className="text-base text-muted-foreground">
          You sorted {sortedCount} case{sortedCount === 1 ? "" : "s"}, but no two
          of them landed close enough on opposite sides of a line to be worth
          asking about — and every pile got used. Sort a pile with some genuine
          near-misses in it and there will be.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="min-h-12 flex-1 text-base"
          onClick={() => {
            setPhase("setup");
            setCases([]);
            setQuestions([]);
          }}
        >
          <RefreshCw className="mr-2 h-5 w-5" />
          Sort another pile
        </Button>
        <Button asChild size="lg" variant="outline" className="min-h-12 flex-1 text-base">
          <Link href={`/masterwork/${rulebookId}`}>Back to the Rulebook</Link>
        </Button>
      </div>
    </div>
  );
}

/** One case of a boundary pair, with the pile she put it in. */
function QuoteCard({ pile, text }: { pile: string; text: string }) {
  return (
    <div className="rounded-xl border-2 border-border bg-card p-3">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">
        {pile}
      </span>
      <span className="block text-base leading-relaxed text-foreground">
        {text}
      </span>
    </div>
  );
}

/** The previous answer's fate, in one short honest phrase. */
function LastAnswerStatus({ state }: { state: SaveState | undefined }) {
  if (!state || state.kind === "idle") return null;
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving the last one…
      </span>
    );
  }
  if (state.kind === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
        <TriangleAlert className="h-4 w-4" />
        Last one didn't save
        <ErrorAlchemyMenu />
      </span>
    );
  }
  if (state.alreadyAnswered) {
    return (
      <span className="text-sm text-muted-foreground">Already had that one</span>
    );
  }
  if (state.added === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        Nothing new from that one
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
      <Check className="h-4 w-4" />
      {state.added} rule{state.added === 1 ? "" : "s"} drafted
      {state.unverified ? " (1 quote flagged)" : ""}
    </span>
  );
}
