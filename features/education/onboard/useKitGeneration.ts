// features/education/onboard/useKitGeneration.ts
//
// The Study Kit orchestrator: the picked Sources → (resolve + anchor) → (naming)
// → (converter fan-out) → live per-target state. It owns NO generation logic of
// its own — ingest owns raw→text, the converter owns text→artifact. It sequences
// them, surfaces progress, and keeps the run alive across a reload.
//
// 🚨 A KIT IS NEVER LOST WITH ITS TAB (2026-10-03). A 6-output build from four
// Sources ran 14 minutes in the tab; the tab closed and five of six aids were
// gone with no notice. The agent calls themselves run on the server and finish
// when the tab closes (every agent stream detaches); what died was the tab's
// merge and save. So the run is a TAB-BOUND RUN (`useTabBoundRun`) with a
// JOURNAL written as it goes:
//   - the request (what was asked: the Sources as a frozen SourceSet, the
//     outputs, depth/count/focus, the organization) — written before it starts;
//   - the anchor and the kit's name, once known — a continued kit keeps both,
//     so its artifacts land in the SAME kit and no `.md` copy is made twice;
//   - every output that saved (its artifact id and link) — never made twice;
//   - the conversation each section ran in — a continued output reads finished
//     sections back from the server (`convert/sectionJournal.ts`) instead of
//     paying for them again.
// A continued run also asks the database which outputs already saved for this
// anchor since the run started (the lineage edges every output writes), so an
// output that saved in the instant before the tab closed is adopted, not
// duplicated. A reload continues by itself (StartHero); a run found later is
// offered with one Continue.

"use client";

import { useRef, useState } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { getGenerator } from "@/features/education/convert/registry";
import { resolveKitTitle, type KitTitle } from "./kitTitle";
import type {
  ConvertOptions,
  TargetKind,
} from "@/features/education/convert/types";
import { ALL_TARGET_KINDS } from "@/features/education/convert/types";
import { isCoverageDepth } from "@/features/education/convert/coverage";
import type { SectionJournal } from "@/features/education/convert/sectionJournal";
import { useContentConverter } from "@/features/education/convert/useContentConverter";
import type { ResolvedSourceSet, SourceSet } from "@ai-matrx/agents/sources";
import { sourcesClient } from "@/features/resource-manager/source-input/sourceSetApi";
import { useTabBoundRun } from "@/lib/wizard-draft/useTabBoundRun";
import { readKit, renameKit } from "@/features/education/kits/kitService";
import { addKitSource, createKitScope, KIT_TOKEN } from "@/features/education/kits/kitScope";
import { useIngest } from "./useIngest";
import type {
  IngestProgress,
  KitTargetState,
  NormalizedIngest,
} from "./types";

export type KitPhase = "idle" | "ingesting" | "generating" | "done" | "error";

/** The run marker's key — one kit build per device at a time on /education/start. */
export const KIT_RUN_KEY = "education:start:kit";

/** What a kit build asked for — everything a continuation needs to ask again. */
export interface KitRunRequest {
  kinds: TargetKind[];
  options: ConvertOptions;
  orgId: string;
  /** The picked Sources, frozen — a continuation re-reads exactly these. */
  sourceSet: SourceSet;
  /** Epoch ms the FIRST attempt started — outputs saved since then belong to this kit. */
  startedAt: number;
}

/** One output that saved. */
interface DoneTarget {
  artifactId: string;
  resourceType: string;
  href: string;
  title: string;
  detail?: string;
  pending?: boolean;
}

/** What the run has done so far (JSON, kept in the run marker). */
export interface KitRunJournal {
  source?: Omit<NormalizedIngest, "text">;
  title?: KitTitle;
  /** The name the person typed over the derived one. */
  renamedTo?: string;
  done?: Partial<Record<TargetKind, DoneTarget>>;
  /** plan key → segment id → conversation id (`convert/sectionJournal.ts`). */
  sections?: Record<string, Record<string, string>>;
}

/** The stored request back, or null when it is not one this code can continue. */
export function restoreKitRunRequest(raw: Record<string, unknown>): KitRunRequest | null {
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((k): k is TargetKind => ALL_TARGET_KINDS.includes(k as TargetKind))
    : [];
  const set = raw.sourceSet as SourceSet | undefined;
  if (kinds.length === 0) return null;
  if (typeof raw.orgId !== "string" || !raw.orgId) return null;
  if (!set || typeof set !== "object" || !Array.isArray(set.sources) || set.sources.length === 0)
    return null;
  if (typeof raw.startedAt !== "number") return null;
  const o = (raw.options ?? {}) as Record<string, unknown>;
  const options: ConvertOptions = {
    ...(typeof o.focus === "string" && o.focus ? { focus: o.focus } : {}),
    ...(isCoverageDepth(o.depth) ? { depth: o.depth } : {}),
    ...(typeof o.count === "number" && o.count > 0 ? { count: o.count } : {}),
  };
  return { kinds, options, orgId: raw.orgId, sourceSet: set, startedAt: raw.startedAt };
}

function readJournal(raw: Record<string, unknown>): KitRunJournal {
  // Written only by this file, as JSON — read back as the same shape.
  return raw as KitRunJournal;
}

export interface UseKitGeneration {
  phase: KitPhase;
  /** Epoch ms the run started — the UI's elapsed clock reads from this. */
  startedAt: number | null;
  /** Epoch ms ingest finished (text in hand); null while still ingesting. */
  ingestFinishedAt: number | null;
  /** Live ingest progress line (upload/extract/scrape). */
  ingestProgress: IngestProgress | null;
  /** Per-target live state (pending → running → success/error). */
  targets: KitTargetState[];
  /** The normalized source, once ingest completes. */
  source: NormalizedIngest | null;
  /**
   * The kit's ONE name, resolved after ingest and carried by every artifact.
   * Null until ingest completes. `named: false` means the namer was unavailable
   * and this is the cleaned-up filename.
   */
  kitTitle: KitTitle | null;
  /** Top-level error (ingest failure sinks the whole run). */
  error: string | null;
  /** The thrown value behind `error`, for the error display. */
  errorCause: unknown;
  /** True when this run continues one that stopped with its page. */
  continued: boolean;
  busy: boolean;
  /**
   * Start a kit build. Resolves true once the material was read and every
   * output settled (so the caller can meter `ingest_document`), false on an
   * empty selection or a failed read.
   *
   * `orgId` is REQUIRED and resolved by the caller BEFORE the run starts (the
   * org gate's hold-at-the-button contract).
   */
  run: (
    sourceSet: SourceSet,
    kinds: TargetKind[],
    options: ConvertOptions | undefined,
    orgId: string,
  ) => Promise<boolean>;
  /** A build that stopped with its page (reload, closed tab), or null. */
  stopped: {
    request: KitRunRequest;
    stoppedAt: number;
    savedCount: number;
    title: string | null;
  } | null;
  /** Another open tab is building a kit right now. */
  runningElsewhere: boolean;
  /** Continue the stopped build: same kit, nothing saved is made again. */
  continueStopped: () => Promise<boolean>;
  dismissStopped: () => void;
  /** Rename the kit (now, or when it finishes when it is still building). */
  renameTitle: (title: string) => Promise<void>;
  /** Settle a streamed child after its own durable runner reports success. */
  markTargetReady: (kind: TargetKind) => void;
  reset: () => void;
}

export function useKitGeneration(): UseKitGeneration {
  const { normalizeSources } = useIngest();
  const { convertMany } = useContentConverter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const tabRun = useTabBoundRun<KitRunRequest>(KIT_RUN_KEY, restoreKitRunRequest);

  const [kitTitle, setKitTitle] = useState<KitTitle | null>(null);
  const [phase, setPhase] = useState<KitPhase>("idle");
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(null);
  const [targets, setTargets] = useState<KitTargetState[]>([]);
  const [source, setSource] = useState<NormalizedIngest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCause, setErrorCause] = useState<unknown>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [ingestFinishedAt, setIngestFinishedAt] = useState<number | null>(null);
  const [continued, setContinued] = useState(false);
  // The running build's journal and its writer — a rename typed mid-build goes
  // into it, so the run applies it at the end and a continuation keeps it.
  const live = useRef<{ journal: KitRunJournal; write: () => void } | null>(null);

  const reset = () => {
    setPhase("idle");
    setKitTitle(null);
    setIngestProgress(null);
    setTargets([]);
    setSource(null);
    setError(null);
    setErrorCause(null);
    setStartedAt(null);
    setIngestFinishedAt(null);
    setContinued(false);
  };

  const patchTarget = (kind: TargetKind, patch: Partial<KitTargetState>) => {
    setTargets((prev) =>
      prev.map((t) => (t.targetKind === kind ? { ...t, ...patch } : t)),
    );
  };

  const markTargetReady = (kind: TargetKind) => {
    patchTarget(kind, { stillGenerating: false, finishedAt: Date.now() });
  };

  /** Apply a name to the kit this run made. */
  const applyRename = async (kitId: string, title: string) => {
    const kit = await readKit(KIT_TOKEN, kitId);
    if (kit && kit.title !== title) await renameKit(kit, title);
  };

  const execute = async (
    request: KitRunRequest,
    prior: KitRunJournal,
    note: (journal: Record<string, unknown>) => void,
    isContinuation: boolean,
  ): Promise<boolean> => {
    const journal: KitRunJournal = {
      ...prior,
      done: { ...(prior.done ?? {}) },
      sections: { ...(prior.sections ?? {}) },
    };
    // A COPY goes to the store, never the object this run keeps writing to:
    // the journal is mutated as the run goes, and a mutated store object is
    // a state mutation (in dev, the invariant check throws on the next
    // dispatch — the run died mid-name and its marker went with it).
    const write = () => note(structuredClone(journal) as Record<string, unknown>);
    live.current = { journal, write };
    // Set once every output settled — a late name then renames the kit itself.
    let finished = false;
    const { kinds, options, orgId } = request;

    setError(null);
    setErrorCause(null);
    setSource(null);
    setKitTitle(null);
    setContinued(isContinuation);
    setPhase("ingesting");
    setIngestProgress(null);
    setStartedAt(Date.now());
    setIngestFinishedAt(null);
    setTargets(
      kinds.map((k) => ({
        targetKind: k,
        label: getGenerator(k)?.label ?? k,
        status: "pending" as const,
      })),
    );

    let normalized: NormalizedIngest;
    try {
      normalized = await normalizeSources(
        (): Promise<ResolvedSourceSet> =>
          sourcesClient.resolve(request.sourceSet, { organizationId: orgId }),
        setIngestProgress,
        journal.source?.ref,
        // The kit holds each Source itself — no merged `.md` copy.
        { copyAnchor: false },
      );
      setSource(normalized);
      setIngestFinishedAt(Date.now());
      const { text: _text, ...kept } = normalized;
      journal.source = kept;
      write();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that source.");
      setErrorCause(e);
      setPhase("error");
      return false;
    }

    // NAME THE KIT ONCE, here, between ingest and fan-out (`kitTitle.ts`). A
    // continued kit keeps the name it already has.
    if (!journal.title) setIngestProgress({ phase: "ready", message: "Naming your kit" });
    const resolvedTitle =
      journal.title ??
      (await resolveKitTitle(dispatch, store, {
        text: normalized.text,
        rawTitle: normalized.title,
        sourceTitles: normalized.meta.sourceTitles,
        focus: options.focus,
        orgId,
      }));
    const { late, ...titleNow } = resolvedTitle as KitTitle & {
      late?: Promise<KitTitle | null>;
    };
    journal.title = titleNow;
    write();

    // THE KIT, made once: its own record holding every picked Source
    // (`kits/kitScope.ts`). A continued run keeps the kit it already made.
    if (!normalized.ref.kitId) {
      setIngestProgress({ phase: "ready", message: "Making your kit" });
      const scope = await createKitScope(orgId, journal.renamedTo ?? titleNow.title);
      for (const kitSource of normalized.ref.kitSources ?? []) {
        await addKitSource(scope, kitSource);
      }
      normalized = { ...normalized, ref: { ...normalized.ref, kitId: scope.id } };
      setSource(normalized);
      const { text: _kept, ...kept } = normalized;
      journal.source = kept;
      write();
    }
    setKitTitle(journal.renamedTo ? { ...titleNow, title: journal.renamedTo } : titleNow);
    // A name that arrives after the deadline still names the kit (applied at
    // the end with `renameKit`) — unless the person already typed one.
    void late?.then((named) => {
      if (!named || journal.renamedTo) return;
      journal.title = named;
      journal.renamedTo = named.title;
      write();
      setKitTitle(named);
      const kitId = normalized.ref.kitId;
      if (finished && kitId) {
        applyRename(kitId, named.title).catch((e: unknown) =>
          console.error("[useKitGeneration] the kit's late name was not applied:", e),
        );
      }
    });

    // Outputs this kit already saved: the journal's, plus any the database
    // holds for this anchor since the run began (saved in the instant before
    // the page closed, before the journal heard of it).
    const anchorId = normalized.ref.kitId;
    if (isContinuation && anchorId) {
      try {
        const since = request.startedAt - 1_000;
        const made = (await readKit(KIT_TOKEN, anchorId))?.artifacts ?? [];
        for (const row of made) {
          const kind = row.targetKind;
          if (!kind || !kinds.includes(kind) || journal.done?.[kind]) continue;
          if (Date.parse(row.createdAt) < since) continue;
          journal.done![kind] = {
            artifactId: row.artifactId,
            resourceType: row.artifactType,
            href: row.href,
            title: row.title,
            detail: row.detail ?? undefined,
            pending: kind === "audio",
          };
        }
        write();
      } catch (e) {
        // Loud, and the kit goes on: the journal alone still prevents every
        // repeat it recorded.
        console.error("[useKitGeneration] could not read what this kit already saved:", e);
      }
    }

    setPhase("generating");
    const generationStartedAt = Date.now();
    const remaining = kinds.filter((k) => !journal.done?.[k]);
    setTargets((prev) =>
      prev.map((t) => {
        const saved = journal.done?.[t.targetKind];
        if (saved) {
          return {
            ...t,
            status: "success" as const,
            href: saved.href,
            title: saved.title,
            detail: saved.detail,
            artifactId: saved.artifactId,
            resourceType: saved.resourceType,
            stillGenerating: saved.pending === true,
            startedAt: generationStartedAt,
            finishedAt: saved.pending ? undefined : generationStartedAt,
          };
        }
        return { ...t, status: "running" as const, startedAt: generationStartedAt };
      }),
    );

    const sectionsFor = (kind: TargetKind): SectionJournal => ({
      recorded: (planKey) =>
        planKey.startsWith(`${kind}:`) ? (journal.sections?.[planKey] ?? {}) : {},
      started: (planKey, segmentId, conversationId) => {
        const sections = journal.sections ?? {};
        sections[planKey] = { ...(sections[planKey] ?? {}), [segmentId]: conversationId };
        journal.sections = sections;
        write();
      },
    });

    if (remaining.length > 0) {
      await convertMany(
        {
          text: normalized.text,
          // THE kit name — not the raw filename. Every generator reads this.
          title: journal.renamedTo ?? resolvedTitle.title,
          ref: normalized.ref,
        },
        remaining,
        options,
        (outcome) => {
          if (outcome.status === "success") {
            const r = outcome.result;
            journal.done![outcome.targetKind] = {
              artifactId: r.artifactId,
              resourceType: r.resourceType,
              href: r.href,
              title: r.title,
              detail: r.detail,
              pending: r.pending === true,
            };
            write();
            patchTarget(outcome.targetKind, {
              status: "success",
              finishedAt: Date.now(),
              href: r.href,
              title: r.title,
              detail: r.detail,
              artifactId: r.artifactId,
              resourceType: r.resourceType,
              stillGenerating: r.pending === true,
            });
          } else {
            patchTarget(outcome.targetKind, {
              status: "error",
              finishedAt: Date.now(),
              error: outcome.error,
              errorCause: outcome.cause,
            });
          }
        },
        (kind, requestId) => patchTarget(kind, { requestId }),
        (kind, progress) => patchTarget(kind, { coverage: progress }),
        orgId,
        sectionsFor,
      );
    }

    finished = true;
    const rename = journal.renamedTo;
    if (rename && anchorId) {
      try {
        await applyRename(anchorId, rename);
      } catch (e) {
        console.error("[useKitGeneration] the kit's new name was not applied:", e);
      }
    }
    setPhase("done");
    return true;
  };

  /** A run that breaks says so on the board — it never sits on its last line. */
  const guarded = async (work: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await work();
    } catch (e) {
      console.error("[useKitGeneration] the kit build broke:", e);
      setError(e instanceof Error ? e.message : "The kit build stopped.");
      setErrorCause(e);
      setPhase("error");
      return false;
    }
  };

  const run: UseKitGeneration["run"] = async (sourceSet, kinds, options, orgId) => {
    if (kinds.length === 0) {
      setError("Pick at least one thing to create.");
      setErrorCause(null);
      setPhase("error");
      return false;
    }
    const request: KitRunRequest = {
      kinds,
      options: options ?? {},
      orgId,
      sourceSet,
      startedAt: Date.now(),
    };
    return tabRun.track(request as unknown as Record<string, unknown>, (_settle, _saving, _attach, note) =>
      guarded(() => execute(request, {}, note, false)),
    );
  };

  const continueStopped = async (): Promise<boolean> => {
    const stopped = tabRun.stopped;
    if (!stopped) return false;
    const prior = readJournal(stopped.journal);
    return tabRun.track(
      stopped.request as unknown as Record<string, unknown>,
      (_settle, _saving, _attach, note) => guarded(() => execute(stopped.request, prior, note, true)),
      { continues: stopped.conversationIds, journal: stopped.journal },
    );
  };

  const renameTitle = async (title: string) => {
    const clean = title.trim();
    if (!clean || !kitTitle) return;
    setKitTitle({ ...kitTitle, title: clean });
    const anchorId = source?.ref.kitId;
    if (phase === "done") {
      if (anchorId) await applyRename(anchorId, clean);
      return;
    }
    // Still building: the run applies it when it finishes.
    if (live.current) {
      live.current.journal.renamedTo = clean;
      live.current.write();
    }
  };

  const stoppedJournal = tabRun.stopped ? readJournal(tabRun.stopped.journal) : null;
  return {
    phase,
    startedAt,
    ingestFinishedAt,
    ingestProgress,
    targets,
    source,
    kitTitle,
    error,
    errorCause,
    continued,
    busy: phase === "ingesting" || phase === "generating",
    run,
    stopped: tabRun.stopped
      ? {
          request: tabRun.stopped.request,
          stoppedAt: tabRun.stopped.stoppedAt,
          savedCount: Object.keys(stoppedJournal?.done ?? {}).length,
          title: stoppedJournal?.renamedTo ?? stoppedJournal?.title?.title ?? null,
        }
      : null,
    runningElsewhere: tabRun.runningElsewhere,
    continueStopped,
    dismissStopped: tabRun.dismiss,
    renameTitle,
    markTargetReady,
    reset,
  };
}
