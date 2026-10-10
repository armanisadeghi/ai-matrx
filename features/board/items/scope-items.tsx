"use client";

/**
 * Scope on a board — one scope (a Client, a Department, a Case: a value on a dimension the person
 * authors inside an organization). The tile body IS the scope's own page body,
 * `ScopeDetailEditor` (`/organizations/[orgId]/scopes/[typeId]/[scopeId]`): the rename and
 * description editors, every context item with its field and auto-save, add context item (for an
 * owner), the knowledge-graph card, suggestions, attached Resources and the advanced section.
 * Its agent surface `matrx-user/scope-detail` is registered by the editor itself
 * (`ScopeDetailSurface`), so the page and the tile are one component with one surface; the page
 * had NO surface before this item (the hub's `matrx-user/scopes` is read-only by decision).
 *
 * The saved source is just the scope's id: its organization and type are read back from the scope
 * tree (the one tree every scope screen reads), so a tile never stores a copy of them.
 *
 * Start new places a tile at once; the scope is made by `NewScopeInline` (the canonical new-scope
 * form) when the person presses Create there, never on mount. Bring in lists every scope across
 * all the person's organizations, from the scope tree. Scope is not Context (`features/scopes/FEATURE.md`).
 */

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readOf } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { canManageSettings } from "@/features/organizations/types";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { selectAllScopeTypes, selectScopeById, selectScopeTreeSettled } from "@/features/scopes/redux/selectors/admin";
import { selectTreeError } from "@/features/scopes/redux/selectors/tree";
import { ScopeDetailEditor } from "@/features/scope-system/components/ScopeDetailEditor";
import { NewScopeInline } from "@/features/scopes/components/management/NewScopeInline";
import { ScopeNotFound } from "@/features/scope-system/components/ScopeNotFound";
import { SCOPE_DETAIL_SURFACE_NAME } from "@/features/surfaces/manifests/scope-detail.manifest";
import type { NodeSource } from "../board/document";
import { entityComments, type BoardItemType, type ItemBodyProps, type PickerProps } from "./types";
import { RecordList } from "./feature-items";
import { titleToAdopt } from "./feature-items.logic";

import { Spinner } from "@/components/ui/loaders/Spinner";
export const SCOPE_ITEM_KEY = "scope";
const NEW_SCOPE_TITLE = "New scope";

function scopeSource(id: string | null): NodeSource {
  return { kind: "entity", entity: SCOPE_ITEM_KEY, id };
}

function scopeIdOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === SCOPE_ITEM_KEY ? source.id : null;
}

/** The scope tree for the whole person (cached: no refetch on a remount). */
function useScopeTree() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);
  return {
    types: useAppSelector(selectAllScopeTypes),
    settled: useAppSelector(selectScopeTreeSettled),
    error: useAppSelector(selectTreeError),
  };
}

// ─── Bring in ────────────────────────────────────────────────────────────────

function ScopePicker({ onPick, onCancel }: PickerProps) {
  const dispatch = useAppDispatch();
  const { types, settled, error } = useScopeTree();
  const rows = types.flatMap((t) => t.scopes.map((s) => ({ scope: s, type: t })));
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={rows}
        read={readOf(
          { loading: !settled, error: error ?? null },
          { what: "your scopes", onRetry: () => void dispatch(ensureScopeTree({ refresh: true })) },
        )}
        rowKey={(r) => r.scope.id}
        rowText={(r) => `${r.scope.name} ${r.type.label_singular}`}
        onChoose={(r) => onPick([{ title: r.scope.name, source: scopeSource(r.scope.id) }])}
        onCancel={onCancel}
        emptyState={<>No scopes yet. Make one with New scope.</>}
        renderRow={(r) => (
          <>
            <span className="min-w-0 flex-1 truncate">{r.scope.name}</span>
            <span className="shrink-0 truncate type-secondary text-muted-foreground">{r.type.label_singular}</span>
          </>
        )}
      />
    </div>
  );
}

// ─── Start new ───────────────────────────────────────────────────────────────

/** A new scope tile before its scope exists: choose its type, then the canonical new-scope form. */
function ScopeDraftBody({ onSource }: Pick<ItemBodyProps, "onSource">) {
  const { types, settled } = useScopeTree();
  const [typeId, setTypeId] = useState<string | null>(null);
  const chosen = types.find((t) => t.id === typeId) ?? null;
  if (!settled) {
    return (
      <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Loading your scope types">
        <Spinner size="sm" className="text-muted-foreground" />
      </div>
    );
  }
  if (!chosen) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-y-auto bg-card p-4">
        <p className="type-title text-foreground">What kind of scope?</p>
        {types.length === 0 ? (
          <p className="type-body text-muted-foreground">
            You have no scope types yet. Define one on the Scopes page, then start a scope here.
          </p>
        ) : (
          types.map((t) => (
            <Button key={t.id} variant="outline" className="justify-start" onClick={() => setTypeId(t.id)}>
              {t.label_singular}
            </Button>
          ))
        )}
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto bg-card p-4">
      <NewScopeInline
        orgId={chosen.organization_id}
        typeId={chosen.id}
        labelSingular={chosen.label_singular}
        labelPlural={chosen.label_plural}
        onCreated={(scopeId) => {
          onSource(scopeSource(scopeId), NEW_SCOPE_TITLE);
        }}
        onCancel={() => setTypeId(null)}
      />
    </div>
  );
}

// ─── The tile ────────────────────────────────────────────────────────────────

function ScopeRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const { settled } = useScopeTree();
  const scope = useAppSelector((s) => selectScopeById(s, id));
  // The person's role in the scope's organization comes with the scope tree (no second read).
  const role = useAppSelector((s) => (scope ? s.scopesTree.organizations[scope.organization_id]?.role : undefined));
  const next = titleToAdopt(title, scope?.name);
  useEffect(() => {
    if (next) onSource(source, next);
  }, [next, source, onSource]);
  if (!scope) {
    return settled ? (
      <div className="h-full overflow-y-auto p-4">
        <ScopeNotFound token="scope" param={id} entityLabel="scope" backHref="/scopes" backLabel="Back to scopes" />
      </div>
    ) : (
      <div className="flex h-full items-center justify-center" aria-busy="true" aria-label="Opening the scope">
        <Spinner size="sm" className="text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-textured p-4">
      <ScopeDetailEditor
        orgId={scope.organization_id}
        orgSlugOrId={scope.organization_id}
        typeParam={scope.scope_type_id}
        scopeParam={scope.id}
        canManage={role ? canManageSettings(role) : false}
      />
    </div>
  );
}

function ScopeBody(props: ItemBodyProps) {
  const id = scopeIdOf(props.source);
  return id ? <ScopeRecordBody key={id} id={id} {...props} /> : <ScopeDraftBody onSource={props.onSource} />;
}

export const SCOPE_ITEMS: readonly BoardItemType[] = [
  {
    key: SCOPE_ITEM_KEY,
    surface: { name: SCOPE_DETAIL_SURFACE_NAME },
    comments: entityComments("scope"),
    label: "Scope",
    kindLabel: "scope",
    icon: Tag,
    group: "features",
    section: "work",
    accent: "lime",
    status: { none: "A scope has no running state." },
    defaultSize: { w: 720, h: 760 },
    matches: (s) => s.kind === "entity" && s.entity === SCOPE_ITEM_KEY,
    Body: ScopeBody,
    startNew: { label: NEW_SCOPE_TITLE, create: () => ({ title: NEW_SCOPE_TITLE, source: scopeSource(null) }) },
    bringIn: { label: "Scope", Picker: ScopePicker },
    record: { place: (id, title) => ({ title: title?.trim() || "Scope", source: scopeSource(id) }), searchToken: "scope" },
    href: (s) => {
      const id = scopeIdOf(s);
      return id ? (tryGetEntityInfo(SCOPE_ITEM_KEY)?.hrefFor?.(id) ?? null) : null;
    },
  },
];
