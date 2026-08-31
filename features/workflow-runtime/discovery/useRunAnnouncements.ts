"use client";

/**
 * `useRunAnnouncements` — THE one consumer of `GET /runs/stream`.
 *
 * Every discovery surface that must stay live (the "waiting on you" inbox, its
 * header badge, the global runs list, a per-workflow runs list) calls this
 * hook. They share ONE SSE connection: the channel is a module singleton with
 * a subscriber refcount, opened when the first surface mounts and closed when
 * the last one unmounts.
 *
 * Never open a second channel. Four mounted surfaces meant four sockets and
 * four copies of the same fan-out for one user, which is exactly the "N
 * subscriptions" mistake this hook exists to make impossible.
 *
 * The callback identity does NOT need to be stable — the hook holds it in a
 * ref and the subscription never re-subscribes because a consumer re-rendered.
 */

import { useEffect, useRef } from "react";

import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { selectAccessToken } from "@/lib/redux/selectors/userSelectors";
import { stampRunStreamOrganizationContext } from "../transport/organization-context";
import type { RunAnnounceEvent } from "@/types/python-generated/workflow-events";

import {
  startAnnounceChannel,
  type AnnounceChannel,
  type AnnounceChannelStatus,
} from "./announce-channel";

export interface RunAnnouncementHandlers {
  /** One run's INSERT or status transition. */
  onAnnounce: (event: RunAnnounceEvent) => void;
  /**
   * The wire (re)connected or dropped. Frames carry no replay, so a consumer
   * refetches its snapshot on every "open" — that is how the hole a dropped
   * connection left gets closed.
   */
  onStatus?: (status: AnnounceChannelStatus) => void;
}

type Subscriber = { current: RunAnnouncementHandlers };

/**
 * The singleton. Keyed by base URL so flipping the admin server toggle
 * (production ↔ localhost) genuinely re-points the wire instead of leaving
 * every list listening to the server nobody is looking at any more.
 */
let channel: AnnounceChannel | null = null;
let channelKey: string | null = null;
const subscribers = new Set<Subscriber>();

function openChannel(
  key: string,
  baseUrl: string,
  getHeaders: () => Record<string, string>,
): void {
  channelKey = key;
  channel = startAnnounceChannel({
    baseUrl,
    getHeaders,
    onAnnounce: (event) => {
      for (const subscriber of subscribers) subscriber.current.onAnnounce(event);
    },
    onStatus: (status) => {
      for (const subscriber of subscribers) subscriber.current.onStatus?.(status);
    },
  });
}

function closeChannel(): void {
  channel?.stop();
  channel = null;
  channelKey = null;
}

export function useRunAnnouncements(handlers: RunAnnouncementHandlers): void {
  const store = useAppStore();
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  /**
   * 🚨 **Whether there IS a token, never the token itself.**
   *
   * A dependency on the token STRING re-runs this effect on every refresh —
   * and because the effect's cleanup drops the last subscriber, each re-run
   * tore the shared channel down and reopened it, aborting the in-flight
   * fetch. The stream never lived long enough to deliver a frame, so the
   * lists looked static while the server was announcing correctly (measured:
   * the endpoint delivered pending → running → interrupted, and not one frame
   * reached the page).
   *
   * The boolean flips false → true exactly once, when the session hydrates;
   * `getHeaders` below reads the CURRENT token from the store at connect time,
   * so a refresh still reaches every reconnect without churning the socket.
   */
  const hasToken = Boolean(useAppSelector(selectAccessToken));

  // The handlers a frame is delivered to are read at delivery time, so a
  // consumer re-rendering with a new closure never churns the connection.
  const held = useRef(handlers);
  held.current = handlers;

  useEffect(() => {
    // No origin, or not signed in yet: `/runs/stream` is user-scoped and
    // refuses an anonymous caller (401), so connecting before the session
    // hydrates would burn the retry budget on a guaranteed rejection.
    if (!baseUrl || !hasToken) return undefined;

    const subscriber = held as Subscriber;
    subscribers.add(subscriber);

    if (channel === null || channelKey !== baseUrl) {
      if (channel !== null) closeChannel();
      openChannel(baseUrl, baseUrl, () => {
        // Read the token from the store at connect time, never from this
        // effect's closure — a refresh between reconnects must reach the wire.
        const state = store.getState();
        const fresh = selectAccessToken(state);
        const headers: Record<string, string> = {};
        if (fresh) headers.Authorization = `Bearer ${fresh}`;
        // Mandatory org admission on the authed /runs/stream SSE — read at
        // connect time like the token, non-throwing stream-lane posture (see
        // the helper's header comment).
        return stampRunStreamOrganizationContext(state, headers);
      });
    }

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) closeChannel();
    };
  }, [baseUrl, hasToken, store]);
}
