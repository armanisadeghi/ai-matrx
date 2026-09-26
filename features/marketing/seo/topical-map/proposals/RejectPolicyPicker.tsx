"use client";

/**
 * features/marketing/seo/topical-map/proposals/RejectPolicyPicker.tsx — what
 * happens to the attachments of a topic being REJECTED.
 *
 * The four answers are `seo.reject_map_topics`' own `on_attachments`
 * vocabulary (`MapTopicRejectionPolicy`): `error` (refuse if anything hangs
 * off the topic — the function then names every blocker, and that sentence
 * reaches the person unaltered), `reject` (keep the attachments on the
 * rejected topic), `parent` (lift them onto the parent), `merge_into:<slug>`
 * (move them onto ANOTHER LIVE topic).
 *
 * The merge target is searched through `seo.search_map_topics` and narrowed
 * to LIVE topics only: since round 22 a retired or rejected slug raises the
 * same `P0002` an invented one does, so offering one would be offering a
 * refusal. A topic in the batch being rejected is excluded for the same
 * reason.
 */

import { useState } from "react";
import { Check, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { useMapTopicSearch } from "../hooks";
import type { MapTopicRejectionPolicy } from "../types";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export type RejectPolicyBase = "error" | "reject" | "parent" | "merge_into";

export const REJECT_POLICY_OPTIONS: ReadonlyArray<{
  value: RejectPolicyBase;
  label: string;
  detail: string;
}> = [
  {
    value: "error",
    label: "Refuse if anything is attached",
    detail: "The database names every page, planned page and keyword that blocks the rejection.",
  },
  {
    value: "reject",
    label: "Reject anyway",
    detail: "Attachments stay on the rejected topic; they can be moved later from History.",
  },
  {
    value: "parent",
    label: "Move attachments to the parent",
    detail: "Pages, planned pages and keywords move up one level.",
  },
  {
    value: "merge_into",
    label: "Move attachments into another topic",
    detail: "Pick a live topic of this map to receive them.",
  },
];

export function splitRejectPolicy(policy: MapTopicRejectionPolicy): {
  base: RejectPolicyBase;
  target: string | null;
} {
  if (policy.startsWith("merge_into:")) {
    return { base: "merge_into", target: policy.slice("merge_into:".length) || null };
  }
  return { base: policy as RejectPolicyBase, target: null };
}

/** The sentence a consequence dialog appends for a policy — in the function's own terms. */
export function rejectPolicySentence(policy: MapTopicRejectionPolicy): string {
  const { base, target } = splitRejectPolicy(policy);
  switch (base) {
    case "error":
      return "A topic that still carries pages, planned pages or keywords is refused, and the database names what blocks it.";
    case "reject":
      return "Anything still attached stays on the rejected topic.";
    case "parent":
      return "Anything still attached moves to the parent topic.";
    case "merge_into":
      return target
        ? `Anything still attached moves onto "${target}".`
        : "Anything still attached moves onto the topic you pick.";
  }
}

export interface RejectPolicyPickerProps {
  mapId: string;
  value: MapTopicRejectionPolicy;
  onChange: (policy: MapTopicRejectionPolicy) => void;
  /** Slugs that cannot be a merge target (the batch being rejected). */
  excludeSlugs?: readonly string[];
  className?: string;
}

export function RejectPolicyPicker({
  mapId,
  value,
  onChange,
  excludeSlugs = [],
  className,
}: RejectPolicyPickerProps) {
  const { base, target } = splitRejectPolicy(value);
  const [query, setQuery] = useState("");
  const search = useMapTopicSearch(mapId, query, 12, base === "merge_into" && query.trim().length > 0);
  const excluded = new Set(excludeSlugs);
  const hits = (search.data ?? []).filter(
    (hit) => hit.status === "active" && !excluded.has(hit.slug),
  );

  return (
    <div className={cn("flex flex-col gap-1.5 text-xs", className)}>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">If attachments remain</span>
        <select
          aria-label="What happens to a rejected topic's attachments"
          className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
          value={base}
          onChange={(event) => {
            const next = event.target.value as RejectPolicyBase;
            onChange(next === "merge_into" ? "merge_into:" : next);
          }}
        >
          {REJECT_POLICY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} title={option.detail}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground">
        {REJECT_POLICY_OPTIONS.find((o) => o.value === base)?.detail}
      </p>

      {base === "merge_into" ? (
        target ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono">
            <Check className="h-3 w-3 text-success" aria-hidden />
            {target}
            <button
              type="button"
              aria-label="Choose a different target topic"
              className="ml-1 rounded p-0.5 hover:bg-muted"
              onClick={() => onChange("merge_into:")}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                aria-label="Search live topics to receive the attachments"
                placeholder="Search a live topic…"
                className="h-7 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {search.isError ? (
              <ErrorNotice size="inline" message={search.error instanceof Error ? search.error.message : "The search failed."} />
            ) : query.trim() && !search.isPending && hits.length === 0 ? (
              <p className="text-muted-foreground">
                No live topic matches. Retired and rejected topics cannot receive attachments.
              </p>
            ) : (
              <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                {hits.map((hit) => (
                  <li key={hit.slug}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-accent"
                      onClick={() => onChange(`merge_into:${hit.slug}`)}
                    >
                      <span className="truncate">{hit.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">{hit.slug}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}
