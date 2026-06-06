"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Home,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopeBySlugOrId,
  selectScopesLoadedForType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  getScopeContext,
  selectValuesByScope,
  selectScopeValuesLoading,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { listScopeTypeItems } from "@/features/scope-system/redux/contextItemsSlice";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { AddContextItemInline } from "./AddContextItemInline";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "./ScopeGlyph";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import {
  contextItemsHref,
  orgScopesHref,
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ScopeContextItemsHubProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
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
  orgName,
  orgIsPersonal,
  typeParam,
  scopeParam,
  canManage,
}: ScopeContextItemsHubProps) {
  const router = useRouter();
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
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId ?? ""));
  const loading = useAppSelector((s) =>
    selectScopeValuesLoading(s, scopeId ?? ""),
  );
  const suggestions = useScopeSuggestions();
  const scopeSuggestions = suggestions.forScope(scopeId);

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
    dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    if (scopeId)
      dispatch(getScopeContext({ scope_id: scopeId, include_empty: true }));
  }, [dispatch, scopeId]);

  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}".`}
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
        title={`${scopeType.label_singular} not found`}
        message={`No ${scopeType.label_singular.toLowerCase()} matches "${scopeParam}".`}
        backHref={scopeTypeHref(orgSlugOrId, scopeType)}
        backLabel={`Back to ${scopeType.label_plural}`}
      />
    ) : (
      <CenteredSpinner />
    );
  }

  const color = resolveColor(scopeType);
  const filled = rows?.filter((r) => r.has_value).length ?? 0;
  const total = rows?.length ?? 0;

  return (
    <div className="space-y-6 pr-14">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="h-7 px-2 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <span className="text-muted-foreground/50">·</span>
        <Link
          href={orgScopesHref(orgSlugOrId)}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {orgIsPersonal ? (
            <Home className="h-3.5 w-3.5" />
          ) : (
            <Building2 className="h-3.5 w-3.5" />
          )}
          {orgIsPersonal ? "Personal workspace" : orgName}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <Link
          href={scopeTypeHref(orgSlugOrId, scopeType)}
          className="text-muted-foreground hover:text-foreground"
        >
          {scopeType.label_plural}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <Link
          href={scopeHref(orgSlugOrId, scopeType, scope)}
          className="text-muted-foreground hover:text-foreground"
        >
          {scope.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">Context items</span>
      </div>

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
              {filled} of {total} {total === 1 ? "field" : "fields"} filled for{" "}
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
        {rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No context items defined for {scopeType.label_plural.toLowerCase()}{" "}
            yet.
          </p>
        )}
        {rows && rows.length > 0 && (
          <div className="space-y-5">
            {rows.map((row) => (
              <ScopeFieldInput
                key={row.item_id}
                scopeId={scope.id}
                row={row}
                itemHref={scopeItemHref(orgSlugOrId, scopeType, scope, {
                  id: row.item_id,
                  slug: row.slug,
                })}
                headerSlot={
                  <KgSuggestionHint
                    variant="dot"
                    rows={suggestions.forScopeItem(scope.id, row.item_id)}
                    accept={suggestions.accept}
                    reject={suggestions.reject}
                    defer={suggestions.defer}
                    label={row.display_name}
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
