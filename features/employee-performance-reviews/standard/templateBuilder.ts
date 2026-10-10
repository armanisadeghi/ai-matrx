// features/employee-performance-reviews/standard/templateBuilder.ts
//
// THE TEMPLATE EDITOR'S MODEL AND THE ONE PLACE IT BECOMES A DOOR PAYLOAD. Every object written
// carries the `__kind` the door (hr._rev_template_problems) validates, and every key is derived
// from a label here — a person never types a key. Pure, so it can be proven.

import type { TemplateQuestionType } from "./types";

export const KIND = {
  section: "performance_review_template_section",
  question: "performance_review_question",
  item: "performance_review_rating_item",
  scale: "performance_review_rating_scale",
  point: "performance_review_rating_point",
} as const;

export interface DraftItem {
  id: string;
  label: string;
}
export interface DraftQuestion {
  id: string;
  type: TemplateQuestionType;
  label: string;
  required: boolean;
  minItems: number;
  maxItems: number;
  items: DraftItem[];
}
export interface DraftSection {
  id: string;
  title: string;
  description: string;
  questions: DraftQuestion[];
}
export interface DraftPoint {
  id: string;
  value: number;
  label: string;
}
export interface TemplateDraft {
  /** Null while the template is new. */
  templateId: string | null;
  name: string;
  description: string;
  isDefault: boolean;
  sections: DraftSection[];
  points: DraftPoint[];
}

let counter = 0;
export const draftId = (): string => `d${++counter}`;

export function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** A key from `label`, made unique among `taken` by a numeric suffix. Empty labels yield "" (the door says so). */
export function uniqueKey(label: string, taken: Set<string>): string {
  const base = slug(label);
  if (!base) return "";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

export interface KeyedDraft {
  sectionKeys: Map<string, string>;
  questionKeys: Map<string, string>;
}

/** The keys each section and question will be written with — also how a problem's `at` finds its element. */
export function keyDraft(draft: TemplateDraft): KeyedDraft {
  const sectionTaken = new Set<string>();
  const questionTaken = new Set<string>();
  const sectionKeys = new Map<string, string>();
  const questionKeys = new Map<string, string>();
  for (const s of draft.sections) {
    sectionKeys.set(s.id, uniqueKey(s.title, sectionTaken));
    for (const q of s.questions) questionKeys.set(q.id, uniqueKey(q.label, questionTaken));
  }
  return { sectionKeys, questionKeys };
}

export function buildSections(draft: TemplateDraft): Array<Record<string, unknown>> {
  const { sectionKeys, questionKeys } = keyDraft(draft);
  return draft.sections.map((s) => ({
    __kind: KIND.section,
    key: sectionKeys.get(s.id) ?? "",
    title: s.title.trim(),
    ...(s.description.trim() ? { description: s.description.trim() } : {}),
    questions: s.questions.map((q) => {
      const base = { __kind: KIND.question, key: questionKeys.get(q.id) ?? "", type: q.type, label: q.label.trim(), required: q.required };
      if (q.type === "rating") {
        const taken = new Set<string>();
        return { ...base, items: q.items.map((i) => ({ __kind: KIND.item, key: uniqueKey(i.label, taken), label: i.label.trim() })) };
      }
      if (q.type === "narrative_list" || q.type === "responsibilities") {
        return { ...base, min_items: q.minItems, max_items: q.maxItems };
      }
      return base;
    }),
  }));
}

export function buildRatingScale(points: DraftPoint[]): Record<string, unknown> {
  const taken = new Set<string>();
  return {
    __kind: KIND.scale,
    key: "custom",
    points: points.map((p) => ({ __kind: KIND.point, value: p.value, key: uniqueKey(p.label, taken), label: p.label.trim() })),
  };
}

/** The payload for a NEW template or a full edit. */
export function buildTemplatePayload(draft: TemplateDraft, organizationId: string): Record<string, unknown> {
  return {
    organization_id: organizationId,
    ...(draft.templateId ? { template_id: draft.templateId } : {}),
    name: draft.name.trim(),
    description: draft.description.trim(),
    is_default: draft.isDefault,
    sections: buildSections(draft),
    rating_scale: buildRatingScale(draft.points),
  };
}

/** The payload for changing only what an existing template is called, described and whether it is the default. */
export function buildMetadataPayload(args: { templateId: string; name: string; description: string; isDefault: boolean }): Record<string, unknown> {
  return {
    template_id: args.templateId,
    name: args.name.trim(),
    description: args.description.trim(),
    is_default: args.isDefault,
  };
}

export const DEFAULT_POINTS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Unsatisfactory" },
  { value: 2, label: "Needs Improvement" },
  { value: 3, label: "Successful" },
  { value: 4, label: "Exceeds Expectations" },
  { value: 5, label: "Outstanding" },
];

/** A starting point a person edits: accomplishments, strengths, areas to grow, a rated skills block, goals. */
export function starterDraft(): TemplateDraft {
  const list = (label: string): DraftQuestion => ({ id: draftId(), type: "narrative_list", label, required: true, minItems: 2, maxItems: 5, items: [] });
  return {
    templateId: null,
    name: "",
    description: "",
    isDefault: false,
    sections: [
      { id: draftId(), title: "Accomplishments", description: "Concrete wins from this review period.", questions: [list("Accomplishments")] },
      { id: draftId(), title: "Strengths", description: "", questions: [list("Strengths")] },
      { id: draftId(), title: "Opportunities for improvement", description: "", questions: [list("Opportunities for improvement")] },
      {
        id: draftId(),
        title: "Ratings",
        description: "Rate each item on the scale.",
        questions: [
          {
            id: draftId(),
            type: "rating",
            label: "Core skills",
            required: true,
            minItems: 0,
            maxItems: 0,
            items: [
              { id: draftId(), label: "Quality of work" },
              { id: draftId(), label: "Communication" },
              { id: draftId(), label: "Teamwork" },
            ],
          },
        ],
      },
      { id: draftId(), title: "Goals", description: "", questions: [{ id: draftId(), type: "text", label: "Goals for the next period", required: false, minItems: 0, maxItems: 0, items: [] }] },
    ],
    points: DEFAULT_POINTS.map((p) => ({ id: draftId(), ...p })),
  };
}
