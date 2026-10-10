// features/employee-performance-reviews/standard/types.ts
//
// THE STANDARD PERFORMANCE REVIEW (HR-REVIEWS wave 1) — the wire shapes of the hr_review_* doors.
// This is NOT the 360 trial (../review-360). Nothing here imports it.
//
// Every door answers jsonb `{ ok, reason?, ... }`. The parsers below narrow `unknown` field by
// field — no `any`, no cast of the whole payload — so a door that drifts shows up as a visible
// "unreadable answer", never as a blank screen.

export type ReviewStatus =
  | "not_started"
  | "in_progress"
  | "self_submitted"
  | "manager_submitted"
  | "both_submitted"
  | "shared"
  | "acknowledged"
  | "reopened"
  | "cancelled";

export type ReviewSeat = "employee" | "manager" | "hr" | "skip_level" | string;
export type ResponseRole = "self" | "manager";

export interface RatingPoint {
  value: number;
  key: string;
  label: string;
}

export interface TemplateItem {
  key: string;
  label: string;
}

export type TemplateQuestionType = "responsibilities" | "narrative_list" | "rating" | "text";

export interface TemplateQuestion {
  key: string;
  type: TemplateQuestionType;
  label: string;
  required: boolean;
  minItems: number | null;
  maxItems: number | null;
  items: TemplateItem[];
}

export interface TemplateSection {
  key: string;
  title: string;
  description: string | null;
  questions: TemplateQuestion[];
}

export interface TemplateSnapshot {
  name: string;
  sections: TemplateSection[];
  ratingPoints: RatingPoint[];
}

export interface ReviewAnswers {
  __kind: "performance_review_answers";
  lists: Record<string, string[]>;
  ratings: Record<string, number>;
  texts: Record<string, string>;
}

export interface ReviewCan {
  save_self: boolean;
  submit_self: boolean;
  save_manager: boolean;
  submit_manager: boolean;
  set_overall: boolean;
  share: boolean;
  acknowledge: boolean;
  reopen: boolean;
  cancel: boolean;
  replace_manager: boolean;
}

export interface ReviewSummary {
  reviewId: string;
  organizationId: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  periodStart: string | null;
  periodEnd: string | null;
  selfDueOn: string | null;
  managerDueOn: string | null;
  shareDueOn: string | null;
  employmentId: string;
  employeeName: string;
  managerName: string;
  mySeat: ReviewSeat;
  status: ReviewStatus;
  selfStatus: string;
  managerStatus: string;
  selfSubmittedAt: string | null;
  managerSubmittedAt: string | null;
  sharedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgmentComment: string | null;
  overallRating: string | null;
  calibratedRating: string | null;
  cancelledAt: string | null;
  reopenHistory: Array<{ at: string | null; reason: string | null }>;
  can: ReviewCan;
}

export interface ResponseView {
  role: ResponseRole;
  status: "draft" | "submitted" | string;
  submittedAt: string | null;
  visible: boolean;
  isMine: boolean;
  version: number | null;
  /** Present only when the door let this seat read the answers. */
  answers: ReviewAnswers | null;
}

export interface ReviewDetail {
  review: ReviewSummary;
  template: TemplateSnapshot;
  responses: ResponseView[];
}

export interface CycleSummary {
  cycleId: string;
  name: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  selfDueOn: string | null;
  managerDueOn: string | null;
  shareDueOn: string | null;
  reviewCount: number;
  acknowledgedCount: number;
  outstandingCount: number;
}

export type Outstanding = "self" | "manager" | "share" | "acknowledge";

export interface CycleReviewRow {
  reviewId: string;
  employmentId: string;
  employeeName: string;
  managerName: string;
  status: ReviewStatus;
  overallRating: string | null;
  outstanding: Outstanding[];
}

export interface CycleDetail {
  cycle: CycleSummary & { organizationId: string };
  total: number;
  reviews: CycleReviewRow[];
}

export interface LaunchCreated {
  reviewId: string;
  employmentId: string;
  employeeName: string;
  managerName: string;
  employeeHasLogin: boolean;
}

export interface LaunchRefused {
  employmentId: string;
  employeeName: string | null;
  reason: string;
}

export interface LaunchResult {
  created: LaunchCreated[];
  refused: LaunchRefused[];
}

export interface AnswerProblem {
  question: string | null;
  problem: string;
  minItems: number | null;
  maxItems: number | null;
  have: number | null;
}

export interface HistoryRow {
  reviewId: string;
  cycleName: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: ReviewStatus;
  managerName: string;
  overallRating: string | null;
  sharedAt: string | null;
  acknowledgedAt: string | null;
}

// ── narrowing helpers ────────────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const recs = (v: unknown): Rec[] => arr(v).filter(isRec);

export function parseTemplate(raw: unknown): TemplateSnapshot {
  const t = isRec(raw) ? raw : {};
  const points: RatingPoint[] = recs(isRec(t.rating_scale) ? t.rating_scale.points : []).flatMap((p) => {
    const value = num(p.value);
    const key = str(p.key);
    return value !== null && key ? [{ value, key, label: str(p.label) ?? key }] : [];
  });
  const sections: TemplateSection[] = recs(t.sections).flatMap((s) => {
    const key = str(s.key);
    if (!key) return [];
    const questions: TemplateQuestion[] = recs(s.questions).flatMap((q) => {
      const qKey = str(q.key);
      const type = str(q.type);
      if (!qKey || (type !== "responsibilities" && type !== "narrative_list" && type !== "rating" && type !== "text")) return [];
      return [
        {
          key: qKey,
          type,
          label: str(q.label) ?? qKey,
          required: q.required !== false,
          minItems: num(q.min_items),
          maxItems: num(q.max_items),
          items: recs(q.items).flatMap((i) => {
            const iKey = str(i.key);
            return iKey ? [{ key: iKey, label: str(i.label) ?? iKey }] : [];
          }),
        },
      ];
    });
    return [{ key, title: str(s.title) ?? key, description: str(s.description), questions }];
  });
  return { name: str(t.name) ?? "Performance review", sections, ratingPoints: points };
}

export function emptyAnswers(): ReviewAnswers {
  return { __kind: "performance_review_answers", lists: {}, ratings: {}, texts: {} };
}

export function parseAnswers(raw: unknown): ReviewAnswers | null {
  if (!isRec(raw)) return null;
  const out = emptyAnswers();
  if (isRec(raw.lists)) {
    for (const [k, v] of Object.entries(raw.lists)) out.lists[k] = arr(v).filter((x): x is string => typeof x === "string");
  }
  if (isRec(raw.ratings)) {
    for (const [k, v] of Object.entries(raw.ratings)) {
      const n = num(v);
      if (n !== null) out.ratings[k] = n;
    }
  }
  if (isRec(raw.texts)) {
    for (const [k, v] of Object.entries(raw.texts)) if (typeof v === "string") out.texts[k] = v;
  }
  return out;
}

function parseCan(raw: unknown): ReviewCan {
  const c = isRec(raw) ? raw : {};
  return {
    save_self: bool(c.save_self),
    submit_self: bool(c.submit_self),
    save_manager: bool(c.save_manager),
    submit_manager: bool(c.submit_manager),
    set_overall: bool(c.set_overall),
    share: bool(c.share),
    acknowledge: bool(c.acknowledge),
    reopen: bool(c.reopen),
    cancel: bool(c.cancel),
    replace_manager: bool(c.replace_manager),
  };
}

export function parseReviewSummary(raw: unknown): ReviewSummary | null {
  if (!isRec(raw)) return null;
  const reviewId = str(raw.review_id);
  if (!reviewId) return null;
  return {
    reviewId,
    organizationId: str(raw.organization_id) ?? "",
    cycleId: str(raw.cycle_id) ?? "",
    cycleName: str(raw.cycle_name) ?? "Review cycle",
    cycleStatus: str(raw.cycle_status) ?? "open",
    periodStart: str(raw.period_start),
    periodEnd: str(raw.period_end),
    selfDueOn: str(raw.self_due_on),
    managerDueOn: str(raw.manager_due_on),
    shareDueOn: str(raw.share_due_on),
    employmentId: str(raw.employment_id) ?? "",
    employeeName: str(raw.employee_name) ?? "Employee",
    managerName: str(raw.manager_name) ?? "Manager",
    mySeat: str(raw.my_seat) ?? "employee",
    status: (str(raw.status) ?? "not_started") as ReviewStatus,
    selfStatus: str(raw.self_status) ?? "not_started",
    managerStatus: str(raw.manager_status) ?? "not_started",
    selfSubmittedAt: str(raw.self_submitted_at),
    managerSubmittedAt: str(raw.manager_submitted_at),
    sharedAt: str(raw.shared_at),
    acknowledgedAt: str(raw.acknowledged_at),
    acknowledgmentComment: str(raw.acknowledgment_comment),
    overallRating: str(raw.overall_rating),
    calibratedRating: str(raw.calibrated_rating),
    cancelledAt: str(raw.cancelled_at),
    reopenHistory: recs(raw.reopen_history).map((h) => ({ at: str(h.at), reason: str(h.reason) })),
    can: parseCan(raw.can),
  };
}

export function parseReviewDetail(raw: Rec): ReviewDetail | null {
  const review = parseReviewSummary(raw.review);
  if (!review) return null;
  const responses: ResponseView[] = recs(raw.responses).flatMap((r) => {
    const role = str(r.role);
    if (role !== "self" && role !== "manager") return [];
    return [
      {
        role,
        status: str(r.status) ?? "draft",
        submittedAt: str(r.submitted_at),
        visible: r.visible === true,
        isMine: r.is_mine === true,
        version: num(r.version),
        answers: r.visible === true ? parseAnswers(r.answers) ?? emptyAnswers() : null,
      },
    ];
  });
  return { review, template: parseTemplate(raw.template), responses };
}

export function parseCycleSummary(c: Rec): CycleSummary | null {
  const cycleId = str(c.cycle_id);
  if (!cycleId) return null;
  return {
    cycleId,
    name: str(c.name) ?? "Review cycle",
    status: str(c.status) ?? "draft",
    periodStart: str(c.period_start),
    periodEnd: str(c.period_end),
    selfDueOn: str(c.self_due_on),
    managerDueOn: str(c.manager_due_on),
    shareDueOn: str(c.share_due_on),
    reviewCount: num(c.review_count) ?? 0,
    acknowledgedCount: num(c.acknowledged_count) ?? 0,
    outstandingCount: num(c.outstanding_count) ?? 0,
  };
}

export function parseCycleDetail(raw: Rec): CycleDetail | null {
  const base = isRec(raw.cycle) ? parseCycleSummary(raw.cycle) : null;
  if (!base || !isRec(raw.cycle)) return null;
  const reviews: CycleReviewRow[] = recs(raw.reviews).flatMap((r) => {
    const reviewId = str(r.review_id);
    if (!reviewId) return [];
    return [
      {
        reviewId,
        employmentId: str(r.employment_id) ?? "",
        employeeName: str(r.employee_name) ?? "Employee",
        managerName: str(r.manager_name) ?? "Manager",
        status: (str(r.status) ?? "not_started") as ReviewStatus,
        overallRating: str(r.overall_rating),
        outstanding: arr(r.outstanding).filter(
          (o): o is Outstanding => o === "self" || o === "manager" || o === "share" || o === "acknowledge",
        ),
      },
    ];
  });
  const counts = isRec(raw.counts) ? raw.counts : {};
  return {
    cycle: { ...base, organizationId: str(raw.cycle.organization_id) ?? "" },
    total: num(counts.total) ?? reviews.length,
    reviews,
  };
}

export function parseLaunch(raw: Rec): LaunchResult {
  return {
    created: recs(raw.created).flatMap((c) => {
      const reviewId = str(c.review_id);
      return reviewId
        ? [
            {
              reviewId,
              employmentId: str(c.employment_id) ?? "",
              employeeName: str(c.employee_name) ?? "Employee",
              managerName: str(c.manager_name) ?? "Manager",
              employeeHasLogin: c.employee_has_login === true,
            },
          ]
        : [];
    }),
    refused: recs(raw.refused).map((r) => ({
      employmentId: str(r.employment_id) ?? "",
      employeeName: str(r.employee_name),
      reason: str(r.reason) ?? "refused",
    })),
  };
}

export function parseProblems(raw: unknown): AnswerProblem[] {
  return recs(raw).map((p) => ({
    question: str(p.question),
    problem: str(p.problem) ?? "invalid",
    minItems: num(p.min_items),
    maxItems: num(p.max_items),
    have: num(p.have),
  }));
}

export function parseHistory(raw: Rec): HistoryRow[] {
  return recs(raw.reviews).flatMap((r) => {
    const reviewId = str(r.review_id);
    if (!reviewId) return [];
    return [
      {
        reviewId,
        cycleName: str(r.cycle_name) ?? "Review cycle",
        periodStart: str(r.period_start),
        periodEnd: str(r.period_end),
        status: (str(r.status) ?? "not_started") as ReviewStatus,
        managerName: str(r.manager_name) ?? "Manager",
        overallRating: str(r.overall_rating),
        sharedAt: str(r.shared_at),
        acknowledgedAt: str(r.acknowledged_at),
      },
    ];
  });
}
