"use client";

/**
 * ReferenceTypeAdder — THE per-type "pick a thing" sub-picker used by every
 * reference-authoring surface. One sub-picker per reference type, added here
 * as the taxonomy grows:
 *
 *   - `file`   → hands off to THE canonical stored-files picker (the caller
 *                owns the `FilePickerWindow` mount; this just triggers it)
 *   - `url`    → a plain URL + optional label form (no Matrx-owned id)
 *   - `scope`  → the org's scope tree, filtered by `allowedScopeTypeIds`
 *                (needs an anchor `scopeId` to resolve the org)
 *   - default  → `useUniversalEntitySearch` scoped to the one token (the ONE
 *                search path; it reports a failed read) for any other listable
 *                `EntityTypeToken` (task, note, project, agent, app, …)
 *
 * Extracted from `features/scopes/components/reference/ReferenceValuePicker.tsx`
 * (2026-07-25) when the messaging attach button needed the same pickers —
 * ReferenceValuePicker still owns the cell semantics (max_items, one type per
 * cell, fence <-> value_text); this owns only "let the user pick items of type
 * T". Never fork a second search list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScope,
  makeSelectScopeTypesForOrg,
  selectTreeError,
} from "@/features/scopes/redux/selectors/tree";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
import type { KindScope } from "@/features/scopes/service/kindInventory";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  collidingRowIds,
  composeRecordSecondaryLine,
  createdLabel,
  fetchRecordCreatedAt,
  fetchRecordFacts,
  type RecordFact,
} from "@/features/scopes/service/recordFacts";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import { referenceTypeDisplayPlural } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";
import {
  isEntityTypeToken,
  type EntityTypeToken,
} from "@ai-matrx/associations";

export interface ReferenceTypeAdderProps {
  type: string;
  /** Anchor scope for the `scope` sub-picker (resolves the org). */
  scopeId?: string | null;
  allowedScopeTypeIds?: string[] | null;
  onBrowseFiles: () => void;
  onPickMany: (items: ReferenceItem[]) => void;
}

export function ReferenceTypeAdder({
  type,
  scopeId = null,
  allowedScopeTypeIds = null,
  onBrowseFiles,
  onPickMany,
}: ReferenceTypeAdderProps) {
  if (!type) return null;
  if (type === "file") return <FileTypeAdder onBrowseFiles={onBrowseFiles} />;
  if (type === "url") return <UrlTypeAdder onPickMany={onPickMany} />;
  if (type === "scope") {
    if (!scopeId) {
      return (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Scope references need an anchor scope on this surface.
        </p>
      );
    }
    return (
      <ScopeTypeAdder
        scopeId={scopeId}
        allowedScopeTypeIds={allowedScopeTypeIds}
        onPickMany={onPickMany}
      />
    );
  }
  if (!isEntityTypeToken(type)) {
    return (
      <p className="px-1 py-2 text-xs text-amber-700 dark:text-amber-300">
        This reference type does not have a registered record picker.
      </p>
    );
  }
  return <RecordReferencePicker token={type} onPickMany={onPickMany} />;
}

function FileTypeAdder({ onBrowseFiles }: { onBrowseFiles: () => void }) {
  return (
    <Button
      data-reference-autofocus
      type="button"
      size="sm"
      variant="secondary"
      className="w-full"
      onClick={onBrowseFiles}
    >
      <FileText className="mr-1.5 h-3.5 w-3.5" />
      Browse files
    </Button>
  );
}

function isLikelyUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function UrlTypeAdder({
  onPickMany,
}: {
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const valid = isLikelyUrl(url.trim());

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const item: Record<string, string> = { url: url.trim() };
        const nextLabel = label.trim();
        if (nextLabel) item.label = nextLabel;
        onPickMany([item as unknown as ReferenceItem]);
        setUrl("");
        setLabel("");
      }}
    >
      <Input
        data-reference-autofocus
        aria-label="URL"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Input
        aria-label="Link label"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Button type="submit" size="sm" className="w-full" disabled={!valid}>
        <Link2 className="mr-1.5 h-3.5 w-3.5" />
        Add link
      </Button>
    </form>
  );
}

function ScopeTypeAdder({
  scopeId,
  allowedScopeTypeIds,
  onPickMany,
}: {
  scopeId: string;
  allowedScopeTypeIds: string[] | null;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const selectScope = useMemo(() => makeSelectScope(), []);
  const scope = useAppSelector((s) => selectScope(s, scopeId));
  const orgId = scope?.organization_id ?? null;

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));
  const treeError = useAppSelector(selectTreeError);
  const retryTree = () => void dispatch(ensureScopeTree({ refresh: true }));

  const candidates = useMemo(() => {
    const allow =
      allowedScopeTypeIds && allowedScopeTypeIds.length > 0
        ? new Set(allowedScopeTypeIds)
        : null;
    const out: Array<{ id: string; name: string; typeLabel: string }> = [];
    for (const t of scopeTypes) {
      if (allow && !allow.has(t.id)) continue;
      for (const s of t.scopes) {
        out.push({ id: s.id, name: s.name, typeLabel: t.label_singular });
      }
    }
    const q = search.trim().toLowerCase();
    return q ? out.filter((c) => c.name.toLowerCase().includes(q)) : out;
  }, [scopeTypes, allowedScopeTypeIds, search]);

  if (treeError && scopeTypes.length === 0) {
    return (
      <ReadFailure
        error={treeError}
        what="your scopes"
        onRetry={retryTree}
        className="m-0"
      />
    );
  }

  if (!orgId) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        Loading organization…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-reference-autofocus
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || candidates.length === 0) return;
            event.preventDefault();
            candidateRefs.current[0]?.focus();
          }}
          placeholder={`Search ${referenceTypeDisplayPlural("scope").toLowerCase()}…`}
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
      </div>
      {treeError ? (
        <StaleDataNotice hasData what="your scopes" onRetry={retryTree} detail={treeError} />
      ) : null}
      <div
        role="listbox"
        aria-label="Scope results"
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {!treeError && candidates.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No scopes found.
          </p>
        )}
        {candidates.map((c, index) => (
          <button
            key={c.id}
            ref={(element) => {
              candidateRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            onKeyDown={(event) =>
              handleCandidateKeyDown(
                event,
                index,
                candidates.length,
                candidateRefs,
                setActiveIndex,
              )
            }
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.name } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="line-clamp-2 min-w-0 break-words text-foreground">{c.name}</span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
              {c.typeLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A person's records of one type: MOST RECENT FIRST, searched by name on the
 * server, a page at a time (`useKindItems` — the kind inventory every "Use
 * existing" list reads), each row carrying a short secondary line so two
 * records with the same name can be told apart. Until 2026-10-02 this read the
 * universal title search, which sorts alphabetically and returns no date, so
 * an unfiltered list opened on "A…" and duplicates were indistinguishable
 * (G2 review). A type whose registry entry supplies its own candidate source
 * (`listCandidates`: data stores, HR employees) keeps that source.
 */
export function RecordReferencePicker({
  token,
  onPickMany,
}: {
  token: EntityTypeToken;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  // Retry = remount the results body (re-runs the search) keeping the query.
  const [attempt, setAttempt] = useState(0);
  const Body = getEntityInfo(token).listCandidates
    ? RecordReferenceSearch
    : RecentRecordSearch;
  return (
    <Body
      key={attempt}
      token={token}
      query={query}
      onQueryChange={setQuery}
      onPickMany={onPickMany}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

interface RecordSearchProps {
  token: EntityTypeToken;
  query: string;
  onQueryChange: (next: string) => void;
  onPickMany: (items: ReferenceItem[]) => void;
  onRetry: () => void;
}

/** Whose records: everything the person can see — the active org never narrows a list. */
const EVERY_RECORD_I_CAN_SEE: KindScope = { kind: "all" };

function RecentRecordSearch({
  token,
  query,
  onQueryChange,
  onPickMany,
  onRetry,
}: RecordSearchProps) {
  const plural = referenceTypeDisplayPlural(token);
  const list = useKindItems(token, EVERY_RECORD_I_CAN_SEE, query);
  const facts = useRecordFacts(
    token,
    list.items.map((item) => item.id),
  );
  const organizationName = useOrganizationNames();
  const now = Date.now();
  const firstPass = recordRows(list.items, facts, organizationName, now);
  // Rows that still read the same get the next fact: when each was created.
  const created = useRecordCreatedAt(token, collidingRowIds(firstPass));
  const rows = recordRows(list.items, facts, organizationName, now, created);
  return (
    <CandidateSearch
      token={token}
      query={query}
      onQueryChange={onQueryChange}
      onPickMany={onPickMany}
      loading={list.loading}
      error={list.error && list.items.length === 0 ? list.error.message : null}
      ready={!list.loading && !list.error}
      onRetry={onRetry}
      rows={rows}
      footer={
        list.hasMore ? (
          <button
            type="button"
            onClick={list.loadMore}
            disabled={list.loadingMore}
            className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {list.loadingMore ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            Show more {plural.toLowerCase()}
          </button>
        ) : null
      }
    />
  );
}

/**
 * Each row's secondary line: the organization (only when the rows span more
 * than one — a single-organization list repeats nothing), one fact that tells
 * same-named records apart, and when it changed. ≤60 characters.
 *
 * Rows whose title AND line still collide trade the edit date (the same for
 * all of them) for when each was created — with the time when two share a
 * day (G8B review). `created` holds `created_at` for those rows only.
 */
export function recordRows(
  items: ReadonlyArray<{ id: string; title: string; updatedAt: string | null }>,
  facts: ReadonlyMap<string, RecordFact>,
  organizationName: (id: string) => string | null,
  now: number,
  created: ReadonlyMap<string, string> = new Map(),
): Array<{ id: string; title: string; secondary: string | null }> {
  const organizations = new Set(
    items
      .map((item) => facts.get(item.id)?.organizationId)
      .filter((id): id is string => Boolean(id)),
  );
  const spansOrganizations = organizations.size > 1;
  const parts = (item: (typeof items)[number]) => {
    const fact = facts.get(item.id);
    return {
      organization:
        spansOrganizations && fact?.organizationId
          ? organizationName(fact.organizationId)
          : null,
      fact: withoutTitle(fact?.fact ?? null, item.title),
      edited: candidateSecondaryLine(item.updatedAt, now),
    };
  };
  const rows = items.map((item) => ({
    id: item.id,
    title: item.title,
    secondary: composeRecordSecondaryLine(parts(item)),
  }));
  const colliding = new Set(collidingRowIds(rows));
  if (colliding.size === 0 || created.size === 0) return rows;
  // A day shared by two colliding rows needs the time to tell them apart.
  const dayOf = (iso: string) => iso.slice(0, 10);
  const daysSeen = new Map<string, number>();
  for (const id of colliding) {
    const iso = created.get(id);
    if (iso) daysSeen.set(dayOf(iso), (daysSeen.get(dayOf(iso)) ?? 0) + 1);
  }
  return rows.map((row, index) => {
    const iso = colliding.has(row.id) ? created.get(row.id) : undefined;
    if (!iso) return row;
    const label = createdLabel(iso, (daysSeen.get(dayOf(iso)) ?? 0) > 1, now);
    if (!label) return row;
    return {
      ...row,
      secondary: composeRecordSecondaryLine({ ...parts(items[index]!), edited: label }),
    };
  });
}

/** When the colliding rows were created; re-read when that set changes. */
function useRecordCreatedAt(
  token: string,
  ids: string[],
): ReadonlyMap<string, string> {
  const idsKey = ids.join(",");
  const [created, setCreated] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void fetchRecordCreatedAt(token, idsKey.split(",")).then((next) => {
      if (!cancelled) setCreated(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token, idsKey]);
  return created;
}

/** A note's first words usually repeat its title; never say it twice. */
function withoutTitle(fact: string | null, title: string): string | null {
  if (!fact) return null;
  const t = title.trim().toLowerCase();
  if (!t || !fact.toLowerCase().startsWith(t)) return fact;
  const rest = fact.slice(t.length).replace(/^[\s:.,;-]+/, "").trim();
  return rest || null;
}

/** Facts for the loaded rows; re-read when the set of ids changes. */
function useRecordFacts(
  token: string,
  ids: string[],
): ReadonlyMap<string, RecordFact> {
  // A string key: `ids` is a fresh array every render.
  const idsKey = ids.join(",");
  const [facts, setFacts] = useState<ReadonlyMap<string, RecordFact>>(
    () => new Map(),
  );
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void fetchRecordFacts(token, idsKey.split(",")).then((next) => {
      if (!cancelled) setFacts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token, idsKey]);
  return facts;
}

/** The person's organizations by id — the membership list, never the active org. */
function useOrganizationNames(): (id: string) => string | null {
  const { organizations } = useUserOrganizations();
  const byId = new Map(organizations.map((org) => [org.id, org.name] as const));
  return (id) => byId.get(id) ?? null;
}

function RecordReferenceSearch({
  token,
  query,
  onQueryChange,
  onPickMany,
  onRetry,
}: RecordSearchProps) {
  // The ONE search path (debounced, stale-guarded) scoped to this token. It
  // reports a failed read as `error` — never "no matches".
  const search = useUniversalEntitySearch({
    query,
    tokens: [token],
    perTokenLimit: 20,
    emptyQueryMode: "candidates",
  });
  return (
    <CandidateSearch
      token={token}
      query={query}
      onQueryChange={onQueryChange}
      onPickMany={onPickMany}
      loading={search.loading}
      error={search.error && search.results.length === 0 ? search.error : null}
      ready={search.status === "ready"}
      onRetry={onRetry}
      rows={search.results.map((c) => ({ id: c.id, title: c.title, secondary: null }))}
      footer={null}
    />
  );
}

/**
 * The short line under a record's name: when it last changed. ≤60 characters
 * (interface-text secondary slot). Null when the type keeps no timestamp.
 */
export function candidateSecondaryLine(
  updatedAt: string | null,
  now: number,
): string | null {
  if (!updatedAt) return null;
  const at = new Date(updatedAt);
  const ms = at.getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "Edited yesterday" : `Edited ${days} days ago`;
  const sameYear = at.getFullYear() === new Date(now).getFullYear();
  return `Edited ${at.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}

function CandidateSearch({
  token,
  query,
  onQueryChange,
  onPickMany,
  loading,
  error,
  ready,
  onRetry,
  rows,
  footer,
}: {
  token: EntityTypeToken;
  query: string;
  onQueryChange: (next: string) => void;
  onPickMany: (items: ReferenceItem[]) => void;
  loading: boolean;
  error: string | null;
  ready: boolean;
  onRetry: () => void;
  rows: Array<{ id: string; title: string; secondary: string | null }>;
  footer: React.ReactNode;
}) {
  const setQuery = onQueryChange;
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const info = getEntityInfo(token);
  const plural = referenceTypeDisplayPlural(token);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-reference-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || rows.length === 0) return;
            event.preventDefault();
            candidateRefs.current[0]?.focus();
          }}
          placeholder={`Search ${plural.toLowerCase()}…`}
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div
        role="listbox"
        aria-label={`${plural} results`}
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {error ? (
          <ReadFailure
            error={error}
            what={plural.toLowerCase()}
            className="m-0"
            onRetry={onRetry}
          />
        ) : null}
        {rows.length === 0 && ready && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim()
              ? "No matches."
              : `No ${plural.toLowerCase()} available.`}
          </p>
        )}
        {rows.map((c, index) => (
          <button
            key={`${token}:${c.id}`}
            ref={(element) => {
              candidateRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            onKeyDown={(event) =>
              handleCandidateKeyDown(
                event,
                index,
                rows.length,
                candidateRefs,
                setActiveIndex,
              )
            }
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.title } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <info.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col">
              {/* Two lines, never one: the suffix that tells two records
                  apart ("(checkout)") sits at the END of the title. */}
              <span className="line-clamp-2 break-words text-foreground">{c.title}</span>
              {c.secondary ? (
                <span className="truncate text-xs text-muted-foreground">
                  {c.secondary}
                </span>
              ) : null}
            </span>
          </button>
        ))}
        {footer}
      </div>
    </div>
  );
}

function handleCandidateKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  count: number,
  refs: React.RefObject<Array<HTMLButtonElement | null>>,
  setActiveIndex: (index: number) => void,
) {
  if (count === 0) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % count;
  } else if (event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + count) % count;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = count - 1;
  }
  if (nextIndex == null) return;
  event.preventDefault();
  setActiveIndex(nextIndex);
  refs.current[nextIndex]?.focus();
}

export default ReferenceTypeAdder;
