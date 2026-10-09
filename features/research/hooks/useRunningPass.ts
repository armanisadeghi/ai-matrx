"use client";

import { useCallback, useEffect, useState } from "react";

import { callApi } from "@/lib/api/call-api";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

const POLL_MS = 6000;
/** `rs_topic.status` values while a pass is working. */
const WORKING = new Set(["searching", "scraping", "curating", "analyzing", "synthesizing"]);

/**
 * Is a research pass working on this topic RIGHT NOW — whoever started it, from whatever page?
 *
 * The Stop button used to exist only while THIS page held the run's stream: reload, navigate
 * away, or open the topic in a second tab and a spending pass had no Stop at all (topic
 * 1ea826a4, 2026-10-09). The server knows (`/runtime/operations/by-link/rs_topic/{id}`), so ask it
 * while the topic reads as working, and Stop through the same door the stream's Stop uses.
 */
export function useRunningPass(topicId: string, topicStatus: string | null | undefined, streaming: boolean) {
  const dispatch = useAppDispatch();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const worth = streaming || (topicStatus != null && WORKING.has(topicStatus));

  useEffect(() => {
    if (!worth) {
      setRunning(false);
      setRequestId(null);
      return;
    }
    let cancelled = false;
    const look = async () => {
      try {
        const { data } = await apiGet(
          buildPath("/runtime/operations/by-link/{link_kind}/{link_id}", {
            link_kind: "rs_topic",
            link_id: topicId,
          }),
          // 404 = "no operation you own for this topic": an answer, not an error.
          { captureErrors: false },
        );
        const live = (data?.operations ?? []).find((o) => !o.is_terminal);
        if (cancelled) return;
        setRunning(Boolean(live));
        setRequestId(live?.root_request_id ?? live?.request_id ?? null);
        if (!live) setStopping(false);
      } catch (error) {
        if (cancelled) return;
        if ((error as { status?: number } | null)?.status === 404) {
          setRunning(false);
          setRequestId(null);
          setStopping(false);
        }
        // Any other failure keeps the last answer: never hide a Stop on a blip.
      }
    };
    void look();
    const timer = window.setInterval(() => void look(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [worth, topicId]);

  const stop = useCallback(async () => {
    if (!requestId) return;
    setStopping(true);
    try {
      await dispatch(
        callApi({ path: "/ai/cancel/{request_id}", method: "POST", pathParams: { request_id: requestId } }),
      );
      toast.success("Stop requested. The run ends at its next step.");
    } catch (error) {
      setStopping(false);
      toast.error((error as Error).message ?? "Could not stop the run");
    }
  }, [dispatch, requestId]);

  return { running, requestId, stopping, stop };
}
