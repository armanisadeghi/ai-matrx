/**
 * features/resource-manager/source-input/itemStage.ts
 *
 * The small state badge on a Use existing row: the Knowledge hub's Stage word
 * (`HUB_STAGE_LABEL`, from `docproc.source_list_facts` via `readSourceFacts`)
 * for a kind that has a stage — a saved Source (`processed_document`). Other
 * kinds have no stage and carry no badge. One vocabulary with the hub; never
 * re-derived here.
 */

import { useEffect, useRef, useState } from "react";
import {
  factsPollDelayMs,
  indexingIds,
  type SourceFacts,
} from "@/features/sources/sourceRows";
import { readSourceFacts } from "@/features/sources/hooks/useSources";
import { HUB_STAGE_LABEL, stageOf, type HubStage } from "@/features/knowledge/hub/hubStage";

/** The kinds whose rows have a stage (read from the Source facts). */
export const STAGE_READ_TOKENS: ReadonlySet<string> = new Set(["processed_document"]);

export interface KindItemStage {
  stage: HubStage;
  label: string;
}

/** One row's badge, or null (no stage for this kind, or its facts are not read yet). */
export function kindItemStage(
  token: string,
  facts: SourceFacts | undefined,
  readFailed: boolean,
): KindItemStage | null {
  if (!STAGE_READ_TOKENS.has(token)) return null;
  const stage = stageOf(facts, readFailed);
  return stage ? { stage, label: HUB_STAGE_LABEL[stage] } : null;
}

/**
 * The facts for the listed rows of a kind that has a stage — one read per new
 * id, then only the rows still indexing are re-read on the hub's own rule
 * (`factsPollDelayMs`, THE STAGE RE-READ RULE), so "Indexing" never outlives
 * its job. Nothing is read for a kind without a stage.
 */
export function useKindItemStages(token: string, ids: readonly string[]) {
  const [facts, setFacts] = useState<Map<string, SourceFacts>>(() => new Map());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const asked = useRef<Set<string>>(new Set());
  const active = STAGE_READ_TOKENS.has(token);
  const idsKey = active ? ids.join(",") : "";

  useEffect(() => {
    if (!idsKey) return undefined;
    const fresh = idsKey.split(",").filter((id) => !asked.current.has(id));
    if (!fresh.length) return undefined;
    fresh.forEach((id) => asked.current.add(id));
    let cancelled = false;
    void readSourceFacts(fresh).then((read) => {
      if (cancelled) return;
      setFacts((prev) => {
        const next = new Map(prev);
        read.facts.forEach((f, id) => next.set(id, f));
        return next;
      });
      setFailed((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => (read.failedIds.has(id) ? next.add(id) : next.delete(id)));
        return next;
      });
    });
    return () => {
      cancelled = true;
      fresh.forEach((id) => asked.current.delete(id));
    };
  }, [idsKey]);

  const pollingKey = indexingIds(facts).join(",");
  const pollStart = useRef<number | null>(null);
  useEffect(() => {
    if (!pollingKey) {
      pollStart.current = null;
      return undefined;
    }
    const now = Date.now();
    if (pollStart.current === null) pollStart.current = now;
    const delay = factsPollDelayMs(true, now - pollStart.current);
    if (delay === null) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void readSourceFacts(pollingKey.split(",")).then((read) => {
        if (cancelled) return;
        setFacts((prev) => {
          const next = new Map(prev);
          read.facts.forEach((f, id) => next.set(id, f));
          return next;
        });
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollingKey, facts]);

  return (id: string) => kindItemStage(token, facts.get(id), failed.has(id));
}
