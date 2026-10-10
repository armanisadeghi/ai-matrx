"use client";

import { UntrustedCount } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, Check, Loader2, Pencil, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useScopeFieldRows } from "@/features/scopes/components/pages/hooks/useScopeFieldRows";
import { hasCellValue } from "./scope-detail-values";
import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { AddContextItemInline } from "./AddContextItemInline";
import { ScopeAdvancedSection } from "./ScopeAdvancedSection";
import { ScopeDetailSurface } from "./ScopeDetailSurface";
import { ScopeGlyph } from "@/features/scopes/components/ScopeGlyph";
import { ScopeNotFound } from "./ScopeNotFound";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scopes/constants/scope-colors";
import { KgGraphCard } from "@/features/kg-graph/components/KgGraphCard";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import {
  orgScopesHref,
  scopeTypeHref,
  scopeItemHref,
  scopeContextItemsHref,
} from "@/features/scopes/lib/scopeRoutes";
import { AssociationCardGrid } from "@ai-matrx/associations/react";
import { PrimaryEntityProvider } from "@ai-matrx/associations/react";
import {
  selectScopeBySlugOrId,
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
  selectScopesLoadedForType,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  updateScope,
} from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { unwrapRecords } from "@ai-matrx/records";


interface ScopeDetailEditorProps {
  orgId: string;
  orgSlugOrId: string;
  /** Route segment for the scope type — UUID or kebab slug. */
  typeParam: string;
  /** Route segment for the scope — UUID or kebab slug. */
  scopeParam: string;
  /** Owner/admin: may add type-level fields and delete this scope. */
  canManage: boolean;
}

export function ScopeDetailEditor({
  orgId,
  orgSlugOrId,
  typeParam,
  scopeParam,
  canManage,
}: ScopeDetailEditorProps) {
  const dispatch = useAppDispatch();
  // Both route segments resolve by UUID or kebab slug.
  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const resolvedTypeId = scopeType?.id;
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );
  const scope = useAppSelector((s) =>
    selectScopeBySlugOrId(s, resolvedTypeId, scopeParam),
  );
  const scopesLoaded = useAppSelector((s) =>
    resolvedTypeId
      ? selectScopesLoadedForType(s, orgId, resolvedTypeId)
      : false,
  );
  const scopeId = scope?.id;
  const {
    rows,
    loading,
    error: readError,
    refresh: retryRead,
  } = useScopeFieldRows(scopeId);
  const suggestions = useScopeSuggestions();
  const editNameButtonRef = useRef<HTMLButtonElement>(null);
  const editDescriptionButtonRef = useRef<HTMLButtonElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  function closeNameEditor() {
    setEditingName(false);
    requestAnimationFrame(() => editNameButtonRef.current?.focus());
  }

  function cancelNameEdit() {
    setNameDraft(scope?.name ?? "");
    closeNameEditor();
  }

  function closeDescriptionEditor() {
    setEditingDescription(false);
    requestAnimationFrame(() => editDescriptionButtonRef.current?.focus());
  }

  function cancelDescriptionEdit() {
    setDescriptionDraft(scope?.description ?? "");
    closeDescriptionEditor();
  }

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(ensureScopeTree());
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    if (scope) {
      // Selecting a different scope intentionally resets both inline drafts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameDraft(scope.name);
      setDescriptionDraft(scope.description ?? "");
    }
  }, [scope]);

  // Not found vs still loading.
  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        token="scope_type"
        param={typeParam}
        entityLabel="scope type"
        backHref={orgScopesHref(orgSlugOrId)}
        backLabel="Back to scopes"
      />
    ) : (
      <CenteredSpinner />
    );
  }
  if (!scope) {
    return scopesLoaded ? (
      <ScopeNotFound
        token="scope"
        param={scopeParam}
        entityLabel={scopeType.label_singular.toLowerCase()}
        backHref={scopeTypeHref(orgSlugOrId, scopeType)}
        backLabel={`Back to ${scopeType.label_plural}`}
      />
    ) : (
      <CenteredSpinner />
    );
  }

  const color = resolveColor(scopeType);

  async function saveName() {
    if (!scope) return;
    const next = nameDraft.trim();
    if (!next || next === scope.name) {
      setNameDraft(scope.name);
      closeNameEditor();
      return;
    }
    setSavingName(true);
    try {
      await dispatch(updateScope({ scope_id: scope.id, name: next })).then(unwrapRecords);
      toast.success("Renamed");
      closeNameEditor();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSavingName(false);
    }
  }

  async function saveDescription() {
    if (!scope) return;
    const next = descriptionDraft.trim();
    if (next === (scope.description ?? "").trim()) {
      closeDescriptionEditor();
      return;
    }
    setSavingDescription(true);
    try {
      await dispatch(
        updateScope({ scope_id: scope.id, description: next }),
      ).then(unwrapRecords);
      toast.success("Description updated");
      closeDescriptionEditor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update description",
      );
    } finally {
      setSavingDescription(false);
    }
  }

  const filled = rows?.filter((r) => hasCellValue(r.value)).length ?? 0;
  const total = rows?.length ?? 0;
  /** The scope's values read — the filled/total counts say "—" when it failed. */
  const valuesRead = readOf({ loading, error: readError });

  return (
    <div className="space-y-6">
      <ScopeDetailSurface
        scope={scope}
        scopeType={scopeType}
        orgId={orgId}
        rows={rows}
        readError={readError ? String(readError) : null}
      />
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-lg ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
          >
            <ScopeGlyph icon={scopeType.icon} className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  aria-label="Scope name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelNameEdit();
                    }
                  }}
                  className="text-xl font-bold h-auto py-1"
                  disabled={savingName}
                  style={{ fontSize: "16px" }}
                />
                <Button
                  icon={savingName ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  type="button"
                  variant="quiet"
                  onClick={saveName}
                  disabled={savingName}
                  aria-label="Save scope name"
                />
                <Button
                  icon={<XIcon />}
                  type="button"
                  variant="quiet"
                  onClick={cancelNameEdit}
                  disabled={savingName}
                  aria-label="Cancel editing scope name"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-bold text-foreground">
                  {scope.name}
                </h1>
                <Button
                  icon={<Pencil />}
                  ref={editNameButtonRef}
                  type="button"
                  variant="quiet"
                  className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={() => setEditingName(true)}
                  aria-label="Edit name"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {scopeType.label_singular} ·{" "}
              <UntrustedCount value={filled} read={valuesRead} label="Filled context items" /> of{" "}
              <UntrustedCount value={total} read={valuesRead} label="Context items" />{" "}
              {total === 1 ? "context item" : "context items"} filled
            </p>

            {editingDescription ? (
              <div className="mt-3 space-y-2">
                <ProTextarea
                  autoFocus
                  aria-label="Scope description"
                  minHeight={80}
                  maxHeight={600}
                  autoGrow
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Describe this scope (optional)"
                  disabled={savingDescription}
                  enableTextStats={false}
                />
                <div className="flex items-center gap-2">
                  <Button
                    icon={savingDescription && (
                      <Loader2 className="animate-spin" />
                    )}
                    variant="primary"
                    type="button"
                    onClick={saveDescription}
                    disabled={savingDescription}
                  >
                    Save description
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={cancelDescriptionEdit}
                    disabled={savingDescription}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                ref={editDescriptionButtonRef}
                type="button"
                onClick={() => setEditingDescription(true)}
                className="group mt-2 block w-full text-left"
              >
                {scope.description ? (
                  <span className="inline-flex items-start gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    {scope.description}
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 mt-1 transition-opacity" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                    Add a description
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Knowledge-graph suggestions targeting this scope's fields. */}
      {suggestions.forScope(scope.id).length > 0 && (
        <KgSuggestionHint
          variant="banner"
          rows={suggestions.forScope(scope.id)}
          accept={suggestions.accept}
          reject={suggestions.reject}
          defer={suggestions.defer}
          label={scope.name}
          align="start"
        />
      )}

      {/* Live preview of this scope's slice of the knowledge graph (lazy, cached). */}
      <KgGraphCard
        variant="scope"
        id={scope.id}
        orgSlugOrId={orgSlugOrId}
        title={`${scope.name} · knowledge graph`}
      />

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">
            Context items
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                <UntrustedCount value={filled} read={valuesRead} label="Filled context items" />/
                <UntrustedCount value={total} read={valuesRead} label="Context items" /> filled
              </span>
            )}
          </h2>
          <Button
            asChild
            variant="quiet"
          >
            <Link href={scopeContextItemsHref(orgSlugOrId, scopeType, scope)}>
              Open full page
            </Link>
          </Button>
        </div>
        {loading && !rows && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading context items…
          </div>
        )}
        {readError && !rows ? (
          <ReadFailure
            error={readError}
            what={`this ${scopeType.label_singular.toLowerCase()}'s context items`}
            onRetry={retryRead}
            className="m-0"
          />
        ) : null}
        {readError && rows ? (
          <StaleDataNotice
            hasData
            what={`this ${scopeType.label_singular.toLowerCase()}'s context items`}
            onRetry={retryRead}
            detail={readError}
          />
        ) : null}
        {!readError && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No context items defined for {scopeType.label_plural.toLowerCase()}{" "}
            yet.
          </p>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-5">
            {rows.map((row) => (
              <ScopeFieldInput
                key={row.field.id}
                scopeId={scope.id}
                row={row}
                itemHref={scopeItemHref(orgSlugOrId, scopeType, scope, {
                  id: row.field.id,
                  slug: row.field.key,
                })}
                headerSlot={
                  <KgSuggestionHint
                    variant="dot"
                    rows={suggestions.forScopeItem(scope.id, row.field.id)}
                    accept={suggestions.accept}
                    reject={suggestions.reject}
                    defer={suggestions.defer}
                    label={row.field.label}
                  />
                }
              />
            ))}
          </div>
        )}
        {/* Adding a context item defines a field for ALL scopes of this type — admin only. */}
        {canManage && (
          <div className="pt-2 border-t">
            <AddContextItemInline
              scopeId={scope.id}
              scopeTypeId={scopeType.id}
              labelPlural={scopeType.label_plural}
            />
          </div>
        )}
      </Card>

      {/* ─── Resources = canonical platform.associations edges ──────────
          Everything attached to this scope, grouped by content role with the
          same categorical colors the org resource grid uses. Sits BELOW the
          core scope content — it is supporting material, not the main job. */}
      <PrimaryEntityProvider
        value={{
          type: "scope",
          id: scope.id,
          orgId,
          label: scope.name,
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Resources</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Attached to this {scopeType.label_singular.toLowerCase()}, grouped
              by what they do
            </span>
          </div>
          <AssociationCardGrid />
        </div>
      </PrimaryEntityProvider>

      <ScopeAdvancedSection scope={scope} />
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
