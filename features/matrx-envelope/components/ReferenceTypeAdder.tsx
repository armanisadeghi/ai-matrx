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
import { Button } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { Input } from "@ai-matrx/design-system/controls";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScope,
  makeSelectScopeTypesForOrg,
  selectTreeError,
} from "@/features/scopes/redux/selectors/tree";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
import type { KindScope } from "@/features/scopes/service/kindInventory";
import { ReadFailure } from "@ai-matrx/design-system";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  collidingRowIds,
  composeRecordSecondaryLine,
  fetchRecordCreatedAt,
  fetchRecordFacts,
  stampLabel,
  type RecordFact,
  type StampPrecision,
} from "@/features/scopes/service/recordFacts";
import { useUserOrganizations } from "@/features/organizations/hooks";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import { referenceTypeDisplayPlural } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";
import {
  isEntityTypeToken,
  type EntityTypeToken,
} from "@ai-matrx/associations";
import { formatRelativeTime } from "@ai-matrx/kit/format";

export interface ReferenceTypeAdderProps {
  type: string;
  /** Anchor scope for the `scope` sub-picker (resolves the org). */
  scopeId?: string | null;
  allowedScopeTypeIds?: string[] | null;
  onBrowseFiles: () => void;
  onPickMany: (items: ReferenceItem[]) => void;
  /**
   * The record list fills its container instead of stopping at a fixed height
   * — for a host that gives it the whole sheet (the reference picker). Every
   * ancestor up to that host must be `flex flex-col min-h-0`.
   */
  fill?: boolean;
}

export function ReferenceTypeAdder({
  type,
  scopeId = null,
  allowedScopeTypeIds = null,
  onBrowseFiles,
  onPickMany,
  fill = false,
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
        fill={fill}
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
  return <RecordReferencePicker token={type} onPickMany={onPickMany} fill={fill} />;
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
      />
      <Input
        aria-label="Link label"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
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
  fill,
}: {
  scopeId: string;
  allowedScopeTypeIds: string[] | null;
  onPickMany: (items: ReferenceItem[]) => void;
  fill: boolean;
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
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input adornment="start"
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
        />
      </div>
      {treeError ? (
        <StaleDataNotice hasData what="your scopes" onRetry={retryTree} detail={treeError} />
      ) : null}
      <div
        role="listbox"
        aria-label="Scope results"
        className={cn(
          "space-y-0.5 overflow-y-auto",
          // A popover / cell caps the list; a sheet lets it fill (G10A review:
          // the phone sheet showed ~4 rows with half the sheet empty below).
          fill ? "min-h-0 flex-1" : "max-h-56",
        )}
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
  fill = false,
}: {
  token: EntityTypeToken;
  onPickMany: (items: ReferenceItem[]) => void;
  /** See `ReferenceTypeAdderProps.fill`. */
  fill?: boolean;
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
      fill={fill}
    />
  );
}

interface RecordSearchProps {
  token: EntityTypeToken;
  query: string;
  onQueryChange: (next: string) => void;
  onPickMany: (items: ReferenceItem[]) => void;
  onRetry: () => void;
  fill: boolean;
}

/** Whose records: everything the person can see — the active org never narrows a list. */
const EVERY_RECORD_I_CAN_SEE: KindScope = { kind: "all" };

function RecentRecordSearch({
  token,
  query,
  onQueryChange,
  onPickMany,
  onRetry,
  fill,
}: RecordSearchProps) {
  const plural = referenceTypeDisplayPlural(token);
  const list = useKindItems(token, EVERY_RECORD_I_CAN_SEE, query);
  const facts = useRecordFacts(
    token,
    list.items.map((item) => item.id),
  );
  const { nameOf: organizationName, multiple } = useOrganizationNames();
  const now = Date.now();
  // `null`: the plain lines, before any rung of the ladder.
  const firstPass = recordRows(list.items, facts, organizationName, now, null, multiple);
  // Rows that still read the same climb the ladder, starting with when each was created.
  const created = useRecordCreatedAt(token, collidingRowIds(firstPass));
  const rows = recordRows(list.items, facts, organizationName, now, created, multiple);
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
      fill={fill}
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
 * Rows whose title AND line still collide climb THE LADDER, one rung at a
 * time and only while they still collide (G8B, G10A reviews): when each was
 * created — the day, then the minute, then the second — then the last edit to
 * the second, and when nothing a person can read differs, a quiet "1 of 3".
 * Never a raw id. `created` holds `created_at` for the colliding rows; `null`
 * means it is still being read, so nothing climbs yet (no flicker).
 */
export function recordRows(
  items: ReadonlyArray<{ id: string; title: string; updatedAt: string | null }>,
  facts: ReadonlyMap<string, RecordFact>,
  organizationName: (id: string) => string | null,
  now: number,
  created: ReadonlyMap<string, string> | null = new Map(),
  /**
   * The person belongs to more than one organization. ONE FACTS RULE FOR EVERY
   * SEARCH (G18 review, 2026-10-07): a Workbook named its organization in the
   * Update search but not in the Delete search, because "the rows span
   * organizations" was judged over whatever the query happened to return. A
   * member of several organizations sees every row's organization, in every
   * search; a member of one never does.
   */
  multipleMemberships: boolean | null = null,
): Array<{ id: string; title: string; secondary: string | null }> {
  const organizations = new Set(
    items
      .map((item) => facts.get(item.id)?.organizationId)
      .filter((id): id is string => Boolean(id)),
  );
  const spansOrganizations = multipleMemberships ?? organizations.size > 1;
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
  const firstPass = items.map((item) => ({
    id: item.id,
    title: item.title,
    secondary: composeRecordSecondaryLine(parts(item)),
  }));
  if (created === null || collidingRowIds(firstPass).length === 0) return firstPass;

  // Rung n → the date the line carries. A rung with nothing to say (no
  // created_at on this table) falls back to the rung below it.
  const rung = (item: (typeof items)[number], level: number): string | null => {
    const iso = created.get(item.id);
    if (level === LADDER_TOP && item.updatedAt) {
      return stampLabel("Edited", item.updatedAt, "second", now);
    }
    if (!iso) return null;
    return stampLabel("Created", iso, LADDER_PRECISION[level - 1]!, now);
  };
  const levels = new Map<string, number>();
  const lineAt = (item: (typeof items)[number], ordinal?: string) => {
    let date: string | null = null;
    for (let level = levels.get(item.id) ?? 0; level > 0 && !date; level -= 1) {
      date = rung(item, level);
    }
    const base = parts(item);
    const edited = date ?? base.edited;
    return composeRecordSecondaryLine({
      ...base,
      edited: ordinal ? [edited, ordinal].filter(Boolean).join(" · ") : edited,
    });
  };
  let rows = firstPass;
  for (let pass = 0; pass < LADDER_TOP; pass += 1) {
    const colliding = collidingRowIds(rows);
    if (colliding.length === 0) return rows;
    for (const id of colliding) {
      levels.set(id, Math.min(LADDER_TOP, (levels.get(id) ?? 0) + 1));
    }
    rows = items.map((item) => ({ id: item.id, title: item.title, secondary: lineAt(item) }));
  }

  // Identical in every way a person can read: say which one it is in the list.
  const still = new Set(collidingRowIds(rows));
  if (still.size === 0) return rows;
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (!still.has(row.id)) continue;
    const key = `${row.title.trim().toLowerCase()}\u0000${row.secondary ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row.id]);
  }
  const ordinalOf = new Map<string, string>();
  for (const ids of groups.values()) {
    ids.forEach((id, i) => ordinalOf.set(id, `${i + 1} of ${ids.length}`));
  }
  return items.map((item, index) => {
    const ordinal = ordinalOf.get(item.id);
    return ordinal
      ? { id: item.id, title: item.title, secondary: lineAt(item, ordinal) }
      : rows[index]!;
  });
}

/** Rungs 1–3 are when the record was created; rung 4 is its last edit. */
const LADDER_PRECISION: readonly StampPrecision[] = ["day", "minute", "second"];
const LADDER_TOP = LADDER_PRECISION.length + 1;

/**
 * When the colliding rows were created; re-read when that set changes. `null`
 * until the read for the current set has answered.
 */
function useRecordCreatedAt(
  token: string,
  ids: string[],
): ReadonlyMap<string, string> | null {
  const idsKey = ids.join(",");
  const [state, setState] = useState<{
    key: string;
    created: ReadonlyMap<string, string>;
  }>(() => ({ key: "", created: new Map() }));
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    void fetchRecordCreatedAt(token, idsKey.split(",")).then((next) => {
      if (!cancelled) setState({ key: idsKey, created: next });
    });
    return () => {
      cancelled = true;
    };
  }, [token, idsKey]);
  if (!idsKey) return new Map();
  return state.key === idsKey ? state.created : null;
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
function useOrganizationNames(): {
  nameOf: (id: string) => string | null;
  /** Null until the memberships load — the rows' own spread decides meanwhile. */
  multiple: boolean | null;
} {
  const { organizations, loading } = useUserOrganizations();
  const byId = new Map(organizations.map((org) => [org.id, org.name] as const));
  return {
    nameOf: (id) => byId.get(id) ?? null,
    multiple: loading && organizations.length === 0 ? null : organizations.length > 1,
  };
}

function RecordReferenceSearch({
  token,
  query,
  onQueryChange,
  onPickMany,
  onRetry,
  fill,
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
      fill={fill}
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
  if (now - ms < 30 * 86_400_000) return `Edited ${formatRelativeTime(ms, { style: "intl", now })}`;
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
  fill,
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
  fill: boolean;
  rows: Array<{ id: string; title: string; secondary: string | null }>;
  footer: React.ReactNode;
}) {
  const setQuery = onQueryChange;
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const info = getEntityInfo(token);
  const plural = referenceTypeDisplayPlural(token);

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2"}>
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input adornment="start"
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
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div
        role="listbox"
        aria-label={`${plural} results`}
        className={cn(
          "space-y-0.5 overflow-y-auto",
          // A popover / cell caps the list; a sheet lets it fill (G10A review:
          // the phone sheet showed ~4 rows with half the sheet empty below).
          fill ? "min-h-0 flex-1" : "max-h-56",
        )}
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
