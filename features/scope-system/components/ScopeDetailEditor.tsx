"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Check,
  X as XIcon,
  Trash2,
  Settings,
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
  updateScope,
  deleteScope,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { selectScopeTypeBySlugOrId } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  getScopeContext,
  selectValuesByScope,
  selectScopeValuesLoading,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { AddContextItemInline } from "./AddContextItemInline";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { ScopeAdvancedSection } from "./ScopeAdvancedSection";
import { ScopeGlyph } from "./ScopeGlyph";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  orgScopesHref,
  scopeTypeHref,
  scopeItemHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ScopeDetailEditorProps {
  orgId: string;
  orgSlugOrId: string;
  /** Route segment for the scope type — UUID or kebab slug. */
  typeParam: string;
  /** Route segment for the scope — UUID or kebab slug. */
  scopeParam: string;
}

export function ScopeDetailEditor({
  orgId,
  orgSlugOrId,
  typeParam,
  scopeParam,
}: ScopeDetailEditorProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // Both route segments resolve by UUID or kebab slug.
  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const resolvedTypeId = scopeType?.id;
  const scope = useAppSelector((s) =>
    selectScopeBySlugOrId(s, resolvedTypeId, scopeParam),
  );
  const scopeId = scope?.id;
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId ?? ""));
  const loading = useAppSelector((s) =>
    selectScopeValuesLoading(s, scopeId ?? ""),
  );

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [editingType, setEditingType] = useState(false);
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

  if (!scope || !scopeType) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingType(true)}
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Edit {scopeType.label_singular} Settings
          </Button>
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
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-lg ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
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

      <Card className="p-6 space-y-5">
        {loading && !rows && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading context items…
          </div>
        )}
        {rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No context items yet. Add your first one below.
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
              />
            ))}
          </div>
        )}
        <div className="pt-2 border-t">
          <AddContextItemInline
            scopeId={scope.id}
            scopeTypeId={scopeType.id}
            labelPlural={scopeType.label_plural}
          />
        </div>
      </Card>

      <ScopeAdvancedSection scope={scope} />

      <EditScopeTypeSheet
        open={editingType}
        onOpenChange={setEditingType}
        orgId={scopeType.organization_id}
        typeId={scopeType.id}
        onDeleted={() => router.push(orgScopesHref(orgSlugOrId))}
      />
    </div>
  );
}
