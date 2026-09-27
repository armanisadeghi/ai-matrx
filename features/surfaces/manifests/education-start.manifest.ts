/**
 * Surface manifest — Create a study kit (`matrx-user/education-start`).
 *
 * `/education/start` (and `?from=files`): the study-kit front door. The person
 * gives ONE piece of material (a file they already own, an upload, pasted
 * text, or a link), picks what to make from it (flashcards, summary, quiz,
 * mind map, audio, notes, memory aids, practice test), how much (depth and an
 * optional exact count) and an optional focus, then presses "Build my study
 * kit". The page then becomes the live kit board: reading the material,
 * naming the kit, and each study aid's progress until it lands.
 *
 * Before this surface existed the page fell through to the public hub surface
 * (`matrx-user/education`), which declares none of the form or the run.
 *
 * Write half: ONE draft target, `ask`.
 *  - `kit_request_draft` fills the form — input kind, pasted text, link, a
 *    file the person owns (by id, looked up exactly as the "Choose from my
 *    files" button does), the outputs, depth, count and focus. NOTHING is
 *    built: building spends the person's kit allowance and passes the
 *    guardian-consent and plan checks, so the person presses the button.
 *    Validation (whole value, before the approval card):
 *    `features/education/onboard/startAgentWrites.ts`.
 * No entity targets: the page lists no records; the kit it creates is made
 * by the page's own Build button and managed on the kit and library pages.
 *
 * Emitter: `features/education/onboard/components/StartHero.tsx` via the
 * pure builder `features/education/onboard/startSurfaceScope.ts`.
 */

import { INLINE_TIER } from "@/features/surfaces/types";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_START_SURFACE_NAME = "matrx-user/education-start";

const groups: SurfaceValueGroup[] = [
  {
    key: "request",
    label: "Kit request",
    sortOrder: 100,
    description: "The form: the material, what to make, how much, and the focus.",
  },
  {
    key: "run",
    label: "Kit build",
    sortOrder: 200,
    description: "The live build after the person presses Build my study kit.",
  },
];

const OUTPUT_KINDS =
  '"deck" (flashcards), "summary", "quiz", "mind_map", "audio" (audio overview), "notes", "memory_aid", "practice_test"';

const surfaceSpecific: SurfaceValue[] = [
  // ── Request ─────────────────────────────────────────────────────────────
  {
    name: "kit_request_draft",
    label: "Kit request",
    description: `Everything the form holds, as { input_mode, paste_text, url, file_id, outputs, depth, count, focus }. input_mode is the open tab: "files" (a file they already own), "upload", "paste" or "link". paste_text / url / file_id are that tab's input ("" or null when empty; the other tabs keep what was typed). outputs are the chosen kinds (${OUTPUT_KINDS}); depth is "quick" | "standard" | "thorough"; count is the exact number of cards/questions or null (sized to the material); focus is the optional focus line. The read twin of the kit_request_draft write target. Always present.`,
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 600,
    inlineUpTo: INLINE_TIER.record,
    sortOrder: 100,
    group: "request",
  },
  {
    name: "chosen_file",
    label: "File to upload",
    description:
      'The file dropped or browsed on the Upload tab, as { name, size_bytes, supported, note } — supported false means the page will not build from it, and note says why (the line the page shows). Absent when none is chosen.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 110,
    group: "request",
  },
  {
    name: "stored_file",
    label: "File from my files",
    description:
      "The file picked on the My files tab, as { file_id, file_name, mime_type, supported }. Nothing is uploaded again; the kit is built from this file. Absent when none is picked.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 120,
    group: "request",
  },
  {
    name: "output_options",
    label: "What we can make",
    description: `Every output the "What should we make?" grid offers, as [{ kind, label, available, selected }]. kind is one of ${OUTPUT_KINDS}; available false shows as "soon" and cannot be chosen. Always present.`,
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    sortOrder: 130,
    group: "request",
  },
  {
    name: "can_build",
    label: "Ready to build",
    description:
      "True when the Build my study kit button is enabled: the open tab has usable input, at least one output is chosen, and no build is running. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 140,
    group: "request",
  },

  // ── Run ─────────────────────────────────────────────────────────────────
  {
    name: "kit_phase",
    label: "Build phase",
    description:
      '"idle" (the form is showing), "ingesting" (reading the material), "generating" (making the study aids), "done", or "error" (the form is back with kit_error). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 200,
    group: "run",
  },
  {
    name: "kit_error",
    label: "Build error",
    description: "Why the build stopped, as the page shows it. Present only when kit_phase is \"error\".",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 210,
    group: "run",
  },
  {
    name: "ingest_progress",
    label: "Reading progress",
    description:
      'The live reading line, as { phase, message, ratio, detail } — phase "uploading" | "extracting" | "scraping" | "transcribing" | "ready"; ratio 0-1 or null when it cannot be measured. Absent before a build starts.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 220,
    group: "run",
  },
  {
    name: "kit_title",
    label: "Kit name",
    description:
      "The kit's name, chosen once after reading, as { title, named } — named false means the namer was unavailable and this is the cleaned-up file name. Absent until reading finishes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 230,
    group: "run",
  },
  {
    name: "source_summary",
    label: "Material read",
    description:
      "What was read from the material, as { title, input_kind, pages, chars, truncated, extraction_method, file_id }. Absent until reading finishes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 240,
    group: "run",
  },
  {
    name: "kit_outputs",
    label: "Study aids in this build",
    description:
      'One entry per output being made, as [{ kind, label, status, title, href, artifact_id, still_generating, error, progress }]. status is "pending" | "running" | "success" | "error"; still_generating true means it exists but is still being produced (audio); progress is { done, total, label, items } for a big output made in sections, else null. Absent before a build starts.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 250,
    group: "run",
  },
  {
    name: "kit_href",
    label: "Kit page",
    description: "Link to the finished kit's page. Present only when kit_phase is \"done\" and the material has a file anchor.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 260,
    group: "run",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "kit_request_draft",
    label: "Fill the kit form",
    description: `Fills the Create a study kit form. NOTHING is built — the person reviews it and presses Build my study kit (building spends their kit allowance). Value is a JSON OBJECT (not a string, not an array) with any of: { input_mode?: "paste" | "link" | "files", paste_text?: string (the notes or text to study), url?: string (an http(s) page or YouTube link), file_id?: string (a file the person owns, e.g. from their files; checked before the card), outputs?: string[] (REPLACES the chosen outputs; kinds: ${OUTPUT_KINDS}; only kinds with available: true in output_options), depth?: "quick" | "standard" | "thorough", count?: integer 1-150 or null (null = size to the material), focus?: string ("" clears it) }. Only the fields you send change. paste_text, url and file_id each switch to their tab when input_mode is not given; send only one of them unless you also send input_mode. Refused, with nothing changed: "upload" (only the person can drop a file — use file_id for a file they already own), a bad URL, an unknown file id, an unknown or unavailable output, an empty outputs list, a count outside 1-150, unknown fields, and any fill while a build is running or its results are showing. Example: { "paste_text": "Photosynthesis turns light into…", "outputs": ["deck", "quiz"], "depth": "quick", "focus": "exam on chapter 3" }.`,
    valueType: "object",
    updatesValue: "kit_request_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "request",
    sortOrder: 100,
  },
];

export const educationStartManifest: SurfaceManifest = {
  surfaceName: EDUCATION_START_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Create a study kit: the material, outputs, depth and focus form, then the live kit build (/education/start). Fill the form with kit_request_draft.",
  readiness: "partial",
  readinessNote:
    "Emitter and kit_request_draft shipped 2026-09-27 with unit-tested validation. Not yet proven: no outside-helper binding test; a live build (kit_outputs through to done) is not exercised by the probe because it spends the allowance.",
  label: "Create a study kit",
  urlPattern: "/education/start",
  intro: `<surface_intro>
You are on Create a study kit at /education/start. The person gives one piece of material and picks what to make from it; the page builds a grounded, cited study kit.
kit_request_draft is everything the form holds; output_options says which outputs can be made; can_build says whether the Build button is enabled; kit_phase and kit_outputs show a build in progress or finished.
To set up a kit for the person, use the kit_request_draft target: it fills the form (pasted text, a link, or a file they own by id, plus outputs, depth, count and focus). It does not build — tell the person to press Build my study kit. Only the person can upload a new file.
Do not create flashcards, quizzes or summaries with other tools for this: the page's build grounds and cites every item in the material and files them as one kit.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

export interface KitRequestDraftScope {
  input_mode: string;
  paste_text: string;
  url: string;
  file_id: string | null;
  outputs: string[];
  depth: string;
  count: number | null;
  focus: string;
}

/** Type-safe payload helper. Required keys mirror `alwaysAvailable: true`. */
export function createEducationStartScope(values: {
  kit_request_draft: KitRequestDraftScope;
  output_options: { kind: string; label: string; available: boolean; selected: boolean }[];
  can_build: boolean;
  kit_phase: string;
  selection?: string;
  context?: Record<string, unknown>;
  chosen_file?: { name: string; size_bytes: number; supported: boolean; note: string };
  stored_file?: { file_id: string; file_name: string; mime_type: string; supported: boolean };
  kit_error?: string;
  ingest_progress?: { phase: string; message: string; ratio: number | null; detail: string | null };
  kit_title?: { title: string; named: boolean };
  source_summary?: {
    title: string;
    input_kind: string;
    pages: number | null;
    chars: number;
    truncated: boolean;
    extraction_method: string | null;
    file_id: string | null;
  };
  kit_outputs?: {
    kind: string;
    label: string;
    status: string;
    title: string | null;
    href: string | null;
    artifact_id: string | null;
    still_generating: boolean;
    error: string | null;
    progress: { done: number; total: number; label: string; items: number } | null;
  }[];
  kit_href?: string;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
