"use client";

import { useSyncExternalStore } from "react";

import {
  getRequestLedger,
  getServerRequestLedger,
  subscribeRequestLedger,
  type LedgerEntry,
} from "./request-ledger";

/** The one request ledger, newest first, live (see `request-ledger.ts`). */
export function useRequestLedger(): LedgerEntry[] {
  return useSyncExternalStore(subscribeRequestLedger, getRequestLedger, getServerRequestLedger);
}
