// features/window-panels/windows/feedback-subject.ts
//
// A report opened FROM something (a selected passage) carries it: readable at the top of the
// description for whoever triages it, and structured in users.user_feedback.metadata.report_subject
// (source, quote, anchor) for tools. RC-B11 low finding 4.

import type { FeedbackSubject } from "@/features/overlays/openers/feedbackDialog";
import type { Json } from "@/types/database.types";

/** The selected passage or billing record as the first lines a triager reads. */
export function describeSubject(subject: FeedbackSubject): string {
  if (subject.kind === "billing_subscription") {
    const invoice = subject.invoiceId
      ? `\nInvoice: ${subject.invoiceId}${subject.invoiceStatus ? ` (${subject.invoiceStatus})` : ""}`
      : subject.invoiceStatus
        ? `\nInvoice status: ${subject.invoiceStatus}`
        : "";
    return `Billing support request\nAccount: ${subject.billingScope}\nSubscription: ${subject.subscriptionId ?? "Not available"}\nPlan: ${subject.planKey ?? "Not available"}\nSubscription status: ${subject.subscriptionStatus ?? "Not available"}${invoice}`;
  }
  const quote =
    subject.quote.length > 1200
      ? `${subject.quote.slice(0, 1200)}…`
      : subject.quote;
  const quoted = quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `Reported passage in "${subject.sourceTitle}" (${subject.sourceToken} ${subject.sourceId}):\n${quoted}`;
}

/** The passage as filed provenance (users.user_feedback.metadata.report_subject). */
export function subjectMetadata(
  subject: FeedbackSubject,
): Record<string, Json> {
  if (subject.kind === "billing_subscription") {
    return {
      kind: subject.kind,
      billing_scope: subject.billingScope,
      subscription_id: subject.subscriptionId,
      plan_key: subject.planKey,
      subscription_status: subject.subscriptionStatus,
      invoice_id: subject.invoiceId ?? null,
      invoice_status: subject.invoiceStatus ?? null,
    };
  }
  return {
    kind: subject.kind,
    source_token: subject.sourceToken,
    source_id: subject.sourceId,
    source_title: subject.sourceTitle,
    quote: subject.quote,
    anchor: (subject.anchor ?? null) as Json,
    href: subject.href ?? null,
  };
}
