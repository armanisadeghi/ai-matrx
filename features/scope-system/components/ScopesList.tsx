"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Plus, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { selectScopeTypeById } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { NewScopeInline } from "./NewScopeInline";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { pickColorForId } from "@/features/scope-system/constants/scope-colors";
import { formatDistanceToNow } from "date-fns";

interface ScopesListProps {
  orgId: string;
  orgSlugOrId: string;
  typeId: string;
}

export function ScopesList({ orgId, orgSlugOrId, typeId }: ScopesListProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const scopeType = useAppSelector((s) => selectScopeTypeById(s, typeId));
  const scopes = useAppSelector((s) => selectScopesByType(s, typeId));
  const items = useAppSelector((s) => selectItemsByType(s, typeId));
  const itemsLoaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, typeId),
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    dispatch(fetchScopes({ org_id: orgId, type_id: typeId }));
    dispatch(listScopeTypeItems(typeId));
  }, [dispatch, orgId, typeId]);

  const itemCount = items.length;
  const sorted = useMemo(
    () =>
      [...scopes].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [scopes],
  );

  if (!scopeType) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Icon = resolveIcon(scopeType.icon);
  const color = pickColorForId(scopeType.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit scope
          </Button>
          <Button onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1.5" />
            New {scopeType.label_singular}
          </Button>
        </div>
      </div>

      <Card
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditing(true);
        }}
        className="p-6 cursor-pointer hover:bg-accent/30 transition-colors group"
        title="Click to edit"
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-lg ${color.fg} flex items-center justify-center shrink-0`}
          >
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {scopeType.label_plural}
              </h1>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {sorted.length}{" "}
              {sorted.length === 1
                ? scopeType.label_singular.toLowerCase()
                : scopeType.label_plural.toLowerCase()}
              {" · "}
              {itemCount} {itemCount === 1 ? "context item" : "context items"}
            </p>
            {scopeType.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {scopeType.description}
              </p>
            )}
          </div>
        </div>
      </Card>

      <EditScopeTypeSheet
        open={editing}
        onOpenChange={setEditing}
        orgId={orgId}
        typeId={typeId}
        onDeleted={() => router.push(`/organizations/${orgSlugOrId}/scopes`)}
      />

      {adding && (
        <NewScopeInline
          orgId={orgId}
          typeId={typeId}
          labelSingular={scopeType.label_singular}
          labelPlural={scopeType.label_plural}
          onCancel={() => setAdding(false)}
          onCreated={(scopeId) => {
            setAdding(false);
            router.push(
              `/organizations/${orgSlugOrId}/scopes/${typeId}/${scopeId}`,
            );
          }}
        />
      )}

      {sorted.length === 0 && !adding && (
        <Card className="p-10 text-center">
          <div
            className={`w-14 h-14 rounded-full ${color.fg} flex items-center justify-center mx-auto mb-3`}
          >
            <Icon className="h-8 w-8" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">
            No {scopeType.label_plural.toLowerCase()} yet
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first {scopeType.label_singular.toLowerCase()} to get
            started.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add {scopeType.label_singular}
          </Button>
        </Card>
      )}

      {sorted.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {sorted.map((scope) => (
              <li key={scope.id}>
                <button
                  onClick={() =>
                    router.push(
                      `/organizations/${orgSlugOrId}/scopes/${typeId}/${scope.id}`,
                    )
                  }
                  className="w-full text-left flex items-center gap-3 px-5 py-3.5 hover:bg-accent/40 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {scope.name}
                    </p>
                    {scope.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {scope.description}
                      </p>
                    )}
                  </div>
                  {itemsLoaded && itemCount > 0 && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {itemCount}{" "}
                      {itemCount === 1 ? "context item" : "context items"}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                    {formatDistanceToNow(new Date(scope.updated_at), {
                      addSuffix: true,
                    })}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
