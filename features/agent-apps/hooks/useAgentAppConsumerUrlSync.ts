"use client";

/**
 * useAgentAppConsumerUrlSync
 *
 * Two-way sync between an agent-app consumer's filter/sort/search state and
 * the page's URL search params. Lets `/agent-apps?q=tutor&sort=name-asc&...`
 * deep-link directly to a filtered list, and lets the browser's back/forward
 * buttons restore the filter set you had on the previous visit.
 *
 *   - On mount, the hook reads the URL once and patches the consumer slice
 *     to match. It only patches fields that are present in the URL — fields
 *     that are absent stay at the consumer's current (or default) value.
 *   - After mount, every consumer change is written back to the URL via
 *     `router.replace` (not push) so we don't bloat history with every
 *     keystroke.
 *
 * Keep the URL footprint small: defaults are omitted from the URL so a
 * fresh `/agent-apps` link doesn't render as `/agent-apps?tab=mine&...`.
 */

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  setAgentAppConsumerFilter,
  DEFAULT_AGENT_APP_CONSUMER_STATE,
} from "@/features/agent-apps/redux/agent-app-consumers/slice";
import type {
  AgentAppArchFilter,
  AgentAppSortOption,
  AgentAppTab,
  AgentAppVisibilityFilter,
} from "@/features/agent-apps/redux/agent-app-consumers/slice";
import type { UseAgentAppConsumerReturn } from "@/features/agent-apps/hooks/useAgentAppConsumer";

const VALID_TABS: AgentAppTab[] = ["mine", "shared", "all"];
const VALID_SORTS: AgentAppSortOption[] = [
  "updated-desc",
  "created-desc",
  "name-asc",
  "name-desc",
  "category-asc",
  "agent-asc",
  "executions-desc",
  "last-run-desc",
];
const VALID_ARCH: AgentAppArchFilter[] = ["active", "archived", "both"];
const VALID_VIS: AgentAppVisibilityFilter[] = ["all", "public", "private"];

function pickValidated<T extends string>(
  raw: string | null,
  allowed: readonly T[],
): T | null {
  if (!raw) return null;
  return allowed.includes(raw as T) ? (raw as T) : null;
}

function csvParse(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvStringify(arr: string[]): string {
  return arr.join(",");
}

export function useAgentAppConsumerUrlSync(
  consumerId: string,
  consumer: UseAgentAppConsumerReturn,
): void {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seededRef = useRef(false);

  // ── One-shot URL → consumer ─────────────────────────────────────────────
  // On the first effect after mount, read the URL and patch any present
  // fields into the consumer. After that we never read from the URL again
  // (to avoid stomping user edits on rerender).
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    const patch: Partial<typeof DEFAULT_AGENT_APP_CONSUMER_STATE> = {};

    const tab = pickValidated(searchParams.get("tab"), VALID_TABS);
    if (tab) patch.tab = tab;
    const sortBy = pickValidated(searchParams.get("sort"), VALID_SORTS);
    if (sortBy) patch.sortBy = sortBy;
    const archFilter = pickValidated(searchParams.get("arch"), VALID_ARCH);
    if (archFilter) patch.archFilter = archFilter;
    const visibilityFilter = pickValidated(searchParams.get("vis"), VALID_VIS);
    if (visibilityFilter) patch.visibilityFilter = visibilityFilter;

    const q = searchParams.get("q");
    if (q != null) patch.searchTerm = q;

    const cats = csvParse(searchParams.get("cats"));
    if (cats.length) patch.includedCats = cats;
    const tags = csvParse(searchParams.get("tags"));
    if (tags.length) patch.includedTags = tags;
    const agents = csvParse(searchParams.get("agents"));
    if (agents.length) patch.includedAgents = agents;

    if (Object.keys(patch).length > 0) {
      dispatch(setAgentAppConsumerFilter({ consumerId, patch }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── consumer → URL ──────────────────────────────────────────────────────
  // Every consumer change writes the diff back to the URL. We always replace
  // (never push) so back/forward stays meaningful — one history entry per
  // route navigation, not per filter tweak.
  useEffect(() => {
    if (!seededRef.current) return; // wait for the seed pass to complete

    const d = DEFAULT_AGENT_APP_CONSUMER_STATE;
    const next = new URLSearchParams();
    if (consumer.tab !== d.tab) next.set("tab", consumer.tab);
    if (consumer.sortBy !== d.sortBy) next.set("sort", consumer.sortBy);
    if (consumer.archFilter !== d.archFilter)
      next.set("arch", consumer.archFilter);
    if (consumer.visibilityFilter !== d.visibilityFilter)
      next.set("vis", consumer.visibilityFilter);
    if (consumer.searchTerm) next.set("q", consumer.searchTerm);
    if (consumer.includedCats.length)
      next.set("cats", csvStringify(consumer.includedCats));
    if (consumer.includedTags.length)
      next.set("tags", csvStringify(consumer.includedTags));
    if (consumer.includedAgents.length)
      next.set("agents", csvStringify(consumer.includedAgents));

    const nextStr = next.toString();
    const currentStr = searchParams.toString();
    if (nextStr === currentStr) return;

    router.replace(nextStr ? `${pathname}?${nextStr}` : pathname, {
      scroll: false,
    });
  }, [
    consumer.tab,
    consumer.sortBy,
    consumer.archFilter,
    consumer.visibilityFilter,
    consumer.searchTerm,
    consumer.includedCats,
    consumer.includedTags,
    consumer.includedAgents,
    pathname,
    router,
    searchParams,
  ]);
}
