"use client";

import { UntrustedCount } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import { useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useScopeFieldRows } from "@/features/scope-system/hooks/useScopeFieldRows";
import { hasCellValue } from "./scope-detail-values";
import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";
import { listScopeTypeItems } from "@/features/scopes/redux/contextItemCatalog";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { AddContextItemInline } from "./AddContextItemInline";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "@/features/scopes/components/ScopeGlyph";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scopes/constants/scope-colors";
import {
  contextItemsHref,
  orgScopesHref,
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
} from "@/features/scopes/lib/scopeRoutes";
import {
  selectScopeBySlugOrId,
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
  selectScopesLoadedForType,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

interface ScopeContextItemsHubProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  typeParam: string;
  scopeParam: string;
  canManage: boolean;
}

/**
 * One scope's context items + values, as a dedicated page (e.g. all of
 * "Cosmetics Injectables Medspa"'s field values). Distinct from the scope hub
 * (which is the scope's overview) — this is the focused items-and-values list.
 */
export function ScopeContextItemsHub({
  orgId,
  orgSlugOrId,
  typeParam,
  scopeParam,
  canManage,
}: ScopeContextItemsHubProps) {
  const dispatch = useAppDispatch();

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
  const scopeSuggestions = suggestions.forScope(scopeId);

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(ensureScopeTree());
    dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, orgId, resolvedTypeId]);

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
  const filled = rows?.filter((r) => hasCellValue(r.value)).length ?? 0;
  const total = rows?.length ?? 0;
  /** The scope's values read — the filled/total counts say "—" when it failed. */
  const valuesRead = readOf({ loading, error: readError });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-lg ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
          >
            <ScopeGlyph icon={scopeType.icon} className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <Link
              href={scopeHref(orgSlugOrId, scopeType, scope)}
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              {scopeType.label_singular} · {scope.name}
            </Link>
            <h1 className="text-2xl font-bold text-foreground leading-tight">
              Context items
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              <UntrustedCount value={filled} read={valuesRead} label="Filled fields" /> of{" "}
              <UntrustedCount value={total} read={valuesRead} label="Fields" />{" "}
              {total === 1 ? "field" : "fields"} filled for{" "}
              {scope.name}.{" "}
              <Link
                href={contextItemsHref(orgSlugOrId, scopeType)}
                className="text-primary hover:underline"
              >
                Manage the fields
              </Link>
            </p>
          </div>
        </div>
      </Card>

      {/* Knowledge-graph suggestions for this scope */}
      {scopeSuggestions.length > 0 && (
        <KgSuggestionHint
          variant="banner"
          rows={scopeSuggestions}
          accept={suggestions.accept}
          reject={suggestions.reject}
          defer={suggestions.defer}
          label={scope.name}
          align="start"
        />
      )}

      {/* Items + values for this scope */}
      <Card className="p-6 space-y-5">
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
