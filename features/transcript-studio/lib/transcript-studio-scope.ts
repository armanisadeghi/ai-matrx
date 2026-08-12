/**
 * Runtime scope builder for `matrx-user/transcript-studio`.
 *
 * WHY A BUILDER MODULE AND NOT AN IN-FILE HELPER. The studio's raw workspace
 * data is four independent normalized registries (raw / cleaned / concept /
 * module segments) plus a settings row, and several declared values are
 * DERIVED from them rather than stored (the pipeline windows below). That is
 * the "complex surface" case in the `surface-authoring` skill, so the
 * derivation lives here beside the feature and returns through the manifest's
 * `createTranscriptStudioScope(...)` so TypeScript still enforces the
 * declaration.
 *
 * THE VOCABULARY IS ADOPTED, NOT INVENTED. The studio has driven three agent
 * pipelines since 2026-05-15 through hand-coded scope keys in
 * `../service/agentScopeBuilder.ts` and `../modules/_lib/buildModuleScope.ts`:
 *
 *   cleaning pass  → `prior_cleaned_suffix`, `raw_window`, `session_title`, `module_id`
 *   concept pass   → `raw_window`, `prior_concepts`, `session_title`, `module_id`
 *   module pass    → `cleaned_window`, `prior_summary`, `session_title` (+ per-module keys)
 *
 * Every one of those names is declared on the manifest and emitted here with
 * the SAME meaning, computed by calling the SAME builders the pipelines call.
 * A header-launched agent therefore reads exactly what the column agents are
 * fed — no parallel vocabulary, which is what the manifest's `readinessNote`
 * warned against.
 *
 * Read at TRIGGER TIME from the store, never from a render snapshot: the
 * studio streams new raw chunks continuously while recording, so a scope
 * captured at render is stale within seconds.
 */

import type { RootState } from "@/lib/redux/store";
import {
  createTranscriptStudioScope,
  type StudioConceptItemValue,
  type StudioSegmentValue,
} from "@/features/surfaces/manifests/transcript-studio.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  selectCleanedSegments,
  selectRawSegments,
  selectSessionCleanedText,
  selectSessionRawText,
} from "../redux/selectors";
import {
  buildCleaningWindow,
  buildConceptWindow,
} from "../service/agentScopeBuilder";
import { getModule } from "../modules/registry";
import type { ConceptItem, ModuleSegment, StudioSession } from "../types";

/** Max characters of full raw/cleaned transcript text put into scope. */
const TRANSCRIPT_CHAR_BUDGET = 20_000;

function clip(text: string, budget = TRANSCRIPT_CHAR_BUDGET): string {
  if (text.length <= budget) return text;
  return `…${text.slice(-(budget - 1))}`;
}

function readConceptItems(
  state: RootState,
  sessionId: string,
): ConceptItem[] {
  const ids = state.transcriptStudio.conceptIdsBySession[sessionId];
  const byId = state.transcriptStudio.conceptsById[sessionId];
  if (!ids || !byId) return [];
  const out: ConceptItem[] = [];
  for (const id of ids) {
    const item = byId[id];
    if (item) out.push(item);
  }
  return out;
}

function readModuleSegments(
  state: RootState,
  sessionId: string,
): ModuleSegment[] {
  const ids = state.transcriptStudio.moduleSegmentIdsBySession[sessionId];
  const byId = state.transcriptStudio.moduleSegmentsById[sessionId];
  if (!ids || !byId) return [];
  const out: ModuleSegment[] = [];
  for (const id of ids) {
    const seg = byId[id];
    if (seg) out.push(seg);
  }
  return out;
}

/**
 * Build the studio's `ApplicationScope`.
 *
 * `sessionId` is the ACTIVE session (Redux `activeSessionId`). When it is null
 * — the studio's empty state, before any session is picked — every
 * session-scoped value is omitted and only the always-available counts are
 * emitted, which is exactly what `alwaysAvailable: false` promises.
 */
export function buildTranscriptStudioScope(
  state: RootState,
  sessionId: string | null,
): SurfaceScopePayload {
  const session: StudioSession | undefined = sessionId
    ? state.transcriptStudio.byId[sessionId]
    : undefined;

  if (!sessionId || !session) {
    return createTranscriptStudioScope({
      session_count: Object.keys(state.transcriptStudio.byId).length,
    });
  }

  const rawSegments = selectRawSegments(sessionId)(state);
  const cleanedSegments = selectCleanedSegments(sessionId)(state);
  // Only `processorKey === "clean"` rows feed the canonical session clean —
  // custom per-segment processors write their own slot keys and must not be
  // mixed into the cleaned vocabulary the cleaning pass reasons about.
  const canonicalCleaned = cleanedSegments.filter(
    (c) => c.processorKey === "clean" && !c.supersededAt,
  );
  const conceptItems = readConceptItems(state, sessionId);
  const moduleSegments = readModuleSegments(state, sessionId);

  // ── The three pipelines' windows, computed by the pipelines' own builders ──
  const cleaningWindow = buildCleaningWindow({
    rawSegments,
    cleanedSegments: canonicalCleaned,
    session,
  });

  // The concept pass starts strictly after the last raw covered by a
  // successful pass; the coverage high-water mark is the largest `tEnd`
  // recorded on the concepts themselves.
  const lastConceptCoverageTEnd = conceptItems.reduce(
    (max, c) => (c.tEnd !== null && c.tEnd > max ? c.tEnd : max),
    0,
  );
  const conceptWindow = buildConceptWindow({
    rawSegments,
    cleanedSegments: canonicalCleaned,
    conceptItems,
    lastConceptCoverageTEnd,
    session,
  });

  // Column 4's window comes from the ACTIVE module's own `buildScope`, so a
  // module that redefines its variable surface stays authoritative here.
  const activeModule = getModule(session.moduleId);
  const priorModuleSegments = moduleSegments.filter(
    (s) => s.moduleId === session.moduleId,
  );
  const lastModuleCoverageTEnd = priorModuleSegments.reduce(
    (max, s) => (s.tEnd !== null && s.tEnd > max ? s.tEnd : max),
    0,
  );
  const moduleScope = activeModule?.buildScope({
    rawSegments,
    cleanedSegments: canonicalCleaned,
    conceptItems,
    priorModuleSegments,
    lastModuleCoverageTEnd,
    session,
  });
  const moduleScopeBag = (moduleScope?.scope ?? {}) as Record<string, unknown>;
  const cleanedWindow =
    typeof moduleScopeBag.cleaned_window === "string"
      ? moduleScopeBag.cleaned_window
      : "";
  const priorSummary =
    typeof moduleScopeBag.prior_summary === "string"
      ? moduleScopeBag.prior_summary
      : typeof moduleScopeBag.prior_tasks === "string"
        ? moduleScopeBag.prior_tasks
        : "";

  const conceptValues: StudioConceptItemValue[] = conceptItems.map((c) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
    description: c.description,
    t_start: c.tStart,
    t_end: c.tEnd,
  }));

  const cleanedValues: StudioSegmentValue[] = canonicalCleaned.map((c) => ({
    id: c.id,
    text: c.text,
    t_start: c.tStart,
    t_end: c.tEnd,
  }));

  const rawValues: StudioSegmentValue[] = rawSegments.map((r) => ({
    id: r.id,
    text: r.text,
    t_start: r.tStart,
    t_end: r.tEnd,
  }));

  const settings = state.transcriptStudio.settingsBySession[sessionId];

  return createTranscriptStudioScope({
    session_count: Object.keys(state.transcriptStudio.byId).length,

    // Session identity
    active_session_id: sessionId,
    session_title: session.title ?? "",
    session_status: session.status,
    session_source: session.source,
    session_started_at: session.startedAt,
    session_duration_ms: session.totalDurationMs,
    linked_transcript_id: session.transcriptId ?? undefined,

    // Column content
    raw_transcript_text: clip(selectSessionRawText(sessionId)(state)),
    raw_segments: rawValues,
    cleaned_transcript_text: clip(selectSessionCleanedText(sessionId)(state)),
    cleaned_segments: cleanedValues,
    concept_items: conceptValues,
    module_segments: moduleSegments.map((s) => ({
      id: s.id,
      module_id: s.moduleId,
      block_type: s.blockType,
      payload: s.payload,
      t_start: s.tStart,
      t_end: s.tEnd,
    })),
    module_id: session.moduleId,

    // Pipeline windows — the adopted hand-coded vocabulary
    raw_window: cleaningWindow.rawWindow,
    prior_cleaned_suffix: cleaningWindow.priorCleanedSuffix,
    prior_concepts: conceptWindow.priorConcepts,
    cleaned_window: cleanedWindow,
    prior_summary: priorSummary,

    // Pipeline cadence
    cleaning_interval_ms: settings?.cleaningIntervalMs,
    concept_interval_ms: settings?.conceptIntervalMs,
    module_interval_ms: settings?.moduleIntervalMs ?? undefined,

    // Back-compat baseline alias: `content` is the cleaned transcript when
    // cleaning has produced anything, else the raw text, so a legacy shortcut
    // bound to `content` still receives the best available transcript.
    content:
      clip(selectSessionCleanedText(sessionId)(state)) ||
      clip(selectSessionRawText(sessionId)(state)),
  });
}
