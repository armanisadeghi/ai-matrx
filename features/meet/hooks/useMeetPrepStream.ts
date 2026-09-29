"use client";

// features/meet/hooks/useMeetPrepStream.ts
//
// PREPARE and DRAFT AGENDA (Meet wave 4) — the two server-run mandates before a
// meeting (`meet.pre_meeting_brief`, `meet.agenda_draft`). The server
// orchestrates the run (it builds the meeting's provision from durable rows), so
// the stream is ADOPTED into the execution system (`adoptForeignStream`) and
// renders in the floating LiveRunWindow — never hand-parsed, never a spinner
// (THE FLOATING LAW). A refusal arrives BEFORE the stream opens and is shown as
// the server's own sentence and remedy ("Nobody is assigned to write meeting
// briefs yet. An administrator assigns one in Administration → Mandates…").

import { useRef, useState } from "react";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { adoptForeignStream } from "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream";
import { selectAnswerText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";

export interface AgendaDraftBody {
  organization_id: string;
  meeting_id?: string | null;
  title: string;
  agenda?: string | null;
  scheduled_for?: string | null;
  time_zone?: string | null;
  duration_minutes?: number | null;
  recurrence_rule?: string | null;
  guests: {
    user_id?: string | null;
    email?: string | null;
    name?: string | null;
    cohost?: boolean;
  }[];
}

export type PrepRequest =
  | { kind: "brief"; meetingId: string; organizationId: string }
  | { kind: "agenda"; body: AgendaDraftBody };

export interface PrepRun {
  readonly status: "idle" | "running" | "done" | "error";
  readonly requestId: string | null;
  readonly error: string | null;
}

/** The server's `{message, remedy}` as one sentence; anything else, said plainly. */
export function refusalSentence(error: {
  message?: string;
  status?: number;
  serverDetail?: unknown;
}): string {
  const detail = error.serverDetail as
    { detail?: unknown; message?: unknown; remedy?: unknown } | undefined;
  const body = (
    detail && typeof detail === "object" && "detail" in detail
      ? detail.detail
      : detail
  ) as { user_message?: unknown; message?: unknown; remedy?: unknown } | undefined;
  // `user_message` is the person's sentence. On a 5xx aidream appends the
  // exception class to `message` for developers ("… — MeetError: …"), so
  // `message` is only the fallback.
  const message =
    typeof body?.user_message === "string" && body.user_message
      ? body.user_message
      : typeof body?.message === "string"
        ? body.message
        : null;
  const remedy = typeof body?.remedy === "string" ? body.remedy : null;
  if (message) return remedy ? `${message} ${remedy}` : message;
  if (error.status === 404) return "The server does not offer this yet.";
  return error.message || "It could not be started.";
}

export function useMeetPrepStream(instanceId: string, label: string) {
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<PrepRun>({
    status: "idle",
    requestId: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  // The window opens once the stream is ADOPTED: a refusal arrives before any
  // stream exists (nobody assigned, AI off), and a window left saying "Starting…"
  // for a run that never started would be a lie — the refusal is shown in place.
  useFloatingLiveRun({
    active: run.status === "running" && run.requestId !== null,
    instanceId,
    requestId: run.requestId ?? undefined,
    label,
  });

  /** Runs the job; resolves to the answer text, or null with `run.error` set. */
  const start = async (request: PrepRequest): Promise<string | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRun({ status: "running", requestId: null, error: null });
    let requestId: string | null = null;
    let streamError: string | null = null;
    const consumeStream = dispatch(
      adoptForeignStream({
        abortController: controller,
        onAdopted: (ids) => {
          requestId = ids.requestId;
          setRun((r) => ({ ...r, requestId: ids.requestId }));
        },
        onEvent: (event) => {
          if (event.event === "error") {
            const data = event.data as {
              user_message?: unknown;
              message?: unknown;
            };
            streamError =
              (typeof data.user_message === "string" && data.user_message) ||
              (typeof data.message === "string" && data.message) ||
              "The run stopped with an error.";
          }
        },
      }),
    );
    const response = await dispatch(
      request.kind === "brief"
        ? callApi({
            path: "/v1/meet/meetings/{meeting_id}/brief",
            method: "POST",
            pathParams: { meeting_id: request.meetingId },
            scopeOverrides: { organization_id: request.organizationId },
            stream: true,
            consumeStream,
            signal: controller.signal,
          })
        : callApi({
            path: "/v1/meet/agenda-draft",
            method: "POST",
            body: request.body,
            scopeOverrides: { organization_id: request.body.organization_id },
            stream: true,
            consumeStream,
            signal: controller.signal,
          }),
    );
    if (controller.signal.aborted) return null;
    const failure = response.error
      ? refusalSentence(response.error)
      : streamError;
    if (failure) {
      setRun({ status: "error", requestId, error: failure });
      return null;
    }
    const text = requestId
      ? dispatch((_d, getState) => selectAnswerText(requestId!)(getState()))
      : "";
    setRun({ status: "done", requestId, error: null });
    return text.trim() || null;
  };

  return {
    run,
    start,
    reset: () => setRun({ status: "idle", requestId: null, error: null }),
  };
}
