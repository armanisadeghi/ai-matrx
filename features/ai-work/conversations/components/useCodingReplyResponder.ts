"use client";

/**
 * useCodingReplyResponder — WHO answers a reply typed on this conversation,
 * read from the server BEFORE the person types.
 *
 * 🚨 THE LABEL IS THE SERVER'S. `composer_label` is composed by
 * `GET /coding-sessions/conversations/{id}/responder` out of the SAME
 * resolution that picks the answering agent, so the sentence and the agent
 * can never disagree, and re-binding the mandate relabels the composer with
 * no frontend release. This hook therefore never re-derives, re-words or
 * templates a sentence from the parts, and there is no client-side fallback
 * sentence to fall back TO: until the report lands the composer says nothing
 * about who answers, and if the read fails it says the label could not be
 * loaded. V-XT/V3 (2026-09-15): the composer used to hardcode "AI Matrx is
 * answering" while production was silently taking the platform-default
 * stand-in, because no agent was bound.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";

export type CodingReplyResponderReport =
  components["schemas"]["CodingReplyResponderReport"];

export type CodingReplyResponderStatus = "loading" | "ready" | "error";

export interface CodingReplyResponderState {
  status: CodingReplyResponderStatus;
  /** The server's report. Null while loading and after a failed read. */
  report: CodingReplyResponderReport | null;
  /** The read's own failure, in the server's words. Null unless status is "error". */
  error: string | null;
}

export function useCodingReplyResponder(opts: {
  conversationId: string;
  /**
   * Read only where a reply can even be typed. A page that already knows this
   * conversation is not a coding-session mirror passes `false` and no request
   * is made.
   */
  enabled: boolean;
}): CodingReplyResponderState {
  const { conversationId, enabled } = opts;
  const dispatch = useAppDispatch();

  const [status, setStatus] = useState<CodingReplyResponderStatus>("loading");
  const [report, setReport] = useState<CodingReplyResponderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const read = useCallback(() => {
    const seq = ++requestSeq.current;
    void dispatch(
      callApi({
        path: "/coding-sessions/conversations/{conversation_id}/responder",
        method: "GET",
        pathParams: { conversation_id: conversationId },
      }),
    ).then((result) => {
      if (seq !== requestSeq.current) return; // superseded
      if (result.error) {
        setReport(null);
        // `extractErrorMessage` answers "Unknown error" for an absent detail,
        // which is truthy — so the server's own message would never be reached
        // through an `||` chain. Ask it only when there IS a detail.
        const detail = result.error.serverDetail
          ? extractErrorMessage(result.error.serverDetail)
          : "";
        setError(detail || result.error.message || "Unknown error");
        setStatus("error");
        return;
      }
      setReport((result.data ?? null) as CodingReplyResponderReport | null);
      setError(null);
      setStatus("ready");
    });
  }, [conversationId, dispatch]);

  useEffect(() => {
    if (!enabled) return;
    read();
  }, [enabled, read]);

  return { status, report, error };
}
