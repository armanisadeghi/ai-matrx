// features/employee-performance-reviews/standard/standardReport.ts
//
// THE STORED STANDARD REVIEW AS A DOCUMENT: print/PDF (the same two-column report look and styles the
// review demo uses, through @ai-matrx/print) and Markdown (for the copy menu's Copy and Export). Built ONLY
// from what the door let this caller read: a half with no visible answers is not in the document, and
// the manager's overall / HR's calibrated rating appear only when the door sent them.

import { escapeHtml } from "@ai-matrx/kit/html-escape";
import { buildPrintDocument, openPrintWindow } from "@ai-matrx/print/core";

import { REVIEW_REPORT_STYLES } from "../review-report";
import { formatDay, periodLabel, ratingLabel } from "./status";
import type { ReviewAnswers, ReviewDetail, ReviewGoal, TemplateQuestion, TemplateSnapshot } from "./types";

export interface ReportTrack {
  role: "self" | "manager" | "peer";
  label: string;
  answers: ReviewAnswers;
}

export interface ReportModel {
  employeeName: string;
  managerName: string;
  cycleName: string;
  period: string;
  template: TemplateSnapshot;
  tracks: ReportTrack[];
  goals: ReviewGoal[];
  overall: string | null;
  calibrated: string | null;
  acknowledgedOn: string | null;
  acknowledgmentComment: string | null;
}

export function buildReportModel(detail: ReviewDetail): ReportModel {
  const { review, template, responses } = detail;
  const tracks: ReportTrack[] = [];
  for (const r of responses) {
    if (!r.visible || !r.answers) continue;
    // A peer's words appear only under the name the door sent; an anonymous peer is "A peer".
    const label = r.role === "self" ? `${review.employeeName}'s self review` : r.role === "manager" ? `${review.managerName}'s review` : `Peer feedback from ${r.respondentName ?? "a peer"}`;
    tracks.push({ role: r.role, label, answers: r.answers });
  }
  return {
    employeeName: review.employeeName,
    managerName: review.managerName,
    cycleName: review.cycleName,
    period: periodLabel(review.periodStart, review.periodEnd),
    template,
    tracks,
    goals: detail.goals,
    overall: review.overallRating ? ratingLabel(template.ratingPoints, review.overallRating) : null,
    calibrated: review.calibratedRating ? ratingLabel(template.ratingPoints, review.calibratedRating) : null,
    acknowledgedOn: review.acknowledgedAt ? formatDay(review.acknowledgedAt) : null,
    acknowledgmentComment: review.acknowledgmentComment,
  };
}

const listOf = (a: ReviewAnswers, q: TemplateQuestion) => (a.lists[q.key] ?? []).filter((x) => x.trim() !== "");
const textOf = (a: ReviewAnswers, q: TemplateQuestion) => (a.texts[q.key] ?? "").trim();

export function buildReportMarkdown(m: ReportModel): string {
  const out: string[] = [`# Performance review: ${m.employeeName}`, "", `${m.cycleName} · ${m.period} · Manager ${m.managerName}`, ""];
  if (m.overall) out.push(`**Overall rating:** ${m.overall}`);
  if (m.calibrated) out.push(`**Calibrated rating:** ${m.calibrated}`);
  if (m.overall || m.calibrated) out.push("");
  for (const t of m.tracks) {
    out.push(`## ${t.label}`, "");
    for (const s of m.template.sections) {
      out.push(`### ${s.title}`, "");
      for (const q of s.questions) {
        if (q.type === "rating") {
          out.push(`**${q.label}**`, "");
          for (const i of q.items) out.push(`- ${i.label}: ${t.answers.ratings[`${q.key}.${i.key}`] ?? "not rated"}`);
          out.push("");
        } else if (q.type === "goal_review") {
          if (m.goals.length === 0) out.push("_No goals in this period_");
          for (const g of m.goals) {
            const note = (t.answers.texts[g.answerKey] ?? "").trim();
            out.push(`- ${g.title}: ${t.answers.ratings[g.answerKey] ?? "not rated"}${note ? ` (${note})` : ""}`);
          }
          out.push("");
        } else if (q.type === "text") {
          out.push(textOf(t.answers, q) || "_Nothing written_", "");
        } else {
          const items = listOf(t.answers, q);
          if (items.length === 0) out.push("_Nothing written_");
          else items.forEach((x, i) => out.push(`${i + 1}. ${x}`));
          out.push("");
        }
      }
    }
  }
  if (m.acknowledgedOn) {
    out.push(`**Acknowledged:** ${m.acknowledgedOn}`);
    if (m.acknowledgmentComment) out.push("", `> ${m.acknowledgmentComment}`);
  }
  return out.join("\n").trimEnd() + "\n";
}

const nl = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

export function buildReportHtml(m: ReportModel): string {
  const pages = m.tracks.map((t, idx) => {
    const sections = m.template.sections
      .map((s) => {
        const qs = s.questions
          .map((q) => {
            if (q.type === "rating") {
              const rows = q.items.map((i) => `<div class="pr-rating-item"><span>${escapeHtml(i.label)}</span><span class="pr-rating-value">${t.answers.ratings[`${q.key}.${i.key}`] ?? "—"}</span></div>`).join("");
              return `<section class="pr-rating-category"><div class="pr-rating-category-head">${escapeHtml(q.label)}</div>${rows}</section>`;
            }
            if (q.type === "goal_review") {
              return m.goals.length === 0
                ? '<p class="pr-empty">No goals in this period</p>'
                : `<section class="pr-rating-category">${m.goals.map((g) => `<div class="pr-rating-item"><span>${escapeHtml(g.title)}${t.answers.texts[g.answerKey] ? ` — ${escapeHtml(t.answers.texts[g.answerKey]!)}` : ""}</span><span class="pr-rating-value">${t.answers.ratings[g.answerKey] ?? "—"}</span></div>`).join("")}</section>`;
            }
            if (q.type === "text") {
              const text = textOf(t.answers, q);
              return `<div class="pr-prose">${text ? nl(text) : '<span class="pr-empty">Nothing written</span>'}</div>`;
            }
            const items = listOf(t.answers, q);
            return items.length === 0
              ? '<p class="pr-empty">Nothing written</p>'
              : `<ol class="pr-list">${items.map((x, i) => `<li class="pr-list-item"><span class="pr-list-number">${i + 1}</span><span>${nl(x)}</span></li>`).join("")}</ol>`;
          })
          .join("");
        return `<section class="pr-section"><div class="pr-section-heading"><h2>${escapeHtml(s.title)}</h2></div>${qs}</section>`;
      })
      .join("");
    return `<article class="pr-report-page" data-review-report-page="${idx + 1}" data-track="${t.role}">
      <header class="pr-report-header"><div><p class="pr-report-kicker">${escapeHtml(t.label)}</p><h1 class="pr-report-title">Performance Review</h1><p class="pr-report-period">${escapeHtml(m.cycleName)} · ${escapeHtml(m.period)}</p></div><div class="pr-report-mark">PR</div></header>
      <section class="pr-identity"><div><span class="pr-label">Employee</span><div class="pr-value">${escapeHtml(m.employeeName)}</div></div><div><span class="pr-label">Manager</span><div class="pr-value">${escapeHtml(m.managerName)}</div></div></section>
      ${idx === 0 && (m.overall || m.calibrated) ? `<section class="pr-overall"><div><span class="pr-label">Overall rating</span><strong>${escapeHtml(m.overall ?? "Not set")}</strong></div>${m.calibrated ? `<span>Calibrated: ${escapeHtml(m.calibrated)}</span>` : ""}</section>` : ""}
      ${sections}
      ${idx === m.tracks.length - 1 && m.acknowledgedOn ? `<section class="pr-section"><div class="pr-section-heading"><h2>Acknowledged ${escapeHtml(m.acknowledgedOn)}</h2></div>${m.acknowledgmentComment ? `<div class="pr-prose">${nl(m.acknowledgmentComment)}</div>` : ""}</section>` : ""}
    </article>`;
  });
  return `<div class="pr-report">${pages.join("")}</div>`;
}

export function openStandardReportPrint(m: ReportModel): void {
  const title = `${m.employeeName} Performance Review`;
  openPrintWindow(buildPrintDocument(buildReportHtml(m), title, REVIEW_REPORT_STYLES), title);
}
