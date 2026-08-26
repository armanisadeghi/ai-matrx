import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import {
  IDEAL_LIST_ITEMS,
  LIST_SECTIONS,
  MAX_LIST_ITEMS,
  MIN_LIST_ITEMS,
  OVERALL_OPTIONS,
  RATING_SCHEMA,
  SCALE_LEGEND,
  ratingKey,
  type Review,
} from "@/features/employee-performance-reviews/schema";
import type { ReviewStats } from "@/features/employee-performance-reviews/use-reviews";

export interface PerformanceReviewCopyContext {
  organizationId?: string;
  organizationName?: string;
  routeLabel: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The form contract without answers. This is intentionally XML-ish: models
 * can see every available question, list rule, rating key, and allowed value
 * without accidentally treating the current draft as authoritative content.
 */
export function buildPerformanceReviewQuestionsPayload(): string {
  const employeeQuestions = [
    ["employee_name", "Employee Name", "text"],
    ["job_title", "Title", "text"],
    ["department", "Department", "text"],
    ["date_of_hire", "Date of Hire", "date"],
    ["review_period", "Review Period", "text"],
    ["date_of_evaluation", "Date of Evaluation", "date"],
  ] as const;

  const employeeXml = employeeQuestions
    .map(
      ([name, label, input]) =>
        `    <question __kind="performance_review_question" name="${name}" input="${input}"><label>${escapeXml(label)}</label></question>`,
    )
    .join("\n");

  const listXml = LIST_SECTIONS.map(
    (
      section,
    ) => `  <section __kind="performance_review_list_question" name="${section.key}" min_items="${MIN_LIST_ITEMS}" ideal_items="${IDEAL_LIST_ITEMS}" max_items="${MAX_LIST_ITEMS}">
    <label>${escapeXml(section.title)}</label>
    <question>${escapeXml(section.description)}</question>
    <guidance>The ideal number is three.</guidance>
  </section>`,
  ).join("\n");

  const ratingsXml = RATING_SCHEMA.map(
    (
      category,
    ) => `    <category __kind="performance_review_rating_category" name="${category.key}">
      <label>${escapeXml(category.label)}</label>
${category.items
  .map(
    (item) =>
      `      <question __kind="performance_review_rating_question" name="${ratingKey(category.key, item.key)}"><label>${escapeXml(item.label)}</label></question>`,
  )
  .join("\n")}
    </category>`,
  ).join("\n");

  const scaleXml = SCALE_LEGEND.map(
    (entry) =>
      `      <option __kind="performance_review_rating_option" value="${entry.value}">${escapeXml(entry.label)}</option>`,
  ).join("\n");

  const overallXml = OVERALL_OPTIONS.map(
    (option) =>
      `      <option __kind="performance_review_overall_option" value="${option.key}"><label>${escapeXml(option.label)}</label><guidance>${escapeXml(option.description)}</guidance></option>`,
  ).join("\n");

  return `<performance_review_questionnaire __kind="performance_review_questionnaire">
  <guidance>Return answers only when the user asks you to draft them. This export contains questions and minimal guidance only; it contains no current answers.</guidance>
  <section __kind="performance_review_section" name="employee_details">
    <label>Employee Details</label>
${employeeXml}
  </section>
${listXml}
  <section __kind="performance_review_rating_section" name="performance_ratings">
    <label>Performance Ratings</label>
    <scale __kind="performance_review_rating_scale" minimum="1" maximum="5">
${scaleXml}
    </scale>
${ratingsXml}
  </section>
  <section __kind="performance_review_text_question" name="goals"><label>Goals &amp; Objectives</label><question>Concrete, checkable goals for the coming year.</question></section>
  <section __kind="performance_review_overall_question" name="overall_rating">
    <label>Overall Performance Rating</label>
    <options __kind="performance_review_overall_options">
${overallXml}
    </options>
  </section>
  <section __kind="performance_review_text_question" name="additional_comments"><label>Additional Comments</label><question>Closing comments for the review.</question></section>
</performance_review_questionnaire>`;
}

export function performanceReviewValuesData(
  review: Review,
  stats: ReviewStats,
  context: PerformanceReviewCopyContext,
) {
  return {
    __kind: "performance_review_current_values",
    organization: {
      __kind: "performance_review_organization_context",
      id: context.organizationId ?? null,
      name: context.organizationName ?? null,
    },
    employee_details: {
      __kind: "performance_review_employee_details",
      employee_name: review.employeeName,
      job_title: review.title,
      department: review.department,
      date_of_hire: review.dateOfHire,
      review_period: review.reviewPeriod,
      date_of_evaluation: review.dateOfEvaluation,
    },
    narrative_sections: LIST_SECTIONS.map((section) => ({
      __kind: "performance_review_narrative_section",
      name: section.key,
      label: section.title,
      items: review[section.key],
      ideal_items: IDEAL_LIST_ITEMS,
      maximum_items: MAX_LIST_ITEMS,
    })),
    performance_ratings: RATING_SCHEMA.map((category) => ({
      __kind: "performance_review_rating_category_values",
      name: category.key,
      label: category.label,
      average: stats.categoryAverages[category.key],
      questions: category.items.map((item) => ({
        __kind: "performance_review_rating_value",
        name: ratingKey(category.key, item.key),
        label: item.label,
        value: review.ratings[ratingKey(category.key, item.key)] ?? null,
      })),
    })),
    goals: review.goals,
    overall_rating: review.overall,
    additional_comments: review.additionalComments,
    summary: {
      __kind: "performance_review_summary",
      average_score: stats.average,
      rated_count: stats.ratedCount,
      total_rating_count: stats.totalCount,
      completion_percent: stats.completionPct,
    },
  };
}

export function buildPerformanceReviewValuesPayload(
  review: Review,
  stats: ReviewStats,
  context: PerformanceReviewCopyContext,
): AgentPayloadInput {
  return {
    kind: "performance-review-current-values",
    location: context.routeLabel,
    description:
      "Every value currently visible in the active performance review form, including live unsaved/autosaving edits and expanded rating labels.",
    data: performanceReviewValuesData(review, stats, context),
    attributes: {
      __kind: "performance_review_copy_attributes",
      completion_percent: stats.completionPct,
      rated_count: stats.ratedCount,
      total_rating_count: stats.totalCount,
    },
    context: {
      __kind: "performance_review_copy_context",
      review_id: review.id,
      organization_id: context.organizationId ?? "browser-local-demo",
      persistence: "browser-local autosave",
    },
  };
}

export function formatPerformanceReviewForHumans(
  review: Review,
  stats: ReviewStats,
): string {
  const lines = [
    "Employee Performance Review",
    `Employee: ${review.employeeName || "Not provided"}`,
    `Title: ${review.title || "Not provided"}`,
    `Department: ${review.department || "Not provided"}`,
    `Review period: ${review.reviewPeriod || "Not provided"}`,
    `Completion: ${stats.completionPct}%`,
  ];

  for (const section of LIST_SECTIONS) {
    lines.push("", section.title);
    const items = review[section.key];
    lines.push(
      items.length > 0
        ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
        : "Not provided",
    );
  }

  lines.push(
    "",
    "Goals & Objectives",
    review.goals || "Not provided",
    "",
    "Overall Performance Rating",
    OVERALL_OPTIONS.find((option) => option.key === review.overall)?.label ??
      "Not provided",
    "",
    "Additional Comments",
    review.additionalComments || "Not provided",
  );

  return lines.join("\n");
}
