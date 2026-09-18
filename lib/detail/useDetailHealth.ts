// lib/detail/useDetailHealth.ts
//
// 🚨 THE SOURCE HEALTH STRIP HAS A PRODUCER, AND A REFUSAL ANYWHERE REACHES
// EVERY DEPENDENT RECORD.
//
// The strip itself has existed since the primitive's first commit and NO record
// could ever render it: the registration's `health` field was never set by the
// one producer of registrations in app code, so "does the record tell the truth
// from a live capability-health row?" was unanswerable for four verification
// rounds (VERIFY-U-P1-R4, § The health strip).
//
// What the contract needs is a producer the HOST wires, because the answer is not
// in the row: whether the grant behind a synced record still works is the
// connector's recorded per-capability health, read from the server. So the
// producer may be ASYNC and it is resolved here — ONE hook, called for every
// record type whether it produces health or not, so the hook order cannot change
// when the person arrows from a synced record to an owned one.
//
// Nothing in this file knows what a provider is. It resolves a function the
// registration carries and hands it the record, an abort signal and the host's
// reconnect action — the same Reconnect the connector rows offer ("A refusal
// anywhere … shows on every dependent record's health strip with the same
// Reconnect").
//
// AND A PRODUCER THAT FAILS SAYS SO (law 4). A read that throws does not leave
// the record looking healthy and does not leave the strip absent, which would
// read as "this record is not synced": it renders with an unknown grant, the
// failure in the person's language, and the Reconnect that is the only thing they
// can do about it.
//
// 🚨 AND `onReconnect: null` MEANS "OFFER NOTHING" (Bugbot round 18, frontend
// PR 228). The producer's decision is three-valued — a function (offer this),
// `null` (offer nothing: a reconnect would not repair this refusal), or omitted
// (defer to the host's `reconnectSource`) — and this hook used to merge the
// host action back in with `??`, which reads `null` as "unset". A synced record
// whose refusal a reconnect cannot fix (a share the owner must grant, a record
// we own) therefore still showed Reconnect: a control that does nothing. Only an
// OMITTED key defers to the host now.

"use client";

import { useEffect, useRef, useState } from "react";

import type {
  DetailRecordType,
  DetailRef,
  DetailRow,
  DetailSourceHealth,
} from "./types";

export interface UseDetailHealthArgs {
  recordType: DetailRecordType | null;
  /** The loaded row — health is only ever produced for a record that loaded. */
  row: DetailRow | null;
  ref: DetailRef;
  /** The host's reconnect action for this record's source, when it has one. */
  reconnect: ((ref: DetailRef, source: string) => void) | null;
}

/**
 * The strip's Reconnect for a producer's answer: the producer's own action, its
 * explicit refusal (`null`), or — only when it said nothing — the host's.
 *
 * 🚨 AND `grant: "blocked"` NEVER GETS ONE (chair, 2026-09-18). The word means
 * the source refuses and nothing the person can click repairs it, so the refusal
 * is structural here rather than a promise each producer must remember to keep:
 * a host that binds `reconnectSource` cannot put the button back, and neither
 * can a producer that supplies an action by mistake.
 */
export function reconnectFor(
  value: DetailSourceHealth,
  hostReconnect: ((source: string) => void) | null,
): (() => void) | null {
  if (value.grant === "blocked") return null;
  if (value.onReconnect !== undefined) return value.onReconnect;
  return hostReconnect ? () => hostReconnect(value.source) : null;
}

export function useDetailHealth({
  recordType,
  row,
  ref,
  reconnect,
}: UseDetailHealthArgs): DetailSourceHealth | null {
  const [health, setHealth] = useState<DetailSourceHealth | null>(null);
  const producer = recordType?.health ?? null;
  const key = `${ref.type}:${ref.id}`;

  // 🚨 N8 (VERIFY-U-P1-R5) — THE PRODUCER'S FUNCTION IDENTITY IS NOT A
  // DEPENDENCY, BECAUSE A HOST IS NOT REQUIRED TO CACHE IT.
  //
  // The effect used to key on `recordType.health` itself. `resolveType` is a
  // host PORT: a host whose map builds the registration per call hands a fresh
  // producer every render, and this effect's own `setHealth` causes the next
  // render — an unbounded loop that react-dom reports as "Maximum update depth
  // exceeded" from inside this file, with no remedy naming the cause. A verifier
  // hit it in minutes by registering the type inline.
  //
  // What actually identifies a producer is the RECORD TYPE it came from, which
  // is a string, plus whether there is one at all. The function and the host's
  // reconnect are read through refs, so a new identity is used on the next run
  // without scheduling one.
  const producerRef = useRef(producer);
  producerRef.current = producer;
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;
  const producerKey = producer ? `${recordType?.type ?? ""}:${key}` : null;

  useEffect(() => {
    const producer = producerRef.current;
    const reconnect = reconnectRef.current;
    if (!producer || !row) {
      setHealth(null);
      return undefined;
    }
    const controller = new AbortController();
    let settled = false;
    const onReconnect = reconnect ? (source: string) => reconnect(ref, source) : null;
    const publish = (value: DetailSourceHealth | null) => {
      if (controller.signal.aborted) return;
      settled = true;
      setHealth(value ? { ...value, onReconnect: reconnectFor(value, onReconnect) } : null);
    };
    try {
      const answer = producer(row, { ref, signal: controller.signal });
      if (answer && typeof (answer as Promise<unknown>).then === "function") {
        void (answer as Promise<DetailSourceHealth | null>).then(publish).catch(
          (error: unknown) => {
            if (controller.signal.aborted) return;
            publish(unreadable(error, onReconnect));
          },
        );
      } else {
        publish((answer as DetailSourceHealth | null) ?? null);
      }
    } catch (error: unknown) {
      publish(unreadable(error, onReconnect));
    }
    return () => {
      controller.abort();
      if (!settled) setHealth(null);
    };
    // `ref` is rebuilt every render; its identity is the key. `producerKey`
    // stands in for the producer (N8) and the host's reconnect is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerKey, row, key]);

  return health;
}

/** The honest strip for a source check that could not be read at all. */
function unreadable(
  error: unknown,
  onReconnect: ((source: string) => void) | null,
): DetailSourceHealth {
  const message = error instanceof Error ? error.message : String(error);
  const source = "its source";
  return {
    source: "Source",
    grant: "unknown",
    grantDetail:
      "We could not check the connection this record refreshes through, so we cannot say " +
      `whether it is still working (${message}). Reconnecting is safe and fixes it if the ` +
      "connection is the problem.",
    lastRefreshedAt: null,
    onReconnect: onReconnect ? () => onReconnect(source) : null,
  };
}
