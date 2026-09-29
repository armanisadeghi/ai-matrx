"use client";

// features/meet/components/record/ActivityLogPanel.tsx
//
// THE MEETING'S POLLS, Q&A AND WHITEBOARD, AFTER IT (Meet wave 5) — the Activity
// side tab of the record. Read from `GET /v1/meet/collab` through the package's
// `loadMeetingActivities` (the same state the room reads on join), so a poll's
// results, every question with its answer, and the whiteboard as it was left are
// part of the meeting's record. What a reader sees is the server's decision (an
// anonymous poll never names voters; a dismissed question is shown to hosts only).

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import {
  loadMeetingActivities,
  useMeetHost,
  type MeetingActivities,
  type MeetingId,
  type MeetStroke,
} from "@ai-matrx/meet/react";
import { Skeleton } from "@ai-matrx/design-system";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

const BOARD_W = 1600;
const BOARD_H = 1000;

function strokePath(stroke: MeetStroke): string {
  const [first, ...rest] = stroke.points;
  if (first === undefined) return "";
  const move = `M${first[0] * BOARD_W} ${first[1] * BOARD_H}`;
  return rest.length === 0
    ? `${move} l0.1 0`
    : `${move} ${rest.map(([x, y]) => `L${x * BOARD_W} ${y * BOARD_H}`).join(" ")}`;
}

export function ActivityLogPanel({ meetingId }: { meetingId: MeetingId }) {
  const host = useMeetHost();
  const { organizationState, retry } = useOrganizationRequired();
  const [read, setRead] = useState<MeetingActivities | null>(null);
  const api = host?.api ?? null;

  useEffect(() => {
    if (api === null) return undefined;
    let live = true;
    void loadMeetingActivities(api, meetingId).then((result) => {
      if (live) setRead(result);
    });
    return () => {
      live = false;
    };
  }, [api, meetingId]);

  if (api === null) {
    return (
      <OrganizationContextNotice
        state={organizationState === "ready" ? "resolving" : organizationState}
        what="This meeting's polls and questions"
        compact
        onRetry={retry}
        className="p-1"
      />
    );
  }
  if (read === null) {
    return (
      <div className="space-y-2 p-3" aria-busy="true" aria-label="Reading polls and questions">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  }
  if (read.refusal !== null || read.collab === null) {
    const message = read.refusal?.message ?? "Polls and questions could not be read.";
    return (
      <div role="alert" className="p-4 text-sm">
        <p>
          {message}
          <ErrorAlchemyMenu error={message} size="xs" />
        </p>
        <p className="mt-1 text-muted-foreground">{read.refusal?.remedy}</p>
      </div>
    );
  }
  const { polls, questions, strokes } = read.collab;
  const shownPolls = polls.filter((poll) => poll.state !== "draft");
  if (shownPolls.length === 0 && questions.length === 0 && strokes.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No polls, questions or whiteboard in this meeting.
      </p>
    );
  }
  return (
    <div className="h-full space-y-4 overflow-y-auto px-3 py-3 text-sm">
      {shownPolls.length > 0 ? (
        <section className="space-y-2" aria-label="Polls">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Polls
          </h3>
          {shownPolls.map((poll) => {
            const total = poll.options.reduce((sum, option) => sum + (option.votes ?? 0), 0);
            const counted = poll.options.some((option) => option.votes !== undefined);
            return (
              <div key={poll.id} className="space-y-1.5 rounded-md border border-border p-2.5">
                <p className="font-medium">{poll.question}</p>
                <p className="text-xs text-muted-foreground">
                  {poll.anonymous ? "Anonymous · " : ""}
                  {poll.multiple ? "Pick any" : "Pick one"}
                  {counted && poll.voterCount !== null ? ` · ${poll.voterCount} voted` : ""}
                  {!counted ? " · results were not shared" : ""}
                </p>
                <ul className="space-y-1">
                  {poll.options.map((option) => {
                    const share = counted && total > 0 ? Math.round(((option.votes ?? 0) / total) * 100) : 0;
                    return (
                      <li key={option.id} className="relative overflow-hidden rounded border border-border px-2 py-1">
                        {counted ? (
                          <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${share}%` }} aria-hidden="true" />
                        ) : null}
                        <span className="relative flex items-baseline justify-between gap-2">
                          <span>{option.text}</span>
                          {counted ? (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {option.votes ?? 0} · {share}%
                            </span>
                          ) : null}
                        </span>
                        {option.voters !== undefined && option.voters.length > 0 ? (
                          <span className="relative block text-xs text-muted-foreground">{option.voters.join(", ")}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}
      {questions.length > 0 ? (
        <section className="space-y-2" aria-label="Questions">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Questions
          </h3>
          <ol className="space-y-2">
            {[...questions]
              .sort((a, b) => b.upvotes - a.upvotes)
              .map((question) => (
                <li key={question.id} className="rounded-md border border-border p-2.5">
                  <p className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{question.askerName}</span>
                    <span>{question.upvotes} upvote{question.upvotes === 1 ? "" : "s"}</span>
                    <span>{question.state === "answered" ? "Answered" : question.state === "dismissed" ? "Dismissed" : "Open"}</span>
                  </p>
                  <p className="whitespace-pre-wrap break-words">{question.text}</p>
                  {question.answer !== null ? (
                    <p className="mt-1 border-l-2 border-border pl-2 text-muted-foreground">
                      <span className="font-medium text-foreground">{question.answeredByName ?? "Host"}:</span>{" "}
                      {question.answer}
                    </p>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ) : null}
      {strokes.length > 0 ? (
        <section className="space-y-2" aria-label="Whiteboard">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Whiteboard
          </h3>
          <svg
            viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
            className="w-full rounded-md border border-border bg-white"
            role="img"
            aria-label={`The whiteboard as it was left, ${strokes.length} strokes`}
          >
            {strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={strokePath(stroke)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.tool === "highlighter" ? stroke.width * 4 : stroke.width}
                strokeOpacity={stroke.tool === "highlighter" ? 0.35 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </section>
      ) : null}
    </div>
  );
}
