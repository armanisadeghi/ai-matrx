import type { StudyKit } from "./kitService";
import { kitArtifactKey, kitMembershipFingerprint } from "./kitService";
import type { EducationLibraryRow } from "@/features/education/library/types";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import {
  collectProblems,
  readCollectionList,
  repeatsProblem,
} from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";

const MAX_KITS_PER_WRITE = 25;

function record(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${at} needs text.`);
  const trimmed = value.trim();
  return trimmed;
}

function kitFor(raw: Record<string, unknown>, at: string, kits: readonly StudyKit[]): StudyKit {
  const sourceId = text(raw.source_id, `${at}.source_id`);
  const sourceType = text(raw.source_type, `${at}.source_type`);
  const kit = kits.find((candidate) => candidate.sourceId === sourceId && candidate.sourceType === sourceType);
  if (!kit) throw new Error(`${sourceType}:${sourceId} is not in the current kit list.`);
  return kit;
}

function fingerprint(raw: Record<string, unknown>, at: string): string {
  return text(raw.expected_membership_fingerprint, `${at}.expected_membership_fingerprint`);
}

export function parseKitUpdates(value: unknown, kits: readonly StudyKit[]) {
  const target = "update_kits";
  return collectProblems(target, readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE), (item, index) => {
    const raw = record(item, `${target}[${index}]`);
    return { kit: kitFor(raw, `${target}[${index}]`, kits), fingerprint: fingerprint(raw, `${target}[${index}]`), title: text(raw.title, `${target}[${index}].title`) };
  }, { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ? `${item.value.kit.sourceType}:${item.value.kit.sourceId}` : ""), "kit")] });
}

export function parseKitDeletes(value: unknown, kits: readonly StudyKit[]) {
  const target = "delete_kits";
  return collectProblems(target, readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE), (item, index) =>
    (() => { const raw = record(item, `${target}[${index}]`); return { kit: kitFor(raw, `${target}[${index}]`, kits), fingerprint: fingerprint(raw, `${target}[${index}]`) }; })(),
  { listChecks: (items) => [repeatsProblem(target, items.map((item) => item.value ? `${item.value.kit.sourceType}:${item.value.kit.sourceId}` : ""), "kit")] });
}

/** How many saved aids an open kit offers its agent as candidates (bounded; the person has the full picker). */
export const KIT_MEMBER_CANDIDATE_LIMIT = 25;

/**
 * `add_kit_members` on an OPEN kit: exactly one entry naming this kit, its current membership
 * fingerprint, and qualified { kind, id } refs that each match a current candidate. The same rules
 * the Add saved aids dialog and add_kit_members enforce; the write itself is `createManualKit` (one write path).
 */
export function parseKitMemberAdds(
  value: unknown,
  kit: StudyKit,
  candidates: readonly EducationLibraryRow[],
): { title: string; artifacts: EducationLibraryRow[]; expectedFingerprint: string } {
  const target = "add_kit_members";
  const list = readCollectionList(target, "kits", value, MAX_KITS_PER_WRITE);
  if (list.length !== 1) throw new Error(`${target} accepts exactly one entry for the open kit.`);
  const raw = record(list[0], `${target}[0]`);
  if (raw.source_id !== kit.sourceId || raw.source_type !== kit.sourceType) {
    throw new Error(`${target}[0].source_id and source_type must equal kit_source_id and kit_source_type.`);
  }
  const expectedFingerprint = fingerprint(raw, `${target}[0]`);
  if (expectedFingerprint !== kitMembershipFingerprint(kit)) {
    throw new Error(`${target}[0].expected_membership_fingerprint is stale. Read kit_membership_fingerprint again.`);
  }
  const refs = raw.artifact_refs;
  if (!Array.isArray(refs) || !refs.length) throw new Error(`${target}[0].artifact_refs needs one or more saved study aids.`);
  const keys = refs.map((ref, index) => {
    const r = record(ref, `${target}[0].artifact_refs[${index}]`);
    return `${text(r.kind, `${target}[0].artifact_refs[${index}].kind`)}:${text(r.id, `${target}[0].artifact_refs[${index}].id`)}`;
  });
  if (new Set(keys).size !== keys.length) throw new Error(`${target}[0].artifact_refs must be distinct kind and id pairs.`);
  const inKit = new Set(kit.artifacts.map((artifact) => kitArtifactKey(artifact)));
  const artifacts = keys.map((key) => {
    if (inKit.has(key)) throw new Error(`${key} is already in this kit.`);
    const row = candidates.find((candidate) => `${candidate.kind}:${candidate.id}` === key);
    if (!row) throw new Error(`${key} is not one of kit_member_candidates.`);
    return row;
  });
  return { title: kit.title, artifacts, expectedFingerprint };
}

// ── generate_in_kit ───────────────────────────────────────────────────────

/** The kinds chat can make in a kit (audio stays a person's own click: it runs for minutes). */
export const GENERATE_IN_KIT_KINDS = ["deck", "quiz", "practice_test", "notes", "summary", "mind_map", "memory_aid"] as const;
export type GenerateInKitKind = (typeof GENERATE_IN_KIT_KINDS)[number];

const GENERATE_CARD_KINDS = ["basic", "cloze", "matching", "formula"] as const;
const GENERATE_QUESTION_TYPES = ["multiple_choice", "true_false", "fill_blank", "short_answer", "written_response"] as const;

/** The most items one chat request may ask for (the person's own per-run limit still applies at run time). */
export const GENERATE_IN_KIT_MAX_COUNT = 100;
const GENERATE_INSTRUCTION_MAX = 1_000;

/** The run a validated `generate_in_kit` asks for. Plain JSON: it is also what the run marker keeps. */
export interface KitGenerateRequest {
  kind: GenerateInKitKind;
  /** The live deck / quiz of THIS kit the items are added to. */
  into?: { id: string; title: string; artifactType: string };
  count?: number;
  cardKinds: string[];
  questionTypes: string[];
  instruction?: string;
  /** Outline section ids (resolved from the titles the agent sent), outline order. */
  sectionIds: string[];
  sectionTitles: string[];
}

function pickFrom(raw: unknown, allowed: readonly string[], at: string, problems: string[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { problems.push(`${at} must be a list of: ${allowed.join(", ")}.`); return []; }
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !allowed.includes(entry)) problems.push(`${at}: "${String(entry)}" is not one of ${allowed.join(", ")}.`);
    else if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * `generate_in_kit` on an OPEN kit: one object { kind, into?, count?, card_kinds?, question_types?,
 * instruction?, section_titles? }. Every problem is listed in one Error so the agent can fix them
 * all at once. The run itself is the kit's own generate door (Make more / Add more).
 */
export function parseGenerateInKit(
  value: unknown,
  kit: StudyKit,
  outline: readonly { id: string; title: string }[],
): KitGenerateRequest {
  const target = "generate_in_kit";
  const problems: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${target} needs an object { kind, into?, count?, card_kinds?, question_types?, instruction?, section_titles? }.`);
  const raw = value as Record<string, unknown>;
  const known = new Set(["kind", "into", "count", "card_kinds", "question_types", "instruction", "section_titles"]);
  for (const key of Object.keys(raw)) if (!known.has(key)) problems.push(`${target}.${key} is not a field. Use: ${[...known].join(", ")}.`);

  const kind = GENERATE_IN_KIT_KINDS.find((k) => k === raw.kind);
  if (!kind) problems.push(`${target}.kind must be one of: ${GENERATE_IN_KIT_KINDS.join(", ")}.`);

  let into: KitGenerateRequest["into"];
  if (raw.into !== undefined && raw.into !== null && raw.into !== "") {
    if (typeof raw.into !== "string") problems.push(`${target}.into must be the artifact_id of a deck or quiz in this kit.`);
    else if (kind && kind !== "deck" && kind !== "quiz" && kind !== "practice_test") problems.push(`${target}.into only works with kind deck, quiz or practice_test.`);
    else {
      const member = kit.artifacts.find((a) => a.artifactId === raw.into);
      if (!member) problems.push(`${target}.into "${raw.into}" is not a member of this kit. Use an artifact_id from study_aids.`);
      else if (kind && member.targetKind !== kind) problems.push(`${target}.into is a ${member.targetKind ?? "different kind of aid"}, not a ${kind}. Send kind "${member.targetKind}" or pick another member.`);
      else if (member.targetKind !== "deck" && member.targetKind !== "quiz" && member.targetKind !== "practice_test") problems.push(`${target}.into must be a deck, quiz or practice test.`);
      else into = { id: member.artifactId, title: member.title, artifactType: member.artifactType };
    }
  }

  let count: number | undefined;
  if (raw.count !== undefined && raw.count !== null) {
    if (typeof raw.count !== "number" || !Number.isInteger(raw.count) || raw.count < 1 || raw.count > GENERATE_IN_KIT_MAX_COUNT) problems.push(`${target}.count must be a whole number from 1 to ${GENERATE_IN_KIT_MAX_COUNT}.`);
    else count = raw.count;
    if (kind && !["deck", "quiz", "practice_test"].includes(kind)) problems.push(`${target}.count only applies to deck, quiz and practice_test.`);
  }

  const cardKinds = pickFrom(raw.card_kinds, GENERATE_CARD_KINDS, `${target}.card_kinds`, problems);
  if (cardKinds.length && kind && kind !== "deck") problems.push(`${target}.card_kinds only applies to kind deck.`);
  const questionTypes = pickFrom(raw.question_types, GENERATE_QUESTION_TYPES, `${target}.question_types`, problems);
  if (questionTypes.length && kind && kind !== "quiz" && kind !== "practice_test") problems.push(`${target}.question_types only applies to kind quiz or practice_test.`);

  let instruction: string | undefined;
  if (raw.instruction !== undefined && raw.instruction !== null) {
    if (typeof raw.instruction !== "string") problems.push(`${target}.instruction must be text.`);
    else if (raw.instruction.trim().length > GENERATE_INSTRUCTION_MAX) problems.push(`${target}.instruction is over ${GENERATE_INSTRUCTION_MAX} characters.`);
    else instruction = raw.instruction.trim() || undefined;
  }

  const sectionIds: string[] = [];
  const sectionTitles: string[] = [];
  if (raw.section_titles !== undefined && raw.section_titles !== null) {
    if (!Array.isArray(raw.section_titles) || raw.section_titles.length === 0) problems.push(`${target}.section_titles must be a non-empty list of outline section titles.`);
    else if (outline.length === 0) problems.push(`${target}.section_titles needs an outline; outline_status says there is none yet.`);
    else {
      for (const title of raw.section_titles) {
        const hit = typeof title === "string" ? outline.find((s) => s.title.trim().toLowerCase() === title.trim().toLowerCase()) : undefined;
        if (!hit) problems.push(`${target}.section_titles: "${String(title)}" is not an outline section. Sections: ${outline.map((s) => s.title).join(" | ")}.`);
        else if (!sectionIds.includes(hit.id)) { sectionIds.push(hit.id); sectionTitles.push(hit.title); }
      }
    }
  }

  if (problems.length || !kind) throw new Error(problems.join(" "));
  return { kind, into, count, cardKinds, questionTypes, instruction, sectionIds, sectionTitles };
}

/** The run marker's key for chat-started runs in one kit (one at a time per kit). */
export function kitGenerateRunKey(kit: Pick<StudyKit, "sourceType" | "sourceId">): string {
  return `kit:generate:${kit.sourceType}:${kit.sourceId}`;
}

/** A run marker's request read back, or null when it is not one we can repeat. */
export function restoreKitGenerateRequest(data: Record<string, unknown>): KitGenerateRequest | null {
  const kind = GENERATE_IN_KIT_KINDS.find((k) => k === data.kind);
  if (!kind) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const into = data.into && typeof data.into === "object" ? (data.into as Record<string, unknown>) : null;
  return {
    kind,
    into: into && typeof into.id === "string" ? { id: into.id, title: typeof into.title === "string" ? into.title : "", artifactType: typeof into.artifactType === "string" ? into.artifactType : "" } : undefined,
    count: typeof data.count === "number" ? data.count : undefined,
    cardKinds: strings(data.cardKinds),
    questionTypes: strings(data.questionTypes),
    instruction: typeof data.instruction === "string" ? data.instruction : undefined,
    sectionIds: strings(data.sectionIds),
    sectionTitles: strings(data.sectionTitles),
  };
}

/** The request in the person's words, for status lines ("20 flashcards", "a quiz"). */
export function describeKitGenerate(request: KitGenerateRequest): string {
  const noun: Record<GenerateInKitKind, [string, string]> = {
    deck: ["flashcard", "flashcards"],
    quiz: ["question", "questions"],
    practice_test: ["question", "questions"],
    notes: ["set of notes", "sets of notes"],
    summary: ["summary", "summaries"],
    mind_map: ["mind map", "mind maps"],
    memory_aid: ["set of memory aids", "sets of memory aids"],
  };
  const [one, many] = noun[request.kind];
  if (request.into) return `${request.count ? `${request.count} ` : ""}${request.count === 1 ? one : many} for "${request.into.title}"`;
  const label = request.kind === "quiz" ? "quiz" : request.kind === "practice_test" ? "practice test" : request.kind === "deck" ? "flashcard deck" : one;
  return `a new ${label}`;
}


// ── one surface, three views ──────────────────────────────────────────────

export type KitSurfaceView = "list" | "detail" | "new";

/**
 * Which view of the one `matrx-user/education-kits` surface actually services each write target.
 * A manifest declares a target once; only the view that owns its state can apply it. The other
 * views answer it themselves (`kitOutOfViewWrites`) instead of leaving a declared door with nothing
 * behind it: the refusal comes BEFORE the person is asked, in words that say where it works.
 */
export const KIT_WRITE_TARGET_VIEWS: Record<string, readonly KitSurfaceView[]> = {
  create_kits: ["new"],
  update_kits: ["list", "detail"],
  delete_kits: ["list", "detail"],
  add_kit_members: ["detail"],
  remove_kit_members: ["detail"],
  generate_in_kit: ["detail"],
};

const KIT_VIEW_WHERE: Record<KitSurfaceView, string> = {
  list: "the kits list",
  detail: "an open kit",
  new: "the new kit page",
};

/** Refusing handlers for every declared target this view does not own. Spread them BEFORE the view's own handlers. */
export function kitOutOfViewWrites(view: KitSurfaceView): Record<string, { validate: (value: unknown) => void; apply: (value: unknown) => never }> {
  const out: Record<string, { validate: (value: unknown) => void; apply: (value: unknown) => never }> = {};
  for (const [name, views] of Object.entries(KIT_WRITE_TARGET_VIEWS)) {
    if (views.includes(view)) continue;
    const refuse = (): never =>
      refuseSurfaceWrite(`${name} works on ${views.map((v) => KIT_VIEW_WHERE[v]).join(" or ")}, not on ${KIT_VIEW_WHERE[view]}. Nothing was changed.`);
    out[name] = { validate: refuse, apply: refuse };
  }
  return out;
}
