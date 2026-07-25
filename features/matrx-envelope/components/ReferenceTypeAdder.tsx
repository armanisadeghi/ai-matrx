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
 *   - default  → `useUniversalEntitySearch` for any other listable
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
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScope,
  makeSelectScopeTypesForOrg,
} from "@/features/scopes/redux/selectors/tree";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

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
  return <RecordTypeAdder type={type} onPickMany={onPickMany} />;
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
          placeholder="Search scopes…"
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div
        role="listbox"
        aria-label="Scope results"
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {candidates.length === 0 && (
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
            <span className="truncate text-foreground">{c.name}</span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
              {c.typeLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecordTypeAdder({
  type,
  onPickMany,
}: {
  type: string;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const token = type as EntityTypeToken;
  const info = getEntityInfo(token);
  const { results, loading } = useUniversalEntitySearch({
    query,
    tokens: [token],
    perTokenLimit: 20,
    emptyQueryMode: "candidates",
  });

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
            if (event.key !== "ArrowDown" || results.length === 0) return;
            event.preventDefault();
            candidateRefs.current[0]?.focus();
          }}
          placeholder={`Search ${info.labelPlural.toLowerCase()}…`}
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div
        role="listbox"
        aria-label={`${info.labelPlural} results`}
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {results.length === 0 && !loading && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim()
              ? "No matches."
              : `No ${info.labelPlural.toLowerCase()} available.`}
          </p>
        )}
        {results.map((c, index) => (
          <button
            key={`${c.token}:${c.id}`}
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
                results.length,
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
            <span className="truncate text-foreground">{c.title}</span>
          </button>
        ))}
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
