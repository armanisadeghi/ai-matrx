"use client";

/**
 * ContextInspector — what an agent is handed, drilled down in order (lane
 * CONTEXT-INSPECTOR-GUIDED, Arman 2026-09-25: "Org → Scope Type → Scope →
 * Context Item → value … the more selective I get, the more you change the
 * data").
 *
 * The four steps are the platform's Miller Columns (lane CONTEXT-INSPECTOR-3,
 * Arman 2026-09-25: "we have a large series of scope selection components …
 * use one here") — Organizations → Scope types → Scopes → Context items, one
 * pick per column (`useDrillPathEngine`: a pick clears the columns after it),
 * each long column searchable. The value of the chosen context item sits
 * read-only under the columns. Below, the old-vs-new compare
 * re-resolves on every choice with the SAME selection on both sides
 * (`selection.ts#previewRequest` — the server's own `ContextSelection`; a
 * scope type reaches both sides as every one of its scopes, no cap). No Run
 * button. "Answer on both paths" carries its own agent picker; the chosen agent
 * lives in the address (`?agent=`).
 *
 * Controlled: the page owns the selection (the address), this renders it. The
 * one reverse flow is the deep link — `?scope=<id>` alone — where the scope
 * names its own organization and type (read from the scope, never from the
 * active organization) and the earlier steps are filled in: from the scope
 * tree when the scope is in it (`drillPathForScope`), otherwise from the scope
 * row itself.
 */

import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { MillerColumnsCore } from "@/features/scopes/components/active-context/miller-columns/MillerColumns";
import {
  drillPathForScope,
  useDrillPathEngine,
  useUniverse,
  type DrillPath,
} from "@/features/scopes/components/active-context/quick-pick/engine";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ContextItemRow, ContextItemValue, ScopesRpcResult } from "@/features/scopes/types";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { adminPageCapture } from "@/components/agent-copy/page-capture/pageCapture";
import { ContextCompareView } from "../ContextCompareView";
import { previewRequest, type InspectorSelection } from "./selection";

const toPath = (s: InspectorSelection): DrillPath => ({
  orgId: s.org,
  typeId: s.scopeType,
  scopeId: s.scope,
  itemId: s.item,
});
const fromPath = (p: DrillPath): InspectorSelection => ({
  org: p.orgId,
  scopeType: p.typeId,
  scope: p.scopeId,
  item: p.itemId,
});

type Load<T> =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; message: string };

/**
 * One step's options, loaded from its parent choice only. `key` is the parent
 * choice; a new key starts a new load and an answer for an old key is dropped.
 */
function useStepLoad<T>(key: string | null, load: (key: string) => Promise<T>): Load<T> {
  const [answer, setAnswer] = useState<{ key: string; load: Load<T> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    load(key).then(
      (data) => live && setAnswer({ key, load: { state: "ready", data } }),
      (e: unknown) =>
        live &&
        setAnswer({
          key,
          load: { state: "error", message: e instanceof Error ? e.message : String(e) },
        }),
    );
    return () => {
      live = false;
    };
    // `load` is a stable module function per step; the key is the dependency.
  }, [key]);
  if (!key) return { state: "idle" };
  return answer?.key === key ? answer.load : { state: "loading" };
}

function unwrap<T>(result: ScopesRpcResult<T>): T {
  if (isScopesRpcErr(result)) throw new Error(result.error.message);
  return (result as { ok: true; data: T }).data;
}

interface ItemWithValue {
  item: Pick<ContextItemRow, "id" | "key" | "display_name" | "sort_order">;
  value: ContextItemValue | null;
}

async function loadItems(key: string): Promise<ItemWithValue[]> {
  const [scopeTypeId, scopeId] = key.split(":");
  const [itemsResult, valuesResult] = await Promise.all([
    scopesService.listContextItems(scopeTypeId),
    scopesService.listContextValues(scopeId),
  ]);
  const { items } = unwrap(itemsResult);
  const { values } = unwrap(valuesResult);
  const byItem = new Map(values.map((v) => [v.context_item_id, v]));
  return [...items]
    .sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.display_name.localeCompare(b.display_name),
    )
    .map((item) => ({ item, value: byItem.get(item.id) ?? null }));
}

/** A stored value in plain text, read-only. Null when the scope has no value for the item. */
export function displayValue(value: ContextItemValue | null): string | null {
  if (!value) return null;
  if (value.value_text !== null && value.value_text !== "") return value.value_text;
  if (value.value_number !== null) return String(value.value_number);
  if (value.value_boolean !== null) return value.value_boolean ? "Yes" : "No";
  if (value.value_date) return value.value_date;
  if (value.value_document_url) return value.value_document_url;
  if (value.value_reference_id)
    return `${value.value_reference_type ?? "reference"} ${value.value_reference_id}`;
  if (value.value_json !== null) return JSON.stringify(value.value_json);
  return null;
}

export function ContextInspector({
  selection,
  onChange,
  agentId,
  onAgentChange,
}: {
  selection: InspectorSelection;
  /** The page writes it to the address; `replace` is true for a back-fill. */
  onChange: (next: InspectorSelection, opts?: { replace?: boolean }) => void;
  /** `?agent=` — the agent "Answer on both paths" asks, chosen with its picker. */
  agentId?: string;
  /** The page writes the chosen agent to the address. */
  onAgentChange?: (agentId: string | null) => void;
}) {
  // ── The columns: the person's own scope tree (access is personal). ──
  const universe = useUniverse();
  const treeReady = universe.treeStatus === "ready" || universe.treeStatus === "empty";

  // ── The deep link: a scope with no organization or type names its own —
  //    from the tree when it is in it, otherwise from the scope row. ──
  const needsHome = Boolean(selection.scope && (!selection.org || !selection.scopeType));
  const fromTree =
    needsHome && selection.scope ? drillPathForScope(universe.orgs, selection.scope) : null;
  const home = useStepLoad(
    needsHome && treeReady && !fromTree ? selection.scope : null,
    async (scopeId) => unwrap(await scopesService.getScopeHome(scopeId)).scope,
  );
  const treeOrg = fromTree?.orgId ?? null;
  const treeType = fromTree?.typeId ?? null;
  useEffect(() => {
    if (!needsHome) return;
    if (treeOrg && treeType) {
      onChange({ ...selection, org: treeOrg, scopeType: treeType }, { replace: true });
    } else if (home.state === "ready" && home.data) {
      onChange(
        { ...selection, org: home.data.organization_id, scopeType: home.data.scope_type_id },
        { replace: true },
      );
    }
  }, [needsHome, treeOrg, treeType, home, selection, onChange]);

  // ── The chosen scope's items and their stored values (the value step). ──
  const itemsLoad = useStepLoad(
    selection.scopeType && selection.scope ? `${selection.scopeType}:${selection.scope}` : null,
    loadItems,
  );
  const itemRows = itemsLoad.state === "ready" ? itemsLoad.data : [];
  const chosenItem = itemRows.find((r) => r.item.id === selection.item) ?? null;
  const chosenValue = chosenItem ? displayValue(chosenItem.value) : null;

  const onPath = useCallback((next: DrillPath) => onChange(fromPath(next)), [onChange]);
  const engine = useDrillPathEngine({
    orgs: universe.orgs,
    path: toPath(selection),
    onChange: onPath,
    itemLabel: chosenItem?.item.display_name ?? null,
  });

  const org = universe.orgs.find((o) => o.id === selection.org) ?? null;
  const type = org?.scope_types.find((t) => t.id === selection.scopeType) ?? null;
  const scope = type?.scopes.find((sc) => sc.id === selection.scope) ?? null;
  const orgName = org?.name ?? null;
  const typeName = type?.label_plural ?? null;
  const scopeName = scope?.name ?? null;
  // A shared scope in an organization the person reaches only through that scope: the
  // compare still reads it (the organization is read from the scope); the columns cannot
  // show a tree the person does not have, and say so.
  const outsideTree = Boolean(treeReady && selection.org && !org && !needsHome);

  const request = previewRequest(selection);
  // The item step narrows the SHOWN compare to one item; it waits for the item's key.
  const focus =
    request?.depth === "item" && chosenItem
      ? { itemId: chosenItem.item.id, key: chosenItem.item.key, label: chosenItem.item.display_name }
      : undefined;
  // The type step waits for the type's scope list only to know whether it is empty (an empty
  // type previews nothing); the request itself is the type, never the list.
  const previewReady =
    request &&
    (request.depth !== "item" || focus) &&
    (request.depth !== "scopeType" || type || outsideTree);

  const errors = [
    universe.treeStatus === "error"
      ? `Your organizations could not load: ${universe.treeError ?? "unknown error"}`
      : null,
    home.state === "error" ? `This scope's organization could not be read: ${home.message}` : null,
    home.state === "ready" && !home.data
      ? "This scope was not found, or it has not been shared with you. Check the id in the address."
      : null,
    itemsLoad.state === "error" ? `The context items could not load: ${itemsLoad.message}` : null,
  ].filter((e): e is string => Boolean(e));

  let caption: string | null = null;
  if (request?.depth === "org") {
    caption = `What an agent working in ${orgName ?? "this organization"} is handed with nothing selected.`;
  } else if (request?.depth === "scopeType") {
    // The count is the scope step's own list — the same scopes, read the same way (the
    // person's own access), that the server hands both sides.
    const n = type ? type.scopes.length : null;
    caption =
      n === 0
        ? null
        : n === null
          ? `Every ${typeName ?? "scope"} selected at once.`
          : `All ${n} ${typeName ?? "scopes"} selected at once.`;
  } else if (request?.depth === "scope") {
    caption = `${scopeName ?? "This scope"} selected — what the agent is handed for it.`;
  } else if (request?.depth === "item" && focus) {
    caption = `${focus.label} on ${scopeName ?? "this scope"}, as the agent sees it.`;
  }
  const typeIsEmpty = request?.depth === "scopeType" && type !== null && type.scopes.length === 0;

  // ── The alchemy capture: this page, the four picks by name AND id, the value,
  //    the exact selection both sides of the compare receive (the compare view
  //    adds both sides, the differences and the answers). ──
  usePageCapture(() =>
    adminPageCapture({
      title: "Context inspector",
      route: "/administration/scopes-context/context-inspector",
      identity: { Depth: request?.depth ?? null },
      selection: {
        Organization: { id: selection.org, name: orgName },
        "Scope type": { id: selection.scopeType, name: typeName },
        Scope: { id: selection.scope, name: scopeName },
        "Context item": {
          id: selection.item,
          name: chosenItem ? `${chosenItem.item.display_name} (key ${chosenItem.item.key})` : null,
        },
        Agent: { id: agentId ?? null, name: null },
      },
      errors,
      sections: [
        {
          id: "value",
          title: "Context item value",
          role: "data",
          value: chosenItem
            ? {
                item: chosenItem.item.display_name,
                key: chosenItem.item.key,
                shown: chosenValue,
                stored: chosenItem.value,
              }
            : "No context item chosen.",
        },
        {
          id: "compare-selection",
          title: "Selection sent to both sides",
          description: "The server's ContextSelection, identical for the current system and the record store.",
          role: "data",
          value: request ? { depth: request.depth, selection: request.selection, focus: focus ?? null } : "Nothing chosen yet; no compare runs.",
        },
        {
          id: "page-says",
          title: "What the page says",
          role: "data",
          value: [
            caption,
            outsideTree ? "This scope belongs to an organization you are not a member of." : null,
            typeIsEmpty ? "This scope type has no scopes yet." : null,
            !selection.org && !needsHome ? "Choose an organization." : null,
          ].filter(Boolean),
        },
      ],
    }),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-context-inspector>
      <MillerColumnsCore
        universe={universe}
        engine={engine}
        mode="filter"
        variant="full"
        includeEngagements={false}
        className="h-[300px] shrink-0"
      />
      <div
        className="flex h-9 min-w-0 items-center rounded-md border border-dashed border-border bg-muted/30 px-2.5"
        data-inspector-value={chosenItem ? (chosenValue ?? "") : undefined}
        aria-label="Context item value"
      >
        <span className="shrink-0 pr-1.5 text-[11px] text-muted-foreground">Value</span>
        {chosenItem ? (
          chosenValue !== null ? (
            <span className="truncate font-mono text-sm text-foreground" title={chosenValue}>
              {chosenItem.item.display_name}: {chosenValue}
            </span>
          ) : (
            <span className="truncate text-sm italic text-muted-foreground">
              {chosenItem.item.display_name} has no value on this scope
            </span>
          )
        ) : (
          <span className="truncate text-sm text-muted-foreground">Choose a context item</span>
        )}
      </div>
      {outsideTree && (
        <p className="text-xs text-muted-foreground" data-inspector-outside-tree>
          This scope belongs to an organization you are not a member of, so the columns cannot
          show it; the preview below still reads it from the scope.
        </p>
      )}

      {errors.map((e) => (
        <Alert key={e} variant="destructive">
          <AlertDescription className="text-xs">{e}</AlertDescription>
        </Alert>
      ))}

      {!selection.org && !needsHome && (
        <p className="text-xs text-muted-foreground" data-inspector-empty>
          Choose an organization and the preview shows what its agents are handed; each choice
          after it narrows the preview.
        </p>
      )}
      {typeIsEmpty && (
        <p className="text-xs text-muted-foreground">
          This scope type has no scopes yet, so there is nothing more to preview for it.
        </p>
      )}
      {caption && (
        <p className="text-xs text-muted-foreground" data-inspector-caption={request?.depth}>
          {caption}
          {request && request.depth !== "org" && request.depth !== "scopeType" && selection.scope && (
            <>
              {" "}
              Open it in{" "}
              <a className="underline underline-offset-2" href={`/scopes/s/${selection.scope}`} target="_blank" rel="noreferrer">
                the current system
              </a>{" "}
              or{" "}
              <a className="underline underline-offset-2" href={`/o/${selection.scope}`} target="_blank" rel="noreferrer">
                the record store&apos;s copy
              </a>
              .
            </>
          )}
        </p>
      )}
      {previewReady && request && !typeIsEmpty && (
        <div className="flex min-h-[24rem] flex-1 flex-col rounded-md border border-border">
          <ContextCompareView
            key={`${request.depth}:${JSON.stringify(request.selection)}`}
            selection={request.selection}
            agentId={agentId}
            onAgentChange={onAgentChange}
            focus={focus}
          />
        </div>
      )}
    </div>
  );
}
