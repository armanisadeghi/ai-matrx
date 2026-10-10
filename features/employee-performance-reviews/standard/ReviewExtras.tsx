"use client";

// The review page's side doors: add the caller's due dates to a calendar, and take the review away
// as a printed PDF, Markdown copy or a Markdown file — built only from what this person may read.

import { CalendarPlus, Printer } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

import { ContentActions } from "@ai-matrx/rich-content/copy/ContentActions";
import { downloadIcs, googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar/eventLinks";

import { reviewDueEvents } from "./calendarEvents";
import { buildReportMarkdown, buildReportModel, openStandardReportPrint } from "./standardReport";
import { formatDay } from "./status";
import type { ReviewDetail } from "./types";

export function ReviewExtras({ detail }: { detail: ReviewDetail }) {
  const url = typeof window === "undefined" ? undefined : window.location.href;
  const events = reviewDueEvents(detail.review, url);
  const model = buildReportModel(detail);
  const markdown = buildReportMarkdown(model);
  const fileBase = `${model.employeeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "employee"}-performance-review`;
  const printable = model.tracks.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {events.map((e) => (
        <div key={e.key} className="flex items-center gap-1 text-sm">
          <CalendarPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span>
            {e.label} {formatDay(e.event.start.slice(0, 10))}
          </span>
          <Button asChild variant="quiet">
            <a href={googleCalendarUrl(e.event)} target="_blank" rel="noopener noreferrer">
              Google
            </a>
          </Button>
          <Button asChild variant="quiet">
            <a href={outlookCalendarUrl(e.event)} target="_blank" rel="noopener noreferrer">
              Outlook
            </a>
          </Button>
          <Button variant="quiet" onClick={() => downloadIcs(e.event)}>
            .ics
          </Button>
        </div>
      ))}
      {printable ? (
        <div className="ml-auto flex items-center gap-2">
          <ContentActions
            size="sm"
            label="Performance review"
            title="Performance review"
            content={() => markdown}
            onPrint={() => openStandardReportPrint(model)}
          />
          <Button icon={<Printer />} variant="outline" onClick={() => openStandardReportPrint(model)}>
            Print or save PDF
          </Button>
        </div>
      ) : null}
    </div>
  );
}
