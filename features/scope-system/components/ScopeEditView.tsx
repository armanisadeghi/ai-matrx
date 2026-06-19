"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ListChecks, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ScopeAdvancedSection } from "./ScopeAdvancedSection";
import { DictionarySection } from "@/features/dictionary/components/DictionarySection";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "./ScopeGlyph";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import {
  orgScopesHref,
  scopeHref,
  scopeTypeHref,
  scopeContextItemsHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ScopeEditViewProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  typeParam: string;
  scopeParam: string;
  canManage: boolean;
}

/**
 * Full-page Manage route for a single scope's OWN settings (name, description,
 * slug, sort order, settings JSON) — not its values. Context above
 * (org → type → scope) + the form (reusing ScopeAdvancedSection) + a link down
 * to the scope's context items/values.
 */
export function ScopeEditView({
  orgId,
  orgSlugOrId,
  typeParam,
  scopeParam,
  canManage,
}: ScopeEditViewProps) {
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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savingBasics, setSavingBasics] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (resolvedTypeId)
      dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    if (scope) {
      setName(scope.name);
      setDescription(scope.description ?? "");
    }
  }, [scope]);

  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}".`}
        backHref={orgScopesHref(orgSlugOrId)}
        backLabel="Back to scopes"
      />
    ) : (
      <Spinner />
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
      <Spinner />
    );
  }

  const color = resolveColor(scopeType);
  const hubHref = scopeHref(orgSlugOrId, scopeType, scope);

  async function saveBasics() {
    if (!scope) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    setSavingBasics(true);
    try {
      await dispatch(
        updateScope({
          scope_id: scope.id,
          name: trimmed,
          description: description.trim(),
        }),
      ).unwrap();
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingBasics(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {scopeType.label_singular}
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Edit {scope.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                This {scopeType.label_singular.toLowerCase()}&apos;s own
                settings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href={scopeContextItemsHref(orgSlugOrId, scopeType, scope)}>
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                Context items
                <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      {!canManage ? (
        <Card className="p-6 text-sm text-muted-foreground">
          You don&apos;t have permission to edit this{" "}
          {scopeType.label_singular.toLowerCase()}.{" "}
          <Link href={hubHref} className="text-primary hover:underline">
            View it instead
          </Link>
          .
        </Card>
      ) : (
        <>
          {/* Basics */}
          <Card className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ fontSize: "16px" }}
                disabled={savingBasics}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <ProTextarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                minHeight={80}
                maxHeight={600}
                autoGrow
                placeholder="Describe this scope (optional)"
                disabled={savingBasics}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={saveBasics}
                disabled={savingBasics || !name.trim()}
                size="sm"
              >
                {savingBasics && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
            </div>
          </Card>

          {/* Advanced: slug, sort order, settings JSON (reused) */}
          <ScopeAdvancedSection scope={scope} />

          {/* Custom Dictionary — terminology + pronunciation for this scope */}
          {canManage && (
            <DictionarySection
              level="scope"
              ownerId={scope.id}
              ownerName={scope.name}
              canEdit={canManage}
            />
          )}

          {/* Danger zone */}
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Delete this {scopeType.label_singular.toLowerCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Permanently removes it and all its values.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Delete
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
