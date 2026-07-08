// Performance Review demo — shared types + static schema.
// Pure data module (no "use client"): safe to import from server or client.
// The rating item `key`s are stable, human-readable slugs so this maps cleanly
// onto a database schema when the demo graduates from localStorage.

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export interface RatingItem {
  key: string;
  label: string;
}

export interface RatingCategory {
  key: string;
  label: string;
  items: RatingItem[];
}

export const RATING_SCHEMA: RatingCategory[] = [
  {
    key: "job_knowledge",
    label: "Job Knowledge",
    items: [
      { key: "meets_job_requirements", label: "Meets job requirements" },
      { key: "applies_knowledge_skills", label: "Applies knowledge/skills to job" },
      { key: "adds_to_knowledge_skills", label: "Adds to knowledge and skills" },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    items: [
      { key: "completes_tasks_on_time", label: "Completes tasks on time" },
      { key: "work_quantity", label: "Work quantity" },
      { key: "work_quality", label: "Work quality" },
      { key: "productivity", label: "Productivity" },
      { key: "works_independently", label: "Works independently" },
      { key: "initiative_creativity", label: "Initiative and creativity" },
      { key: "individual_judgment", label: "Individual judgment" },
      { key: "planning_organization", label: "Planning and organization" },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    items: [
      { key: "reports_to_supervisor", label: "Reports to proper supervisor" },
      { key: "understands_instructions", label: "Understands instructions easily" },
      { key: "verbal_communication", label: "Verbal communication skills" },
      { key: "written_communication", label: "Written communication skills" },
    ],
  },
  {
    key: "interpersonal_skills",
    label: "Interpersonal Skills",
    items: [
      { key: "working_relationship_others", label: "Working relationship with others" },
      { key: "relationship_customers", label: "Relationship with customers/clients" },
      { key: "relationship_supervisor", label: "Relationship with supervisor" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    items: [
      { key: "punctuality", label: "Punctuality" },
      { key: "absenteeism", label: "Absenteeism" },
      { key: "overall_attendance", label: "Overall attendance record" },
    ],
  },
  {
    key: "safety_compliance",
    label: "Safety Compliance",
    items: [
      { key: "safe_condition", label: "Keeps workplace and workspace in safe condition" },
      { key: "safety_over_production", label: "Puts safety over production" },
    ],
  },
];

export const TOTAL_RATING_ITEMS = RATING_SCHEMA.reduce(
  (n, c) => n + c.items.length,
  0,
);

export interface OverallOption {
  key: string;
  label: string;
  description: string;
}

export const OVERALL_OPTIONS: OverallOption[] = [
  {
    key: "outstanding",
    label: "Outstanding",
    description: "Performance consistently far exceeds job requirements.",
  },
  {
    key: "exceeds",
    label: "Exceeds Expectations",
    description:
      "Performance consistently meets and frequently exceeds job requirements.",
  },
  {
    key: "successful",
    label: "Successful",
    description: "Performance fully meets job requirements.",
  },
  {
    key: "needs_improvement",
    label: "Needs Improvement",
    description: "Performance meets some, but not all, job requirements.",
  },
  {
    key: "unsatisfactory",
    label: "Unsatisfactory",
    description: "Performance is below job requirements.",
  },
];

export const SCALE_LEGEND: { value: RatingValue; label: string }[] = [
  { value: 1, label: "Unsatisfactory" },
  { value: 2, label: "Needs Improvement" },
  { value: 3, label: "Successful" },
  { value: 4, label: "Exceeds" },
  { value: 5, label: "Outstanding" },
];

// The three "add one at a time" list sections.
export type ListSectionKey = "accomplishments" | "strengths" | "opportunities";

export const LIST_SECTIONS: {
  key: ListSectionKey;
  index: number;
  title: string;
  description: string;
  placeholder: string;
}[] = [
  {
    key: "accomplishments",
    index: 1,
    title: "Accomplishments",
    description: "Concrete wins from this review period. Add them one at a time.",
    placeholder: "Describe an accomplishment…",
  },
  {
    key: "strengths",
    index: 2,
    title: "Strengths",
    description: "What this person does consistently well.",
    placeholder: "Describe a strength…",
  },
  {
    key: "opportunities",
    index: 3,
    title: "Opportunities for Improvement",
    description: "Where there is the most room to grow.",
    placeholder: "Describe an opportunity…",
  },
];

export interface Review {
  id: string;
  createdAt: number;
  updatedAt: number;
  // Header
  employeeName: string;
  title: string;
  department: string;
  dateOfHire: string;
  reviewPeriod: string;
  dateOfEvaluation: string;
  // Lists
  accomplishments: string[];
  strengths: string[];
  opportunities: string[];
  // Ratings keyed by "<categoryKey>.<itemKey>"
  ratings: Record<string, RatingValue>;
  // Free text
  goals: string;
  overall: string; // OverallOption.key
  additionalComments: string;
}

export function ratingKey(categoryKey: string, itemKey: string): string {
  return `${categoryKey}.${itemKey}`;
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `rev_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function createBlankReview(): Review {
  return {
    id: newId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    employeeName: "",
    title: "",
    department: "",
    dateOfHire: "",
    reviewPeriod: "",
    dateOfEvaluation: "",
    accomplishments: [],
    strengths: [],
    opportunities: [],
    ratings: {},
    goals: "",
    overall: "",
    additionalComments: "",
  };
}
