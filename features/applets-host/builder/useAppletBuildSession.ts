"use client";

// features/applets-host/builder/useAppletBuildSession.ts — the builder's durable half.
//
// A BUILD IS A RECORD WITH ITS OWN URL, AND IT SURVIVES A REFRESH (record + claim: ./build-session.ts).
//
//   begin()   — Build / Change it / Fix it: the request is written to the Applet row FIRST (a new app is
//               born as a draft right here), then the address becomes /applets/build/<id>;
//   running() — the run's conversation id joins the request the instant it exists;
//   settle()  — how the request ended (saved vN / refused / failed), written back;
//   reopen    — on mount the row is read; a request still open is REJOINED through the one runtime door
//               (`loadConversation` + `reconnectServerOperation`: follow the live stream to its end, or
//               reload the finished turn), its committed answer is read back out of the conversation and
//               handed to the builder's own `onAnswer` — the same path a live answer takes.
//
// Nothing here lives in the browser: the row is the truth, the URL only names it.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { extractFirstJson } from "@ai-matrx/content-ir/json-extract";
import { loadConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk";
import { reconnectServerOperation } from "@ai-matrx/chat/agents/runtime-reconnect/reconnect-server-operation.thunk";
import { selectLatestAnswerText } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";

import { createClient } from "@/utils/supabase/client";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";

import {
  appendBuildEntry,
  claimBuildEntry,
  claimFixRound,
  isOpenEntry,
  isStaleClaim,
  newBuildEntry,
  patchBuildEntry,
  readBuildRecord,
  releaseStaleClaim,
  startBuildRecord,
  type BuildEntry,
  type BuildRecord,
} from "./build-session";

/** A request that never got a run this long after it started is over, not "about to start". */
const STALE_START_MS = 60_000;

export interface ReopenedRun {
  entry: BuildEntry;
  /** The run's committed answer, parsed out of its text — null when it left no JSON. */
  value: unknown;
  conversationId: string;
}

export function useAppletBuildSession(opts: {
  appletId: string | null;
  /** The record as the page's server render read it — shown from the first paint (audit9 B1). */
  initialRecord?: BuildRecord | null;
  /** The page owns the address: a new build moves it to /applets/build/<id>. */
  routed: boolean;
  /** Open the live window on a rejoined run. */
  onRejoin: (entry: BuildEntry & { conversation_id: string }) => void;
  /** A reopened run finished with an answer: save it exactly as a live answer is saved. */
  onReopenedAnswer: (run: ReopenedRun) => Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [record, setRecord] = useState<BuildRecord | null>(opts.initialRecord ?? null);
  const [readError, setReadError] = useState<string | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const reopened = useRef<string | null>(null);

  const refresh = async (appletId: string): Promise<BuildRecord | null> => {
    try {
      const next = await readBuildRecord(createClient(), appletId);
      setRecord(next);
      setReadError(null);
      return next;
    } catch (err) {
      setReadError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const settle = async (appletId: string, entryId: string, patch: Partial<BuildEntry>) => {
    const next = await patchBuildEntry(createClient(), appletId, entryId, { finished_at: new Date().toISOString(), ...patch });
    setRecord(next);
    return next;
  };

  /** Rejoin a request the server may still be working on, then hand its answer back. */
  const rejoin = async (appletId: string, entry: BuildEntry): Promise<void> => {
    const cid = entry.conversation_id;
    if (!cid) {
      const age = Date.now() - Date.parse(entry.started_at || "0");
      if (age > STALE_START_MS) {
        await settle(appletId, entry.id, { state: "failed", error: "This request stopped before the builder started." });
        return;
      }
      // Another tab may be starting it this second: look again once it would have started.
      await new Promise((r) => setTimeout(r, STALE_START_MS - age + 1000));
      const again = await refresh(appletId);
      const same = again?.requests.find((r) => r.id === entry.id);
      if (same && isOpenEntry(same) && same.state !== "saving") await rejoin(appletId, { ...same, started_at: entry.started_at || new Date(0).toISOString() });
      return;
    }
    setRejoining(true);
    opts.onRejoin({ ...entry, conversation_id: cid });
    try {
      try {
        await dispatch(loadConversation({ conversationId: cid, expectMaterialized: true })).unwrap();
      } catch (err) {
        console.warn("[applet-build] reading the build's conversation failed — following the live run anyway.", err);
      }
      const followed = await dispatch(reconnectServerOperation({ conversationId: cid, source: "cold-load" })).unwrap();
      let text = selectLatestAnswerText(cid)(store.getState());
      if (!text) {
        // The turn settled before this page asked: its rows are written at the end, so read once more.
        await dispatch(loadConversation({ conversationId: cid })).unwrap();
        text = selectLatestAnswerText(cid)(store.getState());
      }
      if (followed.finalStatus === "failed" || followed.finalStatus === "cancelled") {
        await settle(appletId, entry.id, { state: "failed", error: followed.finalStatus === "failed" ? "The builder's run failed." : "The builder's run was stopped." });
        return;
      }
      if (!text) {
        await settle(appletId, entry.id, { state: "failed", error: "The builder finished without an answer." });
        return;
      }
      const value = extractFirstJson(text, { allowFuzzy: true })?.value ?? null;
      await opts.onReopenedAnswer({ entry, value, conversationId: cid });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[applet-build] rejoining the build failed", { appletId, conversationId: cid, err });
      await settle(appletId, entry.id, { state: "failed", error: message }).catch(() => undefined);
    } finally {
      setRejoining(false);
    }
  };

  // Follow: the row is the truth. A request still open is rejoined once per page — on reopen, and when
  // another tab took the fix round this one was about to start.
  const follow = async (appletId: string) => {
    let next = await refresh(appletId);
    let latest = next?.requests.at(-1);
    // A claim whose tab died between claiming the answer and saving it would hold the request in
    // "saving" forever: release it, then rejoin like any open run (the claim decides again).
    if (isStaleClaim(latest)) {
      await releaseStaleClaim(createClient(), appletId, latest.id).catch((err) => console.error("[applet-build] could not release a stale claim", err));
      next = await refresh(appletId);
      latest = next?.requests.at(-1);
    }
    if (isOpenEntry(latest) && latest.state !== "saving" && reopened.current !== latest.id) {
      reopened.current = latest.id;
      await rejoin(appletId, latest);
    }
  };
  const reopen = useEffectEvent((appletId: string) => follow(appletId));
  const openedAt = opts.appletId;
  useEffect(() => {
    if (openedAt) void reopen(openedAt);
  }, [openedAt]);

  /**
   * Write the request before anything runs. A new app is born here; its id becomes the address.
   * Returns the record the run belongs to and the request's entry.
   */
  const begin = async (input: { appletId: string | null; organizationId: string; text: string; fix: BuildEntry["fix"] }) => {
    const client = createClient();
    const entry = newBuildEntry(input.text, input.fix);
    const next = input.appletId
      ? await appendBuildEntry(client, input.appletId, entry)
      : await startBuildRecord(client, { organizationId: input.organizationId, entry });
    reopened.current = entry.id;
    setRecord(next);
    if (!input.appletId && opts.routed && typeof window !== "undefined") {
      window.history.replaceState(null, "", `/applets/build/${next.id}`);
    }
    return { record: next, entry };
  };

  /**
   * THE FIX CLAIM — the automatic fix round of a refusal is written only by the one tab that claims it.
   * `claimed: false` means another tab runs it: `follow` the record to watch that run instead.
   */
  const beginFix = async (input: { appletId: string; refusedEntryId: string; text: string; fix: NonNullable<BuildEntry["fix"]> }) => {
    const entry = newBuildEntry(input.text, input.fix);
    const outcome = await claimFixRound(createClient(), input.appletId, input.refusedEntryId, entry);
    if (outcome.claimed) reopened.current = entry.id;
    setRecord(outcome.record);
    return { ...outcome, entry };
  };

  /** The run exists: its conversation joins the request, so a refresh can rejoin it. */
  const running = (appletId: string, entryId: string, conversationId: string) =>
    patchBuildEntry(createClient(), appletId, entryId, { conversation_id: conversationId, state: "running" }).then(setRecord);

  /** THE CLAIM — true for the one caller that saves this request's answer. */
  const claim = (appletId: string, entryId: string) => claimBuildEntry(createClient(), appletId, entryId);

  return { record, readError, rejoining, begin, beginFix, follow, running, claim, settle, refresh };
}
