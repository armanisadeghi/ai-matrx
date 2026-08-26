import { formatPerformanceReviewForHumans } from "@/features/employee-performance-reviews/copy";
import {
  LIST_SECTIONS,
  OVERALL_OPTIONS,
  RATING_SCHEMA,
  ratingKey,
  type Review,
} from "@/features/employee-performance-reviews/schema";
import type {
  ReviewStats,
  SaveState,
} from "@/features/employee-performance-reviews/use-reviews";
import {
  createOrganizationPerformanceReviewScope,
  performanceReviewRatingSurfaceName,
  PERFORMANCE_REVIEW_STATIC_INPUTS,
} from "@/features/surfaces/manifests/organization-performance-reviews.manifest";

export interface PerformanceReviewSurfaceRuntimeInput {
  organization?: {
    id: string;
    slug: string;
    name: string;
    viewerRole: string;
  };
  activeReview: Review;
  reviews: Review[];
  stats: ReviewStats;
  currentView: "edit" | "report";
  searchQuery: string;
  saveState: SaveState;
  isExportingPdf: boolean;
}

/** Builds the exhaustive live scope used by top-menu agents and ProTextarea. */
export function buildPerformanceReviewSurfaceScope({
  organization,
  activeReview,
  reviews,
  stats,
  currentView,
  searchQuery,
  saveState,
  isExportingPdf,
}: PerformanceReviewSurfaceRuntimeInput) {
  const overallLabel =
    OVERALL_OPTIONS.find((option) => option.key === activeReview.overall)
      ?.label ?? "Not set";
  const activeReviewValue = {
    __kind: "performance_review",
    id: activeReview.id,
    created_at: activeReview.createdAt,
    updated_at: activeReview.updatedAt,
    employee_name: activeReview.employeeName,
    job_title: activeReview.title,
    department: activeReview.department,
    date_of_hire: activeReview.dateOfHire,
    review_period: activeReview.reviewPeriod,
    date_of_evaluation: activeReview.dateOfEvaluation,
    responsibilities: activeReview.responsibilities,
    accomplishments: activeReview.accomplishments,
    strengths: activeReview.strengths,
    opportunities: activeReview.opportunities,
    ratings: activeReview.ratings,
    goals: activeReview.goals,
    overall_rating: activeReview.overall,
    additional_comments: activeReview.additionalComments,
  };
  const ratingValues = Object.fromEntries(
    RATING_SCHEMA.flatMap((category) =>
      category.items.flatMap((item) => {
        const value = activeReview.ratings[ratingKey(category.key, item.key)];
        return value === undefined
          ? []
          : [
              [
                performanceReviewRatingSurfaceName(category.key, item.key),
                value,
              ],
            ];
      }),
    ),
  );
  const reviewSummary = {
    __kind: "performance_review_summary",
    average_score: stats.average,
    rated_count: stats.ratedCount,
    total_rating_count: stats.totalCount,
    completion_percent: stats.completionPct,
    category_averages: stats.categoryAverages,
    overall_rating_label: overallLabel,
  };

  return createOrganizationPerformanceReviewScope({
    selection: undefined,
    content: formatPerformanceReviewForHumans(activeReview, stats),
    context: {
      __kind: "performance_review_surface_context",
      organization_id: organization?.id ?? null,
      organization_name: organization?.name ?? null,
      active_review_id: activeReview.id,
      persistence: "browser-local autosave",
    },
    organization_id: organization?.id,
    organization_slug: organization?.slug,
    organization_name: organization?.name,
    viewer_role: organization?.viewerRole,
    active_review_id: activeReview.id,
    active_review_created_at: activeReview.createdAt,
    active_review_updated_at: activeReview.updatedAt,
    active_review: activeReviewValue,
    employee_name: activeReview.employeeName,
    job_title: activeReview.title,
    department: activeReview.department,
    date_of_hire: activeReview.dateOfHire,
    review_period: activeReview.reviewPeriod,
    date_of_evaluation: activeReview.dateOfEvaluation,
    responsibilities: activeReview.responsibilities,
    accomplishments: activeReview.accomplishments,
    strengths: activeReview.strengths,
    opportunities: activeReview.opportunities,
    ratings: activeReview.ratings,
    ...ratingValues,
    goals: activeReview.goals,
    overall_rating: activeReview.overall,
    overall_rating_label: overallLabel,
    additional_comments: activeReview.additionalComments,
    average_score: stats.average ?? undefined,
    rated_count: stats.ratedCount,
    total_rating_count: stats.totalCount,
    completion_percent: stats.completionPct,
    category_averages: stats.categoryAverages,
    review_summary: reviewSummary,
    question_outline: PERFORMANCE_REVIEW_STATIC_INPUTS,
    list_section_rules: PERFORMANCE_REVIEW_STATIC_INPUTS.list_section_rules,
    rating_questions: PERFORMANCE_REVIEW_STATIC_INPUTS.rating_questions,
    rating_scale: PERFORMANCE_REVIEW_STATIC_INPUTS.rating_scale,
    overall_rating_options:
      PERFORMANCE_REVIEW_STATIC_INPUTS.overall_rating_options,
    reviews_summary: reviews.map((review) => ({
      __kind: "performance_review_list_item",
      id: review.id,
      employee_name: review.employeeName,
      job_title: review.title,
      department: review.department,
      overall_rating: review.overall,
      updated_at: review.updatedAt,
    })),
    review_count: reviews.length,
    current_view: currentView,
    search_query: searchQuery,
    save_state: saveState,
    is_exporting_pdf: isExportingPdf,
  });
}

export const PERFORMANCE_REVIEW_LIST_KEYS = new Set(
  LIST_SECTIONS.map((section) => section.key),
);
