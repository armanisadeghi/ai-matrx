"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  Home,
  Loader2,
  Pencil,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopeBySlugOrId,
  selectScopesLoadedForType,
  updateScope,
  deleteScope,
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
import { ScopeFieldInput } from "./ScopeFieldInput";
import { AddContextItemInline } from "./AddContextItemInline";
import { ScopeAdvancedSection } from "./ScopeAdvancedSection";
import { ScopeGlyph } from "./ScopeGlyph";
import { ScopeNotFound } from "./ScopeNotFound";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import { KgGraphCard } from "@/features/kg-graph/components/KgGraphCard";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import {
  orgScopesHref,
  scopeTypeHref,
  scopeItemHref,
  scopeContextItemsHref,
  scopeEditHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ScopeDetailEditorProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
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
  orgName,
  orgIsPersonal,
  typeParam,
  scopeParam,
  canManage,
}: ScopeDetailEditorProps) {
  const router = useRouter();
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
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId ?? ""));
  const loading = useAppSelector((s) =>
    selectScopeValuesLoading(s, scopeId ?? ""),
  );
  const suggestions = useScopeSuggestions();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    if (!scopeId) return;
    dispatch(getScopeContext({ scope_id: scopeId, include_empty: true }));
  }, [dispatch, scopeId]);

  useEffect(() => {
    if (scope) {
      setNameDraft(scope.name);
      setDescriptionDraft(scope.description ?? "");
    }
  }, [scope]);

  // Not found vs still loading.
  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}" in this organization.`}
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

  async function saveName() {
    if (!scope) return;
    const next = nameDraft.trim();
    if (!next || next === scope.name) {
      setEditingName(false);
      setNameDraft(scope.name);
      return;
    }
    setSavingName(true);
    try {
      await dispatch(updateScope({ scope_id: scope.id, name: next })).unwrap();
      toast.success("Renamed");
      setEditingName(false);
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
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await dispatch(
        updateScope({ scope_id: scope.id, description: next }),
      ).unwrap();
      toast.success("Description updated");
      setEditingDescription(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update description",
      );
    } finally {
      setSavingDescription(false);
    }
  }

  async function handleDelete() {
    if (!scope) return;
    const ok = await confirm({
      title: `Delete ${scope.name}?`,
      description: `This permanently deletes “${scope.name}” and all its values. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await dispatch(deleteScope(scope.id)).unwrap();
      toast.success(`Deleted “${scope.name}”`);
      router.push(scopeTypeHref(orgSlugOrId, scopeType));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  const filled = rows?.filter((r) => r.has_value).length ?? 0;
  const total = rows?.length ?? 0;

  return (
    <div className="space-y-6 pr-14">
      {/* Breadcrumb: Back · Org › Type › Scope */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm flex-wrap min-w-0">
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
          <span className="font-medium text-foreground truncate">
            {scope.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={scopeEditHref(orgSlugOrId, scopeType, scope)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit settings
            </Link>
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Delete
            </Button>
          )}
        </div>
      </div>

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
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameDraft(scope.name);
                    }
                  }}
                  className="text-xl font-bold h-auto py-1"
                  disabled={savingName}
                  style={{ fontSize: "16px" }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={saveName}
                  disabled={savingName}
                >
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(scope.name);
                  }}
                  disabled={savingName}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-bold text-foreground">
                  {scope.name}
                </h1>
                <Button
                  size="icon"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setEditingName(true)}
                  aria-label="Edit name"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {scopeType.label_singular} · {filled} of {total}{" "}
              {total === 1 ? "context item" : "context items"} filled
            </p>

            {editingDescription ? (
              <div className="mt-3 space-y-2">
                <ProTextarea
                  autoFocus
                  minHeight={80}
                  autoGrow
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Describe this scope (optional)"
                  disabled={savingDescription}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={saveDescription}
                    disabled={savingDescription}
                  >
                    {savingDescription && (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    )}
                    Save description
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingDescription(false);
                      setDescriptionDraft(scope.description ?? "");
                    }}
                    disabled={savingDescription}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
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
                {filled}/{total} filled
              </span>
            )}
          </h2>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
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
