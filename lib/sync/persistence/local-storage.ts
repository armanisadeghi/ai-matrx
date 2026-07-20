/**
 * lib/sync/persistence/local-storage.ts
 *
 * Synchronous localStorage adapter for `boot-critical` slices. Small payloads,
 * synchronous write-through, identity + version stamped on every record.
 *
 * Replaces (via the sync engine): 151 ad-hoc `localStorage.*` calls across 53
 * files. Delete trigger: when Phase 8 grep of `localStorage\.(set|get|remove)`
 * outside `lib/sync/` returns zero matches.
 */

import { logger } from "../logger";
import type { PersistenceAdapter, PersistenceRecord } from "./types";
import { extractErrorMessage } from "@/utils/errors";

function hasLocalStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

export const localStorageAdapter = {
  read(storageKey) {
    if (!hasLocalStorage()) return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        typeof (parsed as { version?: unknown }).version !== "number" ||
        typeof (parsed as { identityKey?: unknown }).identityKey !== "string"
      ) {
        logger.warn("persist.read.malformed", { meta: { storageKey } });
        return null;
      }
      return parsed as PersistenceRecord;
    } catch (err) {
      logger.warn("persist.read.failed", {
        meta: { storageKey, error: extractErrorMessage(err) },
      });
      return null;
    }
  },
  write(storageKey, record) {
    if (!hasLocalStorage()) return false;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(record));
      logger.debug("persist.write", { meta: { storageKey } });
      return true;
    } catch (err) {
      // QuotaExceededError or disabled storage — degrade gracefully.
      logger.warn("persist.write.failed", {
        meta: { storageKey, error: extractErrorMessage(err) },
      });
      return false;
    }
  },
  remove(storageKey) {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch (err) {
      logger.warn("persist.remove.failed", {
        meta: { storageKey, error: extractErrorMessage(err) },
      });
    }
  },
} satisfies PersistenceAdapter;

/**
 * Read a raw legacy key from localStorage (no version/identity envelope).
 * Used by the one-shot legacy-key migration in `engine/boot.ts`.
 */
export function readLegacyKey(legacyKey: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return window.localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

export function removeLegacyKey(legacyKey: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(legacyKey);
  } catch {
    /* noop */
  }
}
