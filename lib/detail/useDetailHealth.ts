// lib/detail/useDetailHealth.ts
//
// 🚨 PLAN §4 (the fixed sections) and §5.3 — THE GOOGLE HEALTH STRIP HAS A
// PRODUCER, AND A REFUSAL ANYWHERE REACHES EVERY DEPENDENT RECORD.
//
// The strip itself has existed since the primitive's first commit and NO record
// could ever render it: the registration's `health` field was never set by the
// one producer of registrations in app code, so "does the record tell the truth
// from a live `capability_health` row?" was unanswerable for four verification
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
// reconnect action — the same Reconnect the connector rows offer (§5.3: "A
// refusal anywhere … shows on every dependent record's health strip with the same
// Reconnect").
//
// AND A PRODUCER THAT FAILS SAYS SO (law 4). A read that throws does not leave
// the record looking healthy and does not leave the strip absent, which would
// read as "this record is not synced": it renders with an unknown grant, the
// failure in the person's language, and the Reconnect that is the only thing they
// can do about it.

"use client";

import { useEffect, useState } from "react";

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

export function useDetailHealth({
  recordType,
  row,
  ref,
  reconnect,
}: UseDetailHealthArgs): DetailSourceHealth | null {
  const [health, setHealth] = useState<DetailSourceHealth | null>(null);
  const producer = recordType?.health ?? null;
  const key = `${ref.type}:${ref.id}`;

  useEffect(() => {
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
      setHealth(
        value
          ? {
              ...value,
              onReconnect:
                value.onReconnect ??
                (onReconnect ? () => onReconnect(value.source) : null),
            }
          : null,
      );
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
    // `ref` is rebuilt every render; its identity is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producer, row, key, reconnect]);

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
