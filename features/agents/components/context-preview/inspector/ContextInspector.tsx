"use client";

/**
 * ContextInspector — what an agent is handed, drilled down in order (lane
 * CONTEXT-INSPECTOR-GUIDED, Arman 2026-09-25: "Org → Scope Type → Scope →
 * Context Item → value … the more selective I get, the more you change the
 * data").
 *
 * One row of four pickers. Each loads its options from the previous choice
 * only; choosing one clears the ones after it; the value of the chosen context
 * item sits read-only at the end of the row. Below, the old-vs-new compare
 * re-resolves on every choice with the SAME selection on both sides
 * (`selection.ts#previewRequest`). No Run button.
 *
 * Controlled: the page owns the selection (the address), this renders it. The
 * one reverse flow is the deep link — `?scope=<id>` alone — where the scope
 * names its own organization and type (read from the scope, never from the
 * active organization) and the earlier steps are filled in.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { ContextItemRow, ContextItemValue, ScopesRpcResult } from "@/features/scopes/types";
import { ContextCompareView } from "../ContextCompareView";
import {
  chooseStep,
  previewRequest,
  TYPE_PREVIEW_LIMIT,
  type InspectorSelection,
  type InspectorStep,
} from "./selection";

interface Option {
  id: string;
  label: string;
  hint?: string;
}

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

async function loadScopeTypes(organizationId: string): Promise<Option[]> {
  const { types } = unwrap(await scopesService.listScopeTypesForOrganization(organizationId));
  return types.map((t) => ({ id: t.id, label: t.label_plural || t.label_singular }));
}

async function loadScopes(key: string): Promise<Option[]> {
  const [organizationId, scopeTypeId] = key.split(":");
  const { scopes } = unwrap(await scopesService.listScopesOfType(organizationId, scopeTypeId));
  return scopes.map((s) => ({ id: s.id, label: s.name }));
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

function Picker({
  step,
  label,
  load,
  options,
  selectedId,
  selectedFallback,
  disabledSentence,
  emptySentence,
  searchPlaceholder,
  onChoose,
}: {
  step: InspectorStep;
  label: string;
  load: Load<unknown>;
  options: Option[];
  selectedId: string | null;
  /** Shown when the selected id is not (yet) among the options. */
  selectedFallback?: string;
  /** Why this step cannot be chosen yet — the previous step is empty. */
  disabledSentence: string;
  emptySentence: string;
  searchPlaceholder: string;
  onChoose: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (load.state === "loading") {
    return (
      <div className="min-w-0 flex-1 basis-40" data-inspector-step={step} data-state="loading">
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  const selected = options.find((o) => o.id === selectedId);
  const ready = load.state === "ready";
  const empty = ready && options.length === 0;
  const text =
    load.state === "idle"
      ? disabledSentence
      : load.state === "error"
        ? `${label} could not load`
        : empty
          ? emptySentence
          : selected
            ? selected.label
            : selectedId && selectedFallback
              ? selectedFallback
              : `Choose ${label.toLowerCase()}`;
  return (
    <div className="min-w-0 flex-1 basis-40" data-inspector-step={step} data-state={load.state}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            disabled={!ready || empty}
            className="h-9 w-full justify-between gap-1 px-2.5 font-normal"
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
              <span
                className={cn("truncate text-sm", !selected && "text-muted-foreground")}
                title={text}
              >
                {text}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent sizing="content" className="p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="max-h-72">
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.label} ${option.hint ?? ""} ${option.id}`}
                    onSelect={() => {
                      onChoose(option.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("h-4 w-4", option.id === selectedId ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.hint && (
                      <span className="ml-auto shrink-0 pl-3 text-xs text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ContextInspector({
  selection,
  onChange,
  agentId,
}: {
  selection: InspectorSelection;
  /** The page writes it to the address; `replace` is true for a back-fill. */
  onChange: (next: InspectorSelection, opts?: { replace?: boolean }) => void;
  /** Optional `?agent=` — lets the compare answer the same question on both paths. */
  agentId?: string;
}) {
  // ── Step 1: the person's own organizations (access is personal). ──
  const orgs = useUserOrganizations();

  // ── The deep link: a scope with no organization or type names its own. ──
  const needsHome = Boolean(selection.scope && (!selection.org || !selection.scopeType));
  const home = useStepLoad(needsHome ? selection.scope : null, async (scopeId) =>
    unwrap(await scopesService.getScopeHome(scopeId)).scope,
  );
  useEffect(() => {
    if (!needsHome || home.state !== "ready" || !home.data) return;
    onChange(
      {
        ...selection,
        org: home.data.organization_id,
        scopeType: home.data.scope_type_id,
      },
      { replace: true },
    );
  }, [needsHome, home, selection, onChange]);

  // ── Steps 2–4, each from the previous choice only. ──
  const typesLoad = useStepLoad(selection.org, loadScopeTypes);
  const scopesLoad = useStepLoad(
    selection.org && selection.scopeType ? `${selection.org}:${selection.scopeType}` : null,
    loadScopes,
  );
  const itemsLoad = useStepLoad(
    selection.scopeType && selection.scope ? `${selection.scopeType}:${selection.scope}` : null,
    loadItems,
  );

  const orgOptions = useMemo<Option[]>(() => {
    const list = orgs.organizations.map((o) => ({ id: o.id, label: o.name }));
    // A shared link to a scope in an organization the person reaches only
    // through that scope: the scope's organization still stands (it is read
    // from the scope), labelled as such.
    if (selection.org && !orgs.loading && !list.some((o) => o.id === selection.org)) {
      list.push({ id: selection.org, label: "This scope's organization" });
    }
    return list;
  }, [orgs.organizations, orgs.loading, selection.org]);
  const typeOptions = typesLoad.state === "ready" ? typesLoad.data : [];
  const scopeOptions = scopesLoad.state === "ready" ? scopesLoad.data : [];
  const itemRows = itemsLoad.state === "ready" ? itemsLoad.data : [];
  const itemOptions = itemRows.map(({ item, value }) => ({
    id: item.id,
    label: item.display_name,
    hint: value ? undefined : "no value",
  }));

  const orgLoad: Load<unknown> = orgs.loading
    ? { state: "loading" }
    : orgs.error
      ? { state: "error", message: orgs.error }
      : { state: "ready", data: null };

  const choose = (step: InspectorStep) => (id: string) => onChange(chooseStep(selection, step, id));

  const orgName = orgOptions.find((o) => o.id === selection.org)?.label ?? null;
  const typeName = typeOptions.find((o) => o.id === selection.scopeType)?.label ?? null;
  const scopeName = scopeOptions.find((o) => o.id === selection.scope)?.label ?? null;
  const chosenItem = itemRows.find((r) => r.item.id === selection.item) ?? null;
  const chosenValue = chosenItem ? displayValue(chosenItem.value) : null;

  const request = previewRequest(
    selection,
    scopesLoad.state === "ready" ? scopesLoad.data.map((s) => s.id) : null,
  );
  // The item step narrows the SHOWN compare to one item; it waits for the item's key.
  const focus =
    request?.depth === "item" && chosenItem
      ? { itemId: chosenItem.item.id, key: chosenItem.item.key, label: chosenItem.item.display_name }
      : undefined;
  const previewReady = request && (request.depth !== "item" || focus);

  const errors = [
    orgs.error ? `Your organizations could not load: ${orgs.error}` : null,
    home.state === "error" ? `This scope's organization could not be read: ${home.message}` : null,
    home.state === "ready" && !home.data
      ? "This scope was not found, or it has not been shared with you. Check the id in the address."
      : null,
    typesLoad.state === "error" ? `The scope types could not load: ${typesLoad.message}` : null,
    scopesLoad.state === "error" ? `The scopes could not load: ${scopesLoad.message}` : null,
    itemsLoad.state === "error" ? `The context items could not load: ${itemsLoad.message}` : null,
  ].filter((e): e is string => Boolean(e));

  let caption: string | null = null;
  if (request?.depth === "org") {
    caption = `What an agent working in ${orgName ?? "this organization"} is handed with nothing selected.`;
  } else if (request?.depth === "scopeType") {
    const n = request.typeScopeCount ?? 0;
    caption =
      n === 0
        ? null
        : n > TYPE_PREVIEW_LIMIT
          ? `The first ${TYPE_PREVIEW_LIMIT} of ${n} ${typeName ?? "scopes"} selected at once, by name.`
          : `All ${n} ${typeName ?? "scopes"} selected at once.`;
  } else if (request?.depth === "scope") {
    caption = `${scopeName ?? "This scope"} selected — what the agent is handed for it.`;
  } else if (request?.depth === "item" && focus) {
    caption = `${focus.label} on ${scopeName ?? "this scope"}, as the agent sees it.`;
  }
  const typeIsEmpty = request?.depth === "scopeType" && request.typeScopeCount === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-context-inspector>
      <div className="flex flex-wrap items-center gap-2" data-inspector-row>
        <Picker
          step="org"
          label="Organization"
          load={orgLoad}
          options={orgOptions}
          selectedId={selection.org}
          disabledSentence=""
          emptySentence="You belong to no organizations"
          searchPlaceholder="Search organizations…"
          onChoose={choose("org")}
        />
        <Picker
          step="scopeType"
          label="Scope type"
          load={needsHome && !selection.org ? { state: "loading" } : typesLoad}
          options={typeOptions}
          selectedId={selection.scopeType}
          disabledSentence="Choose an organization first"
          emptySentence="No scope types yet"
          searchPlaceholder="Search scope types…"
          onChoose={choose("scopeType")}
        />
        <Picker
          step="scope"
          label="Scope"
          load={needsHome && !selection.scopeType ? { state: "loading" } : scopesLoad}
          options={scopeOptions}
          selectedId={selection.scope}
          disabledSentence="Choose a scope type first"
          emptySentence="This scope type has no scopes yet"
          searchPlaceholder={`Search ${typeName?.toLowerCase() ?? "scopes"}…`}
          onChoose={choose("scope")}
        />
        <Picker
          step="item"
          label="Context item"
          load={itemsLoad}
          options={itemOptions}
          selectedId={selection.item}
          disabledSentence="Choose a scope first"
          emptySentence="This scope type has no context items yet"
          searchPlaceholder="Search context items…"
          onChoose={choose("item")}
        />
        <div
          className="flex h-9 min-w-0 flex-1 basis-40 items-center rounded-md border border-dashed border-border bg-muted/30 px-2.5"
          data-inspector-value={chosenItem ? (chosenValue ?? "") : undefined}
          aria-label="Context item value"
        >
          <span className="shrink-0 pr-1.5 text-[11px] text-muted-foreground">Value</span>
          {chosenItem ? (
            chosenValue !== null ? (
              <span className="truncate font-mono text-sm text-foreground" title={chosenValue}>
                {chosenValue}
              </span>
            ) : (
              <span className="truncate text-sm italic text-muted-foreground">
                No value on this scope
              </span>
            )
          ) : (
            <span className="truncate text-sm text-muted-foreground">Choose a context item</span>
          )}
        </div>
      </div>

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
            key={`${request.depth}:${request.organizationId}:${request.scopeIds.join(",")}:${agentId ?? ""}`}
            scopeIds={request.scopeIds}
            organizationId={request.organizationId}
            agentId={agentId}
            focus={focus}
          />
        </div>
      )}
    </div>
  );
}
